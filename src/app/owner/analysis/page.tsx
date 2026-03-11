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

type AnalysisRangeDays = (typeof ANALYSIS_RANGE_OPTIONS)[number];

type OwnerAnalysisPageProps = {
  searchParams: Promise<{
    range?: string;
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

function buildAnalysisRangeHref(rangeDays: AnalysisRangeDays) {
  const params = new URLSearchParams();
  if (rangeDays !== DEFAULT_ANALYSIS_RANGE_DAYS) {
    params.set("range", String(rangeDays));
  }
  const search = params.toString();
  return search ? `/owner/analysis?${search}` : "/owner/analysis";
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

async function getAnalysisData(rangeDays: AnalysisRangeDays): Promise<AnalysisData> {
  const toDay = startOfUtcDay(new Date());
  const fromDay = shiftDays(toDay, -(rangeDays - 1));
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
      const movingRatePerDay = soldQty / rangeDays;
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

    const topSellers = metrics
      .filter((metric) => metric.soldQty > 0)
      .sort((a, b) => b.soldQty - a.soldQty || b.revenueCents - a.revenueCents)
      .slice(0, 12);

    const slowMovers = metrics
      .filter((metric) => metric.stockQty > 0 && metric.isSellable)
      .sort((a, b) => a.soldQty - b.soldQty || b.stockQty - a.stockQty || a.name.localeCompare(b.name))
      .slice(0, 12);

    const stockAlerts = metrics
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
      }))
      .sort(
        (a, b) =>
          a.alertPriority - b.alertPriority ||
          a.stockQty - b.stockQty ||
          (a.stockCoverDays ?? Number.POSITIVE_INFINITY) -
            (b.stockCoverDays ?? Number.POSITIVE_INFINITY)
      )
      .slice(0, 15);

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
      productsSoldCount > 0 ? totalUnitsSold / productsSoldCount / rangeDays : 0;
    const currencyCode = await currencyCodePromise;

    return {
      avgMovingRatePerSoldSku,
      currencyCode,
      fromLabel: displayDateFormat.format(fromDay),
      lowStockCount,
      nonMovingCount,
      outOfStockCount,
      productsSoldCount,
      rangeDays,
      slowMovers,
      stockAlerts,
      toLabel: displayDateFormat.format(toDay),
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
      rangeDays,
      slowMovers: [],
      stockAlerts: [],
      toLabel: displayDateFormat.format(toDay),
      topSellers: [],
      totalUnitsSold: 0,
    };
  }
}

export default async function OwnerAnalysisPage({ searchParams }: OwnerAnalysisPageProps) {
  const sessionUser = await requireOwnerSession();
  const params = await searchParams;
  const rangeDays = parseAnalysisRangeDays(params.range);
  const data = await getAnalysisData(rangeDays);

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
                  <Link href={buildAnalysisRangeHref(option)}>
                    {option}D window
                  </Link>
                </Button>
              ))}
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
                  Best-selling products by quantity in the last {data.rangeDays} days.
                </CardDescription>
              </CardHeader>
              <div className="border-t" />
              <CardContent className="min-h-0 flex-1 overflow-y-auto pt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Sold Qty</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Moving Rate</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Days Cover</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topSellers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                          No sold products found in this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.topSellers.map((metric) => (
                        <TableRow key={metric.id}>
                          <TableCell className="font-medium">{metric.name}</TableCell>
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
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="flex min-h-[360px] flex-col gap-0 overflow-hidden">
              <CardHeader className="shrink-0">
                <CardTitle className="text-base">Stock Alerts</CardTitle>
                <CardDescription>
                  Out-of-stock, low-stock, or soon-to-run-out products.
                </CardDescription>
              </CardHeader>
              <div className="border-t" />
              <CardContent className="min-h-0 flex-1 overflow-y-auto pt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Sold</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.stockAlerts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                          No stock alerts in this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.stockAlerts.map((alert) => (
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
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="flex min-h-[360px] flex-col gap-0 overflow-hidden xl:col-span-3">
              <CardHeader className="shrink-0">
                <CardTitle className="text-base">Slow / Non-Moving Products</CardTitle>
                <CardDescription>
                  Sellable products with low movement but remaining stock.
                </CardDescription>
              </CardHeader>
              <div className="border-t" />
              <CardContent className="min-h-0 flex-1 overflow-y-auto pt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Sold Qty</TableHead>
                      <TableHead className="text-right">Moving Rate</TableHead>
                      <TableHead className="text-right">Days Cover</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.slowMovers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                          No slow-moving products found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.slowMovers.map((metric) => (
                        <TableRow key={metric.id}>
                          <TableCell className="font-medium">{metric.name}</TableCell>
                          <TableCell className="text-muted-foreground">{metric.sku}</TableCell>
                          <TableCell className="text-right">{numberFormat.format(metric.stockQty)}</TableCell>
                          <TableCell className="text-right">{numberFormat.format(metric.soldQty)}</TableCell>
                          <TableCell className="text-right">{formatRate(metric.movingRatePerDay)}</TableCell>
                          <TableCell className="text-right">
                            {formatDaysCover(metric.stockCoverDays, metric.soldQty)}
                          </TableCell>
                        </TableRow>
                      ))
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
