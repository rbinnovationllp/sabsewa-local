import crypto from "crypto";
import express from "express";
import { supabase } from "../connection.js";
import {
  ACTIVATION_USAGE_CHARGE,
  INITIAL_VENDOR_PAYMENT,
  SECURITY_DEPOSIT_MINIMUM,
  STANDARD_WALLET_TOPUP,
  applyInitialActivationPayment,
  applyWalletCredit,
  recordTestPaymentAttempt,
  verifyRazorpaySignature,
} from "../securityWallet/securityWalletService.js";
import { getPaymentReadiness } from "./paymentEnvironment.js";
import { processCapturedPlatformBillingWebhookPayment } from "../billing/platformBillingService.js";
import { requireUserJwt } from "../security/apiSecurity.js";
import { deriveRazorpayWebhookEventId, verifyRazorpayWebhookSignature } from "./razorpayWebhookSecurity.js";

const router = express.Router();
const requireAuth = requireUserJwt(supabase);

/**
 * Helper to verify Razorpay Webhook Signatures
 */
function verifyWebhookSignature(rawBody, signature) {
  return verifyRazorpayWebhookSignature(rawBody, signature, process.env.RAZORPAY_WEBHOOK_SECRET || "");
}

/**
 * Resolves internal vendor_id from Razorpay payment notes
 */
async function resolveVendorId(payment) {
  const internalVendorId = payment?.notes?.internal_vendor_id;
  if (internalVendorId) return internalVendorId;

  const publicVendorId = payment?.notes?.vendor_id;
  if (!publicVendorId) return null;

  const { data, error } = await supabase
    .from("vendors")
    .select("id")
    .eq("public_vendor_id", publicVendorId)
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}

/**
 * Audit log helper for webhook events
 */
async function recordWebhookEvent({ eventId, eventType, mode, payment, rawPayload }) {
  const payloadHash = crypto.createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex");
  const { data, error } = await supabase
    .from("razorpay_webhook_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      environment: mode,
      razorpay_payment_id: payment?.id || null,
      razorpay_order_id: payment?.order_id || null,
      processing_status: "received",
      payload_hash: payloadHash,
      raw_payload: rawPayload,
    })
    .select()
    .single();

  if (error?.code === "23505") {
    return { duplicate: true };
  }
  if (error) throw error;
  return { duplicate: false, eventRecord: data };
}

async function markWebhookEvent(eventId, fields) {
  await supabase
    .from("razorpay_webhook_events")
    .update({
      ...fields,
      processed_at: new Date().toISOString(),
    })
    .eq("event_id", eventId);
}

/**
 * @route POST /api/payments/verify-vendor-invoice
 * @desc Manual verification endpoint called from frontend upon payment completion
 */
router.post("/verify-vendor-invoice", requireAuth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, invoice_id } = req.body;

    const isValid = verifyRazorpaySignature({
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature
    });

    if (!isValid) {
      return res.status(400).json({ success: false, error: "Invalid payment signature." });
    }

    const { data: existingInvoice, error: lookupError } = await supabase
      .from("vendor_invoices")
      .select("id, vendor_id, payment_status, razorpay_order_id, razorpay_payment_id")
      .eq("id", invoice_id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existingInvoice) return res.status(404).json({ success: false, error: "Invoice not found." });

    const { data: ownedVendor, error: vendorError } = await supabase
      .from("vendors")
      .select("id")
      .eq("id", existingInvoice.vendor_id)
      .eq("owner_user_id", req.auth.user_id)
      .maybeSingle();
    if (vendorError) throw vendorError;
    if (!ownedVendor) return res.status(403).json({ success: false, error: "You are not authorized to verify this invoice." });
    if (existingInvoice.razorpay_order_id && existingInvoice.razorpay_order_id !== razorpay_order_id) {
      return res.status(409).json({ success: false, error: "Payment does not belong to this invoice." });
    }
    if (existingInvoice.payment_status === "paid") {
      const samePayment = existingInvoice.razorpay_order_id === razorpay_order_id
        && existingInvoice.razorpay_payment_id === razorpay_payment_id;
      return samePayment
        ? res.json({ success: true, duplicate: true, message: "Payment was already verified.", invoice: existingInvoice })
        : res.status(409).json({ success: false, error: "Invoice was already paid using a different payment." });
    }

    const { data: invoice, error: invErr } = await supabase
      .from("vendor_invoices")
      .update({
        payment_status: "paid",
        razorpay_order_id,
        razorpay_payment_id
      })
      .eq("id", invoice_id)
      .eq("vendor_id", existingInvoice.vendor_id)
      .neq("payment_status", "paid")
      .select()
      .single();

    if (invErr) throw invErr;

    // 2. Mark corresponding ledger entries as billed
    await supabase
      .from("vendor_platform_fee_ledger")
      .update({ settlement_status: "billed" })
      .eq("invoice_id", invoice_id)
      .eq("vendor_id", existingInvoice.vendor_id);

    return res.json({ success: true, message: "Payment verified successfully.", invoice });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route POST /api/payments/razorpay/webhook
 * @desc Razorpay Webhook Endpoint
 */
