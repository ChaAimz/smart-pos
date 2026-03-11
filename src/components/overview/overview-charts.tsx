"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  CardAction,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import Link from "next/link";

const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const revenueChartConfig = {
  cashRevenueCents: {
    label: "Cash",
    color: "var(--chart-2)",
  },
  qrCodeRevenueCents: {
    label: "QR Code",
    color: "var(--chart-4)",
  },
  creditCardRevenueCents: {
    label: "Credit Card",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig;

const paymentChartConfig = {
  cash: {
    label: "Cash",
    color: "var(--chart-2)",
  },
  qrCode: {
    label: "QR Code",
    color: "var(--chart-4)",
  },
  creditCard: {
    label: "Credit Card",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig;

const productsChartConfig = {
  quantity: {
    label: "Qty Sold",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

type OverviewChartsProps = {
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
  trendRangeLabel: string;
  trendRanges: Array<{
    active: boolean;
    href: string;
    label: string;
  }>;
  topProducts: Array<{
    id: string;
    name: string;
    quantity: number;
  }>;
};

function formatCompactPrice(cents: number) {
  return compactUsd.format(cents / 100);
}

function shortenName(value: string) {
  if (value.length <= 26) {
    return value;
  }

  return `${value.slice(0, 26)}...`;
}

export function OverviewCharts({
  dailyTrend,
  paymentMix,
  trendRangeLabel,
  trendRanges,
  topProducts,
}: OverviewChartsProps) {
  const totalRecentRevenueCents = dailyTrend.reduce(
    (sum, item) => sum + item.revenueCents,
    0
  );
  const totalRecentSales = dailyTrend.reduce((sum, item) => sum + item.salesCount, 0);
  const hasPaymentData = paymentMix.some((item) => item.count > 0);
  const hasTopProductData = topProducts.length > 0;

  const paymentData = paymentMix.map((item) => ({
    key:
      item.method === "CASH"
        ? "cash"
        : item.method === "QR_CODE"
          ? "qrCode"
          : "creditCard",
    methodLabel:
      item.method === "CASH"
        ? "Cash"
        : item.method === "QR_CODE"
          ? "QR Code"
          : "Credit Card",
    count: item.count,
    revenueCents: item.revenueCents,
    fill:
      item.method === "CASH"
        ? "var(--color-cash)"
        : item.method === "QR_CODE"
          ? "var(--color-qrCode)"
          : "var(--color-creditCard)",
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Revenue Trend</CardTitle>
            <CardDescription>
              Stacked by payment type over the last {trendRangeLabel}.
            </CardDescription>
            <CardAction className="flex flex-wrap items-center gap-1">
              {trendRanges.map((range) => (
                <Button
                  key={range.label}
                  asChild
                  size="sm"
                  variant={range.active ? "secondary" : "ghost"}
                  className="h-7 px-2"
                >
                  <Link href={range.href}>{range.label}</Link>
                </Button>
              ))}
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ChartContainer
              config={revenueChartConfig}
              className="h-[260px] w-full aspect-auto"
            >
              <BarChart data={dailyTrend} margin={{ left: 8, right: 12, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={14}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(value) => `$${Math.round(Number(value) / 100)}`}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) =>
                        `${String(payload?.[0]?.payload?.dateKey ?? "")} • ${formatCompactPrice(
                          Number(
                            (payload ?? []).reduce(
                              (sum, item) => sum + Number(item.value ?? 0),
                              0
                            )
                          )
                        )}`
                      }
                      formatter={(value, name) => {
                        const methodLabel =
                          name === "cashRevenueCents"
                            ? "Cash"
                            : name === "qrCodeRevenueCents"
                              ? "QR Code"
                              : name === "creditCardRevenueCents"
                                ? "Credit Card"
                                : String(name);

                        return `${methodLabel}: ${formatCompactPrice(Number(value))}`;
                      }}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar
                  dataKey="cashRevenueCents"
                  stackId="revenue"
                  fill="var(--color-cashRevenueCents)"
                  name="Cash"
                />
                <Bar
                  dataKey="qrCodeRevenueCents"
                  stackId="revenue"
                  fill="var(--color-qrCodeRevenueCents)"
                  name="QR Code"
                />
                <Bar
                  dataKey="creditCardRevenueCents"
                  stackId="revenue"
                  fill="var(--color-creditCardRevenueCents)"
                  radius={[4, 4, 0, 0]}
                  name="Credit Card"
                />
              </BarChart>
            </ChartContainer>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>{totalRecentSales} orders</span>
              <span>{formatCompactPrice(totalRecentRevenueCents)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Mix</CardTitle>
            <CardDescription>
              Cash, QR Code, and Credit Card split ({trendRangeLabel}).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {hasPaymentData ? (
              <ChartContainer
                config={paymentChartConfig}
                className="mx-auto h-[220px] w-full max-w-[280px]"
              >
                <PieChart>
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        nameKey="key"
                        formatter={(value, _, item) => {
                          const revenue = Number(item.payload.revenueCents ?? 0);
                          return `${value} orders • ${formatCompactPrice(revenue)}`;
                        }}
                      />
                    }
                  />
                  <Pie
                    data={paymentData}
                    dataKey="count"
                    nameKey="key"
                    innerRadius={54}
                    outerRadius={88}
                    strokeWidth={4}
                  />
                </PieChart>
              </ChartContainer>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No payment records in the last 14 days.
              </p>
            )}

            <div className="flex flex-col gap-2 text-sm">
              {paymentData.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: item.fill }}
                      aria-hidden="true"
                    />
                    <span>{item.methodLabel}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {item.count} orders
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Products by Quantity</CardTitle>
          <CardDescription>Best-selling items in the last {trendRangeLabel}.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasTopProductData ? (
            <ChartContainer
              config={productsChartConfig}
              className="h-[300px] w-full aspect-auto"
            >
              <BarChart
                data={topProducts}
                layout="vertical"
                margin={{ left: 28, right: 12, top: 8, bottom: 8 }}
              >
                <CartesianGrid horizontal={false} />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={200}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(value) => shortenName(String(value))}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) =>
                        String(payload?.[0]?.payload?.name ?? "")
                      }
                      formatter={(value) => `${value} pcs`}
                    />
                  }
                />
                <Bar dataKey="quantity" fill="var(--color-quantity)" radius={6} />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No product-level sales data in the last 14 days.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
