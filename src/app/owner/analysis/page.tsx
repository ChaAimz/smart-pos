import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";

import { OwnerShell } from "@/components/layout/owner-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrencyFromCents, type StoreCurrencyCode } from "@/lib/currency";
import { requireOwnerSession } from "@/lib/owner-session";
import { prisma } from "@/lib/prisma";
import { getStoreCurrencyCode } from "@/lib/store-setting";

const DAY_MS = 24 * 60 * 60 * 1000;
const ANALYSIS_RANGE_OPTIONS = [14, 30, 60, 90] as const;
const DEFAULT_ANALYSIS_RANGE_DAYS = 30 as const;
const LOW_STOCK_THRESHOLD_QTY = 5;
const REORDER_COVER_DAYS = 7;

const TOP_SORT_KEYS = [
  "soldQty",
  "revenueCents",
  "movingRatePerDay",
  "stockQty",
  "stockCoverDays",
] as const;
const SLOW_SORT_KEYS = ["soldQty", "stockQty", "movingRatePerDay", "stockCoverDays"] as const;
const ALERT_SORT_KEYS = ["alertPriority", "stockQty", "soldQty", "stockCoverDays"] as const;

const DEFAULT_TOP_SORT_KEY = "soldQty" as const;
const DEFAULT_SLOW_SORT_KEY = "soldQty" as const;
const DEFAULT_ALERT_SORT_KEY = "alertPriority" as const;
const DEFAULT_TOP_SORT_DIRECTION = "desc" as const;
const DEFAULT_SLOW_SORT_DIRECTION = "asc" as const;
const DEFAULT_ALERT_SORT_DIRECTION = "asc" as const;

type AnalysisRangeDays = (typeof ANALYSIS_RANGE_OPTIONS)[number];
type SortDirection = "asc" | "desc";
type TopSortKey = (typeof TOP_SORT_KEYS)[number];
type SlowSortKey = (typeof SLOW_SORT_KEYS)[number];
type AlertSortKey = (typeof ALERT_SORT_KEYS)[number];
type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

type OwnerAnalysisPageProps = {
  searchParams: Promise<{
    alertDir?: string;
    alertSort?: string;
    range?: string;
    slowDir?: string;
    slowSort?: string;
    topDir?: string;
    topSort?: string;
  }>;
};

type ProductAnalysisMetric = {
  id: string;
  isSellable: boolean;
  movingRatePerDay: number;
  name: string;
  revenueCents: number;
  sku: string;
  soldQty: number;
  stockCoverDays: number | null;
  stockQty: number;
};

type StockAlertRow = ProductAnalysisMetric & {
  alertLabel: string;
  alertPriority: number;
};

type AnalysisQueryState = {
  alertSortDirection: SortDirection;
  alertSortKey: AlertSortKey;
  rangeDays: AnalysisRangeDays;
  slowSortDirection: SortDirection;
  slowSortKey: SlowSortKey;
  topSortDirection: SortDirection;
  topSortKey: TopSortKey;
};

type AnalysisData = {
  avgMovingRatePerSoldSku: number;
  currencyCode: StoreCurrencyCode;
  fromLabel: string;
  lowStockCount: number;
  nonMovingCount: number;
  outOfStockCount: number;
  productsSoldCount: number;
  rangeDays: AnalysisRangeDays;
  slowMovers: ProductAnalysisMetric[];
  stockAlerts: StockAlertRow[];
  toLabel: string;
  topSellerMaxSoldQty: number;
  topSellers: ProductAnalysisMetric[];
  totalUnitsSold: number;
};

const displayDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const percentFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function shiftDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function isAnalysisRangeDays(value: number): value is AnalysisRangeDays {
  return ANALYSIS_RANGE_OPTIONS.includes(value as AnalysisRangeDays);
}

function parseAnalysisRangeDays(value: string | undefined): AnalysisRangeDays {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || !isAnalysisRangeDays(parsed)) {
    return DEFAULT_ANALYSIS_RANGE_DAYS;
  }

  return parsed;
}

function parseSortDirection(
  value: string | undefined,
  defaultDirection: SortDirection
): SortDirection {
  if (value === "asc" || value === "desc") {
    return value;
  }

  return defaultDirection;
}