router.post("/razorpay/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const paymentReadiness = getPaymentReadiness();

  try {
    if (!verifyWebhookSignature(req.body, signature)) {
      return res.status(400).json({ success: false, error: "Invalid Razorpay webhook signature." });
    }

    const body = JSON.parse(req.body.toString("utf8"));
    const eventId = deriveRazorpayWebhookEventId(body, req.body);
    const eventType = body.event;
    const payment = body.payload?.payment?.entity;

    const recorded = await recordWebhookEvent({
      eventId,
      eventType,
      mode: paymentReadiness.mode,
      payment,
      rawPayload: body,
    });

    if (recorded.duplicate) {
      return res.json({ success: true, duplicate: true, status: "duplicate_ignored" });
    }

    if (!payment && !["refund.processed", "refund.failed", "settlement.processed", "settlement.failed"].includes(eventType)) {
      await markWebhookEvent(eventId, {
        processing_status: "ignored",
        processed_result: { reason: "No payment entity present." },
      });
      return res.json({ success: true, status: "ignored" });
    }

    if (eventType === "payment.failed" && payment) {
      await supabase
        .from("vendor_payment_attempts")
        .update({
          payment_status: "failed",
          razorpay_payment_id: payment.id,
          failure_reason: payment.error_description || payment.error_reason || "Razorpay payment failed.",
          updated_at: new Date().toISOString(),
        })
        .eq("razorpay_order_id", payment.order_id);
      await markWebhookEvent(eventId, {
        processing_status: "processed",
        processed_result: { payment_failed_recorded: true },
      });
      return res.json({ success: true, status: "processed" });
    }

    if (eventType !== "payment.captured" || !payment) {
      await markWebhookEvent(eventId, {
        processing_status: "recorded",
        processed_result: { reason: "Event recorded for audit; no immediate local state change required." },
      });
      return res.json({ success: true, status: "recorded" });
    }

    const platformResult = await processCapturedPlatformBillingWebhookPayment({ payment });
    if (platformResult.matched) {
      await markWebhookEvent(eventId, {
        vendor_id: platformResult.attempt?.vendor_id || null,
        processing_status: platformResult.failed ? "failed" : platformResult.test_mode ? "test_recorded" : "processed",
        processing_error: platformResult.failed ? platformResult.reason : null,
        processed_result: platformResult,
      });
      return res.json({ success: true, status: platformResult.failed ? "failed" : "processed", platform_billing: true });
    }

    const vendorId = await resolveVendorId(payment);
    if (!vendorId) {
      await markWebhookEvent(eventId, {
        processing_status: "failed",
        processing_error: "Vendor ID missing from Razorpay payment notes.",
      });
      return res.status(400).json({ success: false, error: "Vendor ID missing from Razorpay payment notes." });
    }

    const purpose = payment.notes?.purpose || payment.notes?.payment_purpose || "vendor_wallet_topup";
    const amount = Number(payment.amount || 0) / 100;

    if (!paymentReadiness.live_payments_enabled) {
      await recordTestPaymentAttempt({
        vendorId,
        razorpayOrderId: payment.order_id,
        razorpayPaymentId: payment.id,
        purpose,
        amount,
        payment,
        paymentReadiness,
      });
      await markWebhookEvent(eventId, {
        vendor_id: vendorId,
        processing_status: "test_recorded",
        processed_result: {
          wallet_credit_applied: false,
          vendor_activation_applied: false,
          message: paymentReadiness.payment_message,
        },
      });
      return res.json({ success: true, status: "test_recorded", wallet_credited: false });
    }

    if (purpose === "vendor_initial_activation") {
      if (amount !== INITIAL_VENDOR_PAYMENT) {
        await markWebhookEvent(eventId, {
          vendor_id: vendorId,
          processing_status: "failed",
          processing_error: "Initial activation payment amount mismatch.",
        });
        return res.status(400).json({ success: false, error: "Initial activation payment amount mismatch." });
      }

      const wallet = await applyInitialActivationPayment({
        vendorId,
        razorpayOrderId: payment.order_id,
        razorpayPaymentId: payment.id,
        razorpaySignature: String(signature),
        payment,
      });

      await markWebhookEvent(eventId, {
        vendor_id: vendorId,
        processing_status: "processed",
        processed_result: {
          wallet_id: wallet?.id || null,
          initial_payment: INITIAL_VENDOR_PAYMENT,
          activation_service_charge: ACTIVATION_USAGE_CHARGE,
          refundable_wallet_credit: SECURITY_DEPOSIT_MINIMUM,
        },
      });
      return res.json({ success: true, status: "processed", wallet_credited: true });
    }

    if (amount !== STANDARD_WALLET_TOPUP) {
      await markWebhookEvent(eventId, {
        vendor_id: vendorId,
        processing_status: "failed",
        processing_error: "Standard top-up amount mismatch.",
      });
      return res.status(400).json({ success: false, error: "Standard wallet top-up must be Rs 5,000." });
    }

    const wallet = await applyWalletCredit({
      vendorId,
      amount,
      transactionType: "top_up",
      paymentReference: payment.id,
      razorpayOrderId: payment.order_id,
      razorpayPaymentId: payment.id,
      razorpaySignature: String(signature),
      metadata: {
        gateway: "razorpay",
        environment: paymentReadiness.mode,
        method: payment.method,
        bank: payment.bank,
        card_id: payment.card_id,
        vpa: payment.vpa,
        status: payment.status,
        payment_purpose: "vendor_wallet_topup",
        credited_by: "verified_razorpay_webhook",
        is_refundable: true,
      },
    });

    await markWebhookEvent(eventId, {
      vendor_id: vendorId,
      processing_status: "processed",
      processed_result: {
        wallet_id: wallet?.id || null,
        refundable_wallet_credit: STANDARD_WALLET_TOPUP,
      },
    });
    return res.json({ success: true, status: "processed", wallet_credited: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
