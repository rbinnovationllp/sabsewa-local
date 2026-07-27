export type SabSewaLanguageCode =
  | "en"
  | "as"
  | "bn"
  | "brx"
  | "doi"
  | "gu"
  | "hi"
  | "kn"
  | "ks"
  | "kok"
  | "mai"
  | "ml"
  | "mni"
  | "mr"
  | "ne"
  | "or"
  | "pa"
  | "sa"
  | "sat"
  | "sd"
  | "ta"
  | "te"
  | "ur";

export const SABSEWA_LANGUAGES: Array<{
  code: SabSewaLanguageCode;
  englishName: string;
  nativeName: string;
  phase: "default" | "phase_1" | "phase_2" | "phase_3";
}> = [
  { code: "en", englishName: "English", nativeName: "English", phase: "default" },
  { code: "hi", englishName: "Hindi", nativeName: "हिन्दी", phase: "phase_1" },
  { code: "bn", englishName: "Bengali", nativeName: "বাংলা", phase: "phase_1" },
  { code: "mr", englishName: "Marathi", nativeName: "मराठी", phase: "phase_1" },
  { code: "ta", englishName: "Tamil", nativeName: "தமிழ்", phase: "phase_1" },
  { code: "te", englishName: "Telugu", nativeName: "తెలుగు", phase: "phase_1" },
  { code: "gu", englishName: "Gujarati", nativeName: "ગુજરાતી", phase: "phase_2" },
  { code: "kn", englishName: "Kannada", nativeName: "ಕನ್ನಡ", phase: "phase_2" },
  { code: "ml", englishName: "Malayalam", nativeName: "മലയാളം", phase: "phase_2" },
  { code: "pa", englishName: "Punjabi", nativeName: "ਪੰਜਾਬੀ", phase: "phase_2" },
  { code: "or", englishName: "Odia", nativeName: "ଓଡ଼ିଆ", phase: "phase_2" },
  { code: "as", englishName: "Assamese", nativeName: "অসমীয়া", phase: "phase_3" },
  { code: "brx", englishName: "Bodo", nativeName: "बड़ो", phase: "phase_3" },
  { code: "doi", englishName: "Dogri", nativeName: "डोगरी", phase: "phase_3" },
  { code: "ks", englishName: "Kashmiri", nativeName: "کٲشُر", phase: "phase_3" },
  { code: "kok", englishName: "Konkani", nativeName: "कोंकणी", phase: "phase_3" },
  { code: "mai", englishName: "Maithili", nativeName: "मैथिली", phase: "phase_3" },
  { code: "mni", englishName: "Manipuri", nativeName: "ꯃꯤꯇꯩꯂꯣꯟ", phase: "phase_3" },
  { code: "ne", englishName: "Nepali", nativeName: "नेपाली", phase: "phase_3" },
  { code: "sa", englishName: "Sanskrit", nativeName: "संस्कृतम्", phase: "phase_3" },
  { code: "sat", englishName: "Santali", nativeName: "ᱥᱟᱱᱛᱟᱲᱤ", phase: "phase_3" },
  { code: "sd", englishName: "Sindhi", nativeName: "سنڌي", phase: "phase_3" },
  { code: "ur", englishName: "Urdu", nativeName: "اردو", phase: "phase_3" },
];

export const DEFAULT_LANGUAGE: SabSewaLanguageCode = "en";

