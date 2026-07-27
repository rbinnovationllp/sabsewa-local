declare const require: any;

const MEMORY_STORE: Record<string, string> = {};

function loadSecureStore() {
  try {
    return require("expo-secure-store");
  } catch {
    return null;
  }
}

export const secureSessionStorage = {
  async getItem(key: string) {
    const SecureStore = loadSecureStore();
    if (!SecureStore) return MEMORY_STORE[key] || null;
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
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
