import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET() {
  const time = new Date().toISOString();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ok",
      db: "up",
      time,
    });
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        db: "down",
        time,
      },
      { status: 503 }
    );
  }
}
