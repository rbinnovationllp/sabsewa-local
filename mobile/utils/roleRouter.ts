import { Router } from "expo-router";

const ADMIN_ROLES = new Set([
  "admin",
  "company_admin",
  "super_admin",
  "master_admin",
  "national_admin",
  "state_admin",
  "district_admin",
  "city_admin",
  "kyc_reviewer",
  "finance_admin",
  "support_admin",
]);

function normalizeRole(role?: string | null) {
  return String(role || "").trim().toLowerCase();
}

export function isAdminRole(role?: string | null) {
  return ADMIN_ROLES.has(normalizeRole(role));
}

function lastModuleAllowedForRole(normalizedRole: string, lastModule: string) {
  if (!lastModule || !lastModule.startsWith("/") || lastModule.startsWith("//")) return false;
  if (lastModule.startsWith("/company") || lastModule.startsWith("/admin")) return isAdminRole(normalizedRole);
  if (lastModule.startsWith("/vendor")) return normalizedRole === "vendor";
  if (lastModule.startsWith("/partner")) return normalizedRole === "partner";
  if (lastModule.startsWith("/rider")) return normalizedRole === "rider";
  if (lastModule.startsWith("/customer") || lastModule.startsWith("/hyperlocal")) return normalizedRole === "customer";
  return ["/", "/hlm"].includes(lastModule);
}

export function routeForRole(role?: string | null, module?: string | null) {
  const normalized = normalizeRole(role);
  const lastModule = String(module || "").trim();

  if (lastModuleAllowedForRole(normalized, lastModule)) {
    return lastModule;
  }

  if (normalized === "vendor") return "/vendor/dashboard";
  if (normalized === "rider") return "/rider";
  if (normalized === "partner") return "/partner-dashboard";
  if (isAdminRole(normalized)) return "/company";
  if (normalized === "customer") return "/customer/dashboard";
  return "/hlm";
}

export function goToRoleHome(router: Router, role?: string | null, module?: string | null) {
  router.replace(routeForRole(role, module) as any);
}

export function routeUser(role?: string | null, module?: string | null) {
  return routeForRole(role, module);
}

export default goToRoleHome;
