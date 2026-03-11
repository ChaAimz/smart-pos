import { NextResponse } from "next/server";

import {
  type AppUserRole,
  createSessionToken,
  getHomePathForRole,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function toLoginUrl(request: Request, errorCode: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", errorCode);
  return url;
}

function getRequestedRole(value: FormDataEntryValue | null): AppUserRole | null {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();

  if (normalized === "OWNER" || normalized === "MANAGER" || normalized === "SALES") {
    return normalized;
  }

  return null;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.redirect(toLoginUrl(request, "dev_only"), {
      status: 303,
    });
  }

  const formData = await request.formData();
  const requestedRole = getRequestedRole(formData.get("role"));
  if (!requestedRole) {
    return NextResponse.redirect(toLoginUrl(request, "invalid_role"), {
      status: 303,
    });
  }

  const devEmail =
    requestedRole === "OWNER"
      ? process.env.SEED_ADMIN_EMAIL ?? "admin@smartpos.local"
      : requestedRole === "MANAGER"
        ? process.env.SEED_MANAGER_EMAIL ?? "manager@smartpos.local"
        : process.env.SEED_SALES_EMAIL ?? "sales@smartpos.local";

  const user = await prisma.user.findUnique({
    where: { email: devEmail.trim().toLowerCase() },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  if (!user || user.role !== requestedRole) {
    return NextResponse.redirect(toLoginUrl(request, "dev_user_missing"), {
      status: 303,
    });
  }

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  const response = NextResponse.redirect(new URL(getHomePathForRole(user.role), request.url), {
    status: 303,
  });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    ...getSessionCookieOptions(),
  });

  return response;
}
