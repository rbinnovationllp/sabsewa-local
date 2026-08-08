import { supabase } from "../connection.js";

const CANONICAL_FALLBACKS = {
  FRUIT_VEGETABLE: { onboarding_fee: 500, security_deposit: 5000, tax_rate_percent: 18 },
  KIRANA_GENERAL: { onboarding_fee: 1000, security_deposit: 5000, tax_rate_percent: 18 },
  PHARMACY_MEDICAL: { onboarding_fee: 2000, security_deposit: 5000, tax_rate_percent: 18 },
  RESTAURANT_FOOD: { onboarding_fee: 2000, security_deposit: 5000, tax_rate_percent: 18 },
  OTHER: { onboarding_fee: 2000, security_deposit: 5000, tax_rate_percent: 18 }
};

function resolveCanonicalCategoryId(rawCategory) {
  if (!rawCategory) return "OTHER";
  const clean = String(rawCategory).trim().toLowerCase();
  if (clean.includes("veg") || clean.includes("fruit")) return "FRUIT_VEGETABLE";
  if (clean.includes("kirana") || clean.includes("general") || clean.includes("grocery")) return "KIRANA_GENERAL";
  if (clean.includes("pharma") || clean.includes("med")) return "PHARMACY_MEDICAL";
  if (clean.includes("rest") || clean.includes("food")) return "RESTAURANT_FOOD";
  return "OTHER";
}

export async function getVendorOnboardingSummary(vendorId) {
  const { data: vendor, error: vendorErr } = await supabase
    .from("vendors")
    .select("id, category, kyc_status, onboarding_payment_status, lifecycle_status, status")
    .eq("id", vendorId)
    .single();

  if (vendorErr || !vendor) throw new Error("Vendor profile not found");

  const canonicalId = resolveCanonicalId(vendor.category);
  const fallback = CANONICAL_FALLBACKS[canonicalId] || CANONICAL_FALLBACKS.OTHER;

  // Query DB fee rules
  const { data: feeRule } = await supabase
    .from("vendor_fee_rules")
    .select("onboarding_fee_amount, security_deposit_amount, tax_rate_percent")
    .or(`category_id.eq.${canonicalId},category_slug.eq.${canonicalId.toLowerCase()}`)
    .eq("is_active", true)
    .maybeSingle();

  const onboardingFee = feeRule?.onboarding_fee_amount ?? fallback.onboarding_fee;
  const securityDeposit = feeRule?.security_deposit_amount ?? fallback.security_deposit;
  const taxRate = feeRule?.tax_rate_percent ?? fallback.tax_rate_percent;

  const taxAmount = Math.round((onboardingFee * taxRate) / 100);
  const totalPayable = onboardingFee + securityDeposit + taxAmount;

  return {
    vendor_id: vendor.id,
    business_category_display: vendor.category || "General Vendor",
    canonical_category_id: canonicalId,
    kyc_status: vendor.kyc_status || "kyc_not_started",
    payment_status: vendor.onboarding_payment_status || "payment_pending",
    lifecycle_status: vendor.lifecycle_status || vendor.status || "registered",
    is_payment_unlocked: vendor.kyc_status === "kyc_verified",
    pricing: {
      onboarding_fee: onboardingFee,
      security_deposit: securityDeposit,
      tax_amount: taxAmount,
      tax_rate_percent: taxRate,
      total_payable: totalPayable
    }
  };
}