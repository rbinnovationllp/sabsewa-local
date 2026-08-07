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
 * Fallback Matrix for Canonical Category IDs
 * Note: perOrderCharge values are in Rupees (e.g., 20 = Rs. 20)
 */
const CANONICAL_FEE_MATRIX = {
  FRUIT_VEGETABLE: { onboardingFee: 500, securityDeposit: 5000, perOrderCharge: 15, taxRate: 18 },
  KIRANA_GENERAL: { onboardingFee: 1000, securityDeposit: 5000, perOrderCharge: 20, taxRate: 18 },
  PHARMACY_MEDICAL: { onboardingFee: 2000, securityDeposit: 5000, perOrderCharge: 25, taxRate: 18 },
  RESTAURANT_FOOD: { onboardingFee: 2000, securityDeposit: 5000, perOrderCharge: 25, taxRate: 18 },
  BAKERY_DAIRY: { onboardingFee: 1000, securityDeposit: 5000, perOrderCharge: 15, taxRate: 18 },
  HARDWARE_REPAIR: { onboardingFee: 1500, securityDeposit: 5000, perOrderCharge: 20, taxRate: 18 },
  CLOTHING_TAILORING: { onboardingFee: 1000, securityDeposit: 5000, perOrderCharge: 15, taxRate: 18 },
  HOME_BUSINESS: { onboardingFee: 500, securityDeposit: 5000, perOrderCharge: 10, taxRate: 18 },
  OTHER: { onboardingFee: 2000, securityDeposit: 5000, perOrderCharge: 25, taxRate: 18 }
};

/**
 * Resolves legacy free-text categories or controlled dropdown IDs to canonical category_id
 */
function resolveCanonicalId(rawCategory) {
  if (!rawCategory) return "OTHER";
  const clean = String(rawCategory).trim().toUpperCase();

  if (CANONICAL_FEE_MATRIX[clean]) return clean;

  const lower = clean.toLowerCase();
  if (lower.includes("veg") || lower.includes("fruit")) return "FRUIT_VEGETABLE";
  if (lower.includes("kirana") || lower.includes("general") || lower.includes("grocery")) return "KIRANA_GENERAL";
  if (lower.includes("pharma") || lower.includes("med") || lower.includes("chemist")) return "PHARMACY_MEDICAL";
  if (lower.includes("rest") || lower.includes("food") || lower.includes("eatery")) return "RESTAURANT_FOOD";
  if (lower.includes("bake") || lower.includes("dairy")) return "BAKERY_DAIRY";
  if (lower.includes("hardware") || lower.includes("repair")) return "HARDWARE_REPAIR";
  if (lower.includes("cloth") || lower.includes("tailor")) return "CLOTHING_TAILORING";
  if (lower.includes("home")) return "HOME_BUSINESS";

  return "OTHER";
}

/**
 * @route POST /api/vendor/onboarding/:vendor_id/register-category
 * @desc Saves controlled dropdown selection or custom 'OTHER' category description
 */
