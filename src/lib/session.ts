import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, verifySessionToken, type SessionUser } from "@/lib/auth";

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}
