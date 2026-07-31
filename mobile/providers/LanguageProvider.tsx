import * as SecureStore from "expo-secure-store";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
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
  setLanguage: (language: SabSewaLanguageCode) => void;
  isLanguageAvailable: (language: SabSewaLanguageCode) => boolean;
  t: (key: CommonTranslationKey | string, replacements?: Record<string, string | number>) => string;
};

const STORAGE_KEY = "sabsewa_local_language";
const LanguageContext = createContext<LanguageContextType | null>(null);

const BUNDLED_TRANSLATIONS: Partial<Record<SabSewaLanguageCode, Record<string, string>>> = {
  en: enCommon,
  hi: hiCommon,
  kn: knCommon,
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SabSewaLanguageCode>(DEFAULT_LANGUAGE);

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
      const saved =
        Platform.OS === "web"
          ? globalThis.localStorage?.getItem(STORAGE_KEY)
          : await SecureStore.getItemAsync(STORAGE_KEY);
      if (saved && FUNCTIONAL_LANGUAGES.includes(saved as SabSewaLanguageCode)) {
        setLanguageState(saved as SabSewaLanguageCode);
      }
    } catch {
      setLanguageState(DEFAULT_LANGUAGE);
    }
  }

  function persistLanguage(nextLanguage: SabSewaLanguageCode) {
    if (!FUNCTIONAL_LANGUAGES.includes(nextLanguage)) return;
    setLanguageState(nextLanguage);
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(STORAGE_KEY, nextLanguage);
      return;
    }
    SecureStore.setItemAsync(STORAGE_KEY, nextLanguage).catch(() => {});
  }

  const value = useMemo(
    () => ({
      language,
      setLanguage: persistLanguage,
      isLanguageAvailable: (code: SabSewaLanguageCode) => FUNCTIONAL_LANGUAGES.includes(code),
      t: (key: CommonTranslationKey | string, replacements?: Record<string, string | number>) => {
        const dictionary = BUNDLED_TRANSLATIONS[language] || enCommon;
        let translated = dictionary[key] || enCommon[key as CommonTranslationKey] || key;
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
