import { redirect } from "next/navigation";

import { SalesShell } from "@/components/layout/sales-shell";
import { SalesWorkspace } from "@/components/sales/sales-workspace";
import { type AppUserRole, getHomePathForRole } from "@/lib/auth";
import { canOperateSales } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { getMonthlySalesGoalCents } from "@/lib/store-setting";

type WorkspaceMode = "sales" | "manage";

type SalesPageProps = {
  searchParams: Promise<{
    mode?: string;
    text?: string;
  }>;
};

type SalesDashboardData = {
  todaySalesCount: number;
  todayRevenueCents: number;
  todayPaymentBreakdownCents: {
    cash: number;
    qrCode: number;
    creditCard: number;
  };
  thisMonthRevenueCents: number;
  monthlyGoalCents: number;
  todayGoalCents: number;
  todayProgressPct: number;
  monthProgressPct: number;
  openShift: {
    id: string;
    openedAt: Date;
  } | null;
  pendingAdjustments: Array<{
    id: string;
    quantityDelta: number;
    reason: string;
    product: {
      name: string;
      sku: string;
    };
    createdByUser: {
      email: string;
      role: AppUserRole;
    };
  }>;
  products: Array<{
    id: string;
    name: string;
    sku: string;
    priceCents: number;
    stockQty: number;
    isSellable: boolean;
    barcodes: Array<{
      code: string;
    }>;
  }>;
};

async function getSalesDashboardData(
  userId: string,
  userRole: AppUserRole,
  shiftEnabled: boolean,
  approvalEnabled: boolean
): Promise<SalesDashboardData> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const monthlyGoalCentsPromise = getMonthlySalesGoalCents();
  const [
    todaySalesCount,
    todaySalesAggregate,
    todayPaymentMethodBreakdown,
    monthSalesAggregate,
    products,
  ] = await prisma.$transaction([
    prisma.sale.count({
      where: {
        createdAt: {
          gte: startOfDay,
        },
      },
    }),
    prisma.sale.aggregate({
      where: {
        createdAt: {
          gte: startOfDay,
        },
      },
      _sum: {
        totalCents: true,
      },
    }),
    prisma.sale.groupBy({
      by: ["paymentMethod"],
      orderBy: {
        paymentMethod: "asc",
      },
      where: {
        createdAt: {
          gte: startOfDay,
        },
      },
      _sum: {
        totalCents: true,
      },
    }),
    prisma.sale.aggregate({
      where: {
        createdAt: {
          gte: startOfMonth,
        },
      },
      _sum: {
        totalCents: true,
      },
    }),
    prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        sku: true,
        priceCents: true,
        stockQty: true,
        isSellable: true,
        barcodes: {
          select: {
            code: true,
          },
          take: 5,
        },
      },
    }),
  ]);

  const todayPaymentBreakdownCents = {
    cash: 0,
    qrCode: 0,
    creditCard: 0,
  };

  for (const row of todayPaymentMethodBreakdown) {
    const cents = row._sum?.totalCents ?? 0;
    if (row.paymentMethod === "CASH") {
      todayPaymentBreakdownCents.cash = cents;
    } else if (row.paymentMethod === "QR_CODE") {
      todayPaymentBreakdownCents.qrCode = cents;
    } else if (row.paymentMethod === "CREDIT_CARD") {
      todayPaymentBreakdownCents.creditCard = cents;
    }
  }

  const todayRevenueCents = todaySalesAggregate._sum.totalCents ?? 0;
  const thisMonthRevenueCents = monthSalesAggregate._sum.totalCents ?? 0;
  const monthlyGoalCents = await monthlyGoalCentsPromise;
  const todayGoalCents = monthlyGoalCents > 0 ? Math.round(monthlyGoalCents / daysInMonth) : 0;
  const todayProgressPct = todayGoalCents > 0 ? (todayRevenueCents / todayGoalCents) * 100 : 0;
  const monthProgressPct = monthlyGoalCents > 0 ? (thisMonthRevenueCents / monthlyGoalCents) * 100 : 0;

  const pendingAdjustments =
    approvalEnabled && (userRole === "MANAGER" || userRole === "OWNER")
      ? await prisma.inventoryMovement.findMany({
          where: {
            approvalStatus: "PENDING_APPROVAL",
            movementType: "ADJUSTMENT",
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
          select: {
            id: true,
            quantityDelta: true,
            reason: true,
            product: {
              select: {
                name: true,
                sku: true,
              },
            },
            createdByUser: {
              select: {
                email: true,
                role: true,
              },
            },
          },
        })
      : [];

  const openShift = shiftEnabled
    ? await prisma.shift.findFirst({
        where: {
          openedByUserId: userId,
          status: "OPEN",
        },
        orderBy: {
          openedAt: "desc",
        },
        select: {
          id: true,
          openedAt: true,
        },
      })
    : null;

  return {
    todaySalesCount,
    todayRevenueCents,
    todayPaymentBreakdownCents,
    thisMonthRevenueCents,
    monthlyGoalCents,
    todayGoalCents,
    todayProgressPct,
    monthProgressPct,
    openShift,
    pendingAdjustments,
    products,
  };
}

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const params = await searchParams;
  const workspaceMode: WorkspaceMode = params.mode === "manage" ? "manage" : "sales";
  const isLargeText = params.text !== "normal";

  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    redirect("/login");
  }
  if (!canOperateSales(sessionUser.role)) {
    redirect(getHomePathForRole(sessionUser.role));
  }

  const userRole = sessionUser.role as AppUserRole;
  const shiftEnabled = process.env.POS_REQUIRE_SHIFT === "true";
  const approvalEnabled = process.env.POS_REQUIRE_APPROVAL === "true";
  const data = await getSalesDashboardData(
    sessionUser.userId,
    userRole,
    shiftEnabled,
    approvalEnabled
  );

  return (
    <SalesShell
      userEmail={sessionUser.email}
      todaySalesCount={data.todaySalesCount}
      todayRevenueCents={data.todayRevenueCents}
      todayPaymentBreakdownCents={data.todayPaymentBreakdownCents}
      thisMonthRevenueCents={data.thisMonthRevenueCents}
      monthlyGoalCents={data.monthlyGoalCents}
      todayGoalCents={data.todayGoalCents}
      todayProgressPct={data.todayProgressPct}
      monthProgressPct={data.monthProgressPct}
      isLargeText={isLargeText}
      shiftEnabled={shiftEnabled}
      isShiftOpen={shiftEnabled ? Boolean(data.openShift) : true}
      workspaceMode={workspaceMode}
    >
      <SalesWorkspace
        workspaceMode={workspaceMode}
        isLargeText={isLargeText}
        userRole={userRole}
        shiftEnabled={shiftEnabled}
        approvalEnabled={approvalEnabled}
        initialShiftOpen={shiftEnabled ? Boolean(data.openShift) : true}
        pendingAdjustments={data.pendingAdjustments}
        products={data.products}
      />
    </SalesShell>
  );
}
