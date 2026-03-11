import { NextResponse } from "next/server";

import { fetchOwnerProductPage } from "@/lib/owner-product-list";
import { normalizeOwnerProductSort } from "@/lib/owner-product-sorting";
import { getSessionUser } from "@/lib/session";

const PRODUCTS_PAGE_SIZE = 60;
const updatedAtFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

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
  const { sortKey, sortOrder } = normalizeOwnerProductSort({
    order: requestUrl.searchParams.get("order"),
    sort: requestUrl.searchParams.get("sort"),
  });

  if (offset == null) {
    return NextResponse.json(
      { error: "Offset must be a non-negative integer." },
      { status: 400 }
    );
  }

  try {
    const pageData = await fetchOwnerProductPage({
      offset,
      pageSize: PRODUCTS_PAGE_SIZE,
      query,
      sortKey,
      sortOrder,
    });

    const rows = pageData.rows.map((product) => ({
      id: product.id,
      isSellable: product.isSellable,
      name: product.name,
      primaryBarcode: product.primaryBarcode,
      costCents: product.costCents,
      priceCents: product.priceCents,
      stockQty: product.stockQty,
      updatedAtLabel: updatedAtFormat.format(product.updatedAt),
    }));

    return NextResponse.json({
      hasMore: pageData.hasMore,
      matchingProductsCount: pageData.matchingProductsCount,
      rows,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to load products right now." },
      { status: 500 }
    );
  }
}
