const PREFIX = "sabsewa_pending_registration:";

function keyFor(identifier: string) {
  return `${PREFIX}${String(identifier || "").trim().toLowerCase()}`;
}

export function savePendingRegistrationDraft(identifier: string, metadata: Record<string, any>) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    keyFor(identifier),
    JSON.stringify({
      metadata,
      saved_at: new Date().toISOString(),
    })
  );
}

export function loadPendingRegistrationDraft(identifier: string) {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(keyFor(identifier));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed?.metadata || null;
  } catch {
    return null;
  }
}

export function clearPendingRegistrationDraft(identifier: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(keyFor(identifier));
}