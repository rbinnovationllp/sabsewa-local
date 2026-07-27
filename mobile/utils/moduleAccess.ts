import type { AppModule } from "@/types/access";

export function canAccessModule(_module: AppModule | string) {
  return true;
}

export function moduleLabel(module: AppModule | string) {
  return String(module);
}
