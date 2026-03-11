"use client";

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Clock3, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type ActivityKind = "sales" | "stock" | "price";
type ActivityTypeFilter = "all" | ActivityKind;
type ActivityRangeDays = 1 | 7 | 30 | 90;

export type ActivityLogRow = {
  actorEmail: string;
  createdAt: string;
  createdAtLabel: string;
  id: string;
  kind: ActivityKind;
  summary: string;
  title: string;
};

type ActivityApiPayload = {
  hasMore: boolean;
  offset: number;
  rows: ActivityLogRow[];
  totalInWindow: number;
};

type ActivityLogTableProps = {
  hasMore: boolean;
  initialFilter: ActivityTypeFilter;
  initialQuery: string;
  initialRangeDays: ActivityRangeDays;
  rows: ActivityLogRow[];
};

const PAGE_SIZE = 40;
const LIVE_REFRESH_MS = 10_000;

function columnClassName(columnId: string) {
  if (columnId === "createdAtLabel") {
    return "w-44";
  }
  if (columnId === "kind") {
    return "w-28";
  }
  if (columnId === "title") {
    return "min-w-72";
  }
  if (columnId === "summary") {
    return "min-w-96";
  }
  if (columnId === "actorEmail") {
    return "min-w-52";
  }
  return "";
}

function kindLabel(kind: ActivityKind) {
  if (kind === "sales") {
    return "Sale";
  }
  if (kind === "stock") {
    return "Stock";
  }
  return "Price";
}

function kindBadgeClassName(kind: ActivityKind) {
  if (kind === "sales") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (kind === "stock") {
    return "bg-blue-100 text-blue-700";
  }
  return "bg-amber-100 text-amber-700";
}

function buildActivityLogHref(input: {
  query: string;
  rangeDays: ActivityRangeDays;
  typeFilter: ActivityTypeFilter;
}) {
  const params = new URLSearchParams();
  const query = input.query.trim();
  if (query) {
    params.set("q", query);
  }
  if (input.typeFilter !== "all") {
    params.set("type", input.typeFilter);
  }
  if (input.rangeDays !== 7) {
    params.set("range", String(input.rangeDays));
  }

  const search = params.toString();
  return search ? `/owner/activity?${search}` : "/owner/activity";
}

