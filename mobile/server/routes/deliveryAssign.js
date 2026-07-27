import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

/**
 * Assign a delivery boy to an order
 * POST /api/vendor/assign-delivery
 */
router.post("/", async (req, res) => {
  const { vendor_id, order_id, delivery_boy_id, terminal_id } = req.body;

  if (!vendor_id || !order_id || !delivery_boy_id || !terminal_id) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  // 1️⃣ Create assignment or update existing
  const { data, error } = await supabase
    .from("delivery_assignments")
    .upsert(
      {
        order_id,
        vendor_id,
        terminal_id,
        delivery_boy_id,
        status: "assigned",
        assigned_at: new Date(),
      },
      { onConflict: "order_id" }
    )
    .select();

  if (error) {
    console.log("Assign error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }

  // 2️⃣ Fetch rider token
  const { data: rider } = await supabase
    .from("delivery_boys")
    .select("id, rider_token, phone")
    .eq("id", delivery_boy_id)
    .single();

  // Rider link
  const riderLink = `https://sabsewa.app/rider?token=${rider.rider_token}`;

  return res.json({
    success: true,
    message: "Delivery boy assigned",
    assignment: data,
    rider_link: riderLink,
    rider_phone: rider.phone,
  });
});

export default router;
