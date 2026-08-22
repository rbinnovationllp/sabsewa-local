import express from "express";
import { randomBytes } from "crypto";
import { supabase } from "../connection.js";

const router = express.Router();

function token() {
  return randomBytes(24).toString("hex");
}

async function auditDeliveryStaff(action, payload = {}) {
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

  if (error) console.error("delivery staff audit failed", { action, error });
}

router.get("/", async (req, res) => {
  try {
    const { vendor_id, terminal_id } = req.query;
    if (!vendor_id || !terminal_id) {
      return res.status(400).json({ success: false, message: "vendor_id and terminal_id are required" });
    }

    const { data: riders = [], error } = await supabase
      .from("delivery_boys")
      .select("*")
      .eq("vendor_id", vendor_id)
      .eq("terminal_id", terminal_id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const riderIds = riders.map((rider) => rider.id);
    let summaryMap = new Map();
    if (riderIds.length > 0) {
      const { data: assignments = [] } = await supabase
        .from("delivery_assignments")
        .select("delivery_boy_id, status, cash_collected_amount, cash_handover_status, delivered_at")
        .in("delivery_boy_id", riderIds);

      summaryMap = assignments.reduce((map, item) => {
        const current = map.get(item.delivery_boy_id) || {
          assigned: 0,
          delivered: 0,
          cash_pending: 0,
        };
        if (["assigned", "picked", "picked_up", "out_for_delivery"].includes(item.status)) current.assigned += 1;
        if (item.status === "delivered") current.delivered += 1;
        if (item.cash_handover_status === "pending_vendor_reconciliation") {
          current.cash_pending += Number(item.cash_collected_amount || 0);
        }
        map.set(item.delivery_boy_id, current);
        return map;
      }, new Map());
    }

    res.json({
      success: true,
      riders: riders.map((rider) => ({
        ...rider,
        summary: summaryMap.get(rider.id) || { assigned: 0, delivered: 0, cash_pending: 0 },
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { vendor_id, terminal_id, name, phone, compensation_rate_per_delivery, created_by } = req.body;
    if (!vendor_id || !terminal_id || !name || !phone) {
      return res.status(400).json({ success: false, message: "vendor_id, terminal_id, name and phone are required" });
    }

    const riderToken = token();
    const { data: staff, error } = await supabase
      .from("delivery_boys")
      .insert({
        vendor_id,
        terminal_id,
        name: String(name).trim(),
        phone: String(phone).trim(),
        rider_token: riderToken,
        access_token: riderToken,
        role: "DELIVERY_STAFF",
        status: "available",
        is_active: true,
        compensation_rate_per_delivery: Number(compensation_rate_per_delivery || 0),
      })
      .select("*")
      .single();

    if (error) throw error;

    await auditDeliveryStaff("delivery_staff_created", {
      vendor_id,
      terminal_id,
      delivery_boy_id: staff.id,
      metadata: { created_by: created_by || null, phone: staff.phone },
    });

    res.json({
      success: true,
      staff,
      rider_link: `https://sabsewa.in/rider?token=${staff.rider_token}`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/:id/disable", async (req, res) => {
  try {
    const { id } = req.params;
    const { vendor_id, terminal_id, reason } = req.body;
    if (!vendor_id || !terminal_id) {
      return res.status(400).json({ success: false, message: "vendor_id and terminal_id are required" });
    }

    const { data: staff, error: staffError } = await supabase
      .from("delivery_boys")
      .select("id, vendor_id, terminal_id")
      .eq("id", id)
      .eq("vendor_id", vendor_id)
      .eq("terminal_id", terminal_id)
      .maybeSingle();

    if (staffError) throw staffError;
    if (!staff) return res.status(404).json({ success: false, message: "Delivery staff not found" });

    const newToken = `disabled-${token()}`;
    const { error } = await supabase
      .from("delivery_boys")
      .update({
        status: "inactive",
        is_active: false,
        disabled_at: new Date().toISOString(),
        disabled_reason: reason || "Disabled by vendor",
        rider_token: newToken,
        access_token: newToken,
      })
      .eq("id", id)
      .eq("vendor_id", vendor_id)
      .eq("terminal_id", terminal_id);

    if (error) throw error;

    await supabase
      .from("delivery_assignments")
      .update({
        status: "reassigned",
        delivery_boy_id: null,
        metadata: { reason: "Delivery staff disabled; vendor must reassign." },
      })
      .eq("delivery_boy_id", id)
      .in("status", ["assigned", "picked", "picked_up", "out_for_delivery"]);

    await auditDeliveryStaff("delivery_staff_disabled", {
      vendor_id,
      terminal_id,
      delivery_boy_id: id,
      metadata: { reason: reason || null },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/:id/reconcile-cash", async (req, res) => {
  try {
    const { id } = req.params;
    const { vendor_id, terminal_id } = req.body;
    if (!vendor_id || !terminal_id) {
      return res.status(400).json({ success: false, message: "vendor_id and terminal_id are required" });
    }

    const reconciledAt = new Date().toISOString();
    const { data: assignments = [], error } = await supabase
      .from("delivery_assignments")
      .update({
        cash_handover_status: "reconciled",
        cash_handover_confirmed_at: reconciledAt,
      })
      .eq("delivery_boy_id", id)
      .eq("vendor_id", vendor_id)
      .eq("terminal_id", terminal_id)
      .eq("cash_handover_status", "pending_vendor_reconciliation")
      .select("id, order_id, cash_collected_amount");

    if (error) throw error;

    await auditDeliveryStaff("delivery_staff_cash_reconciled", {
      vendor_id,
      terminal_id,
      delivery_boy_id: id,
      metadata: {
        assignment_count: assignments.length,
        amount: assignments.reduce((sum, item) => sum + Number(item.cash_collected_amount || 0), 0),
      },
    });

    res.json({ success: true, reconciled_assignments: assignments.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
