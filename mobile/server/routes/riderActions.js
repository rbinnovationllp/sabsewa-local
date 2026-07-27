// server/routes/riderActions.js
import express from "express";
import { supabase } from "../connection.js";
import { sendTrackingSms } from "../services/msg91Client.js";

const router = express.Router();

/** Helper – get rider by token */
async function getRiderByToken(token) {
  const { data, error } = await supabase
    .from("delivery_boys")
    .select("id, vendor_id, terminal_id")
    .eq("rider_token", token)
    .single();

  if (error || !data) {
    throw new Error("Invalid rider token");
  }
  return data;
}

/** GET /api/rider/assignments  – rider sees his active deliveries */
router.get("/assignments", async (req, res) => {
  try {
    const token = req.header("x-rider-token");
    if (!token) return res.status(401).json({ success: false, message: "Missing rider token" });

    const rider = await getRiderByToken(token);

    const { data: assignments, error } = await supabase
      .from("delivery_assignments")
      .select("*")
      .eq("delivery_boy_id", rider.id)
      .in("status", ["assigned", "out_for_delivery"])
      .order("assigned_at", { ascending: false });

    if (error) throw error;

    // attach order info (address + lat/lng) separately to avoid FK issues
    const orderIds = assignments.map((a) => a.order_id);
    let ordersMap = new Map();

    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from("hyperlocal_orders")
        .select("id, delivery_address, customer_lat, customer_lng, customer_phone, shop_name")
        .in("id", orderIds);

      ordersMap = new Map(orders.map((o) => [o.id, o]));
    }

    const merged = assignments.map((a) => ({
      ...a,
      hyperlocal_order: ordersMap.get(a.order_id) || null,
    }));

    return res.json({ success: true, assignments: merged });
  } catch (err) {
    console.error("assignments error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/** POST /api/rider/update-location */
router.post("/update-location", async (req, res) => {
  try {
    const token = req.header("x-rider-token");
    if (!token) return res.status(401).json({ success: false, message: "Missing rider token" });

    await getRiderByToken(token); // just to validate token

    const { assignment_id, lat, lng } = req.body;
    if (!assignment_id || !lat || !lng) {
      return res.status(400).json({ success: false, message: "Missing lat/lng or assignment_id" });
    }

    const { error } = await supabase
      .from("delivery_assignments")
      .update({
        rider_lat: lat,
        rider_lng: lng,
        location_updated_at: new Date().toISOString(),
      })
      .eq("id", assignment_id);

    if (error) throw error;

    return res.json({ success: true });
  } catch (err) {
    console.error("update-location error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/** POST /api/rider/picked – mark picked & send tracking SMS */
router.post("/picked", async (req, res) => {
  try {
    const token = req.header("x-rider-token");
    if (!token) return res.status(401).json({ success: false, message: "Missing rider token" });

    await getRiderByToken(token);

    const { assignment_id } = req.body;
    if (!assignment_id) {
      return res.status(400).json({ success: false, message: "assignment_id required" });
    }

    // 1) update assignment
    const { data: updated, error } = await supabase
      .from("delivery_assignments")
      .update({
        status: "out_for_delivery",
        picked_at: new Date().toISOString(),
      })
      .eq("id", assignment_id)
      .select("*")
      .single();

    if (error) throw error;

    // 2) update order status
    await supabase
      .from("hyperlocal_orders")
      .update({ status: "out_for_delivery" })
      .eq("id", updated.order_id);

    // 3) fetch order details for SMS
    const { data: order } = await supabase
      .from("hyperlocal_orders")
      .select("customer_phone, shop_name")
      .eq("id", updated.order_id)
      .single();

    if (order?.customer_phone) {
      const publicAppUrl = process.env.PUBLIC_APP_URL || "https://sabsewa.app";
      const trackLink = `${publicAppUrl}/customer/track?order_id=${updated.order_id}`;

      await sendTrackingSms({
        phone: order.customer_phone,
        shopName: order.shop_name || "SabSewa Vendor",
        trackLink,
      });
    }

    return res.json({ success: true, assignment: updated });
  } catch (err) {
    console.error("picked error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/** POST /api/rider/delivered – mark delivered */
router.post("/delivered", async (req, res) => {
  try {
    const token = req.header("x-rider-token");
    if (!token) return res.status(401).json({ success: false, message: "Missing rider token" });

    await getRiderByToken(token);

    const { assignment_id } = req.body;
    if (!assignment_id) {
      return res.status(400).json({ success: false, message: "assignment_id required" });
    }

    const { data: updated, error } = await supabase
      .from("delivery_assignments")
      .update({
        status: "delivered",
        delivered_at: new Date().toISOString(),
      })
      .eq("id", assignment_id)
      .select("*")
      .single();

    if (error) throw error;

    await supabase
      .from("hyperlocal_orders")
      .update({ status: "completed" })
      .eq("id", updated.order_id);

    return res.json({ success: true, assignment: updated });
  } catch (err) {
    console.error("delivered error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/** GET /api/rider/customer-tracking?order_id=... */
router.get("/customer-tracking", async (req, res) => {
  try {
    const { order_id } = req.query;
    if (!order_id) {
      return res.status(400).json({ success: false, message: "order_id required" });
    }

    const { data: assignment, error } = await supabase
      .from("delivery_assignments")
      .select("*")
      .eq("order_id", order_id)
      .single();

    if (error) throw error;

    const { data: order } = await supabase
      .from("hyperlocal_orders")
      .select("id, customer_id, delivery_lat, delivery_lng, delivery_address, shop_name, status, total_amount, price_quote_required, price_quote_status, vendor_price_quote, quoted_total_amount")
      .eq("id", order_id)
      .single();

    return res.json({ success: true, assignment, order });
  } catch (err) {
    console.error("customer-tracking error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
