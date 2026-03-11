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

  const existing = await prisma.shift.findFirst({
    where: {
      openedByUserId: sessionUser.userId,
      status: "OPEN",
    },
    orderBy: {
      openedAt: "desc",
    },
    select: {
      id: true,
      openedAt: true,
      status: true,
    },
  });

  if (existing) {
    return NextResponse.json({
      status: "ok",
      shift: existing,
      message: "Shift already open.",
    });
  }

  const shift = await prisma.shift.create({
    data: {
      openedByUserId: sessionUser.userId,
      status: "OPEN",
    },
    select: {
      id: true,
      openedAt: true,
      status: true,
    },
  });

  return NextResponse.json({
    status: "ok",
    shift,
    message: "Shift opened.",
  });
}
