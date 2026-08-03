export type PhoneValidationResult =
  | { ok: true; e164: string; national: string; masked: string }
  | { ok: false; reason: "invalid_mobile" | "unsupported_country" | "duplicate_country_code" | "invalid_length" };

const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

export function validateIndianMobile(input: string): PhoneValidationResult {
  const raw = String(input || "").trim();
  const compact = raw.replace(/[\s\-().]/g, "");

  if (!compact) return { ok: false, reason: "invalid_mobile" };
  if (/[A-Za-z]/.test(compact)) return { ok: false, reason: "invalid_mobile" };
  if (compact.startsWith("00") && !compact.startsWith("0091")) return { ok: false, reason: "unsupported_country" };
  if (compact.startsWith("+") && !compact.startsWith("+91")) return { ok: false, reason: "unsupported_country" };
  if (compact.startsWith("+9191") || compact.startsWith("9191")) return { ok: false, reason: "duplicate_country_code" };

  const digits = compact.replace(/\D/g, "");
  let national = "";

  if (digits.length === 10) {
    national = digits;
  } else if (digits.length === 12 && digits.startsWith("91")) {
    national = digits.slice(2);
  } else if (digits.length === 13 && digits.startsWith("091")) {
    return { ok: false, reason: "invalid_mobile" };
  } else if (digits.length < 10 || digits.length > 12) {
    return { ok: false, reason: "invalid_length" };
  } else {
    return { ok: false, reason: "invalid_mobile" };
  }

  if (!INDIAN_MOBILE_RE.test(national)) return { ok: false, reason: "invalid_mobile" };

  const e164 = `+91${national}`;
  return { ok: true, e164, national, masked: maskPhone(e164) };
}

export function normalizeIndianPhone(input: string) {
  const result = validateIndianMobile(input);
  if (!result.ok) throw new Error("Please enter a valid 10-digit Indian mobile number.");
  return result.e164;
}

export function getIndianMobileDigits(input: string) {
  const result = validateIndianMobile(input);
  return result.ok ? result.national : String(input || "").replace(/\D/g, "");
}

export function maskPhone(input: string) {
  const digits = String(input || "").replace(/\D/g, "");
  const national = digits.length >= 10 ? digits.slice(-10) : digits;
  if (national.length < 4) return "+91 ******";
  return `+91 ******${national.slice(-4)}`;
}

export function authErrorKey(error: unknown) {
  const message = String((error as any)?.message || error || "").toLowerCase();

  if (
    message.includes("user_profiles") ||
    message.includes("customer_addresses") ||
    message.includes("user_policy_acceptances") ||
    message.includes("row-level") ||
    message.includes("rls") ||
    message.includes("permission denied") ||
    message.includes("forbidden") ||
    message.includes("403")
  ) {
    return "auth.registrationSaveFailed";
  }

  if (message.includes("provider") || message.includes("sms")) return "auth.errorSmsProvider";
  if (message.includes("unsupported") && message.includes("phone")) return "auth.errorSmsProvider";
  if (message.includes("unsupported") || message.includes("country")) return "auth.errorUnsupportedCountry";
  if (message.includes("rate") || message.includes("too many")) return "auth.errorRateLimit";
  if (message.includes("expired")) return "auth.errorOtpExpired";
  if (message.includes("invalid") && message.includes("token")) return "auth.errorOtpIncorrect";
  if (message.includes("otp") && message.includes("invalid")) return "auth.errorOtpIncorrect";
  if (message.includes("network") || message.includes("fetch")) return "auth.errorNetwork";

  return "auth.errorOtpSendFailed";
}