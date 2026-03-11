import { Activity, Box, DollarSign } from "lucide-react";

import { OwnerShell } from "@/components/layout/owner-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  listOwnerActivity,
  normalizeOwnerActivityFilter,
  type OwnerActivityFilter,
  normalizeOwnerActivityRange,
  type OwnerActivityRangeDays,
} from "@/lib/activity-log";
import { requireOwnerSession } from "@/lib/owner-session";
import { ActivityLogTable, type ActivityLogRow } from "./activity-log-table";

type OwnerActivityPageProps = {
  searchParams: Promise<{
    q?: string;
    range?: string;
    type?: string;
  }>;
};

type OwnerActivityPageData = {
  filter: OwnerActivityFilter;
  hasMore: boolean;
  query: string;
  rangeDays: OwnerActivityRangeDays;
  rows: ActivityLogRow[];
};

async function getOwnerActivityPageData(params: {
  q?: string;
  range?: string;
  type?: string;
}): Promise<OwnerActivityPageData> {
  const query = String(params.q ?? "").trim();
  const filter = normalizeOwnerActivityFilter(params.type);
  const rangeDays = normalizeOwnerActivityRange(params.range);

  try {
    const result = await listOwnerActivity({
      filter,
      limit: 40,
      offset: 0,
      query,
      rangeDays,
    });

    return {
      filter,
      hasMore: result.hasMore,
      query,
      rangeDays,
      rows: result.rows as ActivityLogRow[],
    };
  } catch {
    return {
      filter,
      hasMore: false,
      query,
      rangeDays,
      rows: [],
    };
  }
}

export default async function OwnerActivityPage({ searchParams }: OwnerActivityPageProps) {
  const sessionUser = await requireOwnerSession();
  const params = await searchParams;
  const data = await getOwnerActivityPageData(params);

  const salesCount = data.rows.filter((row) => row.kind === "sales").length;
  const stockCount = data.rows.filter((row) => row.kind === "stock").length;
  const priceCount = data.rows.filter((row) => row.kind === "price").length;

  return (
    <OwnerShell
      activeNav="activity"
      mainClassName="h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden pb-3 md:pb-4"
      pageTitle="Activity Log"
      userEmail={sessionUser.email}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <section className="shrink-0 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="py-4">
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <DollarSign className="size-4 text-muted-foreground" aria-hidden="true" />
                Sales Events
              </CardDescription>
              <CardTitle className="text-3xl">{salesCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <Box className="size-4 text-muted-foreground" aria-hidden="true" />
                Stock Events
              </CardDescription>
              <CardTitle className="text-3xl">{stockCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
                Price Events
              </CardDescription>
              <CardTitle className="text-3xl">{priceCount}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <div className="min-h-0 flex-1">
          <Card className="flex h-full min-h-0 flex-col overflow-hidden">
            <CardHeader className="shrink-0">
              <CardTitle className="text-base">Transaction & Inventory Timeline</CardTitle>
              <CardDescription>
                Real-time feed for checkout, stock movement, and product price updates.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
              <ActivityLogTable
                hasMore={data.hasMore}
                initialFilter={data.filter}
                initialQuery={data.query}
                initialRangeDays={data.rangeDays}
                rows={data.rows}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </OwnerShell>
  );
}
