import { NextResponse } from "next/server";
import { PaymentMethod, Prisma } from "@prisma/client";

import { normalizeIdempotencyKey } from "@/lib/idempotency";
import { canOperateSales } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type CreateSalePayload = {
  items?: Array<{
    productId?: string;
    quantity?: number;
  }>;
  paymentMethod?: "cash" | "qr_code" | "qr" | "credit_card" | "card" | "credit";
};

class CheckoutError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

const saleSelect = {
  id: true,
  paymentMethod: true,
  soldByUserId: true,
  totalCents: true,
  createdAt: true,
} as const;

function parsePayload(value: unknown): CreateSalePayload {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as CreateSalePayload;
}

function toPaymentMethod(
  value: CreateSalePayload["paymentMethod"]
): PaymentMethod {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "qr" || normalized === "qr_code") {
    return "QR_CODE";
  }

  if (normalized === "credit_card" || normalized === "card" || normalized === "credit") {
    return "CREDIT_CARD";
  }

  return "CASH";
}

function toInventoryErrorMessage(name: string, stockQty: number) {
  if (stockQty <= 0) {
    return `${name} is out of stock.`;
  }

  return `${name} has only ${stockQty} left in stock.`;
}

function isShiftRequired() {
  return process.env.POS_REQUIRE_SHIFT === "true";
}

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!canOperateSales(sessionUser.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const actor = sessionUser;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return badRequest("Invalid request payload.");
  }

  const payload = parsePayload(json);
  const paymentMethod = toPaymentMethod(payload.paymentMethod);
  const idempotencyKey = normalizeIdempotencyKey(
    request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key")
  );
  if (!idempotencyKey) {
    return NextResponse.json(
      {
        error: "Missing or invalid Idempotency-Key header.",
        code: "MISSING_IDEMPOTENCY_KEY",
      },
      { status: 400 }
    );
  }
  const normalizedItems = new Map<string, number>();

  for (const item of payload.items ?? []) {
    const productId = String(item.productId ?? "").trim();
    const quantity = Number(item.quantity);

    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      return badRequest("Items must include valid productId and quantity.");
    }

    const prevQuantity = normalizedItems.get(productId) ?? 0;
    normalizedItems.set(productId, prevQuantity + quantity);
  }

  if (normalizedItems.size === 0) {
    return badRequest("Ticket has no items.");
  }

  const replayedSale = await prisma.sale.findFirst({
    where: {
      soldByUserId: actor.userId,
      idempotencyKey,
    },
    select: saleSelect,
  });
  if (replayedSale) {
    return NextResponse.json({
      status: "ok",
      paymentMethod: replayedSale.paymentMethod,
      sale: replayedSale,
      idempotentReplay: true,
    });
  }

  const shiftRequired = isShiftRequired();
  const openShift = shiftRequired
    ? await prisma.shift.findFirst({
        where: {
          openedByUserId: actor.userId,
          status: "OPEN",
        },
        orderBy: {
          openedAt: "desc",
        },
        select: {
          id: true,
        },
      })
    : null;
  if (shiftRequired && !openShift) {
    return NextResponse.json(
      {
        error: "Please open shift before checkout.",
        code: "SHIFT_REQUIRED",
      },
      { status: 409 }
    );
  }

  try {
    const createdSale = await prisma.$transaction(async (tx) => {
      const productIds = [...normalizedItems.keys()];
      const products = await tx.product.findMany({
        where: {
          id: {
            in: productIds,
          },
        },
        select: {
          id: true,
          name: true,
          priceCents: true,
          stockQty: true,
          isSellable: true,
        },
      });

      if (products.length !== productIds.length) {
        throw new CheckoutError(400, "PRODUCT_UNAVAILABLE", "Some products are unavailable.");
      }

      const productById = new Map(products.map((product) => [product.id, product]));
      let totalCents = 0;

      const saleItems = productIds.map((productId) => {
        const product = productById.get(productId);
        const quantity = normalizedItems.get(productId) ?? 0;

        if (!product || quantity <= 0) {
          throw new CheckoutError(400, "INVALID_ITEM", "Invalid sale item.");
        }

        if (!product.isSellable) {
          throw new CheckoutError(
            409,
            "PRODUCT_NOT_SELLABLE",
            `${product.name} cannot be sold right now.`
          );
        }

        if (quantity > product.stockQty) {
          throw new CheckoutError(
            409,
            "INSUFFICIENT_STOCK",
            toInventoryErrorMessage(product.name, product.stockQty)
          );
        }

        totalCents += product.priceCents * quantity;

        return {
          productId,
          quantity,
          unitPriceCents: product.priceCents,
        };
      });

      if (totalCents <= 0) {
        throw new CheckoutError(400, "INVALID_TOTAL", "Sale total must be greater than zero.");
      }

      for (const item of saleItems) {
        const product = productById.get(item.productId);
        if (!product) {
          throw new CheckoutError(
            409,
            "INVENTORY_CHANGED",
            "Inventory changed while checking out. Please review the ticket and retry."
          );
        }

        const updated = await tx.product.updateMany({
          where: {
            id: item.productId,
            isSellable: true,
            stockQty: product.stockQty,
          },
          data: {
            stockQty: {
              decrement: item.quantity,
            },
          },
        });

        if (updated.count !== 1) {
          throw new CheckoutError(
            409,
            "INVENTORY_CHANGED",
            "Inventory changed while checking out. Please review the ticket and retry."
          );
        }
      }

      const savedSale = await tx.sale.create({
        data: {
          totalCents,
          paymentMethod,
          idempotencyKey,
          soldByUserId: actor.userId,
          shiftId: openShift?.id ?? null,
          items: {
            create: saleItems,
          },
        },
        select: saleSelect,
      });

      await tx.inventoryMovement.createMany({
        data: saleItems.map((item) => {
          const product = productById.get(item.productId)!;
          return {
            productId: item.productId,
            saleId: savedSale.id,
            createdByUserId: actor.userId,
            approvedByUserId: actor.userId,
            movementType: "SALE",
            approvalStatus: "APPROVED",
            quantityDelta: -item.quantity,
            quantityBefore: product.stockQty,
            quantityAfter: product.stockQty - item.quantity,
            reason: `Sale ${savedSale.id}`,
            approvedAt: savedSale.createdAt,
          };
        }),
      });

      return savedSale;
    });

    return NextResponse.json({
      status: "ok",
      paymentMethod: createdSale.paymentMethod,
      sale: createdSale,
    });
  } catch (error) {
    if (error instanceof CheckoutError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status }
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replayed = await prisma.sale.findFirst({
        where: {
          soldByUserId: actor.userId,
          idempotencyKey,
        },
        select: saleSelect,
      });
      if (replayed) {
        return NextResponse.json({
          status: "ok",
          paymentMethod: replayed.paymentMethod,
          sale: replayed,
          idempotentReplay: true,
        });
      }
    }

    return NextResponse.json(
      {
        error: "Unable to complete sale right now.",
      },
      { status: 500 }
    );
  }
}
