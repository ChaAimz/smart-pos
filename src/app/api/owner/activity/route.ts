import { NextResponse } from "next/server";

import {
  listOwnerActivity,
  normalizeOwnerActivityFilter,
  normalizeOwnerActivityRange,
} from "@/lib/activity-log";
import { getSessionUser } from "@/lib/session";

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

export async function GET(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (sessionUser.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const query = String(searchParams.get("q") ?? "").trim();
  const filter = normalizeOwnerActivityFilter(searchParams.get("type") ?? undefined);
  const rangeDays = normalizeOwnerActivityRange(searchParams.get("range") ?? undefined);
  const limit = parsePositiveInt(searchParams.get("limit"), 40, 80);
  const offset = parsePositiveInt(searchParams.get("offset"), 0, 4000);

  try {
    const result = await listOwnerActivity({
      filter,
      limit,
      offset,
      query,
      rangeDays,
    });

    return NextResponse.json({
      hasMore: result.hasMore,
      offset: result.offset,
      rows: result.rows,
      totalInWindow: result.totalInWindow,
    });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to load activity log right now.",
      },
      { status: 500 }
    );
  }
}
