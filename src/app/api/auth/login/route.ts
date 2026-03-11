import { NextResponse } from "next/server";

import {
  createSessionToken,
  getHomePathForRole,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function getRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();

  if (!host) {
    return requestUrl.origin;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();
  const proto = forwardedProto || requestUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

function toLoginUrl(request: Request, errorCode: string) {
  const url = new URL("/login", getRequestOrigin(request));
  url.searchParams.set("error", errorCode);
  return url;
}

export async function POST(request: Request) {
  const formData = await request.formData();

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return NextResponse.redirect(toLoginUrl(request, "missing_fields"), {
      status: 303,
    });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      passwordHash: true,
    },
  });

  if (!user) {
    return NextResponse.redirect(toLoginUrl(request, "invalid_credentials"), {
      status: 303,
    });
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    return NextResponse.redirect(toLoginUrl(request, "invalid_credentials"), {
      status: 303,
    });
  }

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  const response = NextResponse.redirect(
    new URL(getHomePathForRole(user.role), getRequestOrigin(request)),
    {
      status: 303,
    }
  );

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    ...getSessionCookieOptions(),
  });

  return response;
}
