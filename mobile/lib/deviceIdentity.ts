declare const require: any;

import { Platform } from "react-native";

const DEVICE_ID_KEY = "sabsewa-local-device-id";

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function loadSecureStore() {
  if (Platform.OS === "web") return null;
  try {
    const SecureStore = require("expo-secure-store");
    if (typeof SecureStore?.getItemAsync !== "function" || typeof SecureStore?.setItemAsync !== "function") {
      return null;
    }
    return SecureStore;
  } catch {
    return null;
  }
}

function getBrowserStorage() {
  if (Platform.OS !== "web" || typeof globalThis.localStorage === "undefined") return null;
  return globalThis.localStorage;
}

export async function getOrCreateDeviceId() {
  const browserStorage = getBrowserStorage();
  if (browserStorage) {
    const existing = browserStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const next = randomId();
    browserStorage.setItem(DEVICE_ID_KEY, next);
    return next;
  }

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
