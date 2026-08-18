import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  DEFAULT_LANGUAGE,
  FUNCTIONAL_LANGUAGES,
  type SabSewaLanguageCode,
} from "@/constants/languages";
import { enCommon, type CommonTranslationKey } from "@/locales/en/common";
import { hiCommon } from "@/locales/hi/common";
import { knCommon } from "@/locales/kn/common";

type LanguageContextType = {
  language: SabSewaLanguageCode;
  lang: SabSewaLanguageCode;
  setLanguage: (language: SabSewaLanguageCode) => void;
  isLanguageAvailable: (language: SabSewaLanguageCode) => boolean;
  t: (key: CommonTranslationKey | string, replacements?: Record<string, string | number>) => string;
};

const STORAGE_KEY = "sabsewa_local_language";
const LEGACY_LANGUAGE_STORAGE_KEYS = ["user_language"];
const LanguageContext = createContext<LanguageContextType | null>(null);

const BUNDLED_TRANSLATIONS: Partial<Record<SabSewaLanguageCode, Record<string, string>>> = {
  en: enCommon,
  hi: hiCommon,
  kn: knCommon,
};

function getInitialLanguage(): SabSewaLanguageCode {
  if (Platform.OS !== "web") return DEFAULT_LANGUAGE;
  try {
    const saved =
      globalThis.localStorage?.getItem(STORAGE_KEY) ||
      LEGACY_LANGUAGE_STORAGE_KEYS.map((key) => globalThis.localStorage?.getItem(key)).find(Boolean) ||
      null;
    if (saved && FUNCTIONAL_LANGUAGES.includes(saved as SabSewaLanguageCode)) {
      return saved as SabSewaLanguageCode;
    }
  } catch {
    return DEFAULT_LANGUAGE;
  }
  return DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SabSewaLanguageCode>(getInitialLanguage);
  const missingKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    restoreLanguage();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.lang = language;
      document.documentElement.dir = language === "ur" ? "rtl" : "ltr";
    }
  }, [language]);

  async function restoreLanguage() {
    try {
      let saved: string | null = null;
      if (Platform.OS === "web") {
        saved = globalThis.localStorage?.getItem(STORAGE_KEY) || LEGACY_LANGUAGE_STORAGE_KEYS.map((key) => globalThis.localStorage?.getItem(key)).find(Boolean) || null;
      } else {
        saved = await SecureStore.getItemAsync(STORAGE_KEY);
        if (!saved) {
          saved = await AsyncStorage.getItem(STORAGE_KEY);
        }
        if (!saved) {
          for (const legacyKey of LEGACY_LANGUAGE_STORAGE_KEYS) {
            saved = await AsyncStorage.getItem(legacyKey);
            if (saved) break;
          }
        }
      }

      if (saved && FUNCTIONAL_LANGUAGES.includes(saved as SabSewaLanguageCode)) {
        setLanguageState(saved as SabSewaLanguageCode);
      }
    } catch {
      setLanguageState(DEFAULT_LANGUAGE);
    }
  }

  async function persistLanguage(nextLanguage: SabSewaLanguageCode) {
    if (!FUNCTIONAL_LANGUAGES.includes(nextLanguage)) return;
    setLanguageState(nextLanguage);

    try {
      if (Platform.OS === "web") {
        globalThis.localStorage?.setItem(STORAGE_KEY, nextLanguage);
        for (const legacyKey of LEGACY_LANGUAGE_STORAGE_KEYS) {
          globalThis.localStorage?.setItem(legacyKey, nextLanguage);
        }
        return;
      }
      await SecureStore.setItemAsync(STORAGE_KEY, nextLanguage);
      await AsyncStorage.setItem(STORAGE_KEY, nextLanguage);
      for (const legacyKey of LEGACY_LANGUAGE_STORAGE_KEYS) {
        await AsyncStorage.setItem(legacyKey, nextLanguage);
      }
    } catch (e) {
      console.warn("Could not save language choice", e);
    }
  }

  const value = useMemo(
    () => ({
      language,
      lang: language,
      setLanguage: persistLanguage,
      isLanguageAvailable: (code: SabSewaLanguageCode) => FUNCTIONAL_LANGUAGES.includes(code),
      t: (key: CommonTranslationKey | string, replacements?: Record<string, string | number>) => {
        const dictionary = BUNDLED_TRANSLATIONS[language] || enCommon;
        let translated = dictionary[key] || enCommon[key as CommonTranslationKey] || key;
        if (translated === key && !missingKeysRef.current.has(`${language}:${key}`)) {
          missingKeysRef.current.add(`${language}:${key}`);
          console.warn("Missing SabSewa translation key", { language, key });
        }
        Object.entries(replacements || {}).forEach(([name, value]) => {
          translated = translated.replace(new RegExp(`{${name}}`, "g"), String(value));
        });
        return translated;
      },
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