export function ActivityLogTable({
  hasMore,
  initialFilter,
  initialQuery,
  initialRangeDays,
  rows,
}: ActivityLogTableProps) {
  const [tableRows, setTableRows] = useState(rows);
  const [hasMoreRows, setHasMoreRows] = useState(hasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [typeFilter, setTypeFilter] = useState<ActivityTypeFilter>(initialFilter);
  const [rangeDays, setRangeDays] = useState<ActivityRangeDays>(initialRangeDays);

  const scrollElementRef = useRef<HTMLDivElement>(null);
  const requestedOffsetRef = useRef<string | null>(null);
  const queryTokenRef = useRef(0);
  const isFirstLoadRef = useRef(true);
  const isFirstUrlSyncRef = useRef(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    setTableRows(rows);
    setHasMoreRows(hasMore);
    setLoadError(null);
    setQuery(initialQuery);
    setDebouncedQuery(initialQuery);
    setTypeFilter(initialFilter);
    setRangeDays(initialRangeDays);
    setIsLoadingMore(false);
    setIsRefreshing(false);
    requestedOffsetRef.current = null;
    queryTokenRef.current += 1;
    isFirstLoadRef.current = true;
  }, [hasMore, initialFilter, initialQuery, initialRangeDays, rows]);

  const fetchPage = useCallback(
    async (input: {
      append: boolean;
      limit: number;
      offset: number;
      queryValue: string;
      rangeValue: ActivityRangeDays;
      token: number;
      typeValue: ActivityTypeFilter;
    }) => {
      const params = new URLSearchParams({
        limit: String(input.limit),
        offset: String(input.offset),
        q: input.queryValue,
        range: String(input.rangeValue),
        type: input.typeValue,
      });

      const response = await fetch(`/api/owner/activity?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("fetch_failed");
      }

      const payload = (await response.json()) as ActivityApiPayload;
      if (input.token !== queryTokenRef.current) {
        return;
      }

      setHasMoreRows(payload.hasMore);
      if (input.append) {
        setTableRows((previousRows) => {
          if (previousRows.length !== input.offset) {
            return previousRows;
          }
          return [...previousRows, ...payload.rows];
        });
      } else {
        setTableRows(payload.rows);
      }
    },
    []
  );

  useEffect(() => {
    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;
      return;
    }

    const nextToken = queryTokenRef.current + 1;
    queryTokenRef.current = nextToken;
    requestedOffsetRef.current = null;

    setIsLoadingMore(false);
    setIsRefreshing(true);
    setLoadError(null);

    void (async () => {
      try {
        await fetchPage({
          append: false,
          limit: PAGE_SIZE,
          offset: 0,
          queryValue: debouncedQuery,
          rangeValue: rangeDays,
          token: nextToken,
          typeValue: typeFilter,
        });
      } catch {
        if (nextToken !== queryTokenRef.current) {
          return;
        }
        setTableRows([]);
        setHasMoreRows(false);
        setLoadError("Unable to load activity log right now.");
      } finally {
        if (nextToken === queryTokenRef.current) {
          setIsRefreshing(false);
        }
      }
    })();
  }, [debouncedQuery, fetchPage, rangeDays, typeFilter]);

  const loadMore = useCallback(async () => {
    const offset = tableRows.length;
    const requestKey = `${debouncedQuery}:${typeFilter}:${rangeDays}:${offset}`;

    if (
      !hasMoreRows ||
      isLoadingMore ||
      isRefreshing ||
      requestedOffsetRef.current === requestKey
    ) {
      return;
    }

    requestedOffsetRef.current = requestKey;
    setIsLoadingMore(true);
    setLoadError(null);
    const token = queryTokenRef.current;

    try {
      await fetchPage({
        append: true,
        limit: PAGE_SIZE,
        offset,
        queryValue: debouncedQuery,
        rangeValue: rangeDays,
        token,
        typeValue: typeFilter,
      });
    } catch {
      if (token === queryTokenRef.current) {
        setLoadError("Unable to load more events.");
      }
    } finally {
      requestedOffsetRef.current = null;
      if (token === queryTokenRef.current) {
        setIsLoadingMore(false);
      }
    }
  }, [
    debouncedQuery,
    fetchPage,
    hasMoreRows,
    isLoadingMore,
    isRefreshing,
    rangeDays,
    tableRows.length,
    typeFilter,
  ]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.hidden || isLoadingMore || isRefreshing) {
        return;
      }

      const token = queryTokenRef.current;
      const refreshLimit = Math.min(Math.max(tableRows.length, PAGE_SIZE), 120);

      void (async () => {
        try {
          await fetchPage({
            append: false,
            limit: refreshLimit,
            offset: 0,
            queryValue: debouncedQuery,
            rangeValue: rangeDays,
            token,
            typeValue: typeFilter,
          });
        } catch {
          // Keep existing rows; live refresh can fail transiently.
        }
      })();
    }, LIVE_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    debouncedQuery,
    fetchPage,
    isLoadingMore,
    isRefreshing,
    rangeDays,
    tableRows.length,
    typeFilter,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextHref = buildActivityLogHref({
      query: debouncedQuery,
      rangeDays,
      typeFilter,
    });
    const currentHref = `${window.location.pathname}${window.location.search}`;

    if (isFirstUrlSyncRef.current) {
      isFirstUrlSyncRef.current = false;
      if (currentHref === nextHref) {
        return;
      }
    } else if (currentHref === nextHref) {
      return;
    }

    window.history.replaceState(window.history.state, "", nextHref);
  }, [debouncedQuery, rangeDays, typeFilter]);

  const columns = useMemo<Array<ColumnDef<ActivityLogRow>>>(
    () => [
      {
        accessorKey: "createdAtLabel",
        header: "Time",
      },
      {
        accessorKey: "kind",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="secondary" className={kindBadgeClassName(row.original.kind)}>
            {kindLabel(row.original.kind)}
          </Badge>
        ),
      },
      {
        accessorKey: "title",
        header: "Event",
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        accessorKey: "summary",
        header: "Details",
        cell: ({ row }) => (
          <span className="block max-w-[560px] truncate text-muted-foreground">{row.original.summary}</span>
        ),
      },
      {
        accessorKey: "actorEmail",
        header: "Actor",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{row.original.actorEmail}</span>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data: tableRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const rowsModel = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rowsModel.length,
    estimateSize: () => 52,
    getScrollElement: () => scrollElementRef.current,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  useEffect(() => {
    if (!hasMoreRows || isLoadingMore || isRefreshing || loadError || rowsModel.length === 0) {
      return;
    }

    const lastVirtualRow = virtualRows[virtualRows.length - 1];
    if (!lastVirtualRow) {
      return;
    }

    if (lastVirtualRow.index >= rowsModel.length - 12) {
      void loadMore();
    }
  }, [hasMoreRows, isLoadingMore, isRefreshing, loadError, loadMore, rowsModel.length, virtualRows]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="mb-4 shrink-0 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full max-w-sm">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Search by product, SKU, reason, or user"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ButtonGroup>
            <Button
              type="button"
              size="sm"
              variant={typeFilter === "all" ? "default" : "outline"}
              onClick={() => {
                setTypeFilter("all");
              }}
            >
              All
            </Button>
            <Button
              type="button"
              size="sm"
              variant={typeFilter === "sales" ? "default" : "outline"}
              onClick={() => {
                setTypeFilter("sales");
              }}
            >
              Sales
            </Button>
            <Button
              type="button"
              size="sm"
              variant={typeFilter === "stock" ? "default" : "outline"}
              onClick={() => {
                setTypeFilter("stock");
              }}
            >
              Stock
            </Button>
            <Button
              type="button"
              size="sm"
              variant={typeFilter === "price" ? "default" : "outline"}
              onClick={() => {
                setTypeFilter("price");
              }}
            >
              Price
            </Button>
          </ButtonGroup>

          <ButtonGroup>
            <Button
              type="button"
              size="sm"
              variant={rangeDays === 1 ? "default" : "outline"}
              onClick={() => {
                setRangeDays(1);
              }}
            >
              1D
            </Button>
            <Button
              type="button"
              size="sm"
              variant={rangeDays === 7 ? "default" : "outline"}
              onClick={() => {
                setRangeDays(7);
              }}
            >
              7D
            </Button>
            <Button
              type="button"
              size="sm"
              variant={rangeDays === 30 ? "default" : "outline"}
              onClick={() => {
                setRangeDays(30);
              }}
            >
              30D
            </Button>
            <Button
              type="button"
              size="sm"
              variant={rangeDays === 90 ? "default" : "outline"}
              onClick={() => {
                setRangeDays(90);
              }}
            >
              90D
            </Button>
          </ButtonGroup>

          <Badge variant="outline" className="gap-1.5">
            <Clock3 className="size-3.5" aria-hidden="true" />
            Live 10s
          </Badge>
        </div>
      </div>

      <div
        ref={scrollElementRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-auto rounded-md border"
      >
        <Table className="min-w-[1120px]">
          <TableCaption>
            Showing {tableRows.length}
            {hasMoreRows ? "+" : ""} events.
            {isRefreshing ? " Refreshing..." : ""}
          </TableCaption>
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn("sticky top-0 z-10 bg-muted/40", columnClassName(header.column.id))}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rowsModel.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                  {isRefreshing ? "Refreshing activity..." : "No activity events found."}
                </TableCell>
              </TableRow>
            ) : (
              <>
                {paddingTop > 0 ? (
                  <TableRow aria-hidden="true">
                    <TableCell colSpan={columns.length} style={{ height: `${paddingTop}px` }} className="p-0" />
                  </TableRow>
                ) : null}

                {virtualRows.map((virtualRow) => {
                  const row = rowsModel[virtualRow.index];
                  if (!row) {
                    return null;
                  }

                  return (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className={columnClassName(cell.column.id)}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}

                {paddingBottom > 0 ? (
                  <TableRow aria-hidden="true">
                    <TableCell colSpan={columns.length} style={{ height: `${paddingBottom}px` }} className="p-0" />
                  </TableRow>
                ) : null}

                {isLoadingMore ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="py-3 text-center text-xs text-muted-foreground">
                      Loading more events...
                    </TableCell>
                  </TableRow>
                ) : null}

                {loadError ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="py-3 text-center text-xs">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-destructive">{loadError}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void loadMore();
                          }}
                        >
                          Retry
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
