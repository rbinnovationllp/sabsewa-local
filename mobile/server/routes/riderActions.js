// server/routes/riderActions.js
import express from "express";
import { randomUUID } from "crypto";
import { supabase } from "../connection.js";
import { notifyCustomerOrderDispatched } from "../notifications/dispatchNotificationService.js";

const router = express.Router();

const ACTIVE_ASSIGNMENT_STATUSES = ["assigned", "picked", "picked_up", "out_for_delivery"];
const DELIVERY_VISIBLE_STATUSES = [...ACTIVE_ASSIGNMENT_STATUSES, "delivered"];

function nowIso() {
  return new Date().toISOString();
}

async function auditDeliveryStaffAction(action, payload = {}) {
  const { error } = await supabase.from("delivery_staff_audit_logs").insert({
    vendor_id: payload.vendor_id || null,
    terminal_id: payload.terminal_id || null,
    delivery_boy_id: payload.delivery_boy_id || null,
    assignment_id: payload.assignment_id || null,
    order_id: payload.order_id || null,
    actor_role: "DELIVERY_STAFF",
    action,
    metadata: payload.metadata || {},
  });

  if (error) console.error("delivery staff audit failed", { action, error });
}

async function getRiderByToken(token) {
  const { data, error } = await supabase
    .from("delivery_boys")
    .select("id, vendor_id, terminal_id, name, phone, status, is_active, disabled_at, role")
    .eq("rider_token", token)
    .maybeSingle();

  if (error || !data) throw new Error("Invalid delivery staff token");
  if (data.role && data.role !== "DELIVERY_STAFF") throw new Error("This terminal is only for delivery staff");
  if (data.is_active === false || data.disabled_at || data.status === "inactive") {
    throw new Error("Delivery staff access is disabled. Contact the vendor owner.");
  }
  return data;
}

async function getOwnedAssignment(token, assignmentId, statuses = null) {
  const rider = await getRiderByToken(token);
  let query = supabase
    .from("delivery_assignments")
    .select("*")
    .eq("id", assignmentId)
    .eq("delivery_boy_id", rider.id)
    .eq("vendor_id", rider.vendor_id)
    .eq("terminal_id", rider.terminal_id);

  if (statuses?.length) query = query.in("status", statuses);

  const { data: assignment, error } = await query.maybeSingle();
  if (error || !assignment) throw new Error("Assignment not found for this delivery staff member");
  return { rider, assignment };
}

function numericAmount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

