import type { Prisma } from "@prisma/client";

import { formatCurrencyFromCents, type StoreCurrencyCode } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getStoreCurrencyCode } from "@/lib/store-setting";

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SOURCE_TAKE = 500;
const SOURCE_BUFFER = 80;
const OWNER_ACTIVITY_RANGE_OPTIONS = [1, 7, 30, 90] as const;

export type OwnerActivityFilter = "all" | "sales" | "stock" | "price";
export type OwnerActivityRangeDays = (typeof OWNER_ACTIVITY_RANGE_OPTIONS)[number];

export type OwnerActivityRow = {
  actorEmail: string;
  createdAt: string;
  createdAtLabel: string;
  id: string;
  kind: Exclude<OwnerActivityFilter, "all">;
  summary: string;
  title: string;
};

export type OwnerActivityListResult = {
  hasMore: boolean;
  offset: number;
  rows: OwnerActivityRow[];
  totalInWindow: number;
};

function formatPrice(cents: number, currencyCode: StoreCurrencyCode) {
  return formatCurrencyFromCents(cents, currencyCode);
}

function paymentMethodLabel(value: "CASH" | "QR_CODE" | "CREDIT_CARD") {
  if (value === "QR_CODE") {
    return "QR Code";
  }
  if (value === "CREDIT_CARD") {
    return "Credit Card";
  }
  return "Cash";
}

function movementLabel(value: "SALE" | "RECEIVE" | "ADJUSTMENT") {
  if (value === "RECEIVE") {
    return "Stock Received";
  }
  if (value === "ADJUSTMENT") {
    return "Stock Adjusted";
  }
  return "Stock Deducted";
}

function toStatusLabel(value: "APPROVED" | "PENDING_APPROVAL" | "REJECTED") {
  if (value === "PENDING_APPROVAL") {
    return "PENDING";
  }
  return value;
}

function normalizeSignedQuantity(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function normalizeOwnerActivityFilter(value: string | undefined): OwnerActivityFilter {
  if (value === "sales" || value === "stock" || value === "price") {
    return value;
  }
  return "all";
}

function isOwnerActivityRangeDays(value: number): value is OwnerActivityRangeDays {
  return OWNER_ACTIVITY_RANGE_OPTIONS.includes(value as OwnerActivityRangeDays);
}

export function normalizeOwnerActivityRange(value: string | undefined): OwnerActivityRangeDays {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || !isOwnerActivityRangeDays(parsed)) {
    return 7;
  }
  return parsed;
}

