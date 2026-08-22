const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX = 120;
const rateLimitBuckets = new Map();

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function bearerToken(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

const ADMIN_ROLES = new Set([
  "admin",
  "company_admin",
  "super_admin",
  "master_admin",
  "national_admin",
  "state_admin",
  "district_admin",
  "city_admin",
  "kyc_reviewer",
  "finance_admin",
  "support_admin",
]);

function cleanRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return role || null;
}

async function resolveTrustedRole(supabase, user) {
  if (!user?.id) return null;

  const { data: adminProfile, error: adminError } = await supabase
    .from("admin_profiles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminError && adminProfile?.account_status === "active" && cleanRole(adminProfile.role)) return cleanRole(adminProfile.role);

  const { data: assignments, error: assignmentError } = await supabase
    .from("admin_role_assignments")
    .select("role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(10);
  if (!assignmentError) {
    const assignedRole = (assignments || []).map((row) => cleanRole(row.role)).find((role) => ADMIN_ROLES.has(role));
    if (assignedRole) return assignedRole;
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profileError && cleanRole(profile?.role)) return cleanRole(profile.role);

  const { data: vendor, error: vendorError } = await supabase
    .from("vendors")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!vendorError && vendor?.id) return "vendor";

  const appRole = cleanRole(user.app_metadata?.role);
  if (appRole) return appRole;

  const metadataRole = cleanRole(user.user_metadata?.role);
  if (metadataRole && !ADMIN_ROLES.has(metadataRole)) return metadataRole;

  return null;
}

export function securityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=() ");
  res.setHeader("Cache-Control", "no-store");
  next();
}

export function createRateLimiter({ windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS, max = DEFAULT_RATE_LIMIT_MAX, keyPrefix = "api" } = {}) {
  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = `${keyPrefix}:${clientIp(req)}:${req.method}:${req.path}`;
    const current = rateLimitBuckets.get(key);

    if (!current || current.resetAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, error: "Too many requests. Please try again shortly." });
    }

    return next();
  };
}

export function requireDeviceHeaders(req, res, next) {
  const deviceId = req.headers["x-sabsewa-device-id"] || req.headers["x-device-id"];
  const appVersion = req.headers["x-sabsewa-app-version"] || req.headers["x-app-version"];
  const platform = req.headers["x-sabsewa-platform"] || req.headers["x-platform"];

  if (!deviceId || !appVersion || !platform) {
    return res.status(400).json({
      success: false,
      error: "Device id, app version and platform headers are required.",
    });
  }

  req.deviceContext = {
    device_id: String(deviceId),
    app_version: String(appVersion),
    platform: String(platform),
  };
  return next();
}

export function requireUserJwt(supabase) {
  return async function userJwt(req, res, next) {
    try {
      const token = bearerToken(req);
      if (!token) return res.status(401).json({ success: false, error: "Authentication is required." });

      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) return res.status(401).json({ success: false, error: "Invalid or expired session." });

      const trustedRole = await resolveTrustedRole(supabase, data.user);

      req.auth = {
        token,
        user: data.user,
        user_id: data.user.id,
        role: trustedRole,
      };
      return next();
    } catch {
      return res.status(401).json({ success: false, error: "Authentication failed." });
    }
  };
}

export function requireRole(allowedRoles = []) {
  const allowed = new Set(Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]);
  return function roleGuard(req, res, next) {
    if (!req.auth?.user) return res.status(401).json({ success: false, error: "Authentication is required." });
    const role = req.auth.role;
    if (!role || !allowed.has(role)) return res.status(403).json({ success: false, error: "You are not allowed to perform this action." });
    return next();
  };
}

export function validateRequiredBody(fields = []) {
  return function requiredBody(req, res, next) {
    const missing = fields.filter((field) => req.body?.[field] === undefined || req.body?.[field] === null || req.body?.[field] === "");
    if (missing.length) {
      return res.status(400).json({ success: false, error: `Missing required field(s): ${missing.join(", ")}` });
    }
    return next();
  };
}

export function redactError(error) {
  if (process.env.NODE_ENV === "production") return "Request failed. Please try again or contact support.";
  return error?.message || "Request failed.";
}