function parseTopSortKey(value: string | undefined): TopSortKey {
  if (TOP_SORT_KEYS.some((key) => key === value)) {
    return value as TopSortKey;
  }

  return DEFAULT_TOP_SORT_KEY;
}

function parseSlowSortKey(value: string | undefined): SlowSortKey {
  if (SLOW_SORT_KEYS.some((key) => key === value)) {
    return value as SlowSortKey;
  }

  return DEFAULT_SLOW_SORT_KEY;
}

function parseAlertSortKey(value: string | undefined): AlertSortKey {
  if (ALERT_SORT_KEYS.some((key) => key === value)) {
    return value as AlertSortKey;
  }

  return DEFAULT_ALERT_SORT_KEY;
}

function compareNumberValues(a: number, b: number, direction: SortDirection) {
  return direction === "asc" ? a - b : b - a;
}

function compareTextValues(a: string, b: string, direction: SortDirection) {
  return direction === "asc" ? a.localeCompare(b) : b.localeCompare(a);
}

function compareNullableNumbers(
  a: number | null,
  b: number | null,
  direction: SortDirection
) {
  if (a == null && b == null) {
    return 0;
  }
  if (a == null) {
    return 1;
  }
  if (b == null) {
    return -1;
  }

  return compareNumberValues(a, b, direction);
}

function getNextSortDirection<T extends string>(
  activeSort: T,
  activeDirection: SortDirection,
  targetSort: T,
  defaultDirection: SortDirection
) {
  if (activeSort === targetSort) {
    return activeDirection === "asc" ? "desc" : "asc";
  }

  return defaultDirection;
}

function buildAnalysisHref(state: AnalysisQueryState) {
  const params = new URLSearchParams();

  if (state.rangeDays !== DEFAULT_ANALYSIS_RANGE_DAYS) {
    params.set("range", String(state.rangeDays));
  }
  if (
    state.topSortKey !== DEFAULT_TOP_SORT_KEY ||
    state.topSortDirection !== DEFAULT_TOP_SORT_DIRECTION
  ) {
    params.set("topSort", state.topSortKey);
    params.set("topDir", state.topSortDirection);
  }
  if (
    state.slowSortKey !== DEFAULT_SLOW_SORT_KEY ||
    state.slowSortDirection !== DEFAULT_SLOW_SORT_DIRECTION
  ) {
    params.set("slowSort", state.slowSortKey);
    params.set("slowDir", state.slowSortDirection);
  }
  if (
    state.alertSortKey !== DEFAULT_ALERT_SORT_KEY ||
    state.alertSortDirection !== DEFAULT_ALERT_SORT_DIRECTION
  ) {
    params.set("alertSort", state.alertSortKey);
    params.set("alertDir", state.alertSortDirection);
  }

  const search = params.toString();
  return search ? `/owner/analysis?${search}` : "/owner/analysis";
}

function buildTopSortHref(
  state: AnalysisQueryState,
  sortKey: TopSortKey,
  defaultDirection: SortDirection
) {
  return buildAnalysisHref({
    ...state,
    topSortDirection: getNextSortDirection(
      state.topSortKey,
      state.topSortDirection,
      sortKey,
      defaultDirection
    ),
    topSortKey: sortKey,
  });
}

function buildSlowSortHref(
  state: AnalysisQueryState,
  sortKey: SlowSortKey,
  defaultDirection: SortDirection
) {
  return buildAnalysisHref({
    ...state,
    slowSortDirection: getNextSortDirection(
      state.slowSortKey,
      state.slowSortDirection,
      sortKey,
      defaultDirection
    ),
    slowSortKey: sortKey,
  });
}

function buildAlertSortHref(
  state: AnalysisQueryState,
  sortKey: AlertSortKey,
  defaultDirection: SortDirection
) {
  return buildAnalysisHref({
    ...state,
    alertSortDirection: getNextSortDirection(
      state.alertSortKey,
      state.alertSortDirection,
      sortKey,
      defaultDirection
    ),
    alertSortKey: sortKey,
  });
}

function formatPrice(cents: number, currencyCode: StoreCurrencyCode) {
  return formatCurrencyFromCents(cents, currencyCode);
}

function formatRate(value: number) {
  return `${numberFormat.format(value)}/day`;
}

function formatDaysCover(value: number | null, soldQty: number) {
  if (value == null) {
    return soldQty > 0 ? "-" : "No movement";
  }

  return `${numberFormat.format(value)} days`;
}

