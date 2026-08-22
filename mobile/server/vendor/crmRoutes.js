import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function rangeStart(range) {
  const now = new Date();
  const start = startOfDay(now);
  if (range === "week") start.setDate(start.getDate() - 6);
  if (range === "month") start.setDate(1);
  if (range === "all") return null;
  return start.toISOString();
}

function amount(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptySummary() {
  return {
    orders_received: 0,
    orders_accepted: 0,
    orders_delivered: 0,
    orders_pending: 0,
    gross_order_value: 0,
    completed_order_value: 0,
    cash_received: 0,
    upi_received: 0,
    credit_given: 0,
    credit_recovered: 0,
    partial_payments: 0,
    outstanding_credit: 0,
    credit_customers_due: 0,
    deliveries_pending: 0,
    deliveries_completed: 0,
    delivery_staff_active: 0,
    cash_pending_handover: 0,
  };
}

function summarizeOrders(orders = []) {
  return orders.reduce((summary, order) => {
    const total = amount(order.quoted_total_amount || order.total_amount);
    summary.orders_received += 1;
    if (["accepted", "packed", "out_for_delivery", "completed"].includes(order.status)) summary.orders_accepted += 1;
    if (order.status === "completed") {
      summary.orders_delivered += 1;
      summary.completed_order_value += total;
    }
    if (["pending", "accepted", "packed", "out_for_delivery"].includes(order.status)) summary.orders_pending += 1;
    summary.gross_order_value += total;
    return summary;
  }, emptySummary());
}

function mergeInto(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "number") target[key] = amount(target[key]) + value;
  }
}

async function buildSummary(vendorId, range) {
  const since = rangeStart(range);
  let orderQuery = supabase
    .from("hyperlocal_orders")
    .select("id, status, total_amount, quoted_total_amount, payment_method, payment_status, settlement_status, created_at")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .limit(range === "all" ? 1000 : 500);
  if (since) orderQuery = orderQuery.gte("created_at", since);

  const { data: orders = [], error: orderError } = await orderQuery;
  if (orderError) throw orderError;

  const summary = summarizeOrders(orders);

  let txQuery = supabase
    .from("order_payment_transactions")
    .select("payment_method, amount, settlement_status, payment_status, created_at")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .limit(range === "all" ? 1000 : 500);
  if (since) txQuery = txQuery.gte("created_at", since);

  const { data: paymentTransactions = [], error: txError } = await txQuery;
  if (!txError) {
    for (const tx of paymentTransactions) {
      const txAmount = amount(tx.amount);
      if (tx.payment_method === "cash") summary.cash_received += txAmount;
      if (tx.payment_method === "vendor_qr" || tx.payment_method === "bank_transfer" || tx.payment_method === "other_digital") {
        summary.upi_received += txAmount;
      }
      if (tx.settlement_status === "partial") summary.partial_payments += txAmount;
    }
  }

  let creditTxQuery = supabase
    .from("vendor_credit_transactions")
    .select("transaction_type, amount, created_at")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .limit(range === "all" ? 1000 : 500);
  if (since) creditTxQuery = creditTxQuery.gte("created_at", since);

  const { data: creditTransactions = [], error: creditTxError } = await creditTxQuery;
  if (!creditTxError) {
    for (const tx of creditTransactions) {
      if (tx.transaction_type === "credit_purchase") summary.credit_given += amount(tx.amount);
      if (tx.transaction_type === "payment_recorded") summary.credit_recovered += amount(tx.amount);
    }
  }

  const { data: creditAccounts = [], error: accountError } = await supabase
    .from("vendor_credit_accounts")
    .select("customer_id, outstanding_balance, status, due_date, archived_at")
    .eq("vendor_id", vendorId)
    .is("archived_at", null);
  if (!accountError) {
    summary.outstanding_credit = creditAccounts.reduce((sum, account) => sum + amount(account.outstanding_balance), 0);
    summary.credit_customers_due = creditAccounts.filter((account) => amount(account.outstanding_balance) > 0).length;
  }

  const { data: deliveries = [], error: deliveryError } = await supabase
    .from("delivery_assignments")
    .select("status, cash_collected_amount, cash_handover_status, delivered_at, assigned_at")
    .eq("vendor_id", vendorId)
    .limit(1000);
  if (!deliveryError) {
    for (const item of deliveries) {
      const ts = item.delivered_at || item.assigned_at;
      if (since && ts && new Date(ts) < new Date(since)) continue;
      if (["assigned", "picked", "picked_up", "out_for_delivery", "reassigned"].includes(item.status)) summary.deliveries_pending += 1;
      if (item.status === "delivered") summary.deliveries_completed += 1;
      if (item.cash_handover_status === "pending_vendor_reconciliation") {
        summary.cash_pending_handover += amount(item.cash_collected_amount);
      }
    }
  }

  const { data: staff = [], error: staffError } = await supabase
    .from("delivery_boys")
    .select("id")
    .eq("vendor_id", vendorId)
    .eq("is_active", true);
  if (!staffError) summary.delivery_staff_active = staff.length;

  return summary;
}

router.get("/:vendor_id/summary", async (req, res) => {
  try {
    const vendorId = req.params.vendor_id;
    const ranges = ["today", "week", "month", "all"];
    const payload = {};
    for (const range of ranges) {
      payload[range] = await buildSummary(vendorId, range);
    }

    const today = payload.today || emptySummary();
    const attention = [
      { key: "orders_pending", label: "Orders need attention", value: today.orders_pending },
      { key: "deliveries_pending", label: "Deliveries pending", value: today.deliveries_pending },
      { key: "cash_pending_handover", label: "Cash with delivery staff", value: today.cash_pending_handover },
      { key: "credit_customers_due", label: "Customers with dues", value: payload.all?.credit_customers_due || 0 },
    ].filter((item) => Number(item.value || 0) > 0);

    return res.json({ success: true, ranges: payload, attention });
  } catch (error) {
    console.error("vendor crm summary failed:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