export async function listOwnerActivity(input: {
  filter: OwnerActivityFilter;
  limit: number;
  offset: number;
  query: string;
  rangeDays: OwnerActivityRangeDays;
}): Promise<OwnerActivityListResult> {
  const currencyCode = await getStoreCurrencyCode();
  const limit = Math.max(1, Math.min(80, Math.trunc(input.limit)));
  const offset = Math.max(0, Math.trunc(input.offset));
  const query = input.query.trim();
  const sourceTake = Math.min(offset + limit + SOURCE_BUFFER, MAX_SOURCE_TAKE);
  const rangeStart = new Date(
    startOfUtcDay(new Date()).getTime() - DAY_MS * (input.rangeDays - 1)
  );

  const includeSales = input.filter === "all" || input.filter === "sales";
  const includeStock = input.filter === "all" || input.filter === "stock";
  const includePrice = input.filter === "all" || input.filter === "price";

  const salesSearchWhere: Prisma.SaleWhereInput | undefined = query
    ? {
        OR: [
          {
            id: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            soldByUser: {
              email: {
                contains: query,
                mode: "insensitive",
              },
            },
          },
          {
            items: {
              some: {
                product: {
                  name: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
              },
            },
          },
          {
            items: {
              some: {
                product: {
                  sku: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
              },
            },
          },
        ],
      }
    : undefined;
  const salesWhere: Prisma.SaleWhereInput = salesSearchWhere
    ? {
        AND: [{ createdAt: { gte: rangeStart } }, salesSearchWhere],
      }
    : {
        createdAt: {
          gte: rangeStart,
        },
      };

  const stockSearchWhere: Prisma.InventoryMovementWhereInput | undefined = query
    ? {
        OR: [
          {
            id: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            reason: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            product: {
              name: {
                contains: query,
                mode: "insensitive",
              },
            },
          },
          {
            product: {
              sku: {
                contains: query,
                mode: "insensitive",
              },
            },
          },
          {
            createdByUser: {
              email: {
                contains: query,
                mode: "insensitive",
              },
            },
          },
          {
            approvedByUser: {
              email: {
                contains: query,
                mode: "insensitive",
              },
            },
          },
          {
            rejectedByUser: {
              email: {
                contains: query,
                mode: "insensitive",
              },
            },
          },
        ],
      }
    : undefined;
  const stockWhereAnd: Prisma.InventoryMovementWhereInput[] = [
    {
      movementType: {
        not: "SALE",
      },
    },
    {
      createdAt: {
        gte: rangeStart,
      },
    },
  ];
  if (stockSearchWhere) {
    stockWhereAnd.push(stockSearchWhere);
  }
  const stockWhere: Prisma.InventoryMovementWhereInput =
    stockWhereAnd.length === 1 ? stockWhereAnd[0] : { AND: stockWhereAnd };

  const priceSearchWhere: Prisma.ProductPriceLogWhereInput | undefined = query
    ? {
        OR: [
          {
            id: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            productName: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            sku: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            changedByUser: {
              email: {
                contains: query,
                mode: "insensitive",
              },
            },
          },
        ],
      }
    : undefined;
  const priceWhere: Prisma.ProductPriceLogWhereInput = priceSearchWhere
    ? {
        AND: [{ createdAt: { gte: rangeStart } }, priceSearchWhere],
      }
    : {
        createdAt: {
          gte: rangeStart,
        },
      };

  const [sales, stockMovements, priceChanges] = await Promise.all([
    includeSales
      ? prisma.sale.findMany({
          where: salesWhere,
          orderBy: {
            createdAt: "desc",
          },
          take: sourceTake,
          select: {
            id: true,
            createdAt: true,
            paymentMethod: true,
            totalCents: true,
            soldByUser: {
              select: {
                email: true,
              },
            },
            _count: {
              select: {
                items: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    includeStock
      ? prisma.inventoryMovement.findMany({
          where: stockWhere,
          orderBy: {
            createdAt: "desc",
          },
          take: sourceTake,
          select: {
            id: true,
            approvalStatus: true,
            createdAt: true,
            createdByUser: {
              select: {
                email: true,
              },
            },
            approvedAt: true,
            approvedByUser: {
              select: {
                email: true,
              },
            },
            movementType: true,
            product: {
              select: {
                name: true,
                sku: true,
              },
            },
            rejectedAt: true,
            rejectedByUser: {
              select: {
                email: true,
              },
            },
            quantityAfter: true,
            quantityBefore: true,
            quantityDelta: true,
            reason: true,
          },
        })
      : Promise.resolve([]),
    includePrice
      ? prisma.productPriceLog.findMany({
          where: priceWhere,
          orderBy: {
            createdAt: "desc",
          },
          take: sourceTake,
          select: {
            id: true,
            changedByUser: {
              select: {
                email: true,
              },
            },
            createdAt: true,
            nextCostCents: true,
            nextPriceCents: true,
            previousCostCents: true,
            previousPriceCents: true,
            productName: true,
            sku: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const rows: OwnerActivityRow[] = [
    ...sales.map((sale) => ({
      actorEmail: sale.soldByUser.email,
      createdAt: sale.createdAt.toISOString(),
      createdAtLabel: dateTimeFormat.format(sale.createdAt),
      id: `sale:${sale.id}`,
      kind: "sales" as const,
      summary: `${formatPrice(sale.totalCents, currencyCode)} | ${paymentMethodLabel(sale.paymentMethod)} | ${sale._count.items} items`,
      title: `Checkout ${sale.id.slice(-8).toUpperCase()}`,
    })),
    ...stockMovements.flatMap((movement) => {
      const baseRows: OwnerActivityRow[] = [
        {
          actorEmail: movement.createdByUser.email,
          createdAt: movement.createdAt.toISOString(),
          createdAtLabel: dateTimeFormat.format(movement.createdAt),
          id: `stock:${movement.id}:created`,
          kind: "stock",
          summary: `${movement.product.name} (${movement.product.sku}) | ${normalizeSignedQuantity(movement.quantityDelta)} | ${toStatusLabel(movement.approvalStatus)}`,
          title: `${movementLabel(movement.movementType)} • ${movement.reason}`,
        },
      ];

      if (movement.approvedAt && movement.approvedByUser?.email) {
        baseRows.push({
          actorEmail: movement.approvedByUser.email,
          createdAt: movement.approvedAt.toISOString(),
          createdAtLabel: dateTimeFormat.format(movement.approvedAt),
          id: `stock:${movement.id}:approved`,
          kind: "stock",
          summary: `${movement.product.name} (${movement.product.sku}) | ${movement.quantityBefore}→${movement.quantityAfter}`,
          title: "Stock Adjustment Approved",
        });
      }

      if (movement.rejectedAt && movement.rejectedByUser?.email) {
        baseRows.push({
          actorEmail: movement.rejectedByUser.email,
          createdAt: movement.rejectedAt.toISOString(),
          createdAtLabel: dateTimeFormat.format(movement.rejectedAt),
          id: `stock:${movement.id}:rejected`,
          kind: "stock",
          summary: `${movement.product.name} (${movement.product.sku}) | ${normalizeSignedQuantity(movement.quantityDelta)}`,
          title: "Stock Adjustment Rejected",
        });
      }

      return baseRows;
    }),
    ...priceChanges.map((change) => ({
      actorEmail: change.changedByUser.email,
      createdAt: change.createdAt.toISOString(),
      createdAtLabel: dateTimeFormat.format(change.createdAt),
      id: `price:${change.id}`,
      kind: "price" as const,
      summary: `${change.productName} (${change.sku}) | Sell ${formatPrice(change.previousPriceCents, currencyCode)}→${formatPrice(change.nextPriceCents, currencyCode)} | Cost ${formatPrice(change.previousCostCents, currencyCode)}→${formatPrice(change.nextCostCents, currencyCode)}`,
      title: "Price Updated",
    })),
  ].sort((a, b) => {
    if (a.createdAt === b.createdAt) {
      return b.id.localeCompare(a.id);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });

  const sliceEnd = offset + limit;

  return {
    hasMore: rows.length > sliceEnd,
    offset,
    rows: rows.slice(offset, sliceEnd),
    totalInWindow: rows.length,
  };
}
