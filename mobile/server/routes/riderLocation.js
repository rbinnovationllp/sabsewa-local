import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

/**
 * GET /api/rider/location?order_id=xxx
 */
router.get("/", async (req, res) => {
  const { order_id } = req.query;

  if (!order_id) {
    return res.status(400).json({ success: false, message: "order_id is required" });
  }

  const { data, error } = await supabase
    .from("delivery_assignments")
    .select("rider_lat, rider_lng, delivery_boy_id, status, location_updated_at")
    .eq("order_id", order_id)
    .single();

  if (error) {
    return res.status(500).json({ success: false, message: error.message });
  }

  return res.json({
    success: true,
    location: data,
  });
});

export default router;
