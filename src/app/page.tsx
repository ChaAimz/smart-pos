import {
  DollarSign,
  Package,
  ShoppingBag,
  Target,
} from "lucide-react";

import { OverviewCharts } from "@/components/overview/overview-charts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OwnerShell } from "@/components/layout/owner-shell";
import { formatCurrencyFromCents, type StoreCurrencyCode } from "@/lib/currency";
import { requireOwnerSession } from "@/lib/owner-session";
import { prisma } from "@/lib/prisma";
import { getMonthlySalesGoalCents, getStoreCurrencyCode } from "@/lib/store-setting";

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_RANGE_OPTIONS = [7, 14, 30, 365] as const;
const DEFAULT_TREND_RANGE_DAYS = 14 as const;
type TrendRangeDays = (typeof TREND_RANGE_OPTIONS)[number];

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayLabelFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

type DashboardData = {
  currencyCode: StoreCurrencyCode;
  dailyTrend: Array<{
    cashRevenueCents: number;
    creditCardRevenueCents: number;
    dateKey: string;
    label: string;
    qrCodeRevenueCents: number;
    revenueCents: number;
    salesCount: number;
  }>;
  paymentMix: Array<{
    method: "CASH" | "QR_CODE" | "CREDIT_CARD";
    count: number;
    revenueCents: number;
  }>;
  thisMonthRevenueCents: number;
  monthlyGoalCents: number;
  dailyGoalCents: number;
  monthGoalProgressPct: number;
  dayGoalProgressPct: number;
  inventoryCostValueCents: number;
  inventorySellValueCents: number;
  recentRevenueCents: number;
  recentSalesCount: number;
  todayRevenueCents: number;
  todaySalesCount: number;
  topProducts: Array<{
    id: string;
    name: string;
    quantity: number;
  }>;
};

type OwnerOverviewPageProps = {
  searchParams: Promise<{
    range?: string;
  }>;
};

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function buildDailyBuckets(days: number) {
  const today = startOfUtcDay(new Date());
  const firstDay = new Date(today.getTime() - DAY_MS * (days - 1));

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(firstDay.getTime() + index * DAY_MS);
    return {
      date,
      dateKey: dayKeyFormatter.format(date),
      label: dayLabelFormatter.format(date),
    };
  });
}

function isTrendRangeDays(value: number): value is TrendRangeDays {
  return TREND_RANGE_OPTIONS.includes(value as TrendRangeDays);
}

function parseTrendRangeDays(value: string | undefined): TrendRangeDays {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || !isTrendRangeDays(parsed)) {
    return DEFAULT_TREND_RANGE_DAYS;
  }

  return parsed;
}

function formatTrendRangeLabel(days: TrendRangeDays) {
  if (days === 365) {
    return "1 year";
  }

  return `${days} days`;
}

function buildOverviewRangeHref(rangeDays: TrendRangeDays) {
  const params = new URLSearchParams();
  if (rangeDays !== DEFAULT_TREND_RANGE_DAYS) {
    params.set("range", String(rangeDays));
  }
  const search = params.toString();
  return search ? `/owner?${search}` : "/owner";
}

