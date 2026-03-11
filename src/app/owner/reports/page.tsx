import { OwnerShell } from "@/components/layout/owner-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireOwnerSession } from "@/lib/owner-session";
import { formatCurrencyFromCents, type StoreCurrencyCode } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getStoreCurrencyCode } from "@/lib/store-setting";

type OwnerReportsPageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
  }>;
};

type ReportData = {
  averageTicketCents: number;
  currencyCode: StoreCurrencyCode;
  dailySummary: Array<{
    dateKey: string;
    revenueCents: number;
    salesCount: number;
  }>;
  revenueCents: number;
  salesCount: number;
  topProducts: Array<{
    id: string;
    name: string;
    quantity: number;
    revenueCents: number;
    sku: string;
  }>;
};

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatPrice(cents: number, currencyCode: StoreCurrencyCode) {
  return formatCurrencyFromCents(cents, currencyCode);
}

function parseDateInput(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function shiftDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatDateInput(date: Date) {
  return dateFormat.format(date);
}

function getDateRange(fromValue: string | undefined, toValue: string | undefined) {
  const today = new Date();
  const defaultTo = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  ));
  const defaultFrom = shiftDays(defaultTo, -29);

  const parsedFrom = parseDateInput(fromValue);
  const parsedTo = parseDateInput(toValue);

  let from = parsedFrom ?? defaultFrom;
  let to = parsedTo ?? defaultTo;

  if (from > to) {
    from = defaultFrom;
    to = defaultTo;
  }

  if (shiftDays(from, 366) < to) {
    from = shiftDays(to, -365);
  }

  return {
    from,
    fromInput: formatDateInput(from),
    to,
    toExclusive: shiftDays(to, 1),
    toInput: formatDateInput(to),
  };
}

async function getReportData(from: Date, toExclusive: Date): Promise<ReportData> {
  try {
    const currencyCodePromise = getStoreCurrencyCode();
    const [sales, saleItems] = await prisma.$transaction([
      prisma.sale.findMany({
        where: {
          createdAt: {
            gte: from,
            lt: toExclusive,
          },
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          createdAt: true,
          totalCents: true,
        },
      }),
      prisma.saleItem.findMany({
        where: {
          sale: {
            createdAt: {
              gte: from,
              lt: toExclusive,
            },
          },
        },
        select: {
          quantity: true,
          unitPriceCents: true,
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
            },
          },
        },
      }),
    ]);

    const revenueCents = sales.reduce((sum, sale) => sum + sale.totalCents, 0);
    const salesCount = sales.length;
    const averageTicketCents =
      salesCount > 0 ? Math.round(revenueCents / salesCount) : 0;

    const dailyMap = new Map<string, { revenueCents: number; salesCount: number }>();
    for (const sale of sales) {
      const dateKey = formatDateInput(sale.createdAt);
      const existing = dailyMap.get(dateKey);
      if (existing) {
        existing.salesCount += 1;
        existing.revenueCents += sale.totalCents;
      } else {
        dailyMap.set(dateKey, {
          revenueCents: sale.totalCents,
          salesCount: 1,
        });
      }
    }

    const topProductMap = new Map<
      string,
      {
        name: string;
        quantity: number;
        revenueCents: number;
        sku: string;
      }
    >();
    for (const item of saleItems) {
      const existing = topProductMap.get(item.product.id);
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenueCents += item.quantity * item.unitPriceCents;
      } else {
        topProductMap.set(item.product.id, {
          name: item.product.name,
          quantity: item.quantity,
          revenueCents: item.quantity * item.unitPriceCents,
          sku: item.product.sku,
        });
      }
    }

    const topProducts = Array.from(topProductMap.entries())
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8);

    const dailySummary = Array.from(dailyMap.entries())
      .map(([dateKey, value]) => ({ dateKey, ...value }))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    const currencyCode = await currencyCodePromise;

    return {
      averageTicketCents,
      currencyCode,
      dailySummary,
      revenueCents,
      salesCount,
      topProducts,
    };
  } catch {
    return {
      averageTicketCents: 0,
      currencyCode: "ZAR",
      dailySummary: [],
      revenueCents: 0,
      salesCount: 0,
      topProducts: [],
    };
  }
}

export default async function OwnerReportsPage({
  searchParams,
}: OwnerReportsPageProps) {
  const sessionUser = await requireOwnerSession();
  const params = await searchParams;
  const dateRange = getDateRange(params.from, params.to);
  const data = await getReportData(dateRange.from, dateRange.toExclusive);

  return (
    <OwnerShell
      activeNav="reports"
      mainClassName="h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden"
      pageTitle="Reports"
      userEmail={sessionUser.email}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <Card className="shrink-0 gap-0">
          <CardHeader>
            <CardTitle className="text-base">Report Range</CardTitle>
            <CardDescription>Filter by date and export CSV for accounting workflows.</CardDescription>
          </CardHeader>
          <div className="border-t" />
          <CardContent className="pt-4">
            <form className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_180px_auto_auto]">
              <Input name="from" type="date" defaultValue={dateRange.fromInput} required />
              <Input name="to" type="date" defaultValue={dateRange.toInput} required />
              <Button type="submit" variant="outline">
                Apply Range
              </Button>
              <Button asChild>
                <a
                  href={`/api/reports/sales?from=${dateRange.fromInput}&to=${dateRange.toInput}`}
                >
                  Export CSV
                </a>
              </Button>
            </form>
          </CardContent>
        </Card>

        <section className="shrink-0 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Sales</CardDescription>
              <CardTitle className="text-3xl">{data.salesCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Revenue</CardDescription>
              <CardTitle className="text-3xl">{formatPrice(data.revenueCents, data.currencyCode)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Average Ticket</CardDescription>
              <CardTitle className="text-3xl">{formatPrice(data.averageTicketCents, data.currencyCode)}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section className="min-h-0 flex-1 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardHeader className="shrink-0">
              <CardTitle className="text-base">Top Products by Qty</CardTitle>
              <CardDescription>Best sellers in the selected period.</CardDescription>
            </CardHeader>
            <div className="border-t" />
            <CardContent className="min-h-0 flex-1 overflow-y-auto pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                        No sales data in this range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.topProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="text-muted-foreground">{product.sku}</TableCell>
                        <TableCell className="text-right">{product.quantity}</TableCell>
                        <TableCell className="text-right">
                          {formatPrice(product.revenueCents, data.currencyCode)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardHeader className="shrink-0">
              <CardTitle className="text-base">Daily Revenue</CardTitle>
              <CardDescription>Sales and revenue grouped by day.</CardDescription>
            </CardHeader>
            <div className="border-t" />
            <CardContent className="min-h-0 flex-1 overflow-y-auto pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.dailySummary.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                        No daily records in this range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.dailySummary.map((day) => (
                      <TableRow key={day.dateKey}>
                        <TableCell className="font-medium">{day.dateKey}</TableCell>
                        <TableCell className="text-right">{day.salesCount}</TableCell>
                        <TableCell className="text-right">
                          {formatPrice(day.revenueCents, data.currencyCode)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </div>
    </OwnerShell>
  );
}
