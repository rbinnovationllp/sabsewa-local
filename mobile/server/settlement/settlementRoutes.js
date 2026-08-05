import crypto from "crypto";
import express from "express";
import { supabase } from "../connection.js";
import { recordCreditPayment, recordCreditPurchase, upsertCreditAccount } from "../credit/vendorCreditService.js";
import { writeOrderAuditLog } from "../audit/orderAudit.js";

const router = express.Router();
const PAID_METHODS = new Set(["cash", "vendor_qr", "bank_transfer", "other_digital"]);
const PROFILE_METHODS = new Set(["cash", "vendor_qr", "bank_transfer", "other_digital"]);

function receiptNumber(orderId) {
  return `SSL-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(orderId).slice(0, 8).toUpperCase()}`;
}

function maskLast4(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? digits.slice(-4) : null;
}

function encryptionKey() {
  const raw = process.env.PAYMENT_FIELD_ENCRYPTION_KEY;
  if (!raw) return null;
  return crypto.createHash("sha256").update(raw).digest();
}

function encryptField(value) {
  if (!value) return null;
  const key = encryptionKey();
  if (!key) {
    const error = new Error("PAYMENT_FIELD_ENCRYPTION_KEY is required before saving bank account details.");
    error.statusCode = 500;
    throw error;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function normalizeMethods(methods) {
  const next = Array.isArray(methods) ? methods.filter((method) => PROFILE_METHODS.has(method)) : [];
  return next.length ? Array.from(new Set(next)) : ["cash", "vendor_qr"];
}

async function getPrimaryQr(vendorId) {
  const { data, error } = await supabase
    .from("vendor_qr_codes")
    .select("*")
    .eq("vendor_id", vendorId)
    .eq("status", "active")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}


router.get("/customer/:customer_id/credit", async (req, res) => {
  try {
    const customerId = req.params.customer_id;
    const { data: accounts, error: accountError } = await supabase
      .from("vendor_credit_accounts")
      .select("*")
      .eq("customer_id", customerId)
      .gt("outstanding_balance", 0)
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    if (accountError) throw accountError;

    const vendorIds = Array.from(new Set((accounts || []).map((account) => account.vendor_id)));
    const [{ data: vendors, error: vendorError }, { data: qrCodes, error: qrError }, { data: requests, error: requestError }] = await Promise.all([
      vendorIds.length ? supabase.from("vendors").select("id, shop_name, vendor_name, public_vendor_id").in("id", vendorIds) : { data: [], error: null },
      vendorIds.length ? supabase.from("vendor_qr_codes").select("*").in("vendor_id", vendorIds).eq("status", "active").order("is_primary", { ascending: false }) : { data: [], error: null },
      supabase.from("vendor_credit_repayment_requests").select("*").eq("customer_id", customerId).order("submitted_at", { ascending: false }).limit(100),
    ]);
    if (vendorError) throw vendorError;
    if (qrError) throw qrError;
    if (requestError) throw requestError;

    const vendorById = new Map((vendors || []).map((vendor) => [vendor.id, vendor]));
    const qrByVendor = new Map();
    for (const qr of qrCodes || []) if (!qrByVendor.has(qr.vendor_id)) qrByVendor.set(qr.vendor_id, qr);

    return res.json({
      success: true,
      accounts: (accounts || []).map((account) => ({
        ...account,
        vendor: vendorById.get(account.vendor_id) || null,
        qr_code: qrByVendor.get(account.vendor_id) || null,
      })),
      repayment_requests: requests || [],
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/customer/:customer_id/credit/:account_id/repayment", async (req, res) => {
  try {
    const { amount, payment_reference, customer_note, order_id, payment_method = "vendor_qr" } = req.body;
    const paidAmount = Number(amount);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      return res.status(400).json({ success: false, error: "Repayment amount is required." });
    }

    const { data: account, error: accountError } = await supabase
      .from("vendor_credit_accounts")
      .select("*")
      .eq("id", req.params.account_id)
      .eq("customer_id", req.params.customer_id)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) return res.status(404).json({ success: false, error: "Credit account not found." });
    if (Number(account.outstanding_balance || 0) <= 0) return res.status(409).json({ success: false, error: "This credit balance is already settled." });

    const { data, error } = await supabase
      .from("vendor_credit_repayment_requests")
      .insert({
        vendor_id: account.vendor_id,
        customer_id: req.params.customer_id,
        account_id: account.id,
        order_id: order_id || null,
        amount: paidAmount,
        payment_method,
        payment_reference: payment_reference || null,
        customer_note: customer_note || null,
        metadata: { customer_marked_paid: true, vendor_verification_required: true },
      })
      .select()
      .single();
    if (error) throw error;

    await supabase.from("vendor_credit_reminders").insert({
      vendor_id: account.vendor_id,
      customer_id: req.params.customer_id,
      account_id: account.id,
      reminder_type: "due_soon",
      outstanding_balance: Number(account.outstanding_balance || 0),
      credit_limit: Number(account.credit_limit || 0),
      due_date: account.due_date || null,
      channel: "in_app",
      status: "queued",
      message: `Customer submitted a credit repayment reference for Rs ${paidAmount}. Please verify receipt.`,
    });

    return res.json({ success: true, repayment_request: data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/vendor/:vendor_id/repayments/:request_id/verify", async (req, res) => {
  try {
    const { approved = true, vendor_user_id, vendor_note } = req.body;
    const { data: request, error: requestError } = await supabase
      .from("vendor_credit_repayment_requests")
      .select("*")
      .eq("id", req.params.request_id)
      .eq("vendor_id", req.params.vendor_id)
      .single();
    if (requestError || !request) return res.status(404).json({ success: false, error: "Repayment request not found." });
    if (request.status !== "submitted") return res.status(409).json({ success: false, error: "This repayment request has already been reviewed." });

    const now = new Date().toISOString();
    const nextStatus = approved ? "vendor_confirmed" : "rejected";
    const { data: updatedRequest, error: updateError } = await supabase
      .from("vendor_credit_repayment_requests")
      .update({ status: nextStatus, verified_by: vendor_user_id || null, verified_at: now, vendor_note: vendor_note || null })
      .eq("id", request.id)
      .select()
      .single();
    if (updateError) throw updateError;

    let account = null;
    if (approved) {
      account = await recordCreditPayment({
        vendorId: req.params.vendor_id,
        customerId: request.customer_id,
        amount: Number(request.amount || 0),
        vendorUserId: vendor_user_id || null,
        notes: vendor_note || `Vendor confirmed customer QR repayment reference ${request.payment_reference || request.id}.`,
      });
    }

    return res.json({ success: true, repayment_request: updatedRequest, account });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});
router.get("/vendor/:vendor_id/payment-profile", async (req, res) => {
  try {
    const vendorId = req.params.vendor_id;
    const [{ data: profile, error: profileError }, { data: qrCodes, error: qrError }, { data: plans, error: plansError }] = await Promise.all([
      supabase.from("vendor_payment_profiles").select("*").eq("vendor_id", vendorId).maybeSingle(),
      supabase.from("vendor_qr_codes").select("*").eq("vendor_id", vendorId).neq("status", "deleted").order("created_at", { ascending: false }),
      supabase.from("vendor_storage_plans").select("*").eq("is_active", true).order("sort_order"),
    ]);

    if (profileError) throw profileError;
    if (qrError) throw qrError;
    if (plansError) throw plansError;

    return res.json({ success: true, profile: profile || null, qr_codes: qrCodes || [], storage_plans: plans || [] });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/vendor/:vendor_id/payment-profile", async (req, res) => {
  try {
    const vendorId = req.params.vendor_id;
    const { upi_id, preferred_methods, bank_account_number, bank_ifsc, bank_account_holder, other_payment_instructions, actor_user_id } = req.body;
    const methods = normalizeMethods(preferred_methods);

    if (methods.includes("vendor_qr") && !upi_id?.trim()) {
      return res.status(400).json({ success: false, error: "UPI ID is required when UPI QR is enabled." });
    }

    const payload = {
      vendor_id: vendorId,
      upi_id: upi_id?.trim() || null,
      preferred_methods: methods,
      bank_account_holder: bank_account_holder?.trim() || null,
      other_payment_instructions: other_payment_instructions?.trim() || null,
      updated_by: actor_user_id || null,
      updated_at: new Date().toISOString(),
    };

    if (bank_account_number || bank_ifsc) {
      payload.bank_account_last4 = maskLast4(bank_account_number);
      payload.bank_account_encrypted = encryptField(bank_account_number);
      payload.bank_ifsc_encrypted = encryptField(bank_ifsc);
    }

    const { data, error } = await supabase
      .from("vendor_payment_profiles")
      .upsert(payload, { onConflict: "vendor_id" })
      .select()
      .single();
    if (error) throw error;

    return res.json({ success: true, profile: data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.get("/orders/:order_id/payment-context", async (req, res) => {
  try {
    const { data: order, error: orderError } = await supabase
      .from("hyperlocal_orders")
      .select("*")
      .eq("id", req.params.order_id)
      .single();
    if (orderError || !order) return res.status(404).json({ success: false, error: "Order not found." });

    const [{ data: vendor, error: vendorError }, { data: profile, error: profileError }, qr] = await Promise.all([
      supabase.from("vendors").select("id, shop_name, vendor_name, public_vendor_id").eq("id", order.vendor_id).single(),
      supabase.from("vendor_payment_profiles").select("*").eq("vendor_id", order.vendor_id).maybeSingle(),
      getPrimaryQr(order.vendor_id),
    ]);
    if (vendorError) throw vendorError;
    if (profileError) throw profileError;

    return res.json({
      success: true,
      order: {
        id: order.id,
        order_number: order.receipt_number || String(order.id).slice(0, 8).toUpperCase(),
        total_amount: Number(order.quoted_total_amount || order.total_amount || 0),
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        settlement_status: order.settlement_status,
      },
      vendor,
      payment_profile: profile || { preferred_methods: ["cash", "vendor_qr"] },
      qr_code: qr,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/orders/:order_id/settle", async (req, res) => {
  try {
    const orderId = req.params.order_id;
    const { payment_method, payment_reference, confirmed_by, credit_notes, due_date, actor_user_id } = req.body;
    const method = String(payment_method || "");
    if (!PAID_METHODS.has(method) && method !== "credit") {
      return res.status(400).json({ success: false, error: "Select cash, vendor QR, bank transfer, other digital payment or credit." });
    }

    const { data: order, error: orderError } = await supabase
      .from("hyperlocal_orders")
      .select("*")
      .eq("id", orderId)
      .single();
    if (orderError || !order) return res.status(404).json({ success: false, error: "Order not found." });
    if (!["accepted", "packed", "out_for_delivery", "completed"].includes(order.status)) {
      return res.status(409).json({ success: false, error: "Only accepted or delivery-stage orders can be settled." });
    }

    const amount = Number(order.quoted_total_amount || order.total_amount || 0);
    const now = new Date().toISOString();

    if (method === "credit") {
      await upsertCreditAccount({
        vendorId: order.vendor_id,
        customerId: order.customer_id,
        creditLimit: Math.max(amount, amount + 1),
        paymentDueDays: due_date ? 0 : 7,
        vendorUserId: actor_user_id || null,
        notes: credit_notes || "Credit order created during delivery settlement.",
        customerName: order.customer_name || null,
        customerMobile: order.customer_phone || null,
        customerAddress: order.customer_address || order.delivery_address || null,
        creditNotes: credit_notes || null,
      });
      await recordCreditPurchase({
        vendorId: order.vendor_id,
        customerId: order.customer_id,
        orderId: order.id,
        amount,
        vendorUserId: actor_user_id || null,
      });

      const { data: updated, error: updateError } = await supabase
        .from("hyperlocal_orders")
        .update({
          payment_method: "credit",
          payment_status: "pending_payment",
          settlement_status: "credit_pending",
          customer_delivery_snapshot: {
            customer_name: order.customer_name || null,
            customer_phone: order.customer_phone || null,
            customer_address: order.customer_address || order.delivery_address || null,
            credit_date: now.slice(0, 10),
            due_date: due_date || null,
            credit_notes: credit_notes || null,
          },
          updated_at: now,
        })
        .eq("id", order.id)
        .select()
        .single();
      if (updateError) throw updateError;
      return res.json({ success: true, order: updated, settlement_status: "credit_pending" });
    }

    const receipt = order.receipt_number || receiptNumber(order.id);
    await supabase.from("order_payment_transactions").insert({
      order_id: order.id,
      vendor_id: order.vendor_id,
      payment_method: method,
      amount,
      payment_status: "confirmed",
      settlement_status: "complete",
      payment_reference: payment_reference || null,
      confirmed_by: confirmed_by || null,
      metadata: { direct_to_vendor: true, platform_collected_funds: false },
    });

    await supabase.from("order_settlement_records").upsert({
      order_id: order.id,
      vendor_id: order.vendor_id,
      order_date: order.created_at,
      total_amount: amount,
      payment_method: method,
      settlement_status: "complete",
      receipt_number: receipt,
      settled_at: now,
      retained_accounting_payload: {
        order_id: order.id,
        vendor_id: order.vendor_id,
        date: order.created_at,
        total_amount: amount,
        payment_method: method,
        settlement_status: "complete",
      },
    }, { onConflict: "order_id" });

    const { data: updated, error: updateError } = await supabase
      .from("hyperlocal_orders")
      .update({
        status: "completed",
        payment_method: method,
        payment_status: "paid",
        settlement_status: "complete",
        settlement_completed_at: now,
        paid_at: now,
        payment_confirmed_by: confirmed_by || null,
        payment_reference: payment_reference || null,
        receipt_number: receipt,
        customer_delivery_snapshot: null,
        customer_address: "REDACTED_AFTER_SETTLEMENT",
        customer_phone: "REDACTED_AFTER_SETTLEMENT",
        customer_lat: null,
        customer_lng: null,
        delivery_address: null,
        delivery_lat: null,
        delivery_lng: null,
        order_instructions: null,
        safe_order_instructions: null,
        privacy_redacted_at: now,
        privacy_redaction_reason: "Paid and settled direct-to-vendor order; retained minimal accounting history only.",
        updated_at: now,
      })
      .eq("id", order.id)
      .select()
      .single();
    if (updateError) throw updateError;

    await writeOrderAuditLog({
      orderId: order.id,
      vendorId: order.vendor_id,
      actorUserId: actor_user_id || null,
      actorRole: confirmed_by || "rider",
      action: "direct_vendor_payment_settled",
      fromStatus: order.status,
      toStatus: "completed",
      metadata: { payment_method: method, receipt_number: receipt, customer_pii_redacted: true },
      req,
    });

    return res.json({ success: true, order: updated, receipt_number: receipt, settlement_status: "complete" });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.get("/storage/admin/overview", async (_req, res) => {
  try {
    const [{ data: usage, error: usageError }, { data: purchases, error: purchaseError }, { data: plans, error: planError }] = await Promise.all([
      supabase.from("vendor_storage_usage").select("*").order("updated_at", { ascending: false }).limit(500),
      supabase.from("vendor_storage_purchases").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("vendor_storage_plans").select("*").order("sort_order"),
    ]);
    if (usageError) throw usageError;
    if (purchaseError) throw purchaseError;
    if (planError) throw planError;
    return res.json({ success: true, usage: usage || [], purchases: purchases || [], plans: plans || [] });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/storage/:vendor_id/purchase", async (req, res) => {
  try {
    const { plan_id, payment_reference, payment_status = "paid" } = req.body;
    const { data: plan, error: planError } = await supabase
      .from("vendor_storage_plans")
      .select("*")
      .eq("id", plan_id)
      .eq("is_active", true)
      .single();
    if (planError || !plan) return res.status(404).json({ success: false, error: "Storage plan not found." });
    if (payment_status !== "paid") return res.status(402).json({ success: false, error: "Storage is activated only after successful payment." });

    const now = new Date().toISOString();
    const { data: purchase, error: purchaseError } = await supabase
      .from("vendor_storage_purchases")
      .insert({
        vendor_id: req.params.vendor_id,
        plan_id,
        quota_bytes: Number(plan.quota_bytes),
        amount_inr: Number(plan.price_inr),
        payment_status: "paid",
        payment_reference: payment_reference || null,
        activated_at: now,
      })
      .select()
      .single();
    if (purchaseError) throw purchaseError;

    const { data: usage } = await supabase.from("vendor_storage_usage").select("*").eq("vendor_id", req.params.vendor_id).maybeSingle();
    await supabase.from("vendor_storage_usage").upsert({
      vendor_id: req.params.vendor_id,
      quota_bytes: Number(usage?.quota_bytes || 104857600) + Number(plan.quota_bytes),
      purchased_quota_bytes: Number(usage?.purchased_quota_bytes || 0) + Number(plan.quota_bytes),
      used_bytes: Number(usage?.used_bytes || 0),
      warning_level: usage?.warning_level || "none",
      updated_at: now,
    }, { onConflict: "vendor_id" });

    return res.json({ success: true, purchase });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

export default router;


