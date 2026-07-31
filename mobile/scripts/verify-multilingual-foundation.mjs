import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(process.cwd());
const requiredFiles = [
  "constants/languages.ts",
  "providers/LanguageProvider.tsx",
  "locales/en/common.ts",
  "locales/hi/common.ts",
  "locales/kn/common.ts",
  "app/auth/Register.tsx",
  "app/auth/Login.tsx",
  "app/hyperlocal/cart.tsx"
];

const requiredKeys = [
  "auth.registerTitle",
  "auth.registrationSuccessCustomer",
  "delivery.estimatedWindow",
  "delivery.safetyStatement"
];

function read(relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

for (const file of requiredFiles) {
  read(file);
}

const languages = read("constants/languages.ts");
if (!languages.includes('FUNCTIONAL_LANGUAGES: SabSewaLanguageCode[] = ["en", "hi", "kn"]')) {
  throw new Error("English, Hindi and Kannada are not all enabled as functional launch languages.");
}

const provider = read("providers/LanguageProvider.tsx");
if (!provider.includes("knCommon") || !provider.includes("kn: knCommon")) {
  throw new Error("Kannada locale is not bundled in LanguageProvider.");
}

for (const locale of ["en", "hi", "kn"]) {
  const content = read(`locales/${locale}/common.ts`);
  for (const key of requiredKeys) {
    if (!content.includes(`"${key}"`)) {
      throw new Error(`${locale} locale is missing ${key}`);
    }
  }
}

const register = read("app/auth/Register.tsx");
if (!register.includes("submitting") || !register.includes("auth.acceptAndRegister")) {
  throw new Error("Registration screen does not include localized loading/submit protection.");
}

const login = read("app/auth/Login.tsx");
if (!login.includes("registrationSuccessCustomer") || !login.includes("profileError")) {
  throw new Error("Login OTP completion does not confirm profile persistence before success.");
}

console.log("Multilingual, registration and delivery localization foundation verified.");
