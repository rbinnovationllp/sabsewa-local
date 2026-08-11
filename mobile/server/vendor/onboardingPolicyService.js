import { supabase } from "../connection.js";

const CANONICAL_FALLBACKS = {
  FRUIT_VEGETABLE: { onboarding_fee: 500, security_deposit: 5000, tax_rate_percent: 18, slugs: ["vegetables", "fruits"] },
  KIRANA_GENERAL: { onboarding_fee: 1000, security_deposit: 5000, tax_rate_percent: 18, slugs: ["kirana", "grocery"] },
  PHARMACY_MEDICAL: { onboarding_fee: 2000, security_deposit: 5000, tax_rate_percent: 18, slugs: ["pharmacy", "medical"] },
  RESTAURANT_FOOD: { onboarding_fee: 2000, security_deposit: 5000, tax_rate_percent: 18, slugs: ["restaurant", "tiffin"] },
  BAKERY_DAIRY: { onboarding_fee: 1000, security_deposit: 5000, tax_rate_percent: 18, slugs: ["bakery", "dairy"] },
  OTHER: { onboarding_fee: 2000, security_deposit: 5000, tax_rate_percent: 18, slugs: ["other"] },
};

const PAYMENT_UNLOCK_KYC_STATUSES = new Set(["kyc_verified", "kyc_provisionally_cleared", "provisional_approved", "verified", "approved"]);

function isKycPaymentEligible(status) {
  return PAYMENT_UNLOCK_KYC_STATUSES.has(String(status || "").toLowerCase());
}

function resolveCanonicalCategoryId(rawCategory) {
  if (!rawCategory) return "OTHER";
  const clean = String(rawCategory).trim();
  const upper = clean.toUpperCase();
  if (CANONICAL_FALLBACKS[upper]) return upper;

  const lower = clean.toLowerCase();
  if (lower.includes("veg") || lower.includes("fruit")) return "FRUIT_VEGETABLE";
  if (lower.includes("kirana") || lower.includes("general") || lower.includes("grocery")) return "KIRANA_GENERAL";
  if (lower.includes("pharma") || lower.includes("med") || lower.includes("chemist")) return "PHARMACY_MEDICAL";
  if (lower.includes("rest") || lower.includes("food") || lower.includes("tiffin")) return "RESTAURANT_FOOD";
  if (lower.includes("bake") || lower.includes("dairy")) return "BAKERY_DAIRY";
  return "OTHER";
}

function categorySlugCandidates(rawCategory, canonicalId) {
  const clean = String(rawCategory || "").trim().toLowerCase();
  const normalized = clean.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return Array.from(new Set([
    ...(CANONICAL_FALLBACKS[canonicalId]?.slugs || []),
    canonicalId.toLowerCase(),
    normalized,
    normalized.replace(/_shops?$/, ""),
    normalized.replace(/_stores?$/, ""),
    "other",
  ].filter(Boolean)));
}

