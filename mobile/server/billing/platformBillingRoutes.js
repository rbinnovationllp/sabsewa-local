import express from "express";
import { supabase } from "../connection.js";
import { requireRole, requireUserJwt } from "../security/apiSecurity.js";
import {
  createPlatformBillingOrder,
  getInvoiceDocument,
  getVendorBillingDashboard,
  verifyPlatformBillingPayment,
} from "./platformBillingService.js";

const router = express.Router();
const requireAuth = requireUserJwt(supabase);
const requireAdmin = [requireAuth, requireRole(["admin", "company_admin", "super_admin", "finance"])];

router.get("/:vendor_id/dashboard", requireAuth, async (req, res) => {
  try {
    const dashboard = await getVendorBillingDashboard({
      vendorId: req.params.vendor_id,
      auth: req.auth,
    });
    return res.json({ success: true, dashboard });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/:vendor_id/platform-order", requireAuth, async (req, res) => {
  try {
    const result = await createPlatformBillingOrder({
      vendorId: req.params.vendor_id,
      auth: req.auth,
      chargeType: req.body?.charge_type,
      referenceId: req.body?.reference_id || null,
      billingCycle: req.body?.billing_cycle || "monthly",
      couponCode: req.body?.coupon_code || null,
    });
    return res.status(result.reused ? 200 : 201).json({ success: true, ...result });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/:vendor_id/verify-platform-payment", requireAuth, async (req, res) => {
  try {
    const result = await verifyPlatformBillingPayment({
      vendorId: req.params.vendor_id,
      auth: req.auth,
      razorpayOrderId: req.body?.razorpay_order_id,
      razorpayPaymentId: req.body?.razorpay_payment_id,
      razorpaySignature: req.body?.razorpay_signature,
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.get("/:vendor_id/invoices/:invoice_id", requireAuth, async (req, res) => {
  try {
    const invoice = await getInvoiceDocument({
      vendorId: req.params.vendor_id,
      invoiceId: req.params.invoice_id,
      auth: req.auth,
    });
    return res.json({ success: true, invoice });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.get("/:vendor_id/invoices/:invoice_id/receipt.txt", requireAuth, async (req, res) => {
  try {
    const invoice = await getInvoiceDocument({
      vendorId: req.params.vendor_id,
      invoiceId: req.params.invoice_id,
      auth: req.auth,
    });
    const lines = [
      invoice.legal_entity_name,
      invoice.brand_name,
      `Invoice/Receipt: ${invoice.invoice_number}`,
      `Issued: ${invoice.issued_at}`,
      `Vendor: ${invoice.vendor_name || ""}`,
      `Shop: ${invoice.shop_name || ""}`,
      `Charge: ${invoice.charge_type}`,
      `Base amount: ${(Number(invoice.base_amount_paise || 0) / 100).toFixed(2)} ${invoice.currency}`,
      `Discount: ${(Number(invoice.discount_amount_paise || 0) / 100).toFixed(2)} ${invoice.currency}`,
      `Tax: ${(Number(invoice.tax_amount_paise || 0) / 100).toFixed(2)} ${invoice.currency}`,
      `Total: ${(Number(invoice.total_amount_paise || 0) / 100).toFixed(2)} ${invoice.currency}`,
      `Razorpay payment: ${invoice.razorpay_payment_id || ""}`,
      `Status: ${invoice.payment_status}`,
      `Refundability: ${invoice.refundable_classification}`,
      invoice.gst_note,
      "Customer order payments are direct customer-to-vendor payments and are not collected by SabSewa Local.",
    ];
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoice_number}.txt"`);
    return res.send(lines.join("\n"));
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.get("/admin/overview", ...requireAdmin, async (_req, res) => {
  try {
    const [
      { data: attempts, error: attemptError },
      { data: invoices, error: invoiceError },
      { data: subscriptions, error: subscriptionError },
      { data: refunds, error: refundError },
      { data: webhookEvents, error: webhookError },
    ] = await Promise.all([
      supabase.from("vendor_payment_attempts").select("*").order("created_at", { ascending: false }).limit(250),
      supabase.from("vendor_invoices").select("*").order("issued_at", { ascending: false }).limit(250),
      supabase.from("vendor_subscriptions").select("*, plan:subscription_plans(*)").order("updated_at", { ascending: false }).limit(250),
      supabase.from("vendor_refunds").select("*").order("requested_at", { ascending: false }).limit(250),
      supabase.from("razorpay_webhook_events").select("*").order("created_at", { ascending: false }).limit(250),
    ]);
    if (attemptError) throw attemptError;
    if (invoiceError) throw invoiceError;
    if (subscriptionError) throw subscriptionError;
    if (refundError) throw refundError;
    if (webhookError) throw webhookError;
    return res.json({ success: true, attempts: attempts || [], invoices: invoices || [], subscriptions: subscriptions || [], refunds: refunds || [], webhook_events: webhookEvents || [] });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/admin/refunds", ...requireAdmin, async (req, res) => {
  try {
    const { payment_attempt_id, amount_paise, reason } = req.body || {};
    if (!payment_attempt_id || !amount_paise || !reason?.trim()) {
      return res.status(400).json({ success: false, error: "Payment attempt, refund amount and reason are required." });
    }
    const { data: attempt, error: attemptError } = await supabase
      .from("vendor_payment_attempts")
      .select("*")
      .eq("id", payment_attempt_id)
      .single();
    if (attemptError || !attempt) return res.status(404).json({ success: false, error: "Payment attempt not found." });
    if (attempt.payment_status !== "captured") return res.status(409).json({ success: false, error: "Only captured platform payments can be refunded." });
    if (Number(amount_paise) > Number(attempt.total_amount_paise || 0)) return res.status(400).json({ success: false, error: "Refund amount exceeds payment amount." });

    const { data, error } = await supabase
      .from("vendor_refunds")
      .insert({
        vendor_id: attempt.vendor_id,
        payment_attempt_id: attempt.id,
        razorpay_payment_id: attempt.razorpay_payment_id,
        amount_paise: Number(amount_paise),
        refund_status: "refund_pending",
        reason,
        approved_by: req.auth.user_id,
        metadata: { created_from: "admin_billing_portal" },
      })
      .select()
      .single();
    if (error) throw error;

    await supabase.from("billing_audit_logs").insert({
      actor_user_id: req.auth.user_id,
      actor_role: req.auth.role || "admin",
      vendor_id: attempt.vendor_id,
      entity_type: "vendor_refunds",
      entity_id: data.id,
      action: "platform_refund_requested",
      metadata: { payment_attempt_id, amount_paise: Number(amount_paise), reason },
    });

    return res.status(201).json({ success: true, refund: data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

export default router;
