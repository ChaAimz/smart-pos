import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { canOperateSales } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";

export async function POST() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!canOperateSales(sessionUser.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const openShift = await prisma.shift.findFirst({
    where: {
      openedByUserId: sessionUser.userId,
      status: "OPEN",
    },
    orderBy: {
      openedAt: "desc",
    },
    select: {
      id: true,
    },
  });

  if (!openShift) {
    return NextResponse.json(
      {
        error: "No open shift found.",
        code: "NO_OPEN_SHIFT",
      },
      { status: 409 }
    );
  }

  const shift = await prisma.shift.update({
    where: {
      id: openShift.id,
    },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closedByUserId: sessionUser.userId,
    },
    select: {
      id: true,
      openedAt: true,
      closedAt: true,
      status: true,
    },
  });

  return NextResponse.json({
    status: "ok",
    shift,
    message: "Shift closed.",
  });
}
