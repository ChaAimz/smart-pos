import { InventoryApprovalStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { canApproveAdjustments } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type ApprovalPayload = {
  action?: "approve" | "reject";
};

class ApprovalFlowError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function parsePayload(value: unknown): ApprovalPayload {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as ApprovalPayload;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ movementId: string }> }
) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!canApproveAdjustments(sessionUser.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { movementId } = await context.params;
  const id = String(movementId ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Invalid movement id." }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const payload = parsePayload(json);
  const action = String(payload.action ?? "").trim().toLowerCase();
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Action must be approve or reject." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const movement = await tx.inventoryMovement.findUnique({
        where: { id },
        select: {
          id: true,
          productId: true,
          quantityDelta: true,
          movementType: true,
          approvalStatus: true,
          product: {
            select: {
              name: true,
              stockQty: true,
            },
          },
        },
      });

      if (!movement) {
        return {
          type: "error" as const,
          status: 404,
          error: "Movement not found.",
        };
      }

      if (movement.approvalStatus !== InventoryApprovalStatus.PENDING_APPROVAL) {
        return {
          type: "error" as const,
          status: 409,
          error: "Movement is no longer pending approval.",
        };
      }

      if (action === "reject") {
        const rejected = await tx.inventoryMovement.updateMany({
          where: {
            id: movement.id,
            approvalStatus: InventoryApprovalStatus.PENDING_APPROVAL,
          },
          data: {
            approvalStatus: InventoryApprovalStatus.REJECTED,
            rejectedByUserId: sessionUser.userId,
            rejectedAt: new Date(),
          },
        });
        if (rejected.count !== 1) {
          return {
            type: "error" as const,
            status: 409,
            error: "Movement is no longer pending approval.",
          };
        }

        return {
          type: "success" as const,
          movement: {
            id: movement.id,
            approvalStatus: InventoryApprovalStatus.REJECTED,
            rejectedAt: new Date(),
          },
          message: "Adjustment rejected.",
        };
      }

      const quantityBefore = movement.product.stockQty;
      const quantityAfter = quantityBefore + movement.quantityDelta;
      if (quantityAfter < 0) {
        return {
          type: "error" as const,
          status: 409,
          error: `${movement.product.name} would drop below zero stock.`,
        };
      }

      const approvedAt = new Date();
      const approved = await tx.inventoryMovement.updateMany({
        where: {
          id: movement.id,
          approvalStatus: InventoryApprovalStatus.PENDING_APPROVAL,
        },
        data: {
          approvalStatus: InventoryApprovalStatus.APPROVED,
          approvedByUserId: sessionUser.userId,
          approvedAt,
          quantityBefore,
          quantityAfter,
        },
      });
      if (approved.count !== 1) {
        return {
          type: "error" as const,
          status: 409,
          error: "Movement is no longer pending approval.",
        };
      }

      const updatedProduct = await tx.product.updateMany({
        where: {
          id: movement.productId,
          stockQty: quantityBefore,
        },
        data: {
          stockQty: {
            increment: movement.quantityDelta,
          },
        },
      });
      if (updatedProduct.count !== 1) {
        throw new ApprovalFlowError(
          409,
          "Inventory changed while applying approval. Please retry."
        );
      }

      return {
        type: "success" as const,
        movement: {
          id: movement.id,
          approvalStatus: InventoryApprovalStatus.APPROVED,
          approvedAt,
          quantityBefore,
          quantityAfter,
        },
        message: "Adjustment approved and stock updated.",
      };
    });

    if (result.type === "error") {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      status: "ok",
      movement: result.movement,
      message: result.message,
    });
  } catch (error) {
    if (error instanceof ApprovalFlowError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: "Unable to process approval.",
      },
      { status: 500 }
    );
  }
}
