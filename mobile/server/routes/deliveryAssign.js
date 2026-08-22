import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

const ASSIGNABLE_ORDER_STATUSES = ["accepted", "packed", "out_for_delivery"];

async function auditDeliveryAssignment(action, payload = {}) {
  const { error } = await supabase.from("delivery_staff_audit_logs").insert({
    vendor_id: payload.vendor_id || null,
    terminal_id: payload.terminal_id || null,
    delivery_boy_id: payload.delivery_boy_id || null,
    assignment_id: payload.assignment_id || null,
    order_id: payload.order_id || null,
    actor_role: "VENDOR_OWNER",
    action,
    metadata: payload.metadata || {},
  });

  if (error) console.error("delivery assignment audit failed", { action, error });
}

router.post("/", async (req, res) => {
  try {
    const { vendor_id, order_id, delivery_boy_id, terminal_id, assigned_by } = req.body;

    if (!vendor_id || !order_id || !delivery_boy_id || !terminal_id) {
      return res.status(400).json({ success: false, message: "vendor_id, terminal_id, order_id and delivery_boy_id are required" });
    }

    const { data: order, error: orderError } = await supabase
      .from("hyperlocal_orders")
      .select("id, vendor_id, terminal_id, status")
      .eq("id", order_id)
      .eq("vendor_id", vendor_id)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order) return res.status(404).json({ success: false, message: "Order not found for this vendor" });
    if (order.terminal_id && order.terminal_id !== terminal_id) {
      return res.status(403).json({ success: false, message: "Order does not belong to this terminal" });
    }
    if (!ASSIGNABLE_ORDER_STATUSES.includes(order.status)) {
      return res.status(409).json({ success: false, message: `Order status ${order.status} cannot be assigned for delivery` });
    }

    const { data: rider, error: riderError } = await supabase
      .from("delivery_boys")
      .select("id, rider_token, phone, name, vendor_id, terminal_id, status, is_active, disabled_at")
      .eq("id", delivery_boy_id)
      .eq("vendor_id", vendor_id)
      .eq("terminal_id", terminal_id)
      .maybeSingle();

    if (riderError) throw riderError;
    if (!rider) return res.status(404).json({ success: false, message: "Delivery staff not found for this vendor terminal" });
    if (rider.is_active === false || rider.disabled_at || rider.status === "inactive") {
      return res.status(409).json({ success: false, message: "Delivery staff is disabled or inactive" });
    }

    const { data: existing } = await supabase
      .from("delivery_assignments")
      .select("id, delivery_boy_id")
      .eq("order_id", order_id)
      .maybeSingle();

    const assignmentPayload = {
      order_id,
      vendor_id,
      terminal_id,
      delivery_boy_id,
      status: "assigned",
      assigned_at: new Date().toISOString(),
      assigned_by: assigned_by || null,
      reassigned_from: existing?.delivery_boy_id && existing.delivery_boy_id !== delivery_boy_id ? existing.delivery_boy_id : null,
    };

    const { data: assignments, error } = await supabase
      .from("delivery_assignments")
      .upsert(assignmentPayload, { onConflict: "order_id" })
      .select();

    if (error) throw error;

    await supabase.from("delivery_boys").update({ status: "busy" }).eq("id", delivery_boy_id);
    if (assignmentPayload.reassigned_from) {
      await supabase.from("delivery_boys").update({ status: "available" }).eq("id", assignmentPayload.reassigned_from);
    }

    const assignment = Array.isArray(assignments) ? assignments[0] : assignments;
    await auditDeliveryAssignment(assignmentPayload.reassigned_from ? "delivery_reassigned" : "delivery_assigned", {
      vendor_id,
      terminal_id,
      delivery_boy_id,
      assignment_id: assignment?.id,
      order_id,
      metadata: { reassigned_from: assignmentPayload.reassigned_from, assigned_by: assigned_by || null },
    });

    return res.json({
      success: true,
      message: "Delivery staff assigned",
      assignment,
      rider_link: `https://sabsewa.in/rider?token=${rider.rider_token}`,
      rider_phone: rider.phone,
      rider_name: rider.name,
    });
  } catch (error) {
    console.error("Assign delivery error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
