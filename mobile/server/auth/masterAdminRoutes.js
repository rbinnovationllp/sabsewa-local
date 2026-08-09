import express from "express";
import { createClient } from "@supabase/supabase-js";
import { requireUserJwt } from "../security/apiSecurity.js";
import {
  createMasterAdminSession,
  enforceMasterAdminSecretAttemptLimit,
  isMasterAdminRole,
  recordMasterAdminSecretAttempt,
  requireMasterAdminSession,
  verifyMasterAdminSecret,
} from "../security/masterAdminSecurity.js";

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function audit(req, action, success, metadata = {}) {
  try {
    await supabase.from("audit_logs").insert({
      actor_user_id: req.auth?.user_id || null,
      actor_role: req.auth?.role || null,
      action,
      entity_type: "master_admin_access",
      entity_id: req.auth?.user_id || null,
      metadata: {
        success,
        ip: String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim(),
        user_agent: req.headers["user-agent"] || null,
        ...metadata,
      },
    });
  } catch (error) {
    console.error("Master Admin audit insert failed", { action, message: error?.message });
  }
}

router.get("/status", requireUserJwt(supabase), async (req, res) => {
  if (!isMasterAdminRole(req.auth?.role)) {
    await audit(req, "master_admin_status_denied", false, { reason: "role" });
    return res.status(403).json({ success: false, error: "Master Admin role is required." });
  }
  return res.json({ success: true, secret_required: true, role: "master_admin" });
});

router.post("/verify-secret", requireUserJwt(supabase), enforceMasterAdminSecretAttemptLimit, async (req, res) => {
  if (!isMasterAdminRole(req.auth?.role)) {
    await audit(req, "master_admin_secret_denied", false, { reason: "role" });
    return res.status(403).json({ success: false, error: "Master Admin role is required." });
  }

  const secret = String(req.body?.secret || "");
  if (!secret) return res.status(400).json({ success: false, error: "Master Admin secret code is required." });

  let ok = false;
  try {
    ok = verifyMasterAdminSecret(secret);
  } catch {
    await audit(req, "master_admin_secret_config_error", false, { reason: "missing_hash" });
    return res.status(500).json({ success: false, error: "Master Admin secret is not configured on the server." });
  }

  recordMasterAdminSecretAttempt(req, ok);
  await audit(req, ok ? "master_admin_secret_verified" : "master_admin_secret_failed", ok);

  if (!ok) return res.status(401).json({ success: false, error: "Invalid Master Admin secret code." });
  const session = createMasterAdminSession(req.auth.user_id);
  return res.json({ success: true, master_admin_session: session });
});

router.get("/session", requireUserJwt(supabase), requireMasterAdminSession, async (_req, res) => {
  return res.json({ success: true, role: "master_admin" });
});

export default router;