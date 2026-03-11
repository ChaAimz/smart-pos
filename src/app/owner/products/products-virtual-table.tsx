"use client";

import {
  type ColumnDef,
  type ColumnSizingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  MoreHorizontal,
  PackagePlus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  getOwnerProductDefaultSortOrder,
  type OwnerProductSortKey,
  type OwnerProductSortOrder,
} from "@/lib/owner-product-sorting";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrencyFromCents, type StoreCurrencyCode } from "@/lib/currency";
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
  currencyCode: StoreCurrencyCode;
  hasMore: boolean;
  initialQuery: string;
  initialSortKey: OwnerProductSortKey;
  initialSortOrder: OwnerProductSortOrder;
  matchingProductsCount: number;
  products: ProductsVirtualTableRow[];
};

type ProductDialogMode = "new" | "edit" | "delete";

type ProductsApiPayload = {
  hasMore: boolean;
  matchingProductsCount: number;
  rows: ProductsVirtualTableRow[];
};

const PRODUCTS_TABLE_PREFERENCES_STORAGE_KEY = "owner-products-table-preferences-v1";
const DEFAULT_COLUMN_SIZING: ColumnSizingState = {
  actions: 72,
  costCents: 108,
  isSellable: 132,
  marginCents: 120,
  name: 248,
  priceCents: 108,
  priceMix: 220,
  primaryBarcode: 180,
  stockQty: 90,
  updatedAtLabel: 196,
};
const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {};
const COLUMN_LABELS: Record<string, string> = {
  costCents: "Cost",
  isSellable: "Status",
  marginCents: "Margin",
  name: "Name",
  priceCents: "Price",
  priceMix: "Price Mix",
  primaryBarcode: "Barcode",
  stockQty: "Stock",
  updatedAtLabel: "Updated",
};

function loadProductsTablePreferences() {
  if (typeof window === "undefined") {
    return {
      columnSizing: DEFAULT_COLUMN_SIZING,
      columnVisibility: DEFAULT_COLUMN_VISIBILITY,
    };
  }

  try {
    const raw = window.localStorage.getItem(PRODUCTS_TABLE_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return {
        columnSizing: DEFAULT_COLUMN_SIZING,
        columnVisibility: DEFAULT_COLUMN_VISIBILITY,
      };
    }

    const parsed = JSON.parse(raw) as {
      columnSizing?: ColumnSizingState;
      columnVisibility?: VisibilityState;
    };

    return {
      columnSizing: {
        ...DEFAULT_COLUMN_SIZING,
        ...(parsed.columnSizing ?? {}),
      },
      columnVisibility: parsed.columnVisibility ?? DEFAULT_COLUMN_VISIBILITY,
    };
  } catch {
    return {
      columnSizing: DEFAULT_COLUMN_SIZING,
      columnVisibility: DEFAULT_COLUMN_VISIBILITY,
    };
  }
}

