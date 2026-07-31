export function normalizeIndianPhone(input: string) {
  const trimmed = String(input || "").trim();
  const digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("+") && /^\+\d{10,15}$/.test(trimmed.replace(/\s/g, ""))) {
    return trimmed.replace(/\s/g, "");
  }

  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;

  throw new Error("Enter a valid 10-digit Indian mobile number.");
}

export function getIndianMobileDigits(input: string) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits;
}
