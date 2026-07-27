import crypto from "crypto";
import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

function fingerprint(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

router.post("/trusted-device", async (req, res) => {
  try {
    const { user_id, device_id, device_name, platform, app_version } = req.body;
    if (!user_id || !device_id) {
      return res.status(400).json({ success: false, error: "User and device id are required." });
    }

    const deviceFingerprint = fingerprint(device_id);
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("user_device_sessions")
      .upsert({
        user_id,
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

    await supabase.from("auth_security_events").insert({
      user_id,
      event_type: "device_registered",
      device_fingerprint: deviceFingerprint,
      metadata: { device_name, platform, app_version },
    });

    return res.json({ success: true, device: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/trusted-devices/:user_id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_device_sessions")
      .select("id, device_name, platform, app_version, trusted, revoked_at, last_seen_at, created_at")
      .eq("user_id", req.params.user_id)
      .order("last_seen_at", { ascending: false });

    if (error) throw error;
    return res.json({ success: true, devices: data || [] });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/revoke-device", async (req, res) => {
  try {
    const { user_id, device_session_id } = req.body;
    if (!user_id || !device_session_id) {
      return res.status(400).json({ success: false, error: "User and device session are required." });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("user_device_sessions")
      .update({ trusted: false, revoked_at: now, last_seen_at: now })
      .eq("id", device_session_id)
      .eq("user_id", user_id)
      .select()
      .single();

    if (error) throw error;

    await supabase.from("auth_security_events").insert({
      user_id,
      event_type: "device_revoked",
      device_fingerprint: data.device_fingerprint,
      metadata: { device_session_id },
    });

    return res.json({ success: true, device: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
