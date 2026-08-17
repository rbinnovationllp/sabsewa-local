import { supabase } from "../connection.js";

export const GST_RATE_BPS = 1800;
export const GST_DIVISOR_BPS = 11800;
export const VENDOR_MONTHLY_ORDER_PLAN_TERMS_VERSION = "vendor-monthly-order-pricing-local-2026-08-17";
export const VENDOR_GST_INCLUSIVE_PRICING_VERSION = "vendor-gst-inclusive-pricing-local-2026-08-17";

const CATEGORY_PRICING = [
  {
    rule_code: "vegetables_fruits_15",
    category_slugs: ["vegetables", "vegetable", "fruit", "fruits", "fruit_vegetable", "fruit_and_vegetable"],
    category_label: "Vegetables and fruits",
    gross_fee_paise: 1500,
  },
  {
    rule_code: "kirana_general_20",
    category_slugs: ["kirana", "grocery", "general_store", "general_stores", "general"],
    category_label: "Kirana and general stores",
    gross_fee_paise: 2000,
  },
  {
    rule_code: "restaurants_pharmacies_25",
    category_slugs: ["restaurant", "restaurants", "tiffin", "restaurant_tiffin", "pharmacy", "pharmacies", "medical", "medical_store"],
    category_label: "Restaurants and pharmacies",
    gross_fee_paise: 2500,
  },
];

export const MONTHLY_ORDER_PLANS = [
  {
    plan_code: "local_starter_500",
    plan_name: "Local Starter",
    min_order_number: 0,
    max_order_allowance: 500,
    service_fee_before_gst_paise: 200000,
    gst_rate_percent: 18,
    gst_amount_paise: 36000,
    total_payable_paise: 236000,
    required_security_balance_paise: 500000,
  },
  {
    plan_code: "local_growth_1000",
    plan_name: "Local Growth",
    min_order_number: 501,
    max_order_allowance: 1000,
    service_fee_before_gst_paise: 380000,
    gst_rate_percent: 18,
    gst_amount_paise: 68400,
    total_payable_paise: 448400,
    required_security_balance_paise: 500000,
  },
  {
    plan_code: "local_pro_2000",
    plan_name: "Local Pro",
    min_order_number: 1001,
    max_order_allowance: 2000,
    service_fee_before_gst_paise: 750000,
    gst_rate_percent: 18,
    gst_amount_paise: 135000,
    total_payable_paise: 885000,
    required_security_balance_paise: 1000000,
  },
  {
    plan_code: "local_enterprise_5000",
    plan_name: "Local Enterprise",
    min_order_number: 2001,
    max_order_allowance: 5000,
    service_fee_before_gst_paise: 1700000,
    gst_rate_percent: 18,
    gst_amount_paise: 306000,
    total_payable_paise: 2006000,
    required_security_balance_paise: 2500000,
  },
];

function addDays(date, days) {
  return new Date(date.getTime() + Number(days || 0) * 24 * 60 * 60 * 1000);
}

function rupeeNumberToPaise(value) {
  return Math.round(Number(value || 0) * 100);
}

function paiseToRupeeNumber(value) {
  return Number(value || 0) / 100;
}