function toAlertLabel(metric: ProductAnalysisMetric) {
  if (metric.stockQty <= 0) {
    return "Out of stock";
  }

  if (metric.stockCoverDays != null && metric.stockCoverDays <= REORDER_COVER_DAYS) {
    return `Only ${numberFormat.format(metric.stockCoverDays)} days cover`;
  }

  return "Low stock";
}

function toAlertPriority(metric: ProductAnalysisMetric) {
  if (metric.stockQty <= 0) {
    return 0;
  }

  if (metric.stockCoverDays != null && metric.stockCoverDays <= REORDER_COVER_DAYS) {
    return 1;
  }

  return 2;
}

function getAlertUrgency(alert: StockAlertRow) {
  if (alert.alertPriority === 0) {
    return 100;
  }

  if (alert.alertPriority === 1) {
    const coverDays = alert.stockCoverDays ?? REORDER_COVER_DAYS;
    const normalized = Math.max(0, Math.min(1, (REORDER_COVER_DAYS - coverDays) / REORDER_COVER_DAYS));
    return Math.round(60 + normalized * 35);
  }

  const normalized = Math.max(0, Math.min(1, (LOW_STOCK_THRESHOLD_QTY - alert.stockQty) / LOW_STOCK_THRESHOLD_QTY));
  return Math.round(35 + normalized * 24);
}

function getAlertUrgencyBarClass(alert: StockAlertRow) {
  if (alert.alertPriority === 0) {
    return "bg-destructive";
  }
  if (alert.alertPriority === 1) {
    return "bg-amber-500";
  }
  return "bg-sky-500";
}

function getSlowSignal(metric: ProductAnalysisMetric): { label: string; variant: BadgeVariant } {
  if (metric.soldQty === 0) {
    return {
      label: "Non-moving",
      variant: "destructive",
    };
  }

  if (metric.movingRatePerDay < 0.1) {
    return {
      label: "Very slow",
      variant: "secondary",
    };
  }

  return {
    label: "Slow",
    variant: "outline",
  };
}

function sortTopSellers(
  metrics: ProductAnalysisMetric[],
  sortKey: TopSortKey,
  sortDirection: SortDirection
) {
  return [...metrics].sort((a, b) => {
    let result = 0;
    if (sortKey === "soldQty") {
      result = compareNumberValues(a.soldQty, b.soldQty, sortDirection);
    } else if (sortKey === "revenueCents") {
      result = compareNumberValues(a.revenueCents, b.revenueCents, sortDirection);
    } else if (sortKey === "movingRatePerDay") {
      result = compareNumberValues(a.movingRatePerDay, b.movingRatePerDay, sortDirection);
    } else if (sortKey === "stockQty") {
      result = compareNumberValues(a.stockQty, b.stockQty, sortDirection);
    } else {
      result = compareNullableNumbers(a.stockCoverDays, b.stockCoverDays, sortDirection);
    }

    if (result !== 0) {
      return result;
    }

    return b.soldQty - a.soldQty || b.revenueCents - a.revenueCents || a.name.localeCompare(b.name);
  });
}

function sortSlowMovers(
  metrics: ProductAnalysisMetric[],
  sortKey: SlowSortKey,
  sortDirection: SortDirection
) {
  return [...metrics].sort((a, b) => {
    let result = 0;
    if (sortKey === "soldQty") {
      result = compareNumberValues(a.soldQty, b.soldQty, sortDirection);
    } else if (sortKey === "stockQty") {
      result = compareNumberValues(a.stockQty, b.stockQty, sortDirection);
    } else if (sortKey === "movingRatePerDay") {
      result = compareNumberValues(a.movingRatePerDay, b.movingRatePerDay, sortDirection);
    } else {
      result = compareNullableNumbers(a.stockCoverDays, b.stockCoverDays, sortDirection);
    }

    if (result !== 0) {
      return result;
    }

    return a.soldQty - b.soldQty || b.stockQty - a.stockQty || a.name.localeCompare(b.name);
  });
}

