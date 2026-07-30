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

export const DEFAULT_LANGUAGE: SabSewaLanguageCode = "en";

export const FUNCTIONAL_LANGUAGES: SabSewaLanguageCode[] = ["en", "hi"];

export const SABSEWA_LANGUAGES: Array<{
  code: SabSewaLanguageCode;
  englishName: string;
  nativeName: string;
  phase: "default" | "phase_1" | "phase_2" | "phase_3";
  status: "available" | "coming_soon";
}> = [
  { code: "en", englishName: "English", nativeName: "English", phase: "default", status: "available" },
  { code: "hi", englishName: "Hindi", nativeName: "\u0939\u093f\u0928\u094d\u0926\u0940", phase: "phase_1", status: "available" },
  { code: "bn", englishName: "Bengali", nativeName: "\u09ac\u09be\u0982\u09b2\u09be", phase: "phase_1", status: "coming_soon" },
  { code: "mr", englishName: "Marathi", nativeName: "\u092e\u0930\u093e\u0920\u0940", phase: "phase_1", status: "coming_soon" },
  { code: "ta", englishName: "Tamil", nativeName: "\u0ba4\u0bae\u0bbf\u0bb4\u0bcd", phase: "phase_1", status: "coming_soon" },
  { code: "te", englishName: "Telugu", nativeName: "\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41", phase: "phase_1", status: "coming_soon" },
  { code: "gu", englishName: "Gujarati", nativeName: "\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0", phase: "phase_2", status: "coming_soon" },
  { code: "kn", englishName: "Kannada", nativeName: "\u0c95\u0ca8\u0ccd\u0ca8\u0ca1", phase: "phase_2", status: "coming_soon" },
  { code: "ml", englishName: "Malayalam", nativeName: "\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02", phase: "phase_2", status: "coming_soon" },
  { code: "pa", englishName: "Punjabi", nativeName: "\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40", phase: "phase_2", status: "coming_soon" },
  { code: "or", englishName: "Odia", nativeName: "\u0b13\u0b21\u0b3c\u0b3f\u0b06", phase: "phase_2", status: "coming_soon" },
  { code: "as", englishName: "Assamese", nativeName: "\u0985\u09b8\u09ae\u09c0\u09af\u09bc\u09be", phase: "phase_3", status: "coming_soon" },
  { code: "brx", englishName: "Bodo", nativeName: "\u092c\u0921\u093c\u094b", phase: "phase_3", status: "coming_soon" },
  { code: "doi", englishName: "Dogri", nativeName: "\u0921\u094b\u0917\u0930\u0940", phase: "phase_3", status: "coming_soon" },
  { code: "ks", englishName: "Kashmiri", nativeName: "\u06a9\u0672\u0634\u064f\u0631", phase: "phase_3", status: "coming_soon" },
  { code: "kok", englishName: "Konkani", nativeName: "\u0915\u094b\u0902\u0915\u0923\u0940", phase: "phase_3", status: "coming_soon" },
  { code: "mai", englishName: "Maithili", nativeName: "\u092e\u0948\u0925\u093f\u0932\u0940", phase: "phase_3", status: "coming_soon" },
  { code: "mni", englishName: "Manipuri", nativeName: "\u09ae\u09c8\u09a4\u09c8\u09b2\u09cb\u09a8\u09cd", phase: "phase_3", status: "coming_soon" },
  { code: "ne", englishName: "Nepali", nativeName: "\u0928\u0947\u092a\u093e\u0932\u0940", phase: "phase_3", status: "coming_soon" },
  { code: "sa", englishName: "Sanskrit", nativeName: "\u0938\u0902\u0938\u094d\u0915\u0943\u0924\u092e\u094d", phase: "phase_3", status: "coming_soon" },
  { code: "sat", englishName: "Santali", nativeName: "\u1c65\u1c5f\u1c71\u1c5b\u1c5f\u1c72\u1c64", phase: "phase_3", status: "coming_soon" },
  { code: "sd", englishName: "Sindhi", nativeName: "\u0633\u0646\u068c\u064a", phase: "phase_3", status: "coming_soon" },
  { code: "ur", englishName: "Urdu", nativeName: "\u0627\u0631\u062f\u0648", phase: "phase_3", status: "coming_soon" },
];
