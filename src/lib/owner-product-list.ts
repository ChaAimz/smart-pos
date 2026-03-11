import { Prisma } from "@prisma/client";

import {
  type OwnerProductSortKey,
  type OwnerProductSortOrder,
} from "@/lib/owner-product-sorting";
import { prisma } from "@/lib/prisma";

const ownerProductSelect = {
  barcodes: {
    where: { isPrimary: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      code: true,
    },
    take: 1,
  },
  id: true,
  isSellable: true,
  name: true,
  costCents: true,
  priceCents: true,
  sku: true,
  stockQty: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

type OwnerProductRecord = Prisma.ProductGetPayload<{
  select: typeof ownerProductSelect;
}>;

export type OwnerProductListRow = {
  costCents: number;
  id: string;
  isSellable: boolean;
  name: string;
  primaryBarcode: string | null;
  priceCents: number;
  sku: string;
  stockQty: number;
  updatedAt: Date;
};

export function buildOwnerProductWhere(query: string): Prisma.ProductWhereInput | undefined {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return undefined;
  }

  return {
    OR: [
      { name: { contains: normalizedQuery, mode: "insensitive" } },
      { sku: { contains: normalizedQuery, mode: "insensitive" } },
      {
        barcodes: {
          some: {
            isPrimary: true,
            code: { contains: normalizedQuery, mode: "insensitive" },
          },
        },
      },
    ],
  };
}

function toOwnerProductListRow(product: OwnerProductRecord): OwnerProductListRow {
  return {
    id: product.id,
    isSellable: product.isSellable,
    name: product.name,
    primaryBarcode: product.barcodes[0]?.code ?? null,
    costCents: product.costCents,
    priceCents: product.priceCents,
    sku: product.sku,
    stockQty: product.stockQty,
    updatedAt: product.updatedAt,
  };
}

function buildOwnerProductOrderBy(
  sortKey: OwnerProductSortKey,
  sortOrder: OwnerProductSortOrder
): Prisma.ProductOrderByWithRelationInput[] {
  if (sortKey === "updatedAt") {
    return [{ updatedAt: sortOrder }, { id: "asc" }];
  }
  if (sortKey === "name") {
    return [{ name: sortOrder }, { updatedAt: "desc" }, { id: "asc" }];
  }
  if (sortKey === "stockQty") {
    return [{ stockQty: sortOrder }, { updatedAt: "desc" }, { id: "asc" }];
  }
  if (sortKey === "costCents") {
    return [{ costCents: sortOrder }, { updatedAt: "desc" }, { id: "asc" }];
  }
  if (sortKey === "priceCents") {
    return [{ priceCents: sortOrder }, { updatedAt: "desc" }, { id: "asc" }];
  }
  return [{ isSellable: sortOrder }, { updatedAt: "desc" }, { id: "asc" }];
}

async function fetchOwnerProductPageByMargin(input: {
  offset: number;
  pageSize: number;
  productWhere: Prisma.ProductWhereInput | undefined;
  query: string;
  sortOrder: OwnerProductSortOrder;
}) {
  const take = input.pageSize + 1;
  const normalizedQuery = input.query.trim();
  const queryPattern = `%${normalizedQuery}%`;
  const sortDirection = input.sortOrder === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const whereSql = normalizedQuery
    ? Prisma.sql`
      WHERE (
        p."name" ILIKE ${queryPattern}
        OR p."sku" ILIKE ${queryPattern}
        OR EXISTS (
          SELECT 1
          FROM "ProductBarcode" pb
          WHERE pb."productId" = p."id"
            AND pb."isPrimary" = true
            AND pb."code" ILIKE ${queryPattern}
        )
      )
    `
    : Prisma.empty;

  const [idRows, matchingProductsCount] = await prisma.$transaction([
    prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT p."id"
      FROM "Product" p
      ${whereSql}
      ORDER BY (p."priceCents" - p."costCents") ${sortDirection}, p."updatedAt" DESC, p."id" ASC
      OFFSET ${input.offset}
      LIMIT ${take}
    `),
    prisma.product.count({ where: input.productWhere }),
  ]);

  const hasMore = idRows.length > input.pageSize;
  const pageIds = hasMore
    ? idRows.slice(0, input.pageSize).map((row) => row.id)
    : idRows.map((row) => row.id);

  if (pageIds.length === 0) {
    return {
      hasMore,
      matchingProductsCount,
      rows: [] as OwnerProductListRow[],
    };
  }

  const unorderedProducts = await prisma.product.findMany({
    where: {
      id: { in: pageIds },
    },
    select: ownerProductSelect,
  });

  const productsById = new Map(
    unorderedProducts.map((product) => [product.id, product] as const)
  );

  return {
    hasMore,
    matchingProductsCount,
    rows: pageIds
      .map((id) => productsById.get(id))
      .filter((product): product is OwnerProductRecord => Boolean(product))
      .map(toOwnerProductListRow),
  };
}

export async function fetchOwnerProductPage(input: {
  offset: number;
  pageSize: number;
  query: string;
  sortKey: OwnerProductSortKey;
  sortOrder: OwnerProductSortOrder;
}) {
  const productWhere = buildOwnerProductWhere(input.query);
  if (input.sortKey === "marginCents") {
    return fetchOwnerProductPageByMargin({
      offset: input.offset,
      pageSize: input.pageSize,
      productWhere,
      query: input.query,
      sortOrder: input.sortOrder,
    });
  }

  const take = input.pageSize + 1;
  const [rawProducts, matchingProductsCount] = await prisma.$transaction([
    prisma.product.findMany({
      where: productWhere,
      orderBy: buildOwnerProductOrderBy(input.sortKey, input.sortOrder),
      skip: input.offset,
      take,
      select: ownerProductSelect,
    }),
    prisma.product.count({ where: productWhere }),
  ]);

  const hasMore = rawProducts.length > input.pageSize;
  const pageRows = hasMore ? rawProducts.slice(0, input.pageSize) : rawProducts;

  return {
    hasMore,
    matchingProductsCount,
    rows: pageRows.map(toOwnerProductListRow),
  };
}