export async function getVendorOnboardingSummary(vendorId) {
  const { data: vendor, error: vendorErr } = await supabase
    .from("vendors")
    .select("id, category, kyc_status, onboarding_payment_status, lifecycle_status, status")
    .eq("id", vendorId)
    .single();

  if (vendorErr || !vendor) throw new Error("Vendor profile not found");

  const canonicalId = resolveCanonicalCategoryId(vendor.category);
  const fallback = CANONICAL_FALLBACKS[canonicalId] || CANONICAL_FALLBACKS.OTHER;
  const slugCandidates = categorySlugCandidates(vendor.category, canonicalId);

  const { data: feeRules, error: feeError } = await supabase
    .from("vendor_fee_rules")
    .select("id, category_slug, onboarding_fee_amount, security_deposit_amount, tax_rate_percent, onboarding_fee_refundable, security_deposit_refundable, currency")
    .in("category_slug", slugCandidates)
    .eq("is_active", true)
    .is("effective_to", null)
    .order("effective_from", { ascending: false });

  if (feeError) {
    console.warn("Unable to read vendor fee rules; using canonical fallback:", feeError.message);
  }

  const feeRule = (feeRules || []).find((rule) => rule.category_slug !== "other") || (feeRules || [])[0] || null;
  const onboardingFee = Number(feeRule?.onboarding_fee_amount ?? fallback.onboarding_fee);
  const securityDeposit = Number(feeRule?.security_deposit_amount ?? fallback.security_deposit);
  const taxRate = Number(feeRule?.tax_rate_percent ?? fallback.tax_rate_percent);
  const taxAmount = Math.round((onboardingFee * taxRate) / 100);
  const totalPayable = onboardingFee + securityDeposit + taxAmount;
  const kycStatus = vendor.kyc_status || "kyc_not_started";
  const paymentStatus = vendor.onboarding_payment_status || "payment_pending";
  const lifecycleStatus = vendor.lifecycle_status || vendor.status || "registered";
  const canPublishProducts = lifecycleStatus === "active" && isKycPaymentEligible(kycStatus) && paymentStatus === "payment_completed";
  const pricingSource = feeRule ? "vendor_fee_rules" : "canonical_fallback";

  return {
    vendor_id: vendor.id,
    business_category_display: vendor.category || "General Vendor",
    category_slug: feeRule?.category_slug || fallback.slugs[0] || "other",
    canonical_category_id: canonicalId,
    fee_rule_id: feeRule?.id || null,
    pricing_source: pricingSource,
    pricing_configured: totalPayable > 0,
    kyc_status: kycStatus,
    payment_status: paymentStatus,
    vendor_status: lifecycleStatus,
    lifecycle_status: lifecycleStatus,
    is_payment_unlocked: isKycPaymentEligible(kycStatus),
    can_publish_products: canPublishProducts,
    onboarding_fee: onboardingFee,
    security_deposit: securityDeposit,
    tax_amount: taxAmount,
    tax_rate_percent: taxRate,
    total_payable: totalPayable,
    currency: feeRule?.currency || "INR",
    onboarding_fee_refundable: Boolean(feeRule?.onboarding_fee_refundable),
    security_deposit_refundable: feeRule?.security_deposit_refundable !== false,
    pricing: {
      onboarding_fee: onboardingFee,
      security_deposit: securityDeposit,
      tax_amount: taxAmount,
      tax_rate_percent: taxRate,
      total_payable: totalPayable,
      currency: feeRule?.currency || "INR",
    },
  };
}

export async function assertVendorCanReceiveOrdersByStatus(vendorId) {
  const summary = await getVendorOnboardingSummary(vendorId);
  const lifecycleStatus = String(summary.lifecycle_status || summary.vendor_status || "").toLowerCase();
  const kycStatus = String(summary.kyc_status || "").toLowerCase();
  const paymentStatus = String(summary.payment_status || "").toLowerCase();

  const activeLifecycle = ["active", "approved", "verified"].includes(lifecycleStatus);
  const kycApproved = isKycPaymentEligible(kycStatus);
  const paymentComplete = ["payment_completed", "paid", "completed"].includes(paymentStatus);

  if (!activeLifecycle || !kycApproved || !paymentComplete) {
    const error = new Error("Vendor is not active for receiving customer orders yet.");
    error.statusCode = 403;
    error.publicMessage = "This vendor is not active for customer orders yet.";
    error.vendor_status = lifecycleStatus;
    error.kyc_status = kycStatus;
    error.payment_status = paymentStatus;
    throw error;
  }

  return summary;
}

export async function assertVendorCanPublishProducts(vendorId) {
  const summary = await getVendorOnboardingSummary(vendorId);

  if (!summary.can_publish_products) {
    const error = new Error("Vendor onboarding is incomplete. Complete KYC approval, required payment and activation before publishing products.");
    error.statusCode = 403;
    error.publicMessage = "Complete KYC approval and required payment before publishing products.";
    error.vendor_status = summary.lifecycle_status || summary.vendor_status;
    error.kyc_status = summary.kyc_status;
    error.payment_status = summary.payment_status;
    throw error;
  }

  return summary;
}
