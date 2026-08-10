import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

const DEFAULT_BENEFIT_PERCENT = 10;
const PARTNER_TERMS_VERSION = "partner-program-local-2026-08-10";

function clean(value) {
  return String(value || "").trim();
}

function normalizePhone(value) {
  return clean(value).replace(/\D/g, "");
}

function publicApplication(application) {
  if (!application) return null;
  return {
    id: application.id,
    application_id: application.application_id || application.partner_id || `SSL-P-${String(application.id || "").slice(0, 8).toUpperCase()}`,
    partner_id: application.partner_id || null,
    referral_code: application.referral_code || null,
    applicant_name: application.applicant_name,
    phone: application.phone,
    email: application.email || null,
    city: application.city,
    district: application.district || null,
    state: application.state,
    proposed_area_of_operation: application.proposed_area_of_operation || application.coverage_area || null,
    status: application.status || "pending",
    submitted_at: application.submitted_at || application.created_at,
    active_at: application.active_at || null,
    approved_at: application.approved_at || null,
  };
}

async function findExistingByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const { data, error } = await supabase
    .from("partner_applications")
    .select("*")
    .or(`phone.eq.${phone},phone.eq.${normalized}`)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data || []).find((item) => normalizePhone(item.phone) === normalized) || null;
}

router.post("/applications", async (req, res) => {
  try {
    const body = req.body || {};
    const phone = clean(body.phone);
    const required = [
      body.applicant_name,
      body.partner_type,
      phone,
      body.city,
      body.district,
      body.state,
      body.proposed_area_of_operation,
      body.experience_summary,
      body.vendor_onboarding_plan,
      body.customer_awareness_plan,
    ];

    if (required.some((value) => !clean(value))) {
      return res.status(400).json({ success: false, error: "Please fill all mandatory Partner Application fields." });
    }

    if (!body.terms_accepted) {
      return res.status(400).json({ success: false, error: "Partner Program Terms must be accepted before submission." });
    }

    const existing = await findExistingByPhone(phone);
    if (existing) {
      return res.status(200).json({
        success: true,
        duplicate: true,
        message: "A Partner Application already exists for this mobile number.",
        application: publicApplication(existing),
      });
    }

    const acceptanceSummary =
      "Applicant accepted open-to-everyone Partner Program terms, vendor onboarding and local customer awareness responsibilities, independent associate status, no employment/equity rights, configurable benefit initially 10%, eligible-revenue exclusions and company review rights.";

    const payload = {
      applicant_name: clean(body.applicant_name),
      partner_type: clean(body.partner_type),
      applicant_category: clean(body.partner_type),
      organization_name: clean(body.organization_name) || null,
      phone,
      email: clean(body.email) ? clean(body.email).toLowerCase() : null,
      city: clean(body.city),
      district: clean(body.district),
      state: clean(body.state),
      coverage_area: clean(body.proposed_area_of_operation),
      proposed_area_of_operation: clean(body.proposed_area_of_operation),
      hyperlocal_promotion_area: "Normally 500 metres to 1 kilometre around onboarded vendors, subject to final SabSewa Local distance rules.",
      expected_vendor_reach: Number(body.expected_vendor_reach || 0) || null,
      experience_summary: clean(body.experience_summary),
      vendor_onboarding_plan: clean(body.vendor_onboarding_plan),
      customer_awareness_plan: clean(body.customer_awareness_plan),
      referral_source: clean(body.referral_source) || null,
      revenue_share_percent: DEFAULT_BENEFIT_PERCENT,
      net_revenue_definition:
        "Eligible company revenue excludes GST/statutory taxes, refundable security deposits, refunds, chargebacks, discounts, payment-gateway charges and legally required deductions. This is not equity or company ownership.",
      terms_version: clean(body.terms_version) || PARTNER_TERMS_VERSION,
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
      acceptance_summary: acceptanceSummary,
      status: "pending",
    };

    const { data, error } = await supabase
      .from("partner_applications")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      duplicate: false,
      message: "Partner Application submitted successfully and is pending approval.",
      application: publicApplication(data),
    });
  } catch (error) {
    console.error("Partner application submit failed", error);
    return res.status(500).json({ success: false, error: error.message || "Unable to submit Partner Application right now." });
  }
});

router.get("/applications/status", async (req, res) => {
  try {
    const phone = clean(req.query.phone);
    if (!phone) return res.status(400).json({ success: false, error: "Mobile number is required." });
    const existing = await findExistingByPhone(phone);
    return res.json({ success: true, application: publicApplication(existing) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Unable to check Partner Application status." });
  }
});

export default router;