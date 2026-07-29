import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;

export const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  extra?.EXPO_PUBLIC_BACKEND_URL ||
  "https://api.sabsewa.in";

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${BACKEND_URL.replace(/\/$/, "")}${normalizedPath}`;
}