function normalizeCategory(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function splitIncludedGst(grossFeePaise, placeOfSupply = {}) {
  const gross = Number(grossFeePaise || 0);
  const taxable = Math.floor((gross * 10000 + GST_DIVISOR_BPS / 2) / GST_DIVISOR_BPS);
  const gst = gross - taxable;
  const vendorState = normalizeCategory(placeOfSupply.vendor_state || placeOfSupply.vendorState || "");
  const customerState = normalizeCategory(placeOfSupply.customer_state || placeOfSupply.customerState || vendorState);
  const intrastate = !customerState || !vendorState || customerState === vendorState;
  const cgst = intrastate ? Math.floor(gst / 2) : 0;
  const sgst = intrastate ? gst - cgst : 0;
  const igst = intrastate ? 0 : gst;

  return {
    gross_platform_fee_paise: gross,
    taxable_value_paise: taxable,
    gst_rate_bps: GST_RATE_BPS,
    gst_amount_paise: gst,
    cgst_amount_paise: cgst,
    sgst_amount_paise: sgst,
    igst_amount_paise: igst,
    tax_treatment: intrastate ? "intrastate_cgst_sgst" : "interstate_igst",
    place_of_supply: {
      vendor_state: placeOfSupply.vendor_state || placeOfSupply.vendorState || null,
      customer_state: placeOfSupply.customer_state || placeOfSupply.customerState || null,
    },
    rounding_policy: "paise_integer_gross_reconciliation",
  };
}

function tableMissing(error) {
  return ["42P01", "PGRST116", "PGRST205"].includes(String(error?.code || ""));
}

function pricingError(message, statusCode, details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.pricing = details;
  return error;
}

export function getMonthlyOrderPlans() {
  return MONTHLY_ORDER_PLANS.map((plan) => ({ ...plan }));
}

export function getCategoryPricingRules() {
  return CATEGORY_PRICING.map((rule) => ({
    ...rule,
    tax_breakup: splitIncludedGst(rule.gross_fee_paise),
  }));
}

export function resolveCategoryPricingFromCategory(category) {
  const normalized = normalizeCategory(category);
  const exact = CATEGORY_PRICING.find((item) => item.category_slugs.map(normalizeCategory).includes(normalized));
  const fuzzy = CATEGORY_PRICING.find((item) => {
    if (normalized.includes("vegetable") || normalized.includes("fruit")) return item.rule_code === "vegetables_fruits_15";
    if (normalized.includes("kirana") || normalized.includes("grocery") || normalized.includes("general")) return item.rule_code === "kirana_general_20";
    if (normalized.includes("restaurant") || normalized.includes("tiffin") || normalized.includes("pharmacy") || normalized.includes("medical")) return item.rule_code === "restaurants_pharmacies_25";
    return false;
  });
  const rule = exact || fuzzy || CATEGORY_PRICING[0];

  return {
    ...rule,
    category_slug: normalized || null,
    pricing_model: "pay_per_order",
    pricing_version: VENDOR_GST_INCLUSIVE_PRICING_VERSION,
    tax_breakup: splitIncludedGst(rule.gross_fee_paise),
    gross_fee_rupees: paiseToRupeeNumber(rule.gross_fee_paise),
  };
}

export async function resolveVendorCategoryPricing(vendorId, placeOfSupply = {}) {
  const { data: vendor, error } = await supabase
    .from("vendors")
    .select("id, category")
    .eq("id", vendorId)
    .maybeSingle();

  if (error && !tableMissing(error)) throw error;
  const rule = resolveCategoryPricingFromCategory(vendor?.category);
  return {
    ...rule,
    vendor_category: vendor?.category || null,
    tax_breakup: splitIncludedGst(rule.gross_fee_paise, {
      vendor_state: placeOfSupply.vendor_state || null,
      customer_state: placeOfSupply.customer_state || null,
    }),
  };
}

export function getMonthlyOrderPlan(planCode) {
  return MONTHLY_ORDER_PLANS.find((plan) => plan.plan_code === planCode) || null;
}

async function getCurrentWallet(vendorId) {
  const { data, error } = await supabase
    .from("vendor_security_wallets")
    .select("id, current_balance, opening_balance, minimum_security_deposit, eligibility_status")
    .eq("vendor_id", vendorId)
    .maybeSingle();

  if (error && !tableMissing(error)) throw error;
  return data || null;
}

async function getCurrentPreference(vendorId) {
  const { data, error } = await supabase
    .from("vendor_pricing_preferences")
    .select("*")
    .eq("vendor_id", vendorId)
    .maybeSingle();

  if (error) {
    if (tableMissing(error)) return null;
    throw error;
  }
  return data || null;
}

async function getCurrentPeriod(vendorId) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("vendor_order_plan_periods")
    .select("*")
    .eq("vendor_id", vendorId)
    .eq("status", "active")
    .lte("period_start", nowIso)
    .gte("period_end", nowIso)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (tableMissing(error)) return null;
    throw error;
  }
  return data || null;
}

export async function getVendorPricingDashboard(vendorId) {
  const [preference, currentPeriod, wallet, categoryPricing] = await Promise.all([
    getCurrentPreference(vendorId),
    getCurrentPeriod(vendorId),
    getCurrentWallet(vendorId),
    resolveVendorCategoryPricing(vendorId),
  ]);

  const currentModel = preference?.pricing_model === "monthly_order_plan" ? "monthly_order_plan" : "pay_per_order";
  const activePlan = currentPeriod ? getMonthlyOrderPlan(currentPeriod.plan_code) : null;
  const acceptedUsed = Number(currentPeriod?.accepted_orders_used || 0);
  const allowance = Number(activePlan?.max_order_allowance || 0);
  const usagePercent = allowance > 0 ? Math.round((acceptedUsed / allowance) * 100) : 0;
  const currentSecurityPaise = rupeeNumberToPaise(wallet?.current_balance);
  const requiredSecurityPaise = Number(activePlan?.required_security_balance_paise || 500000);
  const securityShortfallPaise = Math.max(requiredSecurityPaise - currentSecurityPaise, 0);

  let warningLevel = "none";
  if (currentModel === "monthly_order_plan") {
    if (securityShortfallPaise > 0) warningLevel = "security_topup_required";
    else if (usagePercent >= 100) warningLevel = "allowance_exhausted";
    else if (usagePercent >= 90) warningLevel = "usage_90_percent";
    else if (usagePercent >= 80) warningLevel = "usage_80_percent";
  }

  return {
    current_model: currentModel,
    pay_per_order_fee_paise: categoryPricing.gross_fee_paise,
    pay_per_order_pricing: categoryPricing,
    category_pricing_rules: getCategoryPricingRules(),
    current_plan: activePlan,
    current_period: currentPeriod,
    accepted_orders_used: acceptedUsed,
    accepted_orders_remaining: activePlan ? Math.max(allowance - acceptedUsed, 0) : null,
    usage_percent: usagePercent,
    current_security_balance_paise: currentSecurityPaise,
    required_security_balance_paise: requiredSecurityPaise,
    security_shortfall_paise: securityShortfallPaise,
    wallet_status: wallet?.eligibility_status || null,
    next_pricing_model: preference?.next_pricing_model || null,
    next_plan_code: preference?.next_plan_code || null,
    next_effective_at: preference?.next_effective_at || null,
    warning_level: warningLevel,
    terms_version: preference?.terms_version || VENDOR_MONTHLY_ORDER_PLAN_TERMS_VERSION,
    monthly_order_plans: getMonthlyOrderPlans(),
  };
}

export async function resolveMonthlyOrderPlanItem({ vendorId, planCode }) {
  const plan = getMonthlyOrderPlan(planCode);
  if (!plan) {
    const error = new Error("Monthly order plan is not available.");
    error.statusCode = 404;
    throw error;
  }

  return {
    chargeType: "monthly_order_plan",
    referenceType: "vendor_monthly_order_plans",
    referenceId: plan.plan_code,
    baseAmountPaise: plan.service_fee_before_gst_paise,
    discountAmountPaise: 0,
    taxAmountPaise: plan.gst_amount_paise,
    totalAmountPaise: plan.total_payable_paise,
    currency: "INR",
    title: `${plan.plan_name} monthly accepted-order plan`,
    allocation: {
      vendor_id: vendorId,
      plan,
      billing_cycle: "monthly_order_plan",
      duration_days: 30,
      terms_version: VENDOR_MONTHLY_ORDER_PLAN_TERMS_VERSION,
      covered_orders: plan.max_order_allowance,
      required_security_balance_paise: plan.required_security_balance_paise,
      double_charge_guard: "Covered accepted orders must not be charged the category-based pay-per-order fee.",
    },
  };
}

export async function activateMonthlyOrderPlanFromPayment({ attempt, payment, actorUserId = null }) {
  const plan = getMonthlyOrderPlan(attempt.reference_id || attempt.metadata?.allocation?.plan?.plan_code);
  if (!plan) throw pricingError("Monthly order plan configuration was not found for this payment.", 409);

  const now = new Date();
  const periodStart = now.toISOString();
  const periodEnd = addDays(now, 30).toISOString();

  const previous = await getCurrentPreference(attempt.vendor_id);

  await supabase
    .from("vendor_order_plan_periods")
    .update({ status: "expired", updated_at: now.toISOString() })
    .eq("vendor_id", attempt.vendor_id)
    .eq("status", "active");

  const { data: period, error: periodError } = await supabase
    .from("vendor_order_plan_periods")
    .insert({
      vendor_id: attempt.vendor_id,
      plan_code: plan.plan_code,
      period_start: periodStart,
      period_end: periodEnd,
      accepted_orders_used: 0,
      payment_attempt_id: attempt.id,
      payment_reference: payment?.id || attempt.razorpay_payment_id || null,
      status: "active",
      renewal_due_at: periodEnd,
      non_payment_deadline_at: addDays(new Date(periodEnd), 30).toISOString(),
      metadata: {
        plan,
        razorpay_order_id: attempt.razorpay_order_id,
        invoice_id: attempt.invoice_id || null,
      },
    })
    .select()
    .single();
  if (periodError) throw periodError;

  const { data: preference, error: preferenceError } = await supabase
    .from("vendor_pricing_preferences")
    .upsert({
      vendor_id: attempt.vendor_id,
      pricing_model: "monthly_order_plan",
      current_plan_code: plan.plan_code,
      current_period_id: period.id,
      next_pricing_model: null,
      next_plan_code: null,
      next_effective_at: null,
      status: "active",
      terms_version: attempt.metadata?.allocation?.terms_version || VENDOR_MONTHLY_ORDER_PLAN_TERMS_VERSION,
      terms_language: attempt.metadata?.terms_language || "en",
      terms_accepted_at: attempt.metadata?.terms_accepted_at || now.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: "vendor_id" })
    .select()
    .single();
  if (preferenceError) throw preferenceError;

  await supabase.from("vendor_pricing_change_audit").insert({
    vendor_id: attempt.vendor_id,
    previous_pricing_model: previous?.pricing_model || "pay_per_order",
    previous_plan_code: previous?.current_plan_code || null,
    new_pricing_model: "monthly_order_plan",
    new_plan_code: plan.plan_code,
    requested_at: attempt.created_at || now.toISOString(),
    effective_at: periodStart,
    actor_user_id: actorUserId,
    payment_reference: payment?.id || attempt.razorpay_payment_id || null,
    terms_version: preference.terms_version,
    terms_language: preference.terms_language,
    admin_adjustment: false,
    reason: "vendor_monthly_order_plan_payment_captured",
    metadata: { payment_attempt_id: attempt.id, period_id: period.id },
  });

  return { preference, period, plan };
}

export async function assertVendorOrderPricingEligibility(vendorId) {
  const dashboard = await getVendorPricingDashboard(vendorId);
  if (dashboard.current_model !== "monthly_order_plan") {
    return { ...dashboard, per_order_fee_required: true };
  }

  if (!dashboard.current_plan || !dashboard.current_period) {
    throw pricingError("Monthly order plan is not active. Please renew, upgrade or switch to pay-per-order before receiving new orders.", 403, dashboard);
  }

  if (dashboard.security_shortfall_paise > 0) {
    throw pricingError("Vendor security balance is below the minimum required for the selected monthly plan. Please top up before receiving new orders.", 403, dashboard);
  }

  if (dashboard.accepted_orders_remaining <= 0) {
    throw pricingError("Monthly accepted-order allowance is exhausted. Please upgrade, renew, or switch to category-based pay-per-accepted-order pricing before receiving more orders.", 403, dashboard);
  }

  return { ...dashboard, per_order_fee_required: false, monthly_covered: true };
}

export async function recordMonthlyCoveredOrder({ vendorId, orderId }) {
  const eligibility = await assertVendorOrderPricingEligibility(vendorId);
  if (eligibility.per_order_fee_required) return { covered: false, eligibility };

  const { data: existing, error: existingError } = await supabase
    .from("vendor_order_plan_usage_events")
    .select("id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { covered: true, idempotent: true, eligibility };

  const { data: event, error: eventError } = await supabase
    .from("vendor_order_plan_usage_events")
    .insert({
      vendor_id: vendorId,
      period_id: eligibility.current_period.id,
      order_id: orderId,
      event_type: "accepted_order_covered",
      metadata: {
        plan_code: eligibility.current_plan.plan_code,
        prevented_pay_per_order_fee_paise: eligibility.pay_per_order_fee_paise,
      },
    })
    .select()
    .single();
  if (eventError) throw eventError;

  const { count, error: countError } = await supabase
    .from("vendor_order_plan_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("period_id", eligibility.current_period.id);
  if (countError) throw countError;

  await supabase
    .from("vendor_order_plan_periods")
    .update({ accepted_orders_used: count || 0, updated_at: new Date().toISOString() })
    .eq("id", eligibility.current_period.id);

  return { covered: true, event, accepted_orders_used: count || 0, eligibility };
}
