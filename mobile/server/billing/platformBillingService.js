import axios from "axios";
import { supabase } from "../connection.js";
import { getPaymentReadiness } from "../payments/paymentEnvironment.js";
import { getRazorpayPayment, verifyRazorpaySignature } from "../securityWallet/securityWalletService.js";
import { getVendorOnboardingSummary } from "../vendor/onboardingPolicyService.js";
import { eligibleRevenueFromBillingAttempt, recordPartnerCommissionForVendorRevenue } from "../partner/partnerCommissionService.js";
import {
  activateMonthlyOrderPlanFromPayment,
  getMonthlyOrderPlans,
  getVendorPricingDashboard,
  resolveMonthlyOrderPlanItem,
} from "./vendorPricingPlanService.js";

const SUPPORTED_CHARGE_TYPES = new Set([
  "onboarding",
  "subscription",
  "storage_addon",
  "featured_listing",
  "promotion",
  "premium_service",
  "monthly_order_plan",
]);

const CYCLE_DAYS = {
  monthly: 30,
  quarterly: 90,
  annual: 365,
};

function paiseFromRupees(value) {
  return Math.round(Number(value || 0) * 100);
}

function rupeesFromPaise(value) {
  return Number(value || 0) / 100;
}

function taxAmount(basePaise, taxRatePercent) {
  return Math.round(Number(basePaise || 0) * Number(taxRatePercent || 0) / 100);
}

function addDays(date, days) {
  return new Date(date.getTime() + Number(days || 0) * 24 * 60 * 60 * 1000);
}

function receiptFor(chargeType) {
  return `SSL-${String(chargeType || "BILL").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)}-${Date.now()}`.slice(0, 40);
}

function legacyVendorPaymentChargeType(chargeType) {
  if (chargeType === "storage_addon") return "additional_storage_purchase";
  if (chargeType === "subscription") return "subscription_payment";
  if (chargeType === "monthly_order_plan") return "subscription_payment";
  if (["featured_listing", "promotion", "premium_service"].includes(chargeType)) return "featured_listing_payment";
  return chargeType;
}

function basicAuth() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    const error = new Error("Razorpay keys are not configured.");
    error.statusCode = 500;
    throw error;
  }
  return Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
}

async function getVendor(vendorId) {
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", vendorId)
    .single();
  if (error || !data) {
    const err = new Error("Vendor profile was not found.");
    err.statusCode = 404;
    throw err;
  }
  return data;
}

export async function assertVendorBillingAccess({ vendorId, auth }) {
  if (!auth?.user_id) {
    const error = new Error("Authentication is required.");
    error.statusCode = 401;
    throw error;
  }
  const vendor = await getVendor(vendorId);
  const role = auth.role;
  const admin = ["admin", "company_admin", "super_admin", "finance"].includes(String(role || ""));
  if (!admin && vendor.owner_user_id !== auth.user_id) {
    const error = new Error("You can access only your own vendor billing account.");
    error.statusCode = 403;
    throw error;
  }
  return vendor;
}

async function resolveOnboardingItem({ vendorId }) {
  // Keep database RPC as the authoritative production source where available, but use
  // the onboarding policy resolver because it safely maps labels like "Vegetable Shops"
  // to the configured "vegetables" fee rule instead of returning a zero/null payable.
  const value = await getVendorOnboardingSummary(vendorId);
  const onboardingFeePaise = paiseFromRupees(value.onboarding_fee);
  const securityDepositPaise = paiseFromRupees(value.security_deposit);
  const taxPaise = paiseFromRupees(value.tax_amount);
  const totalAmountPaise = paiseFromRupees(value.total_payable);

  if (totalAmountPaise <= 0 || value.pricing_configured === false) {
    const error = new Error("Vendor onboarding payment configuration is missing.");
    error.statusCode = 409;
    throw error;
  }

  return {
    chargeType: "onboarding_fee",
    referenceType: "vendor_onboarding",
    referenceId: null,
    baseAmountPaise: onboardingFeePaise + securityDepositPaise,
    discountAmountPaise: 0,
    taxAmountPaise: taxPaise,
    totalAmountPaise,
    currency: value.currency || "INR",
    title: "Vendor onboarding fee and refundable security deposit",
    allocation: {
      onboarding_fee_paise: onboardingFeePaise,
      security_deposit_paise: securityDepositPaise,
      security_deposit_refundable: value.security_deposit_refundable !== false,
      onboarding_fee_refundable: Boolean(value.onboarding_fee_refundable),
      category_slug: value.category_slug,
      fee_rule_id: value.fee_rule_id || null,
      pricing_source: value.pricing_source || "onboarding_policy_service",
    },
  };
}

