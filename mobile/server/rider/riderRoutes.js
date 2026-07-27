// server/rider/riderRoutes.js
import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

/**
 * Helper: find rider by token
 */
async function getRiderByToken(token) {
  if (!token) return { rider: null, error: "Missing rider token" };

  const { data, error } = await supabase
    .from("delivery_boys")
    .select("id, vendor_id, is_active")
    .eq("access_token", token)
    .single();

  if (error || !data) {
    return { rider: null, error: "Invalid or inactive rider token" };
  }

  if (data.is_active === false) {
    return { rider: null, error: "Rider account is inactive" };
  }

  return { rider: data, error: null };
}

/**
 * 1️⃣ Rider: fetch assigned deliveries
 * GET /api/rider/assignments
 * Headers: x-rider-token: <access_token>
 */
router.get("/assignments", async (req, res) => {
  try {
    const token = req.headers["x-rider-token"];
    const { rider, error: riderErr } = await getRiderByToken(token);

    if (riderErr) return res.status(401).json({ error: riderErr });

    const rider_id = rider.id;

    const { data, error } = await supabase
      .from("delivery_assignments")
      .select("*, hyperlocal_orders(*)")
      .eq("delivery_boy_id", rider_id)
      .in("status", ["assigned", "picked"]);

    if (error) throw error;

    return res.json({ success: true, assignments: data });
  } catch (err) {
    console.error("Rider Fetch Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2️⃣ Rider: update live location
 * POST /api/rider/update-location
 * Headers: x-rider-token: <access_token>
 * Body: { assignment_id, lat, lng }
 */
router.post("/update-location", async (req, res) => {
  try {
    const token = req.headers["x-rider-token"];
    const { rider, error: riderErr } = await getRiderByToken(token);

    if (riderErr) return res.status(401).json({ error: riderErr });

    const rider_id = rider.id;
    const { assignment_id, lat, lng } = req.body;

    if (!assignment_id || !lat || !lng) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const { error } = await supabase
      .from("delivery_assignments")
      .update({
        rider_lat: lat,
        rider_lng: lng,
        location_updated_at: new Date(),
      })
      .eq("id", assignment_id)
      .eq("delivery_boy_id", rider_id);

    if (error) throw error;

    res.json({ success: true, message: "Location updated" });
  } catch (err) {
    console.error("Location Update Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3️⃣ Rider: mark order as PICKED
 * POST /api/rider/picked
 * Headers: x-rider-token
 * Body: { assignment_id }
 */
router.post("/picked", async (req, res) => {
  try {
    const token = req.headers["x-rider-token"];
    const { rider, error: riderErr } = await getRiderByToken(token);
    if (riderErr) return res.status(401).json({ error: riderErr });

    const rider_id = rider.id;
    const { assignment_id } = req.body;

    if (!assignment_id) {
      return res.status(400).json({ error: "assignment_id required" });
    }

    const { error } = await supabase
      .from("delivery_assignments")
      .update({
        status: "picked",
        picked_at: new Date(),
      })
      .eq("id", assignment_id)
      .eq("delivery_boy_id", rider_id);

    if (error) throw error;

    res.json({ success: true, message: "Order marked as picked" });
  } catch (err) {
    console.error("Pickup Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4️⃣ Rider: mark order as DELIVERED
 * POST /api/rider/delivered
 * Headers: x-rider-token
 * Body: { assignment_id }
 */
router.post("/delivered", async (req, res) => {
  try {
    const token = req.headers["x-rider-token"];
    const { rider, error: riderErr } = await getRiderByToken(token);
    if (riderErr) return res.status(401).json({ error: riderErr });

    const rider_id = rider.id;
    const { assignment_id } = req.body;

    if (!assignment_id) {
      return res.status(400).json({ error: "assignment_id required" });
    }

    const { error } = await supabase
      .from("delivery_assignments")
      .update({
        status: "delivered",
        delivered_at: new Date(),
      })
      .eq("id", assignment_id)
      .eq("delivery_boy_id", rider_id);

    if (error) throw error;

    res.json({ success: true, message: "Order marked as delivered" });
  } catch (err) {
    console.error("Deliver Error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
