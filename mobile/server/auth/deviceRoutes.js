import crypto from "crypto";
import express from "express";
import { supabase } from "../connection.js";
import { requireUserJwt } from "../security/apiSecurity.js";

const router = express.Router();
const requireAuth = requireUserJwt(supabase);

function fingerprint(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

async function writeSecurityEvent(userId, eventType, deviceFingerprint, metadata = {}) {
  const { error } = await supabase.from("auth_security_events").insert({
    user_id: userId,
    event_type: eventType,
    device_fingerprint: deviceFingerprint,
    metadata,
  });
  if (error) console.warn("Auth security event write failed", { eventType, code: error.code, message: error.message });
}

router.post("/trusted-device", requireAuth, async (req, res) => {
  try {
    const { device_id, device_name, platform, app_version } = req.body;
    const userId = req.auth.user_id;
    if (!userId || !device_id) {
      return res.status(400).json({ success: false, error: "Authenticated user and device id are required." });
    }

    const deviceFingerprint = fingerprint(device_id);
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("user_device_sessions")
      .upsert({
        user_id: userId,
        device_fingerprint: deviceFingerprint,
        device_name,
        platform,
        app_version,
        trusted: true,
        revoked_at: null,
        last_seen_at: now,
      }, { onConflict: "user_id,device_fingerprint" })
      .select()
      .single();

    if (error) throw error;

    await writeSecurityEvent(userId, "device_registered", deviceFingerprint, { device_name, platform, app_version });

    return res.json({ success: true, device: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

async function listTrustedDevicesForUser(userId, res) {
  const { data, error } = await supabase
    .from("user_device_sessions")
    .select("id, device_name, platform, app_version, trusted, revoked_at, last_seen_at, created_at")
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false });

  if (error) throw error;
  return res.json({ success: true, devices: data || [] });
}

router.get("/me/trusted-devices", requireAuth, async (req, res) => {
  try {
    return await listTrustedDevicesForUser(req.auth.user_id, res);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/trusted-devices/:user_id", requireAuth, async (req, res) => {
  try {
    if (req.params.user_id !== req.auth.user_id) {
      return res.status(403).json({ success: false, error: "You may view only your own trusted devices." });
    }
    return await listTrustedDevicesForUser(req.auth.user_id, res);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

async function revokeDeviceForUser(userId, deviceSessionId, res) {
  if (!userId || !deviceSessionId) {
    return res.status(400).json({ success: false, error: "Authenticated user and device session are required." });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("user_device_sessions")
    .update({ trusted: false, revoked_at: now, last_seen_at: now })
    .eq("id", deviceSessionId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;

  await writeSecurityEvent(userId, "device_revoked", data.device_fingerprint, { device_session_id: deviceSessionId });

  return res.json({ success: true, device: data });
}

router.post("/me/revoke-device", requireAuth, async (req, res) => {
  try {
    return await revokeDeviceForUser(req.auth.user_id, req.body?.device_session_id, res);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/revoke-device", requireAuth, async (req, res) => {
  try {
    const userId = req.body?.user_id || req.auth.user_id;
    if (userId !== req.auth.user_id) {
      return res.status(403).json({ success: false, error: "You may revoke only your own trusted devices." });
    }
    return await revokeDeviceForUser(req.auth.user_id, req.body?.device_session_id, res);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
