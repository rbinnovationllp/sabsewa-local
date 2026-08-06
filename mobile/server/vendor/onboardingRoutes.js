import express from "express";
import Razorpay from "razorpay";
import { supabase } from "../connection.js";
import { getRazorpayMode } from "../payments/paymentEnvironment.js";
import { requireRole, requireUserJwt } from "../security/apiSecurity.js";
import { verifyRazorpaySignature } from "../securityWallet/securityWalletService.js";
import { getVendorOnboardingSummary } from "./onboardingPolicyService.js";

const router = express.Router();
const requireAdmin = [requireUserJwt(supabase), requireRole(["admin", "company_admin", "super_admin"])];

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * @route POST /api/vendor/onboarding/:vendor_id/create-razorpay-order
 * @desc Dynamically calculates Onboarding Fee + Security Deposit based on vendor category and creates Razorpay Order
 */
router.post("/:vendor_id/create-razorpay-order", async (req, res) => {
  try {
    const { vendor_id } = req.params;

    // 1. Fetch vendor profile and category
    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("id, public_vendor_id, category, shop_name, phone_number, email")
      .eq("id", vendor_id)
      .single();

    if (vendorError || !vendor) {
      return res.status(404).json({ success: false, error: "Vendor profile not found." });
    }

    const categorySlug = String(vendor.category || "other").toLowerCase();

    // 2. Fetch active fee rule for the vendor's category from database
    const { data: feeRule } = await supabase
      .from("vendor_fee_rules")
      .select("onboarding_fee_amount, security_deposit_amount, tax_rate_percent, onboarding_fee_refundable, security_deposit_refundable")
      .eq("category_slug", categorySlug)
      .eq("is_active", true)
      .is("effective_to", null)
      .maybeSingle();

    // Dynamically retrieve fee values or fall back to defaults (Rs 500 Onboarding Fee + Rs 5,000 Security Deposit)
    const onboardingFee = feeRule?.onboarding_fee_amount ?? 500;
    const securityDeposit = feeRule?.security_deposit_amount ?? 5000;
    const taxRatePercent = feeRule?.tax_rate_percent ?? 0;

    const taxAmount = Math.round((onboardingFee * taxRatePercent) / 100);
    const totalAmountInRupees = onboardingFee + securityDeposit + taxAmount;
    const totalAmountInPaise = Math.round(totalAmountInRupees * 100);

    // 3. Create dynamic order on Razorpay
    const options = {
      amount: totalAmountInPaise,
      currency: "INR",
      receipt: `onb_${vendor_id.slice(0, 8)}_${Date.now()}`,
      notes: {
        internal_vendor_id: vendor.id,
        vendor_id: vendor.public_vendor_id || vendor.id,
        payment_purpose: "vendor_initial_activation",
        category_slug: categorySlug,
        onboarding_fee: String(onboardingFee),
        security_deposit: String(securityDeposit),
        tax_amount: String(taxAmount),
      },
    };

    const order = await razorpay.orders.create(options);

    return res.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
      breakdown: {
        category_slug: categorySlug,
        onboarding_fee: onboardingFee,
        security_deposit: securityDeposit,
        tax_amount: taxAmount,
        tax_rate_percent: taxRatePercent,
        total_payable: totalAmountInRupees,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/:vendor_id/summary", async (req, res) => {
  try {
    const summary = await getVendorOnboardingSummary(req.params.vendor_id);
    return res.json({ success: true, summary });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.get("/categories/fee-rules", async (_req, res) => {
  try {
    const [{ data: categories, error: categoryError }, { data: feeRules, error: feeError }] = await Promise.all([
      supabase.from("vendor_categories").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("vendor_fee_rules").select("*").eq("is_active", true).is("effective_to", null).order("category_slug"),
    ]);
    if (categoryError) throw categoryError;
    if (feeError) throw feeError;
    return res.json({ success: true, categories: categories || [], fee_rules: feeRules || [] });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/:vendor_id/payment-record", async (req, res) => {
  try {
    const {
      gateway_order_id,
      gateway_payment_id,
      gateway_signature,
      actor_user_id,
      metadata = {},
    } = req.body || {};

    if (!gateway_order_id || !gateway_payment_id) {
      return res.status(400).json({
        success: false,
        error: "Verified gateway order id and payment id are required before onboarding payment can be recorded.",
      });
    }
    if (getRazorpayMode() === "live" && !gateway_signature) {
      return res.status(400).json({ success: false, error: "Gateway signature is required in live payment mode." });
    }
    if (gateway_signature) {
      const validSignature = verifyRazorpaySignature({
        razorpayOrderId: gateway_order_id,
        razorpayPaymentId: gateway_payment_id,
        razorpaySignature: gateway_signature,
      });
      if (!validSignature) {
        return res.status(400).json({ success: false, error: "Payment signature verification failed." });
      }
    }

    const { data, error } = await supabase.rpc("record_vendor_onboarding_payment", {
      p_vendor_id: req.params.vendor_id,
      p_gateway_order_id: gateway_order_id,
      p_gateway_payment_id: gateway_payment_id,
      p_gateway_signature: gateway_signature || null,
      p_metadata: {
        ...metadata,
        actor_user_id: actor_user_id || null,
        recorded_from: "mobile_server_vendor_onboarding_route",
      },
    });
    if (error) throw error;

    return res.json({ success: true, summary: data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.get("/admin/config", ...requireAdmin, async (_req, res) => {
  try {
    const [
      { data: categories, error: categoryError },
      { data: feeRules, error: feeError },
      { data: storagePlans, error: storageError },
    ] = await Promise.all([
      supabase.from("vendor_categories").select("*").order("sort_order"),
      supabase.from("vendor_fee_rules").select("*").eq("is_active", true).is("effective_to", null).order("category_slug"),
      supabase.from("vendor_storage_plans").select("*").order("sort_order"),
    ]);
    if (categoryError) throw categoryError;
    if (feeError) throw feeError;
    if (storageError && storageError.code !== "42P01") throw storageError;

    return res.json({
      success: true,
      categories: categories || [],
      fee_rules: feeRules || [],
      storage_plans: storagePlans || [],
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/admin/categories", ...requireAdmin, async (req, res) => {
  try {
    const {
      slug,
      display_name,
      description,
      requires_fssai = false,
      requires_drug_license = false,
      requires_gstin = false,
      requires_trade_license = false,
      is_active = true,
      sort_order = 100,
      actor_user_id,
    } = req.body || {};

    if (!slug || !display_name) {
      return res.status(400).json({ success: false, error: "Category slug and display name are required." });
    }

    const normalizedSlug = String(slug).trim().toLowerCase();
    const { data, error } = await supabase
      .from("vendor_categories")
      .upsert({
        slug: normalizedSlug,
        display_name: String(display_name).trim(),
        description: description || null,
        requires_fssai: Boolean(requires_fssai),
        requires_drug_license: Boolean(requires_drug_license),
        requires_gstin: Boolean(requires_gstin),
        requires_trade_license: Boolean(requires_trade_license),
        is_active: Boolean(is_active),
        sort_order: Number(sort_order || 100),
        updated_at: new Date().toISOString(),
      }, { onConflict: "slug" })
      .select()
      .single();
    if (error) throw error;

    await supabase.from("audit_logs").insert({
      actor_user_id: actor_user_id || null,
      action: "vendor_category_upsert",
      entity_type: "vendor_categories",
      entity_id: data.id,
      metadata: { slug: normalizedSlug },
    });

    return res.json({ success: true, category: data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/admin/fee-rules", ...requireAdmin, async (req, res) => {
  try {
    const {
      category_slug,
      onboarding_fee_amount,
      security_deposit_amount,
      per_completed_order_charge,
      onboarding_fee_refundable = false,
      security_deposit_refundable = true,
      tax_rate_percent = 0,
      currency = "INR",
      actor_user_id,
    } = req.body || {};

    if (!category_slug) return res.status(400).json({ success: false, error: "Category is required." });
    const normalizedCategory = String(category_slug).trim().toLowerCase();
    const onboardingFee = Number(onboarding_fee_amount);
    const securityDeposit = Number(security_deposit_amount);
    const orderCharge = Number(per_completed_order_charge);
    const taxRate = Number(tax_rate_percent || 0);
    if (![onboardingFee, securityDeposit, orderCharge, taxRate].every((value) => Number.isFinite(value) && value >= 0)) {
      return res.status(400).json({ success: false, error: "Fee amounts and tax rate must be valid non-negative numbers." });
    }

    const now = new Date().toISOString();
    await supabase
      .from("vendor_fee_rules")
      .update({ is_active: false, effective_to: now, updated_at: now })
      .eq("category_slug", normalizedCategory)
      .eq("is_active", true)
      .is("effective_to", null);

    const { data, error } = await supabase
      .from("vendor_fee_rules")
      .insert({
        category_slug: normalizedCategory,
        onboarding_fee_amount: onboardingFee,
        security_deposit_amount: securityDeposit,
        per_completed_order_charge: orderCharge,
        onboarding_fee_refundable: Boolean(onboarding_fee_refundable),
        security_deposit_refundable: Boolean(security_deposit_refundable),
        tax_rate_percent: taxRate,
        currency,
        created_by: actor_user_id || null,
      })
      .select()
      .single();
    if (error) throw error;

    await supabase.from("audit_logs").insert({
      actor_user_id: actor_user_id || null,
      action: "vendor_fee_rule_update",
      entity_type: "vendor_fee_rules",
      entity_id: data.id,
      metadata: { category_slug: normalizedCategory, onboardingFee, securityDeposit, orderCharge, taxRate },
    });

    return res.status(201).json({ success: true, fee_rule: data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/:vendor_id/kyc-status", ...requireAdmin, async (req, res) => {
  try {
    const { status, actor_user_id, reason } = req.body || {};
    const allowed = new Set([
      "kyc_not_started",
      "kyc_submitted",
      "kyc_under_review",
      "additional_information_required",
      "kyc_verified",
      "kyc_rejected",
    ]);
    if (!allowed.has(status)) return res.status(400).json({ success: false, error: "Invalid KYC status." });

    const { data: current, error: currentError } = await supabase
      .from("vendors")
      .select("id, status, kyc_status, onboarding_payment_status")
      .eq("id", req.params.vendor_id)
      .single();
    if (currentError || !current) return res.status(404).json({ success: false, error: "Vendor not found." });

    const nextLifecycle =
      status === "kyc_rejected"
        ? "kyc_rejected"
        : status === "kyc_verified" && current.onboarding_payment_status === "payment_completed"
          ? "approval_pending"
          : status === "kyc_verified"
            ? "payment_pending"
            : "kyc_pending";

    const { data, error } = await supabase
      .from("vendors")
      .update({
        kyc_status: status,
        status: current.status === "active" ? "active" : nextLifecycle,
        lifecycle_status: current.status === "active" ? "active" : nextLifecycle,
      })
      .eq("id", req.params.vendor_id)
      .select()
      .single();
    if (error) throw error;

    await supabase.from("vendor_status_history").insert({
      vendor_id: req.params.vendor_id,
      previous_status: current.kyc_status,
      next_status: status,
      changed_by: actor_user_id || null,
      change_reason: reason || "KYC status updated",
    });

    return res.json({ success: true, vendor: data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/:vendor_id/activate", ...requireAdmin, async (req, res) => {
  try {
    const { actor_user_id, reason } = req.body || {};
    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("id, status, kyc_status, onboarding_payment_status")
      .eq("id", req.params.vendor_id)
      .single();
    if (vendorError || !vendor) return res.status(404).json({ success: false, error: "Vendor not found." });
    if (vendor.kyc_status !== "kyc_verified" || vendor.onboarding_payment_status !== "payment_completed") {
      return res.status(409).json({ success: false, error: "Vendor can be activated only after verified KYC and completed onboarding payment." });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("vendors")
      .update({
        status: "active",
        lifecycle_status: "active",
        public_verification_badge: true,
        activated_at: now,
        activated_by: actor_user_id || null,
      })
      .eq("id", req.params.vendor_id)
      .select()
      .single();
    if (error) throw error;

    await supabase.from("vendor_status_history").insert({
      vendor_id: req.params.vendor_id,
      previous_status: vendor.status,
      next_status: "active",
      changed_by: actor_user_id || null,
      change_reason: reason || "Admin approved final activation",
    });

    return res.json({ success: true, vendor: data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

export default router;