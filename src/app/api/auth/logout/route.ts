import { NextResponse } from "next/server";

import { getSessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth";

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

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", getRequestOrigin(request)), {
    status: 303,
  });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    ...getSessionCookieOptions(),
    maxAge: 0,
  });

  return response;
}
