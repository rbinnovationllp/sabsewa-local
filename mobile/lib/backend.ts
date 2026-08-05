import Constants from "expo-constants";
import { getDeviceMetadata } from "@/lib/deviceIdentity";
import { supabase } from "@/lib/supabase";

const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;

export const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  extra?.EXPO_PUBLIC_BACKEND_URL ||
  "https://api.sabsewa.in";

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${BACKEND_URL.replace(/\/$/, "")}${normalizedPath}`;
}

export async function sabsewaClientHeaders(extraHeaders: Record<string, string> = {}) {
  const device = await getDeviceMetadata();
  return {
    "x-sabsewa-device-id": device.device_id,
    "x-sabsewa-app-version": device.app_version,
    "x-sabsewa-platform": device.platform,
    ...extraHeaders,
  };
}

export async function authenticatedApiHeaders(extraHeaders: Record<string, string> = {}) {
  const { data } = await supabase.auth.getSession();
  const headers = await sabsewaClientHeaders(extraHeaders);
  if (data.session?.access_token) {
    return { ...headers, Authorization: `Bearer ${data.session.access_token}` };
  }
  return headers;
}

export async function authenticatedFetch(path: string, init: RequestInit = {}) {
  const headers = await authenticatedApiHeaders(init.headers as Record<string, string> | undefined);
  return fetch(apiUrl(path), { ...init, headers });
}
