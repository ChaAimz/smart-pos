import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const SESSION_COOKIE_NAME = "smart_pos_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const DEFAULT_DEV_AUTH_SECRET = "dev-auth-secret-change-this-before-production";
export type AppUserRole = "OWNER" | "MANAGER" | "SALES";

type SessionTokenPayload = JWTPayload & {
  sub: string;
  email: string;
  role: AppUserRole;
};

export type SessionUser = {
  userId: string;
  email: string;
  role: AppUserRole;
};

function isAppUserRole(value: string): value is AppUserRole {
  return value === "OWNER" || value === "MANAGER" || value === "SALES";
}

export function getHomePathForRole(role: AppUserRole) {
  if (role === "OWNER") {
    return "/owner";
  }
  return "/sales";
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim() || DEFAULT_DEV_AUTH_SECRET;
  if (process.env.NODE_ENV === "production" && secret === DEFAULT_DEV_AUTH_SECRET) {
    throw new Error("AUTH_SECRET must be set to a non-default value in production.");
  }

  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionUser): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifySessionToken(
  token: string
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify<SessionTokenPayload>(token, getJwtSecret());

    if (!payload.sub || !payload.email || !payload.role) {
      return null;
    }

    if (!isAppUserRole(payload.role)) {
      return null;
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function getSessionCookieOptions() {
  const secureCookieOverride = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase();
  const secure =
    secureCookieOverride === "true"
      ? true
      : secureCookieOverride === "false"
        ? false
        : process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
