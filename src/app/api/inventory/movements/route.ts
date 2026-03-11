import { InventoryApprovalStatus, InventoryMovementType } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  resolveProductForInventory,
  SALES_ADJUSTMENT_AUTO_APPROVE_ABS_THRESHOLD,
} from "@/lib/inventory";
import { canOperateSales } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type CreateMovementPayload = {
  productId?: string;
  code?: string;
  kind?: "receive" | "adjust";
  quantity?: number;
  quantityDelta?: number;
  reason?: string;
};

function parsePayload(value: unknown): CreateMovementPayload {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as CreateMovementPayload;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isApprovalRequired() {
  return process.env.POS_REQUIRE_APPROVAL === "true";
}

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!canOperateSales(sessionUser.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return badRequest("Invalid request payload.");
  }

  const payload = parsePayload(json);
  const kind = String(payload.kind ?? "").trim().toLowerCase();
  const reason = String(payload.reason ?? "").trim();

  if (kind !== "receive" && kind !== "adjust") {
    return badRequest("Movement kind must be receive or adjust.");
  }
  if (reason.length < 3) {
    return badRequest("Please provide a reason (minimum 3 characters).");
  }

  let quantityDelta = 0;
  if (kind === "receive") {
    const quantity = Number(payload.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return badRequest("Receive quantity must be a positive integer.");
    }
    quantityDelta = quantity;
  } else {
    quantityDelta = Number(payload.quantityDelta);
    if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
      return badRequest("Adjustment quantity delta must be a non-zero integer.");
    }
  }

  const approvalEnabled = isApprovalRequired();
  const requiresApproval =
    approvalEnabled &&
    kind === "adjust" &&
    sessionUser.role === "SALES" &&
    Math.abs(quantityDelta) > SALES_ADJUSTMENT_AUTO_APPROVE_ABS_THRESHOLD;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await resolveProductForInventory(tx, {
        productId: payload.productId,
        code: payload.code,
      });

      if (!product) {
        return {
          type: "error" as const,
          status: 404,
          error: "Product not found by productId/code.",
        };
      }

      const quantityBefore = product.stockQty;
      const quantityAfter = quantityBefore + quantityDelta;
      if (!requiresApproval && quantityAfter < 0) {
        return {
          type: "error" as const,
          status: 409,
          error: `${product.name} would drop below zero stock.`,
        };
      }

      if (!requiresApproval) {
        const updated = await tx.product.updateMany({
          where: {
            id: product.id,
            stockQty: quantityBefore,
          },
          data: {
            stockQty: {
              increment: quantityDelta,
            },
          },
        });

        if (updated.count !== 1) {
          return {
            type: "error" as const,
            status: 409,
            error:
              "Inventory changed while applying movement. Please review stock and retry.",
          };
        }
      }

      const movement = await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          createdByUserId: sessionUser.userId,
          movementType:
            kind === "receive"
              ? InventoryMovementType.RECEIVE
              : InventoryMovementType.ADJUSTMENT,
          approvalStatus: requiresApproval
            ? InventoryApprovalStatus.PENDING_APPROVAL
            : InventoryApprovalStatus.APPROVED,
          quantityDelta,
          quantityBefore,
          quantityAfter: requiresApproval ? quantityBefore : quantityAfter,
          reason,
          approvedAt: requiresApproval ? null : new Date(),
          approvedByUserId: requiresApproval ? null : sessionUser.userId,
        },
        select: {
          id: true,
          movementType: true,
          approvalStatus: true,
          quantityDelta: true,
          quantityBefore: true,
          quantityAfter: true,
          reason: true,
          createdAt: true,
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
            },
          },
        },
      });

      return {
        type: "success" as const,
        movement,
        applied: !requiresApproval,
      };
    });

    if (result.type === "error") {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      status: "ok",
      applied: result.applied,
      movement: result.movement,
      message: result.applied
        ? "Inventory movement applied."
        : "Adjustment submitted for manager approval.",
    });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to create inventory movement right now.",
      },
      { status: 500 }
    );
  }
}
