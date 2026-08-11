import { supabase } from "../connection.js";

const DEFAULT_BENEFIT_PERCENT = 10;

function clean(value) {
  return String(value || "").trim();
}

function toMoney(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function rupeesFromPaise(value) {
  return toMoney(Number(value || 0) / 100);
}

function monthBounds(date = new Date()) {
  const d = new Date(date);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return {
    period_start: start.toISOString().slice(0, 10),
    period_end: end.toISOString().slice(0, 10),
  };
}

async function fetchReferral(vendorId) {
  const { data, error } = await supabase
    .from("partner_referred_vendors")
    .select("*, partner_applications(id, partner_id, referral_code, applicant_name, status, revenue_share_percent)")
    .eq("vendor_id", vendorId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.partner_application_id) return null;
  const partner = data.partner_applications || {};
  if (String(partner.status || "").toLowerCase() !== "active") return null;
  return { referral: data, partner };
}

async function existingCommission({ partnerApplicationId, vendorId, paymentReference, sourceType, sourceId }) {
  if (!partnerApplicationId || !vendorId) return null;
  try {
    let query = supabase
      .from("partner_commission_events")
      .select("id, status")
      .eq("partner_application_id", partnerApplicationId)
      .eq("vendor_id", vendorId);

    if (paymentReference) query = query.eq("payment_reference", paymentReference);
    else if (sourceType && sourceId) query = query.eq("source_type", sourceType).eq("source_id", sourceId);
    else return null;

    const { data, error } = await query.maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

async function insertCommission(payload) {
  const { data, error } = await supabase
    .from("partner_commission_events")
    .insert(payload)
    .select()
    .single();

  if (!error) return data;

  // Compatibility fallback for databases where optional tracking columns are not yet migrated.
  const fallback = { ...payload };
  delete fallback.referral_code;
  delete fallback.payment_reference;
  delete fallback.source_type;
  delete fallback.source_id;
  delete fallback.metadata;

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("partner_commission_events")
    .insert(fallback)
    .select()
    .single();

  if (fallbackError) throw error;
  return fallbackData;
}

export function eligibleRevenueFromBillingAttempt(attempt) {
  if (!attempt) return 0;

  // Partner benefit is on eligible company revenue only. It excludes GST and refundable security deposit.
  if (attempt.charge_type === "onboarding_fee") {
    const onboardingFeePaise = Number(attempt.metadata?.allocation?.onboarding_fee_paise || 0);
    if (onboardingFeePaise > 0) return rupeesFromPaise(onboardingFeePaise);
  }

  return rupeesFromPaise(attempt.base_amount_paise);
}

export async function recordPartnerCommissionForVendorRevenue({
  vendorId,
  sourceType,
  sourceId,
  paymentReference,
  grossRevenue,
  gstAmount = 0,
  paymentGatewayCharges = 0,
  metadata = {},
}) {
  const eligibleGross = toMoney(grossRevenue);
  if (!vendorId || eligibleGross <= 0) {
    return { skipped: true, reason: "no_eligible_revenue" };
  }

  const found = await fetchReferral(vendorId);
  if (!found) return { skipped: true, reason: "no_active_partner_referral" };

  const { referral, partner } = found;
  const existing = await existingCommission({
    partnerApplicationId: partner.id,
    vendorId,
    paymentReference,
    sourceType,
    sourceId,
  });
  if (existing) return { skipped: true, idempotent: true, existing };

  const commissionPercent = Number(referral.benefit_percent || partner.revenue_share_percent || DEFAULT_BENEFIT_PERCENT);
  const periods = monthBounds();
  const referralCode = clean(referral.referral_code || partner.referral_code || partner.partner_id);

  const event = await insertCommission({
    partner_application_id: partner.id,
    vendor_id: vendorId,
    gross_revenue: eligibleGross,
    gst_amount: toMoney(gstAmount),
    payment_gateway_charges: toMoney(paymentGatewayCharges),
    commission_percent: commissionPercent,
    status: "calculated",
    period_start: periods.period_start,
    period_end: periods.period_end,
    referral_code: referralCode || null,
    payment_reference: paymentReference || null,
    source_type: sourceType || null,
    source_id: sourceId ? String(sourceId) : null,
    metadata: {
      ...(metadata || {}),
      generated_by: "sabsewa_partner_commission_service",
      eligible_revenue_rule: "company revenue only; excludes GST, refundable security deposit, refunds, and pass-through charges",
    },
  });

  try {
    await supabase
      .from("partner_referred_vendors")
      .update({
        eligible_revenue_amount: toMoney(Number(referral.eligible_revenue_amount || 0) + eligibleGross),
        referral_status: "commission_eligible",
        vendor_activation_date: referral.vendor_activation_date || new Date().toISOString(),
      })
      .eq("id", referral.id);
  } catch (error) {
    console.warn("Partner referral revenue rollup update failed", {
      vendor_id: vendorId,
      referral_id: referral.id,
      message: error?.message || String(error),
    });
  }

  return { success: true, commission_event: event };
}
