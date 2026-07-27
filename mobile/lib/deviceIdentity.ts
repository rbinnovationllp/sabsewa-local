declare const require: any;

import { Platform } from "react-native";

const DEVICE_ID_KEY = "sabsewa-local-device-id";

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function loadSecureStore() {
  try {
    return require("expo-secure-store");
  } catch {
    return null;
  }
}

export async function getOrCreateDeviceId() {
  const SecureStore = loadSecureStore();
  if (!SecureStore) return randomId();

  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY, {
    keychainService: "sabsewa-local-device",
  });
  if (existing) return existing;

  const next = randomId();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, next, {
    keychainService: "sabsewa-local-device",
  });
  return next;
}

export async function getDeviceMetadata() {
  return {
    device_id: await getOrCreateDeviceId(),
    device_name: `${Platform.OS} device`,
    platform: Platform.OS,
    app_version: "1.0.0",
  };
}