function sortStockAlerts(
  alerts: StockAlertRow[],
  sortKey: AlertSortKey,
  sortDirection: SortDirection
) {
  return [...alerts].sort((a, b) => {
    let result = 0;
    if (sortKey === "alertPriority") {
      result = compareNumberValues(a.alertPriority, b.alertPriority, sortDirection);
    } else if (sortKey === "stockQty") {
      result = compareNumberValues(a.stockQty, b.stockQty, sortDirection);
    } else if (sortKey === "soldQty") {
      result = compareNumberValues(a.soldQty, b.soldQty, sortDirection);
    } else {
      result = compareNullableNumbers(a.stockCoverDays, b.stockCoverDays, sortDirection);
    }

    if (result !== 0) {
      return result;
    }

    return compareTextValues(a.name, b.name, "asc");
  });
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (!active) {
    return <ArrowUpDown className="size-3 text-muted-foreground/70" aria-hidden="true" />;
  }

  if (direction === "asc") {
    return <ArrowUp className="size-3 text-foreground" aria-hidden="true" />;
  }

  return <ArrowDown className="size-3 text-foreground" aria-hidden="true" />;
}

function SortHeadLink({
  active,
  direction,
  href,
  label,
}: {
  active: boolean;
  direction: SortDirection;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
    >
      <span>{label}</span>
      <SortIndicator active={active} direction={direction} />
    </Link>
  );
}

async function getAnalysisData(query: AnalysisQueryState): Promise<AnalysisData> {
  const toDay = startOfUtcDay(new Date());
  const fromDay = shiftDays(toDay, -(query.rangeDays - 1));
  const toExclusive = shiftDays(toDay, 1);

  try {
    const currencyCodePromise = getStoreCurrencyCode();
    const [products, saleItems] = await prisma.$transaction([
      prisma.product.findMany({
        orderBy: [{ isSellable: "desc" }, { name: "asc" }],
        select: {
          id: true,
          isSellable: true,
          name: true,
          sku: true,
          stockQty: true,
        },
      }),
      prisma.saleItem.findMany({
        where: {
          sale: {
            createdAt: {
              gte: fromDay,
              lt: toExclusive,
            },
          },
        },
        select: {
          productId: true,
          quantity: true,
          unitPriceCents: true,
        },
      }),
    ]);

    const salesByProduct = new Map<
      string,
      {
        revenueCents: number;
        soldQty: number;
      }
    >();

    for (const item of saleItems) {
      const existing = salesByProduct.get(item.productId);
      if (existing) {
        existing.soldQty += item.quantity;
        existing.revenueCents += item.quantity * item.unitPriceCents;
      } else {
        salesByProduct.set(item.productId, {
          soldQty: item.quantity,
          revenueCents: item.quantity * item.unitPriceCents,
        });
      }
    }

    const metrics: ProductAnalysisMetric[] = products.map((product) => {
      const sold = salesByProduct.get(product.id);
      const soldQty = sold?.soldQty ?? 0;
      const revenueCents = sold?.revenueCents ?? 0;
      const movingRatePerDay = soldQty / query.rangeDays;
      const stockCoverDays = movingRatePerDay > 0 ? product.stockQty / movingRatePerDay : null;

      return {
        id: product.id,
        isSellable: product.isSellable,
        movingRatePerDay,
        name: product.name,
        revenueCents,
        sku: product.sku,
        soldQty,
        stockCoverDays,
        stockQty: product.stockQty,
      };
    });

    const topSellers = sortTopSellers(
      metrics.filter((metric) => metric.soldQty > 0),
      query.topSortKey,
      query.topSortDirection
    ).slice(0, 12);

    const slowMovers = sortSlowMovers(
      metrics.filter((metric) => metric.stockQty > 0 && metric.isSellable),
      query.slowSortKey,
      query.slowSortDirection
    ).slice(0, 12);

    const stockAlerts = sortStockAlerts(
      metrics
        .filter(
          (metric) =>
            metric.isSellable &&
            (metric.stockQty <= 0 ||
              metric.stockQty <= LOW_STOCK_THRESHOLD_QTY ||
              (metric.stockCoverDays != null && metric.stockCoverDays <= REORDER_COVER_DAYS))
        )
        .map((metric) => ({
          ...metric,
          alertLabel: toAlertLabel(metric),
          alertPriority: toAlertPriority(metric),
        })),
      query.alertSortKey,
      query.alertSortDirection
    ).slice(0, 15);

    const topSellerMaxSoldQty = topSellers.reduce((max, metric) => {
      return Math.max(max, metric.soldQty);
    }, 0);
    const productsSoldCount = metrics.filter((metric) => metric.soldQty > 0).length;
    const totalUnitsSold = metrics.reduce((sum, metric) => sum + metric.soldQty, 0);
    const nonMovingCount = metrics.filter(
      (metric) => metric.isSellable && metric.stockQty > 0 && metric.soldQty === 0
    ).length;
    const lowStockCount = metrics.filter(
      (metric) => metric.isSellable && metric.stockQty > 0 && metric.stockQty <= LOW_STOCK_THRESHOLD_QTY
    ).length;
    const outOfStockCount = metrics.filter(
      (metric) => metric.isSellable && metric.stockQty <= 0
    ).length;
    const avgMovingRatePerSoldSku =
      productsSoldCount > 0 ? totalUnitsSold / productsSoldCount / query.rangeDays : 0;
    const currencyCode = await currencyCodePromise;

    return {
      avgMovingRatePerSoldSku,
      currencyCode,
      fromLabel: displayDateFormat.format(fromDay),
      lowStockCount,
      nonMovingCount,
      outOfStockCount,
      productsSoldCount,
      rangeDays: query.rangeDays,
      slowMovers,
      stockAlerts,
      toLabel: displayDateFormat.format(toDay),
      topSellerMaxSoldQty,
      topSellers,
      totalUnitsSold,
    };
  } catch {
    return {
      avgMovingRatePerSoldSku: 0,
      currencyCode: "ZAR",
      fromLabel: displayDateFormat.format(fromDay),
      lowStockCount: 0,
      nonMovingCount: 0,
      outOfStockCount: 0,
      productsSoldCount: 0,
      rangeDays: query.rangeDays,
      slowMovers: [],
      stockAlerts: [],
      toLabel: displayDateFormat.format(toDay),
      topSellerMaxSoldQty: 0,
      topSellers: [],
      totalUnitsSold: 0,
    };
  }
}

