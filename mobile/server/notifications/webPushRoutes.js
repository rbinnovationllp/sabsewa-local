import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

router.post("/web-push-subscriptions", async (req, res) => {
  try {
    const { user_id, endpoint, subscription, user_agent } = req.body || {};

    if (!endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ success: false, error: "Valid web push subscription is required." });
    }

    const { data, error } = await supabase
      .from("web_push_subscriptions")
      .upsert(
        {
          user_id: user_id || null,
          endpoint,
          subscription,
          user_agent: user_agent || null,
          consent_status: "granted",
          last_seen_at: new Date().toISOString(),
          revoked_at: null,
        },
        { onConflict: "endpoint" }
      )
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, subscription: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete("/web-push-subscriptions", async (req, res) => {
  try {
    const { endpoint, user_id } = req.body || {};
    if (!endpoint && !user_id) {
      return res.status(400).json({ success: false, error: "Endpoint or user ID is required." });
    }

    let query = supabase
      .from("web_push_subscriptions")
      .update({
        consent_status: "revoked",
        revoked_at: new Date().toISOString(),
      });

    if (endpoint) query = query.eq("endpoint", endpoint);
    if (user_id) query = query.eq("user_id", user_id);

    const { error } = await query;
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});


router.post("/fcm-tokens", async (req, res) => {
  try {
    const { user_id, token, platform = "web", app_role = "customer", user_agent, metadata = {} } = req.body || {};
    if (!user_id || !token) {
      return res.status(400).json({ success: false, error: "User id and FCM token are required." });
    }

    const { data, error } = await supabase
      .from("device_push_tokens")
      .upsert(
        {
          user_id,
          provider: "fcm",
          token,
          platform,
          app_role,
          user_agent: user_agent || null,
          consent_status: "granted",
          revoked_at: null,
          last_seen_at: new Date().toISOString(),
          metadata,
        },
        { onConflict: "token" }
      )
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, token: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete("/fcm-tokens", async (req, res) => {
  try {
    const { token, user_id } = req.body || {};
    if (!token && !user_id) return res.status(400).json({ success: false, error: "Token or user ID is required." });

    let query = supabase.from("device_push_tokens").update({ consent_status: "revoked", revoked_at: new Date().toISOString() });
    if (token) query = query.eq("token", token);
    if (user_id) query = query.eq("user_id", user_id);
    const { error } = await query;
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
export default router;

