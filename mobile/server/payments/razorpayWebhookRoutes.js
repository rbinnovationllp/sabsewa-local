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
} from "../securityWallet/securityWalletService.js";
import { getPaymentReadiness } from "./paymentEnvironment.js";

const router = express.Router();

function verifyWebhookSignature(rawBody, signature) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  if (!webhookSecret || !signature) return false;

  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const received = String(signature);
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

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

async function recordWebhookEvent({ eventId, eventType, mode, payment, rawPayload }) {
  const { data, error } = await supabase
    .from("razorpay_webhook_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      environment: mode,
      razorpay_payment_id: payment?.id || null,
      razorpay_order_id: payment?.order_id || null,
      processing_status: "received",
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

router.post("/razorpay/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const paymentReadiness = getPaymentReadiness();

  try {
    if (!verifyWebhookSignature(req.body, signature)) {
      return res.status(400).json({ success: false, error: "Invalid Razorpay webhook signature." });
    }

    const body = JSON.parse(req.body.toString("utf8"));
    const eventId = body.id || `${body.event}_${Date.now()}`;
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

    if (eventType !== "payment.captured" || !payment) {
      await markWebhookEvent(eventId, {
        processing_status: "ignored",
        processed_result: { reason: "Only payment.captured events affect wallet ledger." },
      });
      return res.json({ success: true, status: "ignored" });
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
        return res.status(400).json({ success: false, error: "Initial activation payment must be Rs 5,500." });
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