async function getDashboardData(trendRangeDays: TrendRangeDays): Promise<DashboardData> {
  const now = new Date();
  const dailyBuckets = buildDailyBuckets(trendRangeDays);
  const rangeStart = dailyBuckets[0]?.date ?? startOfUtcDay(new Date());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  try {
    const monthlyGoalCentsPromise = getMonthlySalesGoalCents();
    const currencyCodePromise = getStoreCurrencyCode();
    const [
      monthRevenue,
      inventoryValuationRows,
      recentSales,
      recentSaleItems,
    ] = await prisma.$transaction([
      prisma.sale.aggregate({
        where: {
          createdAt: {
            gte: startOfMonth,
          },
        },
        _sum: {
          totalCents: true,
        },
      }),
      prisma.product.findMany({
        where: {
          stockQty: {
            gt: 0,
          },
        },
        select: {
          costCents: true,
          priceCents: true,
          stockQty: true,
        },
      }),
      prisma.sale.findMany({
        where: {
          createdAt: {
            gte: rangeStart,
          },
        },
        select: {
          createdAt: true,
          paymentMethod: true,
          totalCents: true,
        },
      }),
      prisma.saleItem.findMany({
        where: {
          sale: {
            createdAt: {
              gte: rangeStart,
            },
          },
        },
        select: {
          quantity: true,
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);
    const inventoryCostValueCents = inventoryValuationRows.reduce(
      (sum, row) => sum + row.costCents * row.stockQty,
      0
    );
    const inventorySellValueCents = inventoryValuationRows.reduce(
      (sum, row) => sum + row.priceCents * row.stockQty,
      0
    );

    const thisMonthRevenueCents = monthRevenue._sum.totalCents ?? 0;
    const monthlyGoalCents = await monthlyGoalCentsPromise;
    const currencyCode = await currencyCodePromise;
    const dailyGoalCents = monthlyGoalCents > 0 ? Math.round(monthlyGoalCents / daysInMonth) : 0;
    const monthGoalProgressPct =
      monthlyGoalCents > 0 ? (thisMonthRevenueCents / monthlyGoalCents) * 100 : 0;

    const dailyMap = new Map<
      string,
      {
        cashRevenueCents: number;
        creditCardRevenueCents: number;
        qrCodeRevenueCents: number;
        revenueCents: number;
        salesCount: number;
      }
    >(
      dailyBuckets.map((bucket) => [
        bucket.dateKey,
        {
          cashRevenueCents: 0,
          creditCardRevenueCents: 0,
          qrCodeRevenueCents: 0,
          revenueCents: 0,
          salesCount: 0,
        },
      ])
    );
    const paymentMap = new Map<
      "CASH" | "QR_CODE" | "CREDIT_CARD",
      { count: number; revenueCents: number }
    >([
      ["CASH", { count: 0, revenueCents: 0 }],
      ["QR_CODE", { count: 0, revenueCents: 0 }],
      ["CREDIT_CARD", { count: 0, revenueCents: 0 }],
    ]);

    for (const sale of recentSales) {
      const dateKey = dayKeyFormatter.format(sale.createdAt);
      const day = dailyMap.get(dateKey);
      if (day) {
        day.salesCount += 1;
        day.revenueCents += sale.totalCents;
        if (sale.paymentMethod === "CASH") {
          day.cashRevenueCents += sale.totalCents;
        } else if (sale.paymentMethod === "QR_CODE") {
          day.qrCodeRevenueCents += sale.totalCents;
        } else if (sale.paymentMethod === "CREDIT_CARD") {
          day.creditCardRevenueCents += sale.totalCents;
        }
      }

      const payment = paymentMap.get(sale.paymentMethod);
      if (payment) {
        payment.count += 1;
        payment.revenueCents += sale.totalCents;
      }
    }

    const topProductMap = new Map<string, { name: string; quantity: number }>();
    for (const item of recentSaleItems) {
      const existing = topProductMap.get(item.product.id);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        topProductMap.set(item.product.id, {
          name: item.product.name,
          quantity: item.quantity,
        });
      }
    }

    const dailyTrend = dailyBuckets.map((bucket) => {
      const entry = dailyMap.get(bucket.dateKey);
      return {
        cashRevenueCents: entry?.cashRevenueCents ?? 0,
        creditCardRevenueCents: entry?.creditCardRevenueCents ?? 0,
        dateKey: bucket.dateKey,
        label: bucket.label,
        qrCodeRevenueCents: entry?.qrCodeRevenueCents ?? 0,
        revenueCents: entry?.revenueCents ?? 0,
        salesCount: entry?.salesCount ?? 0,
      };
    });

    const paymentMix = (["CASH", "QR_CODE", "CREDIT_CARD"] as const).map((method) => {
      const entry = paymentMap.get(method);
      return {
        method,
        count: entry?.count ?? 0,
        revenueCents: entry?.revenueCents ?? 0,
      };
    });

    const topProducts = Array.from(topProductMap.entries())
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 6);

    const recentRevenueCents = dailyTrend.reduce(
      (sum, item) => sum + item.revenueCents,
      0
    );
    const todayRevenueCents = dailyTrend[dailyTrend.length - 1]?.revenueCents ?? 0;
    const todaySalesCount = dailyTrend[dailyTrend.length - 1]?.salesCount ?? 0;
    const dayGoalProgressPct = dailyGoalCents > 0 ? (todayRevenueCents / dailyGoalCents) * 100 : 0;
    const recentSalesCount = dailyTrend.reduce((sum, item) => sum + item.salesCount, 0);

    return {
      currencyCode,
      dailyTrend,
      paymentMix,
      thisMonthRevenueCents,
      monthlyGoalCents,
      dailyGoalCents,
      monthGoalProgressPct,
      dayGoalProgressPct,
      inventoryCostValueCents,
      inventorySellValueCents,
      recentRevenueCents,
      recentSalesCount,
      todayRevenueCents,
      todaySalesCount,
      topProducts,
    };
  } catch {
    return {
      currencyCode: "ZAR",
      dailyTrend: dailyBuckets.map((bucket) => ({
        cashRevenueCents: 0,
        creditCardRevenueCents: 0,
        dateKey: bucket.dateKey,
        label: bucket.label,
        qrCodeRevenueCents: 0,
        revenueCents: 0,
        salesCount: 0,
      })),
      paymentMix: [
        { method: "CASH", count: 0, revenueCents: 0 },
        { method: "QR_CODE", count: 0, revenueCents: 0 },
        { method: "CREDIT_CARD", count: 0, revenueCents: 0 },
      ],
      thisMonthRevenueCents: 0,
      monthlyGoalCents: 0,
      dailyGoalCents: 0,
      monthGoalProgressPct: 0,
      dayGoalProgressPct: 0,
      inventoryCostValueCents: 0,
      inventorySellValueCents: 0,
      recentRevenueCents: 0,
      recentSalesCount: 0,
      todayRevenueCents: 0,
      todaySalesCount: 0,
      topProducts: [],
    };
  }
}

function formatPrice(cents: number, currencyCode: StoreCurrencyCode) {
  return formatCurrencyFromCents(cents, currencyCode);
}

function clampProgressPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function formatProgressPercent(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${Math.round(safeValue * 10) / 10}%`;
}

function getGoalProgressTone(value: number) {
  if (value >= 100) {
    return {
      badgeClassName: "bg-emerald-100 text-emerald-700",
      barClassName: "bg-emerald-500",
      label: "Goal reached",
    };
  }

  if (value >= 70) {
    return {
      badgeClassName: "bg-amber-100 text-amber-700",
      barClassName: "bg-amber-500",
      label: "On track",
    };
  }

  return {
    badgeClassName: "bg-rose-100 text-rose-700",
    barClassName: "bg-rose-500",
    label: "Needs boost",
  };
}

export default async function Home({ searchParams }: OwnerOverviewPageProps) {
  const sessionUser = await requireOwnerSession();
  const params = await searchParams;
  const trendRangeDays = parseTrendRangeDays(params.range);
  const trendRangeLabel = formatTrendRangeLabel(trendRangeDays);
  const data = await getDashboardData(trendRangeDays);
  const dayGoalTone = getGoalProgressTone(data.dayGoalProgressPct);
  const monthGoalTone = getGoalProgressTone(data.monthGoalProgressPct);
  const dayGoalPercentText = formatProgressPercent(data.dayGoalProgressPct);
  const monthGoalPercentText = formatProgressPercent(data.monthGoalProgressPct);
  const dayGoalProgressWidth = clampProgressPercent(data.dayGoalProgressPct);
  const monthGoalProgressWidth = clampProgressPercent(data.monthGoalProgressPct);
  const todayAverageOrderCents =
    data.todaySalesCount > 0 ? Math.round(data.todayRevenueCents / data.todaySalesCount) : 0;
  const dayGoalGapCents = Math.max(0, data.dailyGoalCents - data.todayRevenueCents);
  const monthGoalGapCents = Math.max(0, data.monthlyGoalCents - data.thisMonthRevenueCents);
  const inventoryMarginCents = data.inventorySellValueCents - data.inventoryCostValueCents;
  const inventoryMarginPct = clampProgressPercent(
    data.inventorySellValueCents > 0
      ? (inventoryMarginCents / data.inventorySellValueCents) * 100
      : 0
  );
  const inventoryMarginPositive = inventoryMarginCents >= 0;

  return (
    <OwnerShell
      activeNav="overview"
      pageTitle="Overview"
      userEmail={sessionUser.email}
    >
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="min-w-0 py-4 xl:min-h-64">
          <CardHeader className="h-full min-w-0 justify-between gap-4">
            <div className="min-w-0 flex flex-col gap-2">
              <CardDescription className="flex min-w-0 items-center gap-2">
                <ShoppingBag className="size-4 text-muted-foreground" aria-hidden="true" />
                Today Sales
              </CardDescription>
              <CardTitle className="min-w-0 break-words text-3xl leading-tight">
                {data.todaySalesCount}
              </CardTitle>
              <CardDescription className="min-w-0 break-words">Orders completed today</CardDescription>
            </div>
            <div className="min-w-0 flex flex-col gap-2">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 text-xs">
                <span className="min-w-0 flex-1 break-words text-muted-foreground">Revenue pace</span>
                <Badge variant="secondary" className={`shrink-0 ${dayGoalTone.badgeClassName}`}>
                  {dayGoalTone.label}
                </Badge>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${dayGoalTone.barClassName}`}
                  style={{ width: `${dayGoalProgressWidth}%` }}
                />
              </div>
              <p className="min-w-0 break-words text-xs text-muted-foreground">
                Avg order {formatPrice(todayAverageOrderCents, data.currencyCode)}
              </p>
            </div>
          </CardHeader>
        </Card>
        <Card className="min-w-0 py-4 xl:min-h-64">
          <CardHeader className="h-full min-w-0 justify-between gap-4">
            <div className="min-w-0 flex flex-col gap-2">
              <CardDescription className="flex min-w-0 items-center gap-2">
                <DollarSign className="size-4 text-muted-foreground" aria-hidden="true" />
                Today Revenue
              </CardDescription>
              <CardTitle className="min-w-0 break-words text-3xl leading-tight">
                {formatPrice(data.todayRevenueCents, data.currencyCode)}
              </CardTitle>
              <CardDescription className="min-w-0 break-words">Daily goal progress</CardDescription>
            </div>
            <div className="min-w-0 flex flex-col gap-2">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 text-xs">
                <span className="min-w-0 flex-1 break-words text-muted-foreground">
                  {dayGoalPercentText} of {formatPrice(data.dailyGoalCents, data.currencyCode)}
                </span>
                <Badge variant="secondary" className={`shrink-0 ${dayGoalTone.badgeClassName}`}>
                  {dayGoalTone.label}
                </Badge>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${dayGoalTone.barClassName}`}
                  style={{ width: `${dayGoalProgressWidth}%` }}
                />
              </div>
              <p className="min-w-0 break-words text-xs text-muted-foreground">
                {dayGoalGapCents > 0
                  ? `${formatPrice(dayGoalGapCents, data.currencyCode)} left to goal`
                  : "Goal reached"}
              </p>
            </div>
          </CardHeader>
        </Card>
        <Card className="min-w-0 py-4 xl:min-h-64">
          <CardHeader className="h-full min-w-0 justify-between gap-4">
            <div className="min-w-0 flex flex-col gap-2">
              <CardDescription className="flex min-w-0 items-center gap-2">
                <DollarSign className="size-4 text-muted-foreground" aria-hidden="true" />
                Month Revenue
              </CardDescription>
              <CardTitle className="min-w-0 break-words text-3xl leading-tight">
                {formatPrice(data.thisMonthRevenueCents, data.currencyCode)}
              </CardTitle>
              <CardDescription className="min-w-0 break-words">Monthly goal progress</CardDescription>
            </div>
            <div className="min-w-0 flex flex-col gap-2">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 text-xs">
                <span className="min-w-0 flex-1 break-words text-muted-foreground">
                  {monthGoalPercentText} of {formatPrice(data.monthlyGoalCents, data.currencyCode)}
                </span>
                <Badge variant="secondary" className={`shrink-0 ${monthGoalTone.badgeClassName}`}>
                  {monthGoalTone.label}
                </Badge>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${monthGoalTone.barClassName}`}
                  style={{ width: `${monthGoalProgressWidth}%` }}
                />
              </div>
              <p className="min-w-0 break-words text-xs text-muted-foreground">
                {monthGoalGapCents > 0
                  ? `${formatPrice(monthGoalGapCents, data.currencyCode)} left this month`
                  : "Monthly goal reached"}
              </p>
            </div>
          </CardHeader>
        </Card>
        <Card className="min-w-0 py-4 xl:min-h-64">
          <CardHeader className="h-full min-w-0 justify-between gap-4">
            <div className="min-w-0 flex flex-col gap-2">
              <CardDescription className="flex min-w-0 items-center gap-2">
                <Target className="size-4 text-muted-foreground" aria-hidden="true" />
                Goal Progress
              </CardDescription>
              <CardTitle className="min-w-0 break-words text-3xl leading-tight">{dayGoalPercentText}</CardTitle>
              <CardDescription className="min-w-0 break-words">Today vs month target</CardDescription>
            </div>
            <div className="min-w-0 flex flex-col gap-3">
              <div className="min-w-0 flex flex-col gap-1">
                <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 break-words text-muted-foreground">Today</span>
                  <span className="shrink-0 font-medium tabular-nums">{dayGoalPercentText}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${dayGoalTone.barClassName}`}
                    style={{ width: `${dayGoalProgressWidth}%` }}
                  />
                </div>
              </div>
              <div className="min-w-0 flex flex-col gap-1">
                <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 break-words text-muted-foreground">Month</span>
                  <span className="shrink-0 font-medium tabular-nums">{monthGoalPercentText}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${monthGoalTone.barClassName}`}
                    style={{ width: `${monthGoalProgressWidth}%` }}
                  />
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
        <Card className="min-w-0 py-4 xl:min-h-64">
          <CardHeader className="h-full min-w-0 justify-between gap-4">
            <div className="min-w-0 flex flex-col gap-2">
              <CardDescription className="flex min-w-0 items-center gap-2">
                <Package className="size-4 text-muted-foreground" aria-hidden="true" />
                Inventory Value
              </CardDescription>
              <CardTitle className="min-w-0 break-words text-3xl leading-tight">
                {formatPrice(data.inventorySellValueCents, data.currencyCode)}
              </CardTitle>
              <CardDescription className="min-w-0 break-words">Estimated sell value in stock</CardDescription>
            </div>
            <div className="min-w-0 flex flex-col gap-2">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 text-xs">
                <span className="min-w-0 flex-1 break-words text-muted-foreground">Cost</span>
                <span className="shrink-0 break-words text-right font-medium tabular-nums">
                  {formatPrice(data.inventoryCostValueCents, data.currencyCode)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    inventoryMarginPositive ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                  style={{ width: `${inventoryMarginPct}%` }}
                />
              </div>
              <p className="min-w-0 break-words text-xs text-muted-foreground">
                Margin {inventoryMarginPositive ? "+" : "-"}
                {formatPrice(Math.abs(inventoryMarginCents), data.currencyCode)}
              </p>
            </div>
          </CardHeader>
        </Card>
      </section>

      <section className="mt-4">
        <OverviewCharts
          currencyCode={data.currencyCode}
          dailyTrend={data.dailyTrend}
          paymentMix={data.paymentMix}
          trendRangeLabel={trendRangeLabel}
          trendRanges={TREND_RANGE_OPTIONS.map((rangeValue) => ({
            active: rangeValue === trendRangeDays,
            href: buildOverviewRangeHref(rangeValue),
            label: rangeValue === 365 ? "1Y" : `${rangeValue}D`,
          }))}
          topProducts={data.topProducts}
        />
      </section>
    </OwnerShell>
  );
}