async function resolveSubscriptionItem({ referenceId, billingCycle = "monthly" }) {
  const { data: plan, error } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("id", referenceId)
    .eq("is_active", true)
    .single();
  if (error || !plan) {
    const err = new Error("Subscription plan is not available.");
    err.statusCode = 404;
    throw err;
  }
  const cycle = CYCLE_DAYS[billingCycle] ? billingCycle : "monthly";
  const pricePaise = Number(plan[`${cycle}_price_paise`] || 0);
  const taxPaise = taxAmount(pricePaise, plan.tax_rate_percent);
  return {
    chargeType: "subscription",
    referenceType: "subscription_plans",
    referenceId: plan.id,
    baseAmountPaise: pricePaise,
    discountAmountPaise: 0,
    taxAmountPaise: taxPaise,
    totalAmountPaise: pricePaise + taxPaise,
    currency: "INR",
    title: `${plan.plan_name} subscription (${cycle})`,
    allocation: { plan, billing_cycle: cycle, duration_days: CYCLE_DAYS[cycle] },
  };
}

async function resolveStorageItem({ referenceId }) {
  const { data: plan, error } = await supabase
    .from("vendor_storage_plans")
    .select("*")
    .eq("id", referenceId)
    .eq("is_active", true)
    .single();
  if (error || !plan) {
    const err = new Error("Storage plan is not available.");
    err.statusCode = 404;
    throw err;
  }
  const base = paiseFromRupees(plan.price_inr);
  return {
    chargeType: "storage_addon",
    referenceType: "vendor_storage_plans",
    referenceId: plan.id,
    baseAmountPaise: base,
    discountAmountPaise: 0,
    taxAmountPaise: 0,
    totalAmountPaise: base,
    currency: "INR",
    title: `Additional storage ${plan.title}`,
    allocation: { plan },
  };
}

async function resolveBillingProductItem({ chargeType, referenceId }) {
  const query = supabase
    .from("billing_products")
    .select("*")
    .eq("is_active", true);
  const { data: product, error } = referenceId
    ? await query.eq("id", referenceId).single()
    : await query.eq("charge_type", chargeType).eq("visibility", "vendor_visible").order("created_at").limit(1).single();
  if (error || !product) {
    const err = new Error("Billing product is not available.");
    err.statusCode = 404;
    throw err;
  }
  const base = Number(product.base_amount_paise || 0);
  const tax = taxAmount(base, product.tax_rate_percent);
  return {
    chargeType: product.charge_type,
    referenceType: "billing_products",
    referenceId: product.id,
    baseAmountPaise: base,
    discountAmountPaise: 0,
    taxAmountPaise: tax,
    totalAmountPaise: base + tax,
    currency: product.currency || "INR",
    title: product.title,
    allocation: { product },
  };
}

export async function resolveBillingItem({ vendorId, chargeType, referenceId, billingCycle }) {
  if (!SUPPORTED_CHARGE_TYPES.has(chargeType)) {
    const error = new Error("Unsupported platform billing charge type.");
    error.statusCode = 400;
    throw error;
  }
  if (chargeType === "onboarding") return resolveOnboardingItem({ vendorId });
  if (chargeType === "subscription") return resolveSubscriptionItem({ referenceId, billingCycle });
  if (chargeType === "monthly_order_plan") return resolveMonthlyOrderPlanItem({ vendorId, planCode: referenceId });
  if (chargeType === "storage_addon") return resolveStorageItem({ referenceId });
  return resolveBillingProductItem({ chargeType, referenceId });
}

