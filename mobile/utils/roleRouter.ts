import { Router } from "expo-router";

export function routeForRole(role?: string) {
  if (role === "vendor") return "/vendor/dashboard";
  if (role === "rider") return "/rider";
  return "/hlm";
}

export function goToRoleHome(router: Router, role?: string) {
  router.replace(routeForRole(role) as any);
}

export function routeUser(_role?: string, _module?: string) {
  return routeForRole(_role);
}

export default goToRoleHome;
