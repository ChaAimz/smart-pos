import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

const PRODUCTS_PAGE_SIZE = 60;
const updatedAtFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function buildProductWhere(query: string): Prisma.ProductWhereInput | undefined {
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

function parseOffset(input: string | null) {
  const value = Number.parseInt(String(input ?? "0"), 10);
  if (!Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

export async function GET(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (sessionUser.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const requestUrl = new URL(request.url);
  const query = String(requestUrl.searchParams.get("q") ?? "");
  const offset = parseOffset(requestUrl.searchParams.get("offset"));

  if (offset == null) {
    return NextResponse.json(
      { error: "Offset must be a non-negative integer." },
      { status: 400 }
    );
  }

  try {
    const productWhere = buildProductWhere(query);

    const [rawProducts, matchingProductsCount] = await prisma.$transaction([
      prisma.product.findMany({
        where: productWhere,
        orderBy: { updatedAt: "desc" },
        skip: offset,
        take: PRODUCTS_PAGE_SIZE + 1,
        select: {
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
          stockQty: true,
          updatedAt: true,
        },
      }),
      prisma.product.count({ where: productWhere }),
    ]);

    const hasMore = rawProducts.length > PRODUCTS_PAGE_SIZE;
    const pageProducts = hasMore
      ? rawProducts.slice(0, PRODUCTS_PAGE_SIZE)
      : rawProducts;

    const rows = pageProducts.map((product) => ({
      id: product.id,
      isSellable: product.isSellable,
      name: product.name,
      primaryBarcode: product.barcodes[0]?.code ?? null,
      costCents: product.costCents,
      priceCents: product.priceCents,
      stockQty: product.stockQty,
      updatedAtLabel: updatedAtFormat.format(product.updatedAt),
    }));

    return NextResponse.json({
      hasMore,
      matchingProductsCount,
      rows,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to load products right now." },
      { status: 500 }
    );
  }
}