router.get("/assignments", async (req, res) => {
  try {
    const token = req.header("x-rider-token");
    if (!token) return res.status(401).json({ success: false, message: "Missing rider token" });

    const rider = await getRiderByToken(token);
    const since = new Date();
    since.setHours(0, 0, 0, 0);

    const { data: assignments = [], error } = await supabase
      .from("delivery_assignments")
      .select("*")
      .eq("delivery_boy_id", rider.id)
      .in("status", DELIVERY_VISIBLE_STATUSES)
      .or(`status.in.(${ACTIVE_ASSIGNMENT_STATUSES.join(",")}),delivered_at.gte.${since.toISOString()}`)
      .order("assigned_at", { ascending: false });

    if (error) throw error;

    const orderIds = assignments.map((a) => a.order_id).filter(Boolean);
    let ordersMap = new Map();

    if (orderIds.length > 0) {
      const { data: orders = [] } = await supabase
        .from("hyperlocal_orders")
        .select("id, order_number, delivery_address, customer_address, customer_lat, customer_lng, customer_phone, customer_name, shop_name, total_amount, quoted_total_amount, payment_method, payment_status, settlement_status, status")
        .in("id", orderIds);

      ordersMap = new Map(orders.map((o) => [o.id, o]));
    }

    return res.json({
      success: true,
      staff: { id: rider.id, name: rider.name, phone: rider.phone },
      assignments: assignments.map((assignment) => ({
        ...assignment,
        hyperlocal_order: ordersMap.get(assignment.order_id) || null,
      })),
    });
  } catch (err) {
    console.error("assignments error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/update-location", async (req, res) => {
  try {
    const token = req.header("x-rider-token");
    if (!token) return res.status(401).json({ success: false, message: "Missing rider token" });

    const { assignment_id, lat, lng } = req.body;
    if (!assignment_id || lat == null || lng == null) {
      return res.status(400).json({ success: false, message: "Missing lat/lng or assignment_id" });
    }

    const { rider, assignment } = await getOwnedAssignment(token, assignment_id, ACTIVE_ASSIGNMENT_STATUSES);

    const { error } = await supabase
      .from("delivery_assignments")
      .update({
        rider_lat: lat,
        rider_lng: lng,
        location_updated_at: nowIso(),
      })
      .eq("id", assignment.id)
      .eq("delivery_boy_id", rider.id);

    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    console.error("update-location error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/picked", async (req, res) => {
  try {
    const token = req.header("x-rider-token");
    if (!token) return res.status(401).json({ success: false, message: "Missing rider token" });

    const { assignment_id } = req.body;
    if (!assignment_id) return res.status(400).json({ success: false, message: "assignment_id required" });

    const { rider, assignment } = await getOwnedAssignment(token, assignment_id, ["assigned", "picked", "picked_up", "out_for_delivery"]);
    if (assignment.status === "out_for_delivery") {
      return res.json({ success: true, assignment, already_processed: true });
    }

    const { data: updated, error } = await supabase
      .from("delivery_assignments")
      .update({
        status: "out_for_delivery",
        picked_at: nowIso(),
      })
      .eq("id", assignment.id)
      .eq("delivery_boy_id", rider.id)
      .select("*")
      .single();

    if (error) throw error;

    await supabase.from("hyperlocal_orders").update({ status: "out_for_delivery" }).eq("id", updated.order_id);
    await auditDeliveryStaffAction("picked_up_order", {
      vendor_id: rider.vendor_id,
      terminal_id: rider.terminal_id,
      delivery_boy_id: rider.id,
      assignment_id: updated.id,
      order_id: updated.order_id,
    });

    let dispatchNotification = null;
    try {
      dispatchNotification = await notifyCustomerOrderDispatched(updated.order_id, { source: "delivery_staff_picked" });
    } catch (notificationError) {
      dispatchNotification = { error: notificationError.message };
    }

    return res.json({ success: true, assignment: updated, dispatch_notification: dispatchNotification });
  } catch (err) {
    console.error("picked error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/cash-collected", async (req, res) => {
  try {
    const token = req.header("x-rider-token");
    if (!token) return res.status(401).json({ success: false, message: "Missing rider token" });

    const { assignment_id, amount_collected, payment_reference } = req.body;
    const amount = numericAmount(amount_collected);
    if (!assignment_id || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Enter the cash amount collected from customer" });
    }

    const { rider, assignment } = await getOwnedAssignment(token, assignment_id, ACTIVE_ASSIGNMENT_STATUSES);
    const timestamp = nowIso();

    const { data: updated, error } = await supabase
      .from("delivery_assignments")
      .update({
        cash_collected_amount: amount,
        cash_collected_at: timestamp,
        cash_handover_status: "pending_vendor_reconciliation",
        payment_collection_status: "cash_collected",
        metadata: {
          ...(assignment.metadata || {}),
          cash_collection_reference: payment_reference || null,
        },
      })
      .eq("id", assignment.id)
      .eq("delivery_boy_id", rider.id)
      .select("*")
      .single();

    if (error) throw error;

    await supabase.from("hyperlocal_orders").update({
      payment_method: "cash",
      payment_status: "payment_reported",
      settlement_status: "pending",
      payment_confirmed_by: "delivery_staff",
      payment_confirmed_at: timestamp,
    }).eq("id", assignment.order_id);

    await supabase.from("order_payment_transactions").insert({
      order_id: assignment.order_id,
      vendor_id: rider.vendor_id,
      payment_method: "cash",
      amount,
      payment_status: "pending",
      settlement_status: "pending",
      confirmed_by: "delivery_staff",
      payment_reference: payment_reference || null,
      metadata: {
        delivery_boy_id: rider.id,
        assignment_id: assignment.id,
        terminal_id: rider.terminal_id,
        amount_received: amount,
        outstanding_amount: 0,
        confirmation_status: "reported",
        note: "Cash reported by delivery staff; vendor must reconcile physical cash handover.",
      },
    });

    await auditDeliveryStaffAction("cash_collected_reported", {
      vendor_id: rider.vendor_id,
      terminal_id: rider.terminal_id,
      delivery_boy_id: rider.id,
      assignment_id: assignment.id,
      order_id: assignment.order_id,
      metadata: { amount_collected: amount },
    });

    return res.json({ success: true, assignment: updated });
  } catch (err) {
    console.error("cash-collected error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/request-credit", async (req, res) => {
  try {
    const token = req.header("x-rider-token");
    if (!token) return res.status(401).json({ success: false, message: "Missing rider token" });

    const { assignment_id, note } = req.body;
    if (!assignment_id) return res.status(400).json({ success: false, message: "assignment_id required" });

    const { rider, assignment } = await getOwnedAssignment(token, assignment_id, ACTIVE_ASSIGNMENT_STATUSES);
    const { data: updated, error } = await supabase
      .from("delivery_assignments")
      .update({
        payment_collection_status: "pending_vendor_review",
        staff_credit_request_note: note || null,
        staff_credit_request_at: nowIso(),
      })
      .eq("id", assignment.id)
      .eq("delivery_boy_id", rider.id)
      .select("*")
      .single();

    if (error) throw error;

    await auditDeliveryStaffAction("credit_approval_requested", {
      vendor_id: rider.vendor_id,
      terminal_id: rider.terminal_id,
      delivery_boy_id: rider.id,
      assignment_id: assignment.id,
      order_id: assignment.order_id,
      metadata: { note: note || null },
    });

    return res.json({ success: true, assignment: updated });
  } catch (err) {
    console.error("request-credit error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/delivered", async (req, res) => {
  try {
    const token = req.header("x-rider-token");
    if (!token) return res.status(401).json({ success: false, message: "Missing rider token" });

    const { assignment_id, idempotency_key } = req.body;
    if (!assignment_id) return res.status(400).json({ success: false, message: "assignment_id required" });

    const { rider, assignment } = await getOwnedAssignment(token, assignment_id, [...ACTIVE_ASSIGNMENT_STATUSES, "delivered"]);
    if (assignment.status === "delivered") {
      return res.json({ success: true, assignment, already_processed: true });
    }

    const completionKey = idempotency_key || randomUUID();
    const { data: updated, error } = await supabase
      .from("delivery_assignments")
      .update({
        status: "delivered",
        delivered_at: nowIso(),
        delivery_completed_by: rider.id,
        delivery_completion_key: completionKey,
      })
      .eq("id", assignment.id)
      .eq("delivery_boy_id", rider.id)
      .select("*")
      .single();

    if (error) throw error;

    await supabase.from("hyperlocal_orders").update({ status: "completed" }).eq("id", updated.order_id);
    await supabase.from("delivery_boys").update({ status: "available" }).eq("id", rider.id);
    await auditDeliveryStaffAction("order_delivered", {
      vendor_id: rider.vendor_id,
      terminal_id: rider.terminal_id,
      delivery_boy_id: rider.id,
      assignment_id: updated.id,
      order_id: updated.order_id,
      metadata: { idempotency_key: completionKey },
    });

    return res.json({ success: true, assignment: updated });
  } catch (err) {
    console.error("delivered error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/customer-tracking", async (req, res) => {
  try {
    const { order_id } = req.query;
    if (!order_id) return res.status(400).json({ success: false, message: "order_id required" });

    const { data: assignment, error } = await supabase
      .from("delivery_assignments")
      .select("id, order_id, status, rider_lat, rider_lng, location_updated_at, picked_at, delivered_at")
      .eq("order_id", order_id)
      .maybeSingle();

    if (error) throw error;

    const { data: order } = await supabase
      .from("hyperlocal_orders")
      .select("id, customer_id, delivery_lat, delivery_lng, delivery_address, shop_name, status, total_amount, price_quote_required, price_quote_status, vendor_price_quote, quoted_total_amount, payment_status, settlement_status")
      .eq("id", order_id)
      .single();

    return res.json({ success: true, assignment, order });
  } catch (err) {
    console.error("customer-tracking error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