export default async function OwnerAnalysisPage({ searchParams }: OwnerAnalysisPageProps) {
  const sessionUser = await requireOwnerSession();
  const params = await searchParams;

  const queryState: AnalysisQueryState = {
    alertSortDirection: parseSortDirection(params.alertDir, DEFAULT_ALERT_SORT_DIRECTION),
    alertSortKey: parseAlertSortKey(params.alertSort),
    rangeDays: parseAnalysisRangeDays(params.range),
    slowSortDirection: parseSortDirection(params.slowDir, DEFAULT_SLOW_SORT_DIRECTION),
    slowSortKey: parseSlowSortKey(params.slowSort),
    topSortDirection: parseSortDirection(params.topDir, DEFAULT_TOP_SORT_DIRECTION),
    topSortKey: parseTopSortKey(params.topSort),
  };

  const data = await getAnalysisData(queryState);

  return (
    <OwnerShell
      activeNav="analysis"
      mainClassName="h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden"
      pageTitle="Analysis"
      userEmail={sessionUser.email}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <Card className="shrink-0 gap-0">
          <CardHeader>
            <CardTitle className="text-base">Inventory and Sales Analysis</CardTitle>
            <CardDescription>
              Analyze product performance, stock moving rate, and replenishment risk from{" "}
              {data.fromLabel} to {data.toLabel}.
            </CardDescription>
          </CardHeader>
          <div className="border-t" />
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-2">
              {ANALYSIS_RANGE_OPTIONS.map((option) => (
                <Button
                  key={option}
                  asChild
                  size="sm"
                  variant={option === data.rangeDays ? "default" : "outline"}
                >
                  <Link href={buildAnalysisHref({ ...queryState, rangeDays: option })}>
                    {option}D window
                  </Link>
                </Button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Signal legend:</span>
              <Badge variant="destructive">Critical</Badge>
              <Badge variant="secondary">Watch</Badge>
              <Badge variant="outline">Normal</Badge>
            </div>
          </CardContent>
        </Card>

        <section className="shrink-0 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Products With Sales</CardDescription>
              <CardTitle className="text-3xl">{data.productsSoldCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Total Units Sold</CardDescription>
              <CardTitle className="text-3xl">{numberFormat.format(data.totalUnitsSold)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Avg Moving Rate</CardDescription>
              <CardTitle className="text-3xl">{formatRate(data.avgMovingRatePerSoldSku)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Non-Moving SKUs</CardDescription>
              <CardTitle className="text-3xl">{data.nonMovingCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Low Stock</CardDescription>
              <CardTitle className="text-3xl">{data.lowStockCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Out of Stock</CardDescription>
              <CardTitle className="text-3xl">{data.outOfStockCount}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="flex min-h-[360px] flex-col gap-0 overflow-hidden xl:col-span-2">
              <CardHeader className="shrink-0">
                <CardTitle className="text-base">Top Sellers</CardTitle>
                <CardDescription>
                  Click column headers to sort. Share bar shows relative sold volume.
                </CardDescription>
              </CardHeader>
              <div className="border-t" />
              <CardContent className="min-h-0 flex-1 overflow-y-auto pt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">
                        <div className="flex justify-end">
                          <SortHeadLink
                            active={queryState.topSortKey === "soldQty"}
                            direction={queryState.topSortDirection}
                            href={buildTopSortHref(queryState, "soldQty", "desc")}
                            label="Sold Qty"
                          />
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex justify-end">
                          <SortHeadLink
                            active={queryState.topSortKey === "revenueCents"}
                            direction={queryState.topSortDirection}
                            href={buildTopSortHref(queryState, "revenueCents", "desc")}
                            label="Revenue"
                          />
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex justify-end">
                          <SortHeadLink
                            active={queryState.topSortKey === "movingRatePerDay"}
                            direction={queryState.topSortDirection}
                            href={buildTopSortHref(queryState, "movingRatePerDay", "desc")}
                            label="Rate"
                          />
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex justify-end">
                          <SortHeadLink
                            active={queryState.topSortKey === "stockQty"}
                            direction={queryState.topSortDirection}
                            href={buildTopSortHref(queryState, "stockQty", "desc")}
                            label="Stock"
                          />
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex justify-end">
                          <SortHeadLink
                            active={queryState.topSortKey === "stockCoverDays"}
                            direction={queryState.topSortDirection}
                            href={buildTopSortHref(queryState, "stockCoverDays", "asc")}
                            label="Days Cover"
                          />
                        </div>
                      </TableHead>
                      <TableHead className="text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topSellers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                          No sold products found in this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.topSellers.map((metric, index) => {
                        const soldSharePct =
                          data.topSellerMaxSoldQty > 0
                            ? (metric.soldQty / data.topSellerMaxSoldQty) * 100
                            : 0;
                        const soldShareBarWidth = soldSharePct > 0 ? Math.max(8, soldSharePct) : 0;

                        return (
                          <TableRow key={metric.id}>
                            <TableCell className="font-medium">
                              <span className="mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 text-xs">
                                {index + 1}
                              </span>
                              {metric.name}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{metric.sku}</TableCell>
                            <TableCell className="text-right">{numberFormat.format(metric.soldQty)}</TableCell>
                            <TableCell className="text-right">
                              {formatPrice(metric.revenueCents, data.currencyCode)}
                            </TableCell>
                            <TableCell className="text-right">{formatRate(metric.movingRatePerDay)}</TableCell>
                            <TableCell className="text-right">{numberFormat.format(metric.stockQty)}</TableCell>
                            <TableCell className="text-right">
                              {formatDaysCover(metric.stockCoverDays, metric.soldQty)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="min-w-9 text-right text-xs tabular-nums">
                                  {percentFormat.format(soldSharePct)}%
                                </span>
                                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="h-full rounded-full bg-primary"
                                    style={{ width: `${Math.min(100, soldShareBarWidth)}%` }}
                                  />
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="flex min-h-[360px] flex-col gap-0 overflow-hidden">
              <CardHeader className="shrink-0">
                <CardTitle className="text-base">Stock Alerts</CardTitle>
                <CardDescription>
                  Prioritized view of out-of-stock, low stock, and run-out risk.
                </CardDescription>
              </CardHeader>
              <div className="border-t" />
              <CardContent className="min-h-0 flex-1 overflow-y-auto pt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">
                        <div className="flex justify-end">
                          <SortHeadLink
                            active={queryState.alertSortKey === "stockQty"}
                            direction={queryState.alertSortDirection}
                            href={buildAlertSortHref(queryState, "stockQty", "asc")}
                            label="Stock"
                          />
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex justify-end">
                          <SortHeadLink
                            active={queryState.alertSortKey === "soldQty"}
                            direction={queryState.alertSortDirection}
                            href={buildAlertSortHref(queryState, "soldQty", "desc")}
                            label="Sold"
                          />
                        </div>
                      </TableHead>
                      <TableHead>
                        <SortHeadLink
                          active={queryState.alertSortKey === "alertPriority"}
                          direction={queryState.alertSortDirection}
                          href={buildAlertSortHref(queryState, "alertPriority", "asc")}
                          label="Status"
                        />
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex justify-end">
                          <SortHeadLink
                            active={queryState.alertSortKey === "stockCoverDays"}
                            direction={queryState.alertSortDirection}
                            href={buildAlertSortHref(queryState, "stockCoverDays", "asc")}
                            label="Urgency"
                          />
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.stockAlerts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                          No stock alerts in this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.stockAlerts.map((alert) => {
                        const urgencyScore = getAlertUrgency(alert);
                        const urgencyBarClass = getAlertUrgencyBarClass(alert);

                        return (
                          <TableRow key={alert.id}>
                            <TableCell className="font-medium">
                              {alert.name}
                              <p className="text-xs text-muted-foreground">{alert.sku}</p>
                            </TableCell>
                            <TableCell className="text-right">{numberFormat.format(alert.stockQty)}</TableCell>
                            <TableCell className="text-right">{numberFormat.format(alert.soldQty)}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  alert.alertPriority === 0
                                    ? "destructive"
                                    : alert.alertPriority === 1
                                      ? "secondary"
                                      : "outline"
                                }
                              >
                                {alert.alertLabel}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="min-w-9 text-right text-xs tabular-nums">
                                  {urgencyScore}%
                                </span>
                                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className={`h-full rounded-full ${urgencyBarClass}`}
                                    style={{ width: `${urgencyScore}%` }}
                                  />
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="flex min-h-[360px] flex-col gap-0 overflow-hidden xl:col-span-3">
              <CardHeader className="shrink-0">
                <CardTitle className="text-base">Slow / Non-Moving Products</CardTitle>
                <CardDescription>
                  Sellable products with low movement and high holding risk.
                </CardDescription>
              </CardHeader>
              <div className="border-t" />
              <CardContent className="min-h-0 flex-1 overflow-y-auto pt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">
                        <div className="flex justify-end">
                          <SortHeadLink
                            active={queryState.slowSortKey === "stockQty"}
                            direction={queryState.slowSortDirection}
                            href={buildSlowSortHref(queryState, "stockQty", "desc")}
                            label="Stock"
                          />
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex justify-end">
                          <SortHeadLink
                            active={queryState.slowSortKey === "soldQty"}
                            direction={queryState.slowSortDirection}
                            href={buildSlowSortHref(queryState, "soldQty", "asc")}
                            label="Sold Qty"
                          />
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex justify-end">
                          <SortHeadLink
                            active={queryState.slowSortKey === "movingRatePerDay"}
                            direction={queryState.slowSortDirection}
                            href={buildSlowSortHref(queryState, "movingRatePerDay", "asc")}
                            label="Rate"
                          />
                        </div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="flex justify-end">
                          <SortHeadLink
                            active={queryState.slowSortKey === "stockCoverDays"}
                            direction={queryState.slowSortDirection}
                            href={buildSlowSortHref(queryState, "stockCoverDays", "desc")}
                            label="Days Cover"
                          />
                        </div>
                      </TableHead>
                      <TableHead>Signal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.slowMovers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                          No slow-moving products found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.slowMovers.map((metric) => {
                        const signal = getSlowSignal(metric);
                        return (
                          <TableRow key={metric.id}>
                            <TableCell className="font-medium">{metric.name}</TableCell>
                            <TableCell className="text-muted-foreground">{metric.sku}</TableCell>
                            <TableCell className="text-right">{numberFormat.format(metric.stockQty)}</TableCell>
                            <TableCell className="text-right">{numberFormat.format(metric.soldQty)}</TableCell>
                            <TableCell className="text-right">{formatRate(metric.movingRatePerDay)}</TableCell>
                            <TableCell className="text-right">
                              {formatDaysCover(metric.stockCoverDays, metric.soldQty)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={signal.variant}>{signal.label}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </OwnerShell>
  );
}
