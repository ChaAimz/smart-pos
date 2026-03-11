"use client";

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MoreHorizontal, PackagePlus, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export type ProductsVirtualTableRow = {
  costCents: number;
  id: string;
  isSellable: boolean;
  name: string;
  primaryBarcode: string | null;
  priceCents: number;
  stockQty: number;
  updatedAtLabel: string;
};

type ProductsVirtualTableProps = {
  hasMore: boolean;
  initialQuery: string;
  matchingProductsCount: number;
  products: ProductsVirtualTableRow[];
};

type ProductDialogMode = "new" | "edit" | "delete";

type ProductsApiPayload = {
  hasMore: boolean;
  matchingProductsCount: number;
  rows: ProductsVirtualTableRow[];
};

function buildProductsPageHref(input: {
  dialog?: ProductDialogMode | null;
  item?: string | null;
  q?: string;
}) {
  const params = new URLSearchParams();
  const query = (input.q ?? "").trim();
  if (query) {
    params.set("q", query);
  }
  if (input.dialog) {
    params.set("dialog", input.dialog);
  }
  const itemId = (input.item ?? "").trim();
  if (input.dialog && input.dialog !== "new" && itemId) {
    params.set("item", itemId);
  }

  const search = params.toString();
  return search ? `/owner/products?${search}` : "/owner/products";
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function columnClassName(columnId: string) {
  if (columnId === "name") {
    return "min-w-52";
  }
  if (columnId === "primaryBarcode") {
    return "min-w-40";
  }
  if (columnId === "stockQty") {
    return "w-20 text-right";
  }
  if (columnId === "costCents") {
    return "w-24";
  }
  if (columnId === "priceCents") {
    return "w-24";
  }
  if (columnId === "isSellable") {
    return "w-28";
  }
  if (columnId === "updatedAtLabel") {
    return "min-w-44";
  }
  if (columnId === "actions") {
    return "w-16 text-right";
  }
  return "";
}

export function ProductsVirtualTable({
  hasMore,
  initialQuery,
  matchingProductsCount,
  products,
}: ProductsVirtualTableProps) {
  const [rows, setRows] = useState(products);
  const [hasMoreRows, setHasMoreRows] = useState(hasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [listCount, setListCount] = useState(matchingProductsCount);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  const scrollElementRef = useRef<HTMLDivElement>(null);
  const requestedOffsetRef = useRef<string | null>(null);
  const queryTokenRef = useRef(0);
  const isFirstDynamicQueryRef = useRef(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    setRows(products);
    setHasMoreRows(hasMore);
    setListCount(matchingProductsCount);
    setLoadError(null);
    setQuery(initialQuery);
    setDebouncedQuery(initialQuery);
    setIsLoadingMore(false);
    setIsRefreshing(false);
    requestedOffsetRef.current = null;
    queryTokenRef.current += 1;
    isFirstDynamicQueryRef.current = true;
  }, [hasMore, initialQuery, matchingProductsCount, products]);

  const fetchPage = useCallback(
    async (input: {
      append: boolean;
      offset: number;
      queryValue: string;
      token: number;
    }) => {
      const searchParams = new URLSearchParams({
        offset: String(input.offset),
        q: input.queryValue,
      });

      const response = await fetch(`/api/owner/products?${searchParams.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("fetch_failed");
      }

      const payload = (await response.json()) as ProductsApiPayload;

      if (input.token !== queryTokenRef.current) {
        return;
      }

      setHasMoreRows(payload.hasMore);
      setListCount(payload.matchingProductsCount);

      if (input.append) {
        setRows((previousRows) => {
          if (previousRows.length !== input.offset) {
            return previousRows;
          }
          return [...previousRows, ...payload.rows];
        });
      } else {
        setRows(payload.rows);
      }
    },
    []
  );

  useEffect(() => {
    if (isFirstDynamicQueryRef.current) {
      isFirstDynamicQueryRef.current = false;
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
          offset: 0,
          queryValue: debouncedQuery,
          token: nextToken,
        });
      } catch {
        if (nextToken !== queryTokenRef.current) {
          return;
        }

        setRows([]);
        setHasMoreRows(false);
        setListCount(0);
        setLoadError("Unable to load products right now.");
      } finally {
        if (nextToken === queryTokenRef.current) {
          setIsRefreshing(false);
        }
      }
    })();
  }, [debouncedQuery, fetchPage]);

  const loadMore = useCallback(async () => {
    const offset = rows.length;
    const requestKey = `${debouncedQuery}:${offset}`;

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
        offset,
        queryValue: debouncedQuery,
        token,
      });
    } catch {
      if (token === queryTokenRef.current) {
        setLoadError("Unable to load more products right now.");
      }
    } finally {
      requestedOffsetRef.current = null;
      if (token === queryTokenRef.current) {
        setIsLoadingMore(false);
      }
    }
  }, [debouncedQuery, fetchPage, hasMoreRows, isLoadingMore, isRefreshing, rows.length]);

  const activeQuery = query.trim();

  const columns = useMemo<Array<ColumnDef<ProductsVirtualTableRow>>>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="block max-w-80 truncate font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: "primaryBarcode",
        header: "Barcode",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.primaryBarcode ?? "No barcode"}
          </span>
        ),
      },
      {
        accessorKey: "stockQty",
        header: "Stock",
        cell: ({ row }) => row.original.stockQty,
      },
      {
        accessorKey: "costCents",
        header: "Cost",
        cell: ({ row }) => formatPrice(row.original.costCents),
      },
      {
        accessorKey: "priceCents",
        header: "Price",
        cell: ({ row }) => formatPrice(row.original.priceCents),
      },
      {
        accessorKey: "isSellable",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isSellable ? "secondary" : "outline"}>
            {row.original.isSellable ? "Sellable" : "Blocked"}
          </Badge>
        ),
      },
      {
        accessorKey: "updatedAtLabel",
        header: "Updated",
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`Open actions for ${row.original.name}`}
                className="ml-auto h-8 w-8 p-0"
                size="sm"
                variant="ghost"
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link
                  href={buildProductsPageHref({
                    q: activeQuery,
                    dialog: "edit",
                    item: row.original.id,
                  })}
                >
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild variant="destructive">
                <Link
                  href={buildProductsPageHref({
                    q: activeQuery,
                    dialog: "delete",
                    item: row.original.id,
                  })}
                >
                  Delete
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [activeQuery]
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const tableRows = table.getRowModel().rows;

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    estimateSize: () => 49,
    getScrollElement: () => scrollElementRef.current,
    overscan: 8,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  useEffect(() => {
    if (
      !hasMoreRows ||
      isLoadingMore ||
      isRefreshing ||
      loadError ||
      tableRows.length === 0
    ) {
      return;
    }

    const lastVirtualRow = virtualRows[virtualRows.length - 1];
    if (!lastVirtualRow) {
      return;
    }

    if (lastVirtualRow.index >= tableRows.length - 12) {
      void loadMore();
    }
  }, [
    hasMoreRows,
    isLoadingMore,
    isRefreshing,
    loadError,
    loadMore,
    tableRows.length,
    virtualRows,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="mb-4 shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            placeholder="Search product or barcode"
            className="pl-9"
          />
        </div>
        <Button asChild>
          <Link href={buildProductsPageHref({ q: activeQuery, dialog: "new" })}>
            <PackagePlus className="size-4" aria-hidden="true" />
            New Item
          </Link>
        </Button>
      </div>

      <div
        ref={scrollElementRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-auto rounded-md border"
      >
        <Table className="min-w-[1060px]">
          <TableCaption>
            Showing {rows.length} of {listCount} products.
            {isRefreshing ? " Updating..." : ""}
          </TableCaption>
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "sticky top-0 z-10 bg-muted/40",
                      columnClassName(header.column.id)
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {tableRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-6 text-center text-muted-foreground">
                  {isRefreshing ? "Searching products..." : "No products found."}
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
                  const row = tableRows[virtualRow.index];
                  if (!row) {
                    return null;
                  }

                  return (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={columnClassName(cell.column.id)}
                        >
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
                      Loading more products...
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
