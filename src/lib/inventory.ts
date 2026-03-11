import { type Prisma } from "@prisma/client";

export const SALES_ADJUSTMENT_AUTO_APPROVE_ABS_THRESHOLD = 10;

export type ProductLookupInput = {
  code?: string;
  productId?: string;
};

export async function resolveProductForInventory(
  tx: Prisma.TransactionClient,
  input: ProductLookupInput
) {
  const productId = String(input.productId ?? "").trim();
  if (productId) {
    return tx.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        sku: true,
        priceCents: true,
        stockQty: true,
        isSellable: true,
      },
    });
  }

  const code = String(input.code ?? "").trim();
  if (!code) {
    return null;
  }

  return tx.product.findFirst({
    where: {
      OR: [{ sku: code }, { barcodes: { some: { code } } }],
    },
    select: {
      id: true,
      name: true,
      sku: true,
      priceCents: true,
      stockQty: true,
      isSellable: true,
    },
  });
}
