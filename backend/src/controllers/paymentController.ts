import { Request, Response } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase Admin Client
const supabaseUrl: string = process.env.SUPABASE_URL || "";
const supabaseServiceKey: string = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize Razorpay Instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || ""
});

// Pricing Map with 18% GST calculation on base onboarding charges
const CATEGORY_PRICING: Record<
  string,
  { totalPaise: number; feeInRupees: number; depositInRupees: number }
> = {
  vegetables_fruits: {
    totalPaise: 559000,
    feeInRupees: 590,
    depositInRupees: 5000
  },
  kirana_general: {
    totalPaise: 618000,
    feeInRupees: 1180,
    depositInRupees: 5000
  },
  restaurant_pharmacy: {
    totalPaise: 836000,
    feeInRupees: 2360,
    depositInRupees: 5000
  }
};

/**
 * Endpoint 1: Create Razorpay Order for Vendor Onboarding or Top-up
 * POST /api/payments/create-order
 */
export async function createPaymentOrder(req: Request, res: Response): Promise<Response> {
  try {
    const { vendorId, paymentType, category, topUpAmount } = req.body;

    if (!vendorId) {
      return res.status(400).json({ ok: false, error: "vendorId is required." });
    }

    let amountInPaise = 0;
    const notes: Record<string, string> = {
      vendorId: String(vendorId),
      paymentType: String(paymentType)
    };

    if (paymentType === "ONBOARDING") {
      const config = CATEGORY_PRICING[category];
      if (!config) {
        return res.status(400).json({
          ok: false,
          error: "Invalid category. Options: vegetables_fruits, kirana_general, restaurant_pharmacy"
        });
      }
      amountInPaise = config.totalPaise;
      notes["category"] = String(category);
      notes["feeAmount"] = String(config.feeInRupees);
      notes["depositAmount"] = String(config.depositInRupees);
    } else if (paymentType === "WALLET_TOPUP") {
      const amount = Number(topUpAmount);
      if (!amount || amount < 5000) {
        return res.status(400).json({
          ok: false,
          error: "Minimum wallet top-up amount is ₹5,000."
        });
      }
      amountInPaise = Math.round(amount * 100);
      notes["topUpAmount"] = String(amount);
    } else {
      return res.status(400).json({
        ok: false,
        error: "Invalid paymentType. Must be ONBOARDING or WALLET_TOPUP."
      });
    }

    const receiptId = `rcpt_${String(vendorId).substring(0, 8)}_${Date.now()}`;
    const orderOptions = {
      amount: amountInPaise,
      currency: "INR",
      receipt: receiptId,
      notes: notes
    };

    const razorpayOrder = await razorpay.orders.create(orderOptions);

    await supabase.from("payments").insert({
      vendor_id: vendorId,
      razorpay_order_id: razorpayOrder.id,
      amount: amountInPaise / 100,
      currency: "INR",
      payment_type: paymentType,
      status: "PENDING",
      metadata: notes
    });

    return res.status(200).json({
      ok: true,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to initiate payment.";
    console.error("Error creating Razorpay order:", message);
    return res.status(500).json({ ok: false, error: message });
  }
}

/**
 * Endpoint 2: Verify Frontend Payment Signature
 * POST /api/payments/verify
 */
export async function verifyPaymentSignature(req: Request, res: Response): Promise<Response> {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const secret = process.env.RAZORPAY_KEY_SECRET || "";

    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        ok: false,
        error: "Payment verification failed: Signature mismatch."
      });
    }

    return res.status(200).json({ ok: true, message: "Payment verified successfully." });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error verifying payment signature.";
    console.error("Signature verification error:", message);
    return res.status(500).json({ ok: false, error: message });
  }
}

/**
 * Endpoint 3: Razorpay Webhook Handler
 * POST /api/payments/razorpay/webhook
 */
export async function handleRazorpayWebhook(req: Request, res: Response): Promise<Response> {
  try {
    const signature = req.headers["x-razorpay-signature"] as string;
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
    const rawPayload = (req as unknown as { rawBody?: string }).rawBody || JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawPayload)
      .digest("hex");

    const isAuthentic = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(signature || "", "utf8")
    );

    if (!isAuthentic) {
      console.error("Razorpay webhook signature mismatch");
      return res.status(400).json({ error: "Invalid signature" });
    }

    const { event, payload } = req.body;

    if (event === "payment.captured" || event === "order.paid") {
      const paymentEntity = payload.payment?.entity;
      const orderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;
      const notes = paymentEntity?.notes || {};
      const vendorId = notes.vendorId;
      const paymentType = notes.paymentType;

      if (!vendorId) {
        return res.status(200).json({ status: "skipped", reason: "No vendorId in notes" });
      }

      const { data: existingPayment } = await supabase
        .from("payments")
        .select("status")
        .eq("razorpay_payment_id", paymentId)
        .single();

      if (existingPayment && existingPayment.status === "COMPLETED") {
        return res.status(200).json({ status: "already_processed" });
      }

      if (paymentType === "ONBOARDING") {
        const feeAmount = Number(notes.feeAmount || 0);
        const depositAmount = Number(notes.depositAmount || 5000);

        await supabase.from("company_earnings_ledger").insert({
          vendor_id: vendorId,
          payment_id: paymentId,
          amount: feeAmount,
          fee_type: "ONBOARDING_REGISTRATION_FEE",
          gst_rate: 0.18,
          created_at: new Date().toISOString()
        });

        await supabase.rpc("credit_vendor_wallet", {
          p_vendor_id: vendorId,
          p_amount: depositAmount,
          p_tx_type: "ONBOARDING_DEPOSIT",
          p_payment_id: paymentId
        });
      } else if (paymentType === "WALLET_TOPUP") {
        const topUpAmount = Number(notes.topUpAmount);

        await supabase.rpc("credit_vendor_wallet", {
          p_vendor_id: vendorId,
          p_amount: topUpAmount,
          p_tx_type: "WALLET_TOPUP",
          p_payment_id: paymentId
        });
      }

      await supabase
        .from("payments")
        .update({
          razorpay_payment_id: paymentId,
          status: "COMPLETED",
          updated_at: new Date().toISOString()
        })
        .eq("razorpay_order_id", orderId);
    }

    return res.status(200).json({ status: "ok" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    console.error("Webhook processing error:", message);
    return res.status(500).json({ error: message });
  }
}