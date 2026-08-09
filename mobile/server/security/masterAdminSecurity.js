import crypto from "crypto";

const SESSION_TTL_MS = Number(process.env.MASTER_ADMIN_SESSION_TTL_MS || 30 * 60 * 1000);
const MAX_ATTEMPTS = Number(process.env.MASTER_ADMIN_SECRET_MAX_ATTEMPTS || 5);
const LOCKOUT_MS = Number(process.env.MASTER_ADMIN_SECRET_LOCKOUT_MS || 15 * 60 * 1000);
const attempts = new Map();

function now() {
  return Date.now();
}

function clientKey(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  return `${req.auth?.user_id || "anonymous"}:${ip}`;
}

function signPayload(payload) {
  const key = process.env.MASTER_ADMIN_SESSION_SIGNING_KEY;
  if (!key) throw new Error("Master Admin session signing key is not configured.");
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

export function isMasterAdminRole(role) {
  return String(role || "").toLowerCase() === "master_admin";
}

export function verifyMasterAdminSecret(secret) {
  const salt = process.env.MASTER_ADMIN_SECRET_SALT;
  const expectedHash = process.env.MASTER_ADMIN_SECRET_HASH;
  if (!salt || !expectedHash) throw new Error("Master Admin secret hash is not configured.");
  const calculated = crypto.scryptSync(String(secret || ""), salt, 64).toString("hex");
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(calculated, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function createMasterAdminSession(userId) {
  const expiresAt = now() + SESSION_TTL_MS;
  const payload = JSON.stringify({ sub: userId, role: "master_admin", exp: expiresAt });
  const encodedPayload = Buffer.from(payload).toString("base64url");
  const signature = signPayload(encodedPayload);
  return { token: `${encodedPayload}.${signature}`, expires_at: new Date(expiresAt).toISOString() };
}

export function verifyMasterAdminSessionToken(token, userId) {
  try {
    if (!token || !String(token).includes(".")) return false;
    const [encodedPayload, signature] = String(token).split(".");
    const expectedSignature = signPayload(encodedPayload);
    const a = Buffer.from(signature || "");
    const b = Buffer.from(expectedSignature || "");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    return payload?.sub === userId && payload?.role === "master_admin" && Number(payload?.exp || 0) > now();
  } catch {
    return false;
  }
}

export function enforceMasterAdminSecretAttemptLimit(req, res, next) {
  const key = clientKey(req);
  const entry = attempts.get(key);
  if (entry?.lockedUntil && entry.lockedUntil > now()) {
    res.setHeader("Retry-After", String(Math.ceil((entry.lockedUntil - now()) / 1000)));
    return res.status(429).json({ success: false, error: "Too many incorrect attempts. Please try again later." });
  }
  return next();
}

export function recordMasterAdminSecretAttempt(req, success) {
  const key = clientKey(req);
  if (success) {
    attempts.delete(key);
    return;
  }
  const entry = attempts.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now() + LOCKOUT_MS;
    entry.count = 0;
  }
  attempts.set(key, entry);
}

export function requireMasterAdminSession(req, res, next) {
  if (!isMasterAdminRole(req.auth?.role)) {
    return res.status(403).json({ success: false, error: "Master Admin role is required." });
  }
  const token = req.headers["x-master-admin-session"];
  if (!verifyMasterAdminSessionToken(token, req.auth.user_id)) {
    return res.status(403).json({ success: false, error: "Master Admin secret verification is required." });
  }
  return next();
}