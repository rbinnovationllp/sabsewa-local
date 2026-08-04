const PREFIX = "sabsewa_pending_registration:";

function normalizeIdentifier(identifier: string) {
  const raw = String(identifier || "").trim().toLowerCase();
  const looksPhone = /^[+\d\s()\-]+$/.test(raw);

  if (looksPhone) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 10) return digits;
  }

  return raw;
}

function storageKeys(identifier: string) {
  const raw = String(identifier || "").trim().toLowerCase();
  const normalized = normalizeIdentifier(identifier);

  return Array.from(new Set([
    `${PREFIX}${normalized}`,
    `${PREFIX}${raw}`,
  ].filter(Boolean)));
}

function writeStorage(key: string, value: string) {
  try { window.sessionStorage?.setItem(key, value); } catch {}
  try { window.localStorage?.setItem(key, value); } catch {}
}

function readStorage(key: string) {
  try {
    const value = window.sessionStorage?.getItem(key);
    if (value) return value;
  } catch {}

  try {
    const value = window.localStorage?.getItem(key);
    if (value) return value;
  } catch {}

  return null;
}

function removeStorage(key: string) {
  try { window.sessionStorage?.removeItem(key); } catch {}
  try { window.localStorage?.removeItem(key); } catch {}
}

export function savePendingRegistrationDraft(identifier: string, metadata: Record<string, any>) {
  if (typeof window === "undefined") return;

  const payload = JSON.stringify({
    metadata,
    saved_at: new Date().toISOString(),
  });

  for (const key of storageKeys(identifier)) writeStorage(key, payload);
}

export function loadPendingRegistrationDraft(identifier: string) {
  if (typeof window === "undefined") return null;

  for (const key of storageKeys(identifier)) {
    const value = readStorage(key);
    if (!value) continue;

    try {
      const parsed = JSON.parse(value);
      if (parsed?.metadata) return parsed.metadata;
    } catch {}
  }

  return null;
}

export function clearPendingRegistrationDraft(identifier: string) {
  if (typeof window === "undefined") return;

  for (const key of storageKeys(identifier)) removeStorage(key);
}