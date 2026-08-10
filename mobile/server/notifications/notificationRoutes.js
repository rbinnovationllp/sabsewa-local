import express from "express";
import { supabase } from "../connection.js";
import { requireUserJwt } from "../security/apiSecurity.js";

const router = express.Router();
const requireAuth = requireUserJwt(supabase);

/**
 * @route POST /api/notifications/subscribe
 * @desc Registers a web-push / FCM push token bound safely to the authenticated user ID.
 */
router.post("/subscribe", requireAuth, async (req, res) => {
  try {
    const authenticatedUserId = req.auth?.user_id;
    if (!authenticatedUserId) {
      return res.status(401).json({ success: false, error: "Unauthorized access token." });
    }

    const { push_token, device_type = "web", device_info = {} } = req.body || {};

    if (!push_token) {
      return res.status(400).json({ success: false, error: "Push token is required for registration." });
    }

    // Upsert subscription tied strictly to the authenticated user
    const { data, error } = await supabase
      .from("user_push_subscriptions")
      .upsert(
        {
          user_id: authenticatedUserId, // Securely bound to JWT
          push_token,
          device_type,
          device_info,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id, push_token" }
      )
      .select()
      .single();

    if (error) throw error;

    return res.json({ success: true, subscription: data });
  } catch (err) {
    console.error("Push subscription error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @route DELETE /api/notifications/unsubscribe
 * @desc Unregisters a push token for the authenticated user.
 */
router.delete("/unsubscribe", requireAuth, async (req, res) => {
  try {
    const authenticatedUserId = req.auth?.user_id;
    const { push_token } = req.body || {};

    if (!push_token) {
      return res.status(400).json({ success: false, error: "Push token is required." });
    }

    const { error } = await supabase
      .from("user_push_subscriptions")
      .delete()
      .eq("user_id", authenticatedUserId)
      .eq("push_token", push_token);

    if (error) throw error;

    return res.json({ success: true, message: "Unsubscribed successfully." });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;