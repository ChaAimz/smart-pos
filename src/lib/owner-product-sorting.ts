export const OWNER_PRODUCT_SORT_KEYS = [
  "updatedAt",
  "name",
  "stockQty",
  "costCents",
  "priceCents",
  "marginCents",
  "isSellable",
] as const;

export type OwnerProductSortKey = (typeof OWNER_PRODUCT_SORT_KEYS)[number];
export type OwnerProductSortOrder = "asc" | "desc";

const DEFAULT_OWNER_PRODUCT_SORT_KEY: OwnerProductSortKey = "updatedAt";

const OWNER_PRODUCT_DEFAULT_SORT_ORDER: Record<
  OwnerProductSortKey,
  OwnerProductSortOrder
> = {
  updatedAt: "desc",
  name: "asc",
  stockQty: "asc",
  costCents: "asc",
  priceCents: "asc",
  marginCents: "desc",
  isSellable: "desc",
};

function isOwnerProductSortKey(value: string): value is OwnerProductSortKey {
  return OWNER_PRODUCT_SORT_KEYS.includes(value as OwnerProductSortKey);
}

export function getOwnerProductDefaultSortOrder(
  sortKey: OwnerProductSortKey
): OwnerProductSortOrder {
  return OWNER_PRODUCT_DEFAULT_SORT_ORDER[sortKey];
}

export function parseOwnerProductSortKey(
  value: string | null | undefined
): OwnerProductSortKey {
  const normalized = String(value ?? "").trim();
  if (isOwnerProductSortKey(normalized)) {
    return normalized;
  }
  return DEFAULT_OWNER_PRODUCT_SORT_KEY;
}

function parseOwnerProductSortOrder(
  value: string | null | undefined
): OwnerProductSortOrder | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "asc" || normalized === "desc") {
    return normalized;
  }
  return null;
}

export function normalizeOwnerProductSort(input: {
  order?: string | null;
  sort?: string | null;
}): {
  sortKey: OwnerProductSortKey;
  sortOrder: OwnerProductSortOrder;
} {
  const sortKey = parseOwnerProductSortKey(input.sort);
  const parsedSortOrder = parseOwnerProductSortOrder(input.order);

  return {
    sortKey,
    sortOrder: parsedSortOrder ?? getOwnerProductDefaultSortOrder(sortKey),
  };
}
