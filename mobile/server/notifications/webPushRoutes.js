import express from "express";
import { supabase } from "../connection.js";
import { requireUserJwt } from "../security/apiSecurity.js";

const router = express.Router();
const requireAuth = requireUserJwt(supabase);

router.post("/web-push-subscriptions", requireAuth, async (req, res) => {
  try {
    const { endpoint, subscription, user_agent } = req.body || {};
    const user_id = req.auth.user_id;

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

router.delete("/web-push-subscriptions", requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) {
      return res.status(400).json({ success: false, error: "Endpoint is required." });
    }

    let query = supabase
      .from("web_push_subscriptions")
      .update({
        consent_status: "revoked",
        revoked_at: new Date().toISOString(),
      });

    query = query.eq("endpoint", endpoint).eq("user_id", req.auth.user_id);

    const { error } = await query;
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});


router.post("/fcm-tokens", requireAuth, async (req, res) => {
  try {
    const { token, platform = "web", app_role = "customer", user_agent, metadata = {} } = req.body || {};
    const user_id = req.auth.user_id;
    if (!token) {
      return res.status(400).json({ success: false, error: "FCM token is required." });
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

router.delete("/fcm-tokens", requireAuth, async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ success: false, error: "Token is required." });

    let query = supabase.from("device_push_tokens").update({ consent_status: "revoked", revoked_at: new Date().toISOString() });
    query = query.eq("token", token).eq("user_id", req.auth.user_id);
    const { error } = await query;
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
export default router;

