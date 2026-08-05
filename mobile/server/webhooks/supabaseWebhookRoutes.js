import crypto from "crypto";
import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

function configuredSecret() {
  return String(process.env.SUPABASE_WEBHOOK_SECRET || "").trim();
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function bearerSecret(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function verifySupabaseWebhook(req) {
  const secret = configuredSecret();
  if (!secret || secret.includes("replace_with")) return false;

  const candidates = [
    req.headers["x-supabase-webhook-secret"],
    req.headers["x-webhook-secret"],
    req.headers["x-sabsewa-webhook-secret"],
    bearerSecret(req),
  ].filter(Boolean);

  return candidates.some((candidate) => timingSafeEqualText(candidate, secret));
}

async function auditSupabaseWebhook(payload, status, errorMessage = null) {
  try {
    const eventType = payload?.type || payload?.event_type || payload?.event || "supabase.webhook";
    const tableName = payload?.table || payload?.table_name || payload?.record?.table || null;
    const externalEventId = payload?.id || payload?.event_id || payload?.record?.id || null;

    await supabase.from("platform_webhook_events").insert({
      provider: "supabase",
      event_type: String(eventType),
      table_name: tableName ? String(tableName) : null,
      external_event_id: externalEventId ? String(externalEventId) : null,
      processing_status: status,
      processing_error: errorMessage,
      payload,
    });
  } catch (error) {
    console.warn("Supabase webhook audit skipped", error?.message || error);
  }
}

router.post("/supabase", express.json({ limit: "1mb", type: "*/*" }), async (req, res) => {
  try {
    if (!verifySupabaseWebhook(req)) {
      await auditSupabaseWebhook({ rejected: true, reason: "invalid_secret" }, "rejected", "Invalid Supabase webhook secret.");
      return res.status(401).json({ success: false, error: "Invalid Supabase webhook secret." });
    }

    const payload = req.body || {};
    await auditSupabaseWebhook(payload, "received");
    return res.json({ success: true, status: "received" });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
