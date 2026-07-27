import React, { createContext, useContext, useMemo, useState } from "react";
import { DEFAULT_LANGUAGE, type SabSewaLanguageCode } from "@/constants/languages";

type LanguageContextType = {
  language: SabSewaLanguageCode;
  setLanguage: (language: SabSewaLanguageCode) => void;
  t: (text: string, replacements?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<SabSewaLanguageCode>(DEFAULT_LANGUAGE);
  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (text: string, replacements?: Record<string, string | number>) => {
        let translated = text;
        if (language === "hi") {
          translated = HI_TRANSLATIONS[text] || text;
        }
        Object.entries(replacements || {}).forEach(([key, value]) => {
          translated = translated.replace(new RegExp(`{${key}}`, "g"), String(value));
        });
        return translated;
      }
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

const HI_TRANSLATIONS: Record<string, string> = {
  "Language": "भाषा",
  "Choose Language": "भाषा चुनें",
  "English is the default language. More Indian languages will be quality-tested and released in phases.": "अंग्रेजी डिफ़ॉल्ट भाषा है। अन्य भारतीय भाषाएँ चरणों में जाँच के बाद जारी की जाएँगी।",
  "Vendor Advance Balance": "विक्रेता अग्रिम शेष",
  "Orders": "ऑर्डर",
  "Exit & Refund": "बाहर निकलें और रिफंड",
  "Customer": "ग्राहक",
  "Vendor": "विक्रेता",
  "Rider": "राइडर",
};

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