export async function createPlatformBillingOrder({ vendorId, auth, chargeType, referenceId, billingCycle, couponCode }) {
  const vendor = await assertVendorBillingAccess({ vendorId, auth });
  if (chargeType === "onboarding" && !["kyc_verified", "kyc_provisionally_cleared", "provisional_approved"].includes(String(vendor.kyc_status || "").toLowerCase())) {
    const error = new Error("Complete KYC approval or provisional KYC clearance before paying onboarding charges.");
    error.statusCode = 409;
    throw error;
  }
  const item = await resolveBillingItem({ vendorId, chargeType, referenceId, billingCycle, couponCode });
  if (item.totalAmountPaise <= 0 && item.chargeType !== "subscription") {
    const error = new Error("This billing item has no payable amount.");
    error.statusCode = 400;
    throw error;
  }

  const idempotencyKey = [
    vendorId,
    item.chargeType,
    item.referenceType || "none",
    item.referenceId || "none",
    item.allocation.billing_cycle || "once",
    item.totalAmountPaise,
  ].join(":");

  const { data: existing } = await supabase
    .from("vendor_payment_attempts")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .in("payment_status", ["created", "pending", "authorized"])
    .maybeSingle();
  if (existing?.razorpay_order_id) {
    const { data: existingOrder } = await supabase
      .from("razorpay_orders")
      .select("*")
      .eq("attempt_id", existing.id)
      .maybeSingle();
    return {
      attempt: existing,
      razorpay_order: existingOrder?.raw_response || { id: existing.razorpay_order_id, amount: existing.total_amount_paise, currency: existing.currency },
      key_id: process.env.RAZORPAY_KEY_ID,
      reused: true,
    };
  }

  const { data: attempt, error: attemptError } = await supabase
    .from("vendor_payment_attempts")
    .insert({
      vendor_id: vendorId,
      charge_type: item.chargeType,
      reference_type: item.referenceType,
      reference_id: item.referenceId,
      base_amount_paise: item.baseAmountPaise,
      discount_amount_paise: item.discountAmountPaise,
      tax_amount_paise: item.taxAmountPaise,
      total_amount_paise: item.totalAmountPaise,
      currency: item.currency,
      payment_status: "created",
      idempotency_key: idempotencyKey,
      metadata: {
        title: item.title,
        allocation: item.allocation,
        customer_order_payment: false,
        payment_scope: "vendor_to_sabsewa_platform_payment",
      },
    })
    .select()
    .single();
  if (attemptError) throw attemptError;

  const receipt = receiptFor(item.chargeType);
  const readiness = getPaymentReadiness();
  const { data: razorpayOrder } = await axios.post(
    "https://api.razorpay.com/v1/orders",
    {
      amount: item.totalAmountPaise,
      currency: item.currency,
      receipt,
      notes: {
        application: "sabsewa_local",
        payment_scope: "vendor_to_sabsewa_platform_payment",
        customer_order_payment: "false",
        vendor_id: vendor.public_vendor_id || vendorId,
        internal_vendor_id: vendorId,
        attempt_id: attempt.id,
        charge_type: item.chargeType,
        reference_type: item.referenceType || "",
        reference_id: item.referenceId || "",
        environment: readiness.mode,
      },
    },
    {
      headers: {
        Authorization: `Basic ${basicAuth()}`,
        "Content-Type": "application/json",
      },
    }
  );

  const { data: updatedAttempt, error: updateError } = await supabase
    .from("vendor_payment_attempts")
    .update({
      payment_status: "pending",
      razorpay_order_id: razorpayOrder.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attempt.id)
    .select()
    .single();
  if (updateError) throw updateError;

  await supabase.from("razorpay_orders").insert({
    vendor_id: vendorId,
    attempt_id: attempt.id,
    razorpay_order_id: razorpayOrder.id,
    amount_paise: item.totalAmountPaise,
    currency: item.currency,
    receipt,
    order_status: razorpayOrder.status || "created",
    notes: razorpayOrder.notes || {},
    raw_response: razorpayOrder,
  });

  await auditBilling({
    vendorId,
    actorUserId: auth.user_id,
    actorRole: auth.role,
    entityType: "vendor_payment_attempts",
    entityId: attempt.id,
    action: "platform_payment_order_created",
    afterData: updatedAttempt,
    metadata: { charge_type: item.chargeType, razorpay_order_id: razorpayOrder.id },
  });

  return {
    attempt: updatedAttempt,
    razorpay_order: razorpayOrder,
    key_id: process.env.RAZORPAY_KEY_ID,
    payment_environment: readiness,
    summary: item,
  };
}

async function recordPartnerCommissionFromBillingAttempt({ attempt, payment, source }) {
  try {
    const eligibleRevenue = eligibleRevenueFromBillingAttempt(attempt);
    return await recordPartnerCommissionForVendorRevenue({
      vendorId: attempt.vendor_id,
      sourceType: source || "platform_billing",
      sourceId: attempt.id,
      paymentReference: payment?.id || attempt.razorpay_payment_id || attempt.razorpay_order_id || attempt.id,
      grossRevenue: eligibleRevenue,
      gstAmount: 0,
      metadata: {
        charge_type: attempt.charge_type,
        reference_type: attempt.reference_type || null,
        reference_id: attempt.reference_id || null,
        razorpay_order_id: payment?.order_id || attempt.razorpay_order_id || null,
        razorpay_payment_id: payment?.id || attempt.razorpay_payment_id || null,
      },
    });
  } catch (error) {
    console.error("Partner commission creation failed for platform billing", {
      vendor_id: attempt?.vendor_id,
      attempt_id: attempt?.id,
      message: error?.message || String(error),
    });
    return { error: error?.message || String(error) };
  }
}

async function auditBilling({ vendorId, actorUserId, actorRole, entityType, entityId, action, beforeData = null, afterData = null, metadata = {} }) {
  await supabase.from("billing_audit_logs").insert({
    vendor_id: vendorId,
    actor_user_id: actorUserId || null,
    actor_role: actorRole || null,
    entity_type: entityType,
    entity_id: entityId || null,
    action,
    before_data: beforeData,
    after_data: afterData,
    metadata,
  });
}

async function nextInvoiceNumber() {
  const { data, error } = await supabase.rpc("next_vendor_invoice_number");
  if (error) throw error;
  return data;
}

async function createInvoice({ attempt, vendor, payment }) {
  const invoiceNumber = await nextInvoiceNumber();
  const refundable = attempt.charge_type === "security_deposit" || attempt.charge_type === "storage_addon" ? "refundable_policy_applies" : "non_refundable";
  const { data: invoice, error } = await supabase
    .from("vendor_invoices")
    .insert({
      vendor_id: attempt.vendor_id,
      invoice_number: invoiceNumber,
      invoice_type: "receipt",
      vendor_name: vendor.owner_name || vendor.vendor_name || null,
      shop_name: vendor.shop_name || null,
      billing_address: {
        address: vendor.address || null,
        city: vendor.city || vendor.city_code || null,
        locality: vendor.locality || vendor.locality_code || null,
      },
      charge_type: attempt.charge_type,
      reference_type: attempt.reference_type,
      reference_id: attempt.reference_id,
      base_amount_paise: Number(attempt.base_amount_paise || 0),
      discount_amount_paise: Number(attempt.discount_amount_paise || 0),
      tax_amount_paise: Number(attempt.tax_amount_paise || 0),
      total_amount_paise: Number(attempt.total_amount_paise || 0),
      currency: attempt.currency || "INR",
      razorpay_payment_id: payment.id,
      payment_status: "captured",
      refundable_classification: refundable,
      invoice_payload: {
        razorpay_order_id: payment.order_id,
        razorpay_payment_id: payment.id,
        method: payment.method,
        payment_status: payment.status,
        amount_rupees: rupeesFromPaise(attempt.total_amount_paise),
        customer_order_payment: false,
      },
    })
    .select()
    .single();
  if (error) throw error;
  return invoice;
}

async function activateOnboarding({ attempt, payment }) {
  const { data, error } = await supabase.rpc("record_vendor_onboarding_payment", {
    p_vendor_id: attempt.vendor_id,
    p_gateway_order_id: payment.order_id,
    p_gateway_payment_id: payment.id,
    p_gateway_signature: attempt.razorpay_signature || null,
    p_metadata: {
      billing_attempt_id: attempt.id,
      payment_scope: "vendor_to_sabsewa_platform_payment",
    },
  });
  if (error) throw error;

  const securityDepositPaise = Number(attempt.metadata?.allocation?.security_deposit_paise || 0);
  if (securityDepositPaise > 0) {
    await supabase.from("vendor_security_deposits").upsert({
      vendor_id: attempt.vendor_id,
      deposit_amount_paise: securityDepositPaise,
      amount_held_paise: securityDepositPaise,
      deposit_status: "held",
      payment_id: attempt.id,
      razorpay_payment_id: payment.id,
      paid_at: new Date().toISOString(),
      metadata: { source: "onboarding_payment", billing_attempt_id: attempt.id },
    }, { onConflict: "vendor_id" });
  }
  return data;
}

async function activateSubscription({ attempt }) {
  const plan = attempt.metadata?.allocation?.plan;
  const billingCycle = attempt.metadata?.allocation?.billing_cycle || "monthly";
  const days = Number(attempt.metadata?.allocation?.duration_days || CYCLE_DAYS[billingCycle] || 30);
  const now = new Date();
  const expiresAt = addDays(now, days);
  const graceDays = Number(plan?.grace_period_days || 7);
  const { data, error } = await supabase
    .from("vendor_subscriptions")
    .upsert({
      vendor_id: attempt.vendor_id,
      plan_id: plan?.id || attempt.reference_id,
      subscription_status: "active",
      billing_cycle: billingCycle,
      starts_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      grace_ends_at: addDays(expiresAt, graceDays).toISOString(),
      auto_renewal_enabled: false,
      last_payment_id: attempt.id,
      metadata: {
        activated_from_attempt_id: attempt.id,
        product_listing_limit: plan?.product_listing_limit || null,
        storage_allowance_bytes: plan?.storage_allowance_bytes || null,
      },
      updated_at: now.toISOString(),
    }, { onConflict: "vendor_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function activateStorage({ attempt, payment }) {
  const plan = attempt.metadata?.allocation?.plan;
  const { data: existing } = await supabase
    .from("vendor_storage_purchases")
    .select("*")
    .eq("vendor_id", attempt.vendor_id)
    .eq("payment_reference", payment.id)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabase
    .from("vendor_storage_purchases")
    .insert({
      vendor_id: attempt.vendor_id,
      plan_id: plan?.id || attempt.reference_id,
      quota_bytes: Number(plan?.quota_bytes || 0),
      amount_inr: rupeesFromPaise(attempt.total_amount_paise),
      payment_gateway: "razorpay",
      payment_status: "paid",
      payment_reference: payment.id,
      activated_at: new Date().toISOString(),
      metadata: { billing_attempt_id: attempt.id, razorpay_order_id: payment.order_id },
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function activatePromotion({ attempt }) {
  const product = attempt.metadata?.allocation?.product || {};
  const now = new Date();
  const days = Number(product.validity_days || 7);
  const { data, error } = await supabase
    .from("vendor_promotions")
    .insert({
      vendor_id: attempt.vendor_id,
      promotion_type: product.charge_type || attempt.charge_type,
      starts_at: now.toISOString(),
      ends_at: addDays(now, days).toISOString(),
      promotion_status: "active",
      price_paise: Number(attempt.total_amount_paise || 0),
      payment_attempt_id: attempt.id,
      metadata: { product_code: product.product_code, title: product.title },
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function activateService({ attempt, payment }) {
  if (attempt.charge_type === "onboarding_fee") return activateOnboarding({ attempt, payment });
  if (attempt.charge_type === "subscription") return activateSubscription({ attempt });
  if (attempt.charge_type === "monthly_order_plan") return activateMonthlyOrderPlanFromPayment({ attempt, payment });
  if (attempt.charge_type === "storage_addon") return activateStorage({ attempt, payment });
  if (["featured_listing", "promotion", "premium_service"].includes(attempt.charge_type)) return activatePromotion({ attempt });
  return null;
}

export async function verifyPlatformBillingPayment({ vendorId, auth, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const vendor = await assertVendorBillingAccess({ vendorId, auth });
  if (!verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature })) {
    const error = new Error("Invalid Razorpay signature.");
    error.statusCode = 400;
    throw error;
  }

  const { data: attempt, error: attemptError } = await supabase
    .from("vendor_payment_attempts")
    .select("*")
    .eq("vendor_id", vendorId)
    .eq("razorpay_order_id", razorpayOrderId)
    .single();
  if (attemptError || !attempt) {
    const error = new Error("Billing payment attempt was not found.");
    error.statusCode = 404;
    throw error;
  }
  if (attempt.payment_status === "captured") {
    return { attempt, idempotent: true, message: "Payment was already verified and processed." };
  }

  const payment = await getRazorpayPayment(razorpayPaymentId);
  if (payment.order_id !== razorpayOrderId) {
    const error = new Error("Razorpay order mismatch.");
    error.statusCode = 400;
    throw error;
  }
  if (Number(payment.amount || 0) !== Number(attempt.total_amount_paise || 0)) {
    const error = new Error("Razorpay amount mismatch.");
    error.statusCode = 400;
    throw error;
  }
  if (!["captured", "authorized"].includes(payment.status)) {
    await supabase.from("vendor_payment_attempts").update({
      payment_status: payment.status === "failed" ? "failed" : "pending",
      failure_reason: `Razorpay payment is ${payment.status}.`,
      updated_at: new Date().toISOString(),
    }).eq("id", attempt.id);
    const error = new Error(`Razorpay payment is ${payment.status}.`);
    error.statusCode = 400;
    throw error;
  }

  const readiness = getPaymentReadiness();
  if (!readiness.live_payments_enabled) {
    const { data: testAttempt } = await supabase
      .from("vendor_payment_attempts")
      .update({
        payment_status: "authorized",
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature,
        signature_verified: true,
        metadata: {
          ...(attempt.metadata || {}),
          test_mode_no_activation: true,
          readiness_snapshot: readiness,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id)
      .select()
      .single();
    return { attempt: testAttempt, test_mode: true, payment_environment: readiness, message: readiness.payment_message };
  }

  const invoice = await createInvoice({ attempt, vendor, payment });
  const activation = await activateService({ attempt: { ...attempt, invoice_id: invoice.id, razorpay_signature: razorpaySignature }, payment });

  const { data: updatedAttempt, error: updateError } = await supabase
    .from("vendor_payment_attempts")
    .update({
      payment_status: "captured",
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
      signature_verified: true,
      invoice_id: invoice.id,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", attempt.id)
    .select()
    .single();
  if (updateError) throw updateError;

  await supabase.from("vendor_payments").upsert({
    vendor_id: vendorId,
    category_slug: vendor.category || null,
    charge_type: legacyVendorPaymentChargeType(attempt.charge_type),
    reference_type: attempt.reference_type,
    reference_id: attempt.reference_id,
    base_amount: rupeesFromPaise(attempt.base_amount_paise),
    tax_amount: rupeesFromPaise(attempt.tax_amount_paise),
    total_amount: rupeesFromPaise(attempt.total_amount_paise),
    base_amount_paise: Number(attempt.base_amount_paise || 0),
    discount_amount_paise: Number(attempt.discount_amount_paise || 0),
    tax_amount_paise: Number(attempt.tax_amount_paise || 0),
    total_amount_paise: Number(attempt.total_amount_paise || 0),
    payment_gateway: "razorpay",
    gateway_order_id: razorpayOrderId,
    gateway_payment_id: razorpayPaymentId,
    gateway_signature: razorpaySignature,
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    payment_status: "paid",
    payment_date: new Date().toISOString(),
    paid_at: new Date().toISOString(),
    refundable: attempt.charge_type === "security_deposit",
    receipt_number: invoice.invoice_number,
    invoice_id: invoice.id,
    signature_verified: true,
    idempotency_key: `billing:${attempt.id}`,
    metadata: { billing_attempt_id: attempt.id, customer_order_payment: false },
  }, { onConflict: "idempotency_key" });

  const partnerCommission = await recordPartnerCommissionFromBillingAttempt({ attempt: updatedAttempt, payment, source: "platform_billing_payment" });

  await auditBilling({
    vendorId,
    actorUserId: auth.user_id,
    actorRole: auth.role,
    entityType: "vendor_payment_attempts",
    entityId: attempt.id,
    action: "platform_payment_verified_and_activated",
    afterData: updatedAttempt,
    metadata: { invoice_id: invoice.id, activation, partner_commission: partnerCommission },
  });

  return { attempt: updatedAttempt, invoice, activation, payment_environment: readiness };
}

export async function processCapturedPlatformBillingWebhookPayment({ payment }) {
  const { data: attempt, error: attemptError } = await supabase
    .from("vendor_payment_attempts")
    .select("*")
    .eq("razorpay_order_id", payment.order_id)
    .maybeSingle();
  if (attemptError) throw attemptError;
  if (!attempt) return { matched: false };
  if (attempt.payment_status === "captured") {
    return { matched: true, idempotent: true, attempt };
  }
  if (Number(payment.amount || 0) !== Number(attempt.total_amount_paise || 0)) {
    await supabase
      .from("vendor_payment_attempts")
      .update({
        payment_status: "failed",
        failure_reason: "Webhook amount mismatch.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id);
    return { matched: true, failed: true, reason: "amount_mismatch", attempt };
  }

  const readiness = getPaymentReadiness();
  if (!readiness.live_payments_enabled) {
    const { data: testAttempt } = await supabase
      .from("vendor_payment_attempts")
      .update({
        payment_status: "authorized",
        razorpay_payment_id: payment.id,
        signature_verified: true,
        metadata: {
          ...(attempt.metadata || {}),
          test_mode_no_activation: true,
          readiness_snapshot: readiness,
          webhook_captured: true,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id)
      .select()
      .single();
    return { matched: true, test_mode: true, attempt: testAttempt };
  }

  const vendor = await getVendor(attempt.vendor_id);
  const invoice = await createInvoice({ attempt, vendor, payment });
  const activation = await activateService({ attempt: { ...attempt, invoice_id: invoice.id }, payment });

  const { data: updatedAttempt, error: updateError } = await supabase
    .from("vendor_payment_attempts")
    .update({
      payment_status: "captured",
      razorpay_payment_id: payment.id,
      signature_verified: true,
      invoice_id: invoice.id,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", attempt.id)
    .select()
    .single();
  if (updateError) throw updateError;

  await supabase.from("vendor_payments").upsert({
    vendor_id: attempt.vendor_id,
    category_slug: vendor.category || null,
    charge_type: legacyVendorPaymentChargeType(attempt.charge_type),
    reference_type: attempt.reference_type,
    reference_id: attempt.reference_id,
    base_amount: rupeesFromPaise(attempt.base_amount_paise),
    tax_amount: rupeesFromPaise(attempt.tax_amount_paise),
    total_amount: rupeesFromPaise(attempt.total_amount_paise),
    base_amount_paise: Number(attempt.base_amount_paise || 0),
    discount_amount_paise: Number(attempt.discount_amount_paise || 0),
    tax_amount_paise: Number(attempt.tax_amount_paise || 0),
    total_amount_paise: Number(attempt.total_amount_paise || 0),
    payment_gateway: "razorpay",
    gateway_order_id: payment.order_id,
    gateway_payment_id: payment.id,
    razorpay_order_id: payment.order_id,
    razorpay_payment_id: payment.id,
    payment_status: "paid",
    payment_date: new Date().toISOString(),
    paid_at: new Date().toISOString(),
    refundable: attempt.charge_type === "security_deposit",
    receipt_number: invoice.invoice_number,
    invoice_id: invoice.id,
    signature_verified: true,
    idempotency_key: `billing:${attempt.id}`,
    metadata: { billing_attempt_id: attempt.id, customer_order_payment: false, processed_by: "razorpay_webhook" },
  }, { onConflict: "idempotency_key" });

  const partnerCommission = await recordPartnerCommissionFromBillingAttempt({ attempt: updatedAttempt, payment, source: "platform_billing_webhook" });

  await auditBilling({
    vendorId: attempt.vendor_id,
    entityType: "vendor_payment_attempts",
    entityId: attempt.id,
    action: "platform_payment_webhook_activated",
    afterData: updatedAttempt,
    metadata: { invoice_id: invoice.id, activation, partner_commission: partnerCommission },
  });

  return { matched: true, attempt: updatedAttempt, invoice, activation };
}

export async function getVendorBillingDashboard({ vendorId, auth }) {
  const vendor = await assertVendorBillingAccess({ vendorId, auth });
  const [
    { data: subscription },
    { data: plans },
    { data: products },
    { data: storagePlans },
    { data: attempts },
    { data: invoices },
    { data: deposits },
    { data: promotions },
    onboarding,
    { data: storageUsage },
  ] = await Promise.all([
    supabase.from("vendor_subscriptions").select("*, plan:subscription_plans(*)").eq("vendor_id", vendorId).maybeSingle(),
    supabase.from("subscription_plans").select("*").eq("is_active", true).eq("is_public", true).order("sort_order"),
    supabase.from("billing_products").select("*").eq("is_active", true).eq("visibility", "vendor_visible").order("created_at"),
    supabase.from("vendor_storage_plans").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("vendor_payment_attempts").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false }).limit(100),
    supabase.from("vendor_invoices").select("*").eq("vendor_id", vendorId).order("issued_at", { ascending: false }).limit(100),
    supabase.from("vendor_security_deposits").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false }).limit(5),
    supabase.from("vendor_promotions").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false }).limit(50),
    supabase.rpc("vendor_onboarding_payment_summary", { p_vendor_id: vendorId }),
    supabase.from("vendor_storage_usage").select("*").eq("vendor_id", vendorId).maybeSingle(),
  ]);

  const sub = subscription || null;
  const expiresAt = sub?.expires_at ? new Date(sub.expires_at) : null;
  const daysRemaining = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
  const pricingModel = await getVendorPricingDashboard(vendorId);

  return {
    vendor: {
      id: vendor.id,
      public_vendor_id: vendor.public_vendor_id,
      shop_name: vendor.shop_name,
      status: vendor.status,
      kyc_status: vendor.kyc_status,
      onboarding_payment_status: vendor.onboarding_payment_status,
    },
    onboarding: onboarding.data || null,
    current_subscription: sub ? { ...sub, days_remaining: daysRemaining } : null,
    pricing_model: pricingModel,
    monthly_order_plans: getMonthlyOrderPlans(),
    available_plans: plans || [],
    storage_plans: storagePlans || [],
    billing_products: products || [],
    payment_history: attempts || [],
    invoices: invoices || [],
    security_deposits: deposits || [],
    promotions: promotions || [],
    storage_usage: storageUsage || null,
    customer_payment_policy: "Customer product-order payments are direct customer-to-vendor payments and are not collected by SabSewa Local Razorpay.",
  };
}

export async function getInvoiceDocument({ vendorId, invoiceId, auth }) {
  await assertVendorBillingAccess({ vendorId, auth });
  const { data: invoice, error } = await supabase
    .from("vendor_invoices")
    .select("*")
    .eq("vendor_id", vendorId)
    .eq("id", invoiceId)
    .single();
  if (error || !invoice) {
    const err = new Error("Invoice was not found.");
    err.statusCode = 404;
    throw err;
  }
  return invoice;
}