function buildProductsPageHref(input: {
  dialog?: ProductDialogMode | null;
  item?: string | null;
  order?: OwnerProductSortOrder;
  q?: string;
  sort?: OwnerProductSortKey;
}) {
  const params = new URLSearchParams();
  const query = (input.q ?? "").trim();
  if (query) {
    params.set("q", query);
  }
  const sortKey = input.sort ?? "updatedAt";
  const sortOrder = input.order ?? getOwnerProductDefaultSortOrder(sortKey);
  if (sortKey !== "updatedAt") {
    params.set("sort", sortKey);
  }
  if (sortOrder !== getOwnerProductDefaultSortOrder(sortKey)) {
    params.set("order", sortOrder);
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

function formatPrice(cents: number, currencyCode: StoreCurrencyCode) {
  return formatCurrencyFromCents(cents, currencyCode);
}

const percentFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

function clampPercent(value: number) {
  return Math.min(Math.max(value, 0), 100);
}

function formatPercent(value: number) {
  return `${percentFormat.format(value)}%`;
}

function formatSignedPercent(value: number) {
  if (value > 0) {
    return `+${formatPercent(value)}`;
  }
  if (value < 0) {
    return `-${formatPercent(Math.abs(value))}`;
  }
  return "0%";
}

function formatMargin(cents: number, currencyCode: StoreCurrencyCode) {
  if (cents > 0) {
    return `+${formatPrice(cents, currencyCode)}`;
  }
  if (cents < 0) {
    return `-${formatPrice(Math.abs(cents), currencyCode)}`;
  }
  return formatPrice(0, currencyCode);
}

function columnClassName(columnId: string) {
  if (columnId === "name") {
    return "min-w-52";
  }
  if (columnId === "primaryBarcode") {
    return "min-w-40";
  }
  if (columnId === "stockQty") {
    return "text-right";
  }
  if (columnId === "updatedAtLabel") {
    return "min-w-44";
  }
  if (columnId === "actions") {
    return "text-right";
  }
  return "";
}

function nextSortState(
  currentSortKey: OwnerProductSortKey,
  currentSortOrder: OwnerProductSortOrder,
  targetSortKey: OwnerProductSortKey
) {
  if (currentSortKey !== targetSortKey) {
    return {
      sortKey: targetSortKey,
      sortOrder: getOwnerProductDefaultSortOrder(targetSortKey),
    };
  }

  return {
    sortKey: targetSortKey,
    sortOrder: currentSortOrder === "asc" ? ("desc" as const) : ("asc" as const),
  };
}

export function ProductsVirtualTable({
  currencyCode,
  hasMore,
  initialQuery,
  initialSortKey,
  initialSortOrder,
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
  const [sortKey, setSortKey] = useState<OwnerProductSortKey>(initialSortKey);
  const [sortOrder, setSortOrder] = useState<OwnerProductSortOrder>(initialSortOrder);
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(DEFAULT_COLUMN_VISIBILITY);
  const [columnSizing, setColumnSizing] =
    useState<ColumnSizingState>(DEFAULT_COLUMN_SIZING);
  const [arePreferencesReady, setArePreferencesReady] = useState(false);

  const scrollElementRef = useRef<HTMLDivElement>(null);
  const requestedOffsetRef = useRef<string | null>(null);
  const queryTokenRef = useRef(0);
  const isFirstDynamicQueryRef = useRef(true);

  useEffect(() => {
    const preferences = loadProductsTablePreferences();
    setColumnVisibility(preferences.columnVisibility);
    setColumnSizing(preferences.columnSizing);
    setArePreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!arePreferencesReady) {
      return;
    }

    window.localStorage.setItem(
      PRODUCTS_TABLE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        columnSizing,
        columnVisibility,
      })
    );
  }, [arePreferencesReady, columnSizing, columnVisibility]);

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
    setSortKey(initialSortKey);
    setSortOrder(initialSortOrder);
    setIsLoadingMore(false);
    setIsRefreshing(false);
    requestedOffsetRef.current = null;
    queryTokenRef.current += 1;
    isFirstDynamicQueryRef.current = true;
  }, [
    hasMore,
    initialQuery,
    initialSortKey,
    initialSortOrder,
    matchingProductsCount,
    products,
  ]);

  const fetchPage = useCallback(
    async (input: {
      append: boolean;
      offset: number;
      queryValue: string;
      sortKeyValue: OwnerProductSortKey;
      sortOrderValue: OwnerProductSortOrder;
      token: number;
    }) => {
      const searchParams = new URLSearchParams({
        offset: String(input.offset),
        order: input.sortOrderValue,
        q: input.queryValue,
        sort: input.sortKeyValue,
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
          sortKeyValue: sortKey,
          sortOrderValue: sortOrder,
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
  }, [debouncedQuery, fetchPage, sortKey, sortOrder]);

  const loadMore = useCallback(async () => {
    const offset = rows.length;
    const requestKey = `${debouncedQuery}:${sortKey}:${sortOrder}:${offset}`;

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
        sortKeyValue: sortKey,
        sortOrderValue: sortOrder,
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
  }, [
    debouncedQuery,
    fetchPage,
    hasMoreRows,
    isLoadingMore,
    isRefreshing,
    rows.length,
    sortKey,
    sortOrder,
  ]);

  const activeQuery = query.trim();

  const renderSortableHeader = useCallback(
    (label: string, targetSortKey: OwnerProductSortKey) => {
      const isActiveSort = sortKey === targetSortKey;

      return (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 gap-1 px-2 font-medium"
          onClick={() => {
            const nextSort = nextSortState(sortKey, sortOrder, targetSortKey);
            setSortKey(nextSort.sortKey);
            setSortOrder(nextSort.sortOrder);
          }}
        >
          {label}
          {isActiveSort ? (
            sortOrder === "asc" ? (
              <ArrowUp className="size-4" aria-hidden="true" />
            ) : (
              <ArrowDown className="size-4" aria-hidden="true" />
            )
          ) : (
            <ArrowUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
          )}
        </Button>
      );
    },
    [sortKey, sortOrder]
  );

  const columns = useMemo<Array<ColumnDef<ProductsVirtualTableRow>>>(
    () => [
      {
        accessorKey: "name",
        header: () => renderSortableHeader("Name", "name"),
        minSize: 180,
        size: 248,
        cell: ({ row }) => (
          <span className="block max-w-80 truncate font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: "primaryBarcode",
        header: "Barcode",
        minSize: 140,
        size: 180,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.primaryBarcode ?? "No barcode"}
          </span>
        ),
      },
      {
        accessorKey: "stockQty",
        header: () => renderSortableHeader("Stock", "stockQty"),
        minSize: 72,
        size: 90,
        cell: ({ row }) => row.original.stockQty,
      },
      {
        accessorKey: "costCents",
        header: () => renderSortableHeader("Cost", "costCents"),
        minSize: 96,
        size: 108,
        cell: ({ row }) => formatPrice(row.original.costCents, currencyCode),
      },
      {
        accessorKey: "priceCents",
        header: () => renderSortableHeader("Price", "priceCents"),
        minSize: 96,
        size: 108,
        cell: ({ row }) => formatPrice(row.original.priceCents, currencyCode),
      },
      {
        id: "marginCents",
        header: () => renderSortableHeader("Margin", "marginCents"),
        minSize: 104,
        size: 120,
        cell: ({ row }) => {
          const marginCents = row.original.priceCents - row.original.costCents;
          return (
            <span
              className={cn(
                marginCents > 0 && "text-emerald-600",
                marginCents < 0 && "text-destructive"
              )}
            >
              {formatMargin(marginCents, currencyCode)}
            </span>
          );
        },
      },
      {
        id: "priceMix",
        header: "Price Mix",
        minSize: 190,
        size: 220,
        cell: ({ row }) => {
          const { costCents, priceCents } = row.original;
          const marginCents = priceCents - costCents;
          const costPercentOfPrice = priceCents > 0 ? (costCents / priceCents) * 100 : 0;
          const marginPercentOfPrice = priceCents > 0 ? (marginCents / priceCents) * 100 : 0;
          const boundedCostPercent = clampPercent(costPercentOfPrice);
          const gainPercent = marginCents > 0 ? 100 - boundedCostPercent : 0;
          const overCostPercent = marginCents < 0 ? clampPercent(costPercentOfPrice - 100) : 0;

          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="min-w-44">
                  <div className="relative h-2 overflow-hidden rounded-full bg-muted/70">
                    <div
                      className="h-full bg-slate-400/90"
                      style={{ width: `${boundedCostPercent}%` }}
                    />
                    {gainPercent > 0 ? (
                      <div
                        className="absolute inset-y-0 right-0 bg-emerald-500/90"
                        style={{ width: `${gainPercent}%` }}
                      />
                    ) : null}
                    {overCostPercent > 0 ? (
                      <div
                        className="absolute inset-y-0 right-0 bg-destructive/80"
                        style={{ width: `${overCostPercent}%` }}
                      />
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] leading-none">
                    <span className="text-muted-foreground">Cost {formatPercent(costPercentOfPrice)}</span>
                    <span
                      className={cn(
                        marginCents > 0 && "text-emerald-600",
                        marginCents < 0 && "text-destructive"
                      )}
                    >
                      {formatSignedPercent(marginPercentOfPrice)}
                    </span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={8}>
                Cost {formatPrice(costCents, currencyCode)} of {formatPrice(priceCents, currencyCode)}
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: "isSellable",
        header: () => renderSortableHeader("Status", "isSellable"),
        minSize: 116,
        size: 132,
        cell: ({ row }) => (
          <Badge
            variant={row.original.isSellable ? "secondary" : "outline"}
            className={cn(row.original.isSellable && "bg-emerald-100 text-emerald-700")}
          >
            {row.original.isSellable ? "Sellable" : "Blocked"}
          </Badge>
        ),
      },
      {
        accessorKey: "updatedAtLabel",
        header: () => renderSortableHeader("Updated", "updatedAt"),
        minSize: 168,
        size: 196,
      },
      {
        id: "actions",
        header: "Actions",
        enableHiding: false,
        enableResizing: false,
        size: 72,
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
                    order: sortOrder,
                    q: activeQuery,
                    dialog: "edit",
                    item: row.original.id,
                    sort: sortKey,
                  })}
                >
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild variant="destructive">
                <Link
                  href={buildProductsPageHref({
                    order: sortOrder,
                    q: activeQuery,
                    dialog: "delete",
                    item: row.original.id,
                    sort: sortKey,
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
    [activeQuery, currencyCode, renderSortableHeader, sortKey, sortOrder]
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      columnSizing,
      columnVisibility,
    },
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const tableRows = table.getRowModel().rows;
  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const hideableColumns = table.getAllLeafColumns().filter((column) => column.getCanHide());

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    estimateSize: () => 58,
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
    <TooltipProvider delayDuration={120}>
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
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline">
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Visible Columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hideableColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(checked) => {
                      column.toggleVisibility(Boolean(checked));
                    }}
                  >
                    {COLUMN_LABELS[column.id] ?? column.id}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button asChild>
              <Link
                href={buildProductsPageHref({
                  order: sortOrder,
                  q: activeQuery,
                  dialog: "new",
                  sort: sortKey,
                })}
              >
                <PackagePlus className="size-4" aria-hidden="true" />
                New Item
              </Link>
            </Button>
          </div>
        </div>

      <div
        ref={scrollElementRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-auto rounded-md border"
      >
        <Table className="min-w-full" style={{ minWidth: `${table.getTotalSize()}px` }}>
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
                    style={{ width: `${header.getSize()}px` }}
                    className={cn(
                      "sticky top-0 z-10 bg-muted/40 relative",
                      columnClassName(header.column.id)
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    {header.column.getCanResize() ? (
                      <button
                        type="button"
                        aria-label={`Resize ${COLUMN_LABELS[header.column.id] ?? header.column.id} column`}
                        onDoubleClick={() => {
                          header.column.resetSize();
                        }}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={cn(
                          "absolute top-0 right-0 h-full w-1 cursor-col-resize select-none touch-none",
                          header.column.getIsResizing() ? "bg-primary/60" : "hover:bg-muted-foreground/40"
                        )}
                      />
                    ) : null}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {tableRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumnCount} className="py-6 text-center text-muted-foreground">
                  {isRefreshing ? "Searching products..." : "No products found."}
                </TableCell>
              </TableRow>
            ) : (
              <>
                {paddingTop > 0 ? (
                  <TableRow aria-hidden="true">
                    <TableCell colSpan={visibleColumnCount} style={{ height: `${paddingTop}px` }} className="p-0" />
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
                          style={{ width: `${cell.column.getSize()}px` }}
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
                    <TableCell colSpan={visibleColumnCount} style={{ height: `${paddingBottom}px` }} className="p-0" />
                  </TableRow>
                ) : null}

                {isLoadingMore ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumnCount} className="py-3 text-center text-xs text-muted-foreground">
                      Loading more products...
                    </TableCell>
                  </TableRow>
                ) : null}

                {loadError ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumnCount} className="py-3 text-center text-xs">
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
    </TooltipProvider>
  );
}
