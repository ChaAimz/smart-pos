import { redirect } from "next/navigation";

import { getHomePathForRole, type SessionUser } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";

export async function requireOwnerSession(): Promise<SessionUser> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    redirect("/login");
  }
  if (sessionUser.role !== "OWNER") {
    redirect(getHomePathForRole(sessionUser.role));
  }

  return sessionUser;
}
