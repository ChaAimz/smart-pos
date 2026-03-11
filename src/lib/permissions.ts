import type { AppUserRole } from "@/lib/auth";

export function isOwner(role: AppUserRole) {
  return role === "OWNER";
}

export function isManagerOrOwner(role: AppUserRole) {
  return role === "MANAGER" || role === "OWNER";
}

export function canOperateSales(role: AppUserRole) {
  return role === "SALES" || role === "MANAGER" || role === "OWNER";
}

export function canManageProducts(role: AppUserRole) {
  return isManagerOrOwner(role);
}

export function canApproveAdjustments(role: AppUserRole) {
  return isManagerOrOwner(role);
}