router.post("/:vendor_id/register-category", async (req, res) => {
  try {
    const { vendor_id } = req.params;
    const { category_id, custom_category_description, actor_user_id } = req.body || {};

    if (!category_id) {
      return res.status(400).json({ success: false, error: "Category selection is required." });
    }

    const canonicalId = resolveCanonicalId(category_id);

    const { data: updatedVendor, error: updateError } = await supabase
      .from("vendors")
      .update({
        category: canonicalId,
        custom_category_description: canonicalId === "OTHER" ? custom_category_description : null,
        updated_at: new Date().toISOString()
      })
      .eq("id", vendor_id)
      .select()
      .single();

    if (updateError) throw updateError;

    if (canonicalId === "OTHER" && custom_category_description) {
      await supabase.from("audit_logs").insert({
        actor_user_id: actor_user_id || null,
        action: "custom_category_submitted",
        entity_type: "vendors",
        entity_id: vendor_id,
        metadata: { custom_category_description, assigned_category: "OTHER" }
      });
    }

    return res.json({ success: true, vendor: updatedVendor });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route POST /api/vendor/onboarding/:vendor_id/create-razorpay-order
 * @desc Dynamically calculates Onboarding Fee + GST + Security Deposit based on canonical category
 */
router.post("/:vendor_id/create-razorpay-order", async (req, res) => {
  try {
    const { vendor_id } = req.params;

    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("id, public_vendor_id, category, shop_name, phone_number, email")
      .eq("id", vendor_id)
      .single();

    if (vendorError || !vendor) {
      return res.status(404).json({ success: false, error: "Vendor profile not found." });
    }

    const canonicalId = resolveCanonicalId(vendor.category);
    const fallbackRules = CANONICAL_FEE_MATRIX[canonicalId] || CANONICAL_FEE_MATRIX.OTHER;

    const { data: feeRule } = await supabase
      .from("vendor_fee_rules")
      .select("onboarding_fee_amount, security_deposit_amount, tax_rate_percent, per_completed_order_charge")
      .or(`category_id.eq.${canonicalId},category_slug.eq.${canonicalId.toLowerCase()}`)
      .eq("is_active", true)
      .is("effective_to", null)
      .maybeSingle();

    const onboardingFee = feeRule?.onboarding_fee_amount ?? fallbackRules.onboardingFee;
    const securityDeposit = feeRule?.security_deposit_amount ?? fallbackRules.securityDeposit;
    const taxRatePercent = feeRule?.tax_rate_percent ?? fallbackRules.taxRate;
    const perOrderCharge = feeRule?.per_completed_order_charge ?? fallbackRules.perOrderCharge;

    const taxAmount = Math.round((onboardingFee * taxRatePercent) / 100);
    const totalAmountInRupees = onboardingFee + securityDeposit + taxAmount;
    const totalAmountInPaise = Math.round(totalAmountInRupees * 100);

    const options = {
      amount: totalAmountInPaise,
      currency: "INR",
      receipt: `onb_${vendor_id.slice(0, 8)}_${Date.now()}`,
      notes: {
        internal_vendor_id: vendor.id,
        vendor_id: vendor.public_vendor_id || vendor.id,
        category_id: canonicalId,
        onboarding_fee: String(onboardingFee),
        security_deposit: String(securityDeposit),
        tax_amount: String(taxAmount),
        per_order_charge: String(perOrderCharge)
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
        category_id: canonicalId,
        onboarding_fee: onboardingFee,
        gst_amount: taxAmount,
        gst_rate_percent: taxRatePercent,
        security_deposit: securityDeposit,
        per_completed_order_charge: perOrderCharge,
        total_payable: totalAmountInRupees,
      },
    });
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
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
      supabase.from("vendor_fee_rules").select("*").eq("is_active", true).is("effective_to", null),
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
    const { gateway_order_id, gateway_payment_id, gateway_signature, actor_user_id, metadata = {} } = req.body || {};

    if (!gateway_order_id || !gateway_payment_id) {
      return res.status(400).json({ success: false, error: "Verified gateway order id and payment id are required." });
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
    const [{ data: categories }, { data: feeRules }] = await Promise.all([
      supabase.from("vendor_categories").select("*").order("sort_order"),
      supabase.from("vendor_fee_rules").select("*").eq("is_active", true).is("effective_to", null),
    ]);
    return res.json({ success: true, categories: categories || [], fee_rules: feeRules || [] });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/:vendor_id/kyc-status", ...requireAdmin, async (req, res) => {
  try {
    const { status, actor_user_id, reason } = req.body || {};
    const allowed = new Set(["kyc_not_started", "kyc_submitted", "kyc_under_review", "additional_information_required", "kyc_verified", "kyc_rejected"]);
    if (!allowed.has(status)) return res.status(400).json({ success: false, error: "Invalid KYC status." });

    const { data: current, error: currentError } = await supabase
      .from("vendors")
      .select("id, status, kyc_status, onboarding_payment_status")
      .eq("id", req.params.vendor_id)
      .single();
    if (currentError || !current) return res.status(404).json({ success: false, error: "Vendor not found." });

    const nextLifecycle = status === "kyc_rejected"
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