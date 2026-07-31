declare const require: any;

import { Platform } from "react-native";

const MEMORY_STORE: Record<string, string> = {};

function loadSecureStore() {
  if (Platform.OS === "web") return null;
  try {
    const SecureStore = require("expo-secure-store");
    if (
      typeof SecureStore?.getItemAsync !== "function" ||
      typeof SecureStore?.setItemAsync !== "function" ||
      typeof SecureStore?.deleteItemAsync !== "function"
    ) {
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

export const secureSessionStorage = {
  async getItem(key: string) {
    const browserStorage = getBrowserStorage();
    if (browserStorage) return browserStorage.getItem(key);
    const SecureStore = loadSecureStore();
    if (!SecureStore) return MEMORY_STORE[key] || null;
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
    const browserStorage = getBrowserStorage();
    if (browserStorage) {
      browserStorage.setItem(key, value);
      return;
    }
    const SecureStore = loadSecureStore();
    if (!SecureStore) {
      MEMORY_STORE[key] = value;
      return;
    }
    await SecureStore.setItemAsync(key, value, {
      keychainService: "sabsewa-local-auth",
    });
  },
  async removeItem(key: string) {
    const browserStorage = getBrowserStorage();
    if (browserStorage) {
      browserStorage.removeItem(key);
      return;
    }
    const SecureStore = loadSecureStore();
    if (!SecureStore) {
      delete MEMORY_STORE[key];
      return;
    }
    await SecureStore.deleteItemAsync(key, {
      keychainService: "sabsewa-local-auth",
    });
  },
};
