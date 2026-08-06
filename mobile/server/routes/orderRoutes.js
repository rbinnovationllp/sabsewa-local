const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../lib/supabaseAdmin");

// 1. Customer Places Order with Immutable Address Snapshot
router.post("/api/orders/create", async (req, res) => {
  try {
    const { customer_id, vendor_id, items, total_amount, payment_method, selected_address } = req.body;

    if (!selected_address || !selected_address.street_address || !selected_address.phone_number) {
      return res.status(400).json({ success: false, error: "Complete address and contact confirmation required." });
    }

    // Capture an unalterable snapshot of the customer address at order time
    const delivery_snapshot = {
      customer_name: selected_address.full_name,
      phone_number: selected_address.phone_number,
      alternative_phone: selected_address.alternative_phone || null,
      street_address: selected_address.street_address,
      landmark: selected_address.landmark || "",
      locality: selected_address.locality,
      pincode: selected_address.pincode,
      address_label: selected_address.label || "Home",
      lat: selected_address.lat || null,
      lng: selected_address.lng || null,
      delivery_instructions: selected_address.instructions || "",
    };

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_id,
        vendor_id,
        items,
        total_amount,
        payment_method,
        status: "pending", // Pending acceptance
        locality: selected_address.locality,
        pincode: selected_address.pincode,
        delivery_snapshot_json: delivery_snapshot,
      })
      .select("id, status, total_amount, items, created_at, locality, pincode")
      .single();

    if (error) throw error;
    return res.json({ success: true, order });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Vendor Pending Orders View (Data Minimization: Redacts PII)
router.get("/api/vendor/orders/pending", async (req, res) => {
  try {
    const { vendor_id } = req.query;

    const { data: orders, error } = await supabaseAdmin
      .from("orders")
      .select("id, status, total_amount, items, payment_method, locality, pincode, created_at")
      .eq("vendor_id", vendor_id)
      .eq("status", "pending");

    if (error) throw error;

    // Sanitize response to guarantee no customer PII is returned before acceptance
    const sanitizedOrders = orders.map(order => ({
      order_id: order.id,
      items: order.items,
      total_amount: order.total_amount,
      payment_method: order.payment_method,
      approximate_area: `${order.locality}, ${order.pincode}`,
      created_at: order.created_at,
    }));

    return res.json({ success: true, orders: sanitizedOrders });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Vendor Accepts Order (Unlocks Full Delivery Details)
router.post("/api/vendor/orders/accept", async (req, res) => {
  try {
    const { order_id, vendor_id } = req.body;

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .update({ status: "accepted" })
      .eq("id", order_id)
      .eq("vendor_id", vendor_id)
      .select("*")
      .single();

    if (error) throw error;

    const snapshot = order.delivery_snapshot_json;

    return res.json({
      success: true,
      message: "Order accepted. Delivery details unlocked.",
      delivery_details: {
        order_id: order.id,
        status: order.status,
        customer_name: snapshot.customer_name,
        contact_number: snapshot.phone_number,
        alternative_contact: snapshot.alternative_phone,
        complete_address: `${snapshot.street_address}, ${snapshot.locality}, ${snapshot.pincode}`,
        landmark: snapshot.landmark,
        address_type: snapshot.address_label,
        delivery_instructions: snapshot.delivery_instructions,
        navigation_url: snapshot.lat && snapshot.lng ? `https://www.google.com/maps/dir/?api=1&destination=${snapshot.lat},${snapshot.lng}` : null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;