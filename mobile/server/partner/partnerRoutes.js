import crypto from "crypto";
import express from "express";
import multer from "multer";
import { supabase } from "../connection.js";
import { requireUserJwt } from "../security/apiSecurity.js";
import { requireCompanyAdmin, writeAdminAudit } from "../company/adminProfileService.js";
import { uploadPartnerKycDocument } from "./partnerKycService.js";
import { createClient } from "@supabase/supabase-js";

// Use service role key for administrative inserts to bypass client-level RLS restrictions
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const router = express.Router();
const requireAuth = requireUserJwt(supabase);
const requireAdmin = [requireAuth, requireCompanyAdmin("vendors.manage")];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const DEFAULT_BENEFIT_PERCENT = 10;
const PARTNER_TERMS_VERSION = "partner-program-local-2026-08-10";
const PAYMENT_METHODS = new Set(["bank_account", "upi"]);
const KYC_SECTIONS = {
  identity_proof: ["aadhaar", "pan_card", "voter_id", "driving_licence", "passport", "other_identity_proof"],
  address_proof: ["aadhaar_address", "driving_licence_address", "passport_address", "voter_id_address", "utility_bill", "other_address_proof"],
  partner_photo: ["partner_selfie", "authorized_person_photo"],
  organization_document: ["incorporation_certificate", "organization_pan", "gst_certificate", "authorization_letter", "representative_identity", "other_organization_document"],
};

function clean(value) {
  return String(value || "").trim();
}

function normalizePhone(value) {
  return clean(value).replace(/\D/g, "");
}

function maskPartnerName(value) {
  const words = clean(value).split(/\s+/).filter(Boolean);
  if (!words.length) return "Verified SabSewa Partner";
  return words
    .map((word) => {
      if (word.length <= 2) return `${word[0] || ""}*`;
      return `${word[0]}${"*".repeat(Math.min(word.length - 2, 6))}${word[word.length - 1]}`;
    })
    .join(" ");
}

function partnerCodeFor(partner, fallback = "") {
  return clean(partner?.referral_code || partner?.partner_id || partner?.application_id || fallback).toUpperCase();
}

function normalizePaymentMethod(value) {
  const method = clean(value).toLowerCase();
  return PAYMENT_METHODS.has(method) ? method : "";
}

function maskAccount(value) {
  const digits = clean(value).replace(/\D/g, "");
  if (!digits) return null;
  return `${"X".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function maskUpi(value) {
  const raw = clean(value).toLowerCase();
  const [name, handle] = raw.split("@");
  if (!name || !handle) return raw ? "***" : null;
  return `${name.slice(0, 2)}***@${handle}`;
}

function maskPan(value) {
  const raw = clean(value).toUpperCase();
  if (raw.length < 4) return raw || null;
  return `${raw.slice(0, 2)}*****${raw.slice(-3)}`;
}

function maskGstin(value) {
  const raw = clean(value).toUpperCase();
  if (raw.length < 6) return raw || null;
  return `${raw.slice(0, 4)}******${raw.slice(-3)}`;
}

function encryptionKey() {
  const secret = process.env.PARTNER_PAYMENT_DETAILS_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw Object.assign(new Error("Partner payment detail encryption is not configured."), { statusCode: 500 });
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptSensitive(value) {
  const text = clean(value);
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function generateReferralCode(applicantName) {
  const prefix = clean(applicantName).replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "SSL";
  const randomHex = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `REF-${prefix}-${randomHex}`;
}

function publicPaymentDetail(detail) {
  if (!detail) return null;
  return {
    payment_method: detail.payment_method,
    status: detail.status || "pending_verification",
    masked_account: detail.account_number_last4 ? `XXXXXX${detail.account_number_last4}` : null,
    bank_name: detail.bank_name || null,
    account_holder_name: detail.account_holder_name || null,
    ifsc_code: detail.ifsc_code || null,
    account_type: detail.account_type || null,
    upi_masked: detail.upi_id_masked || null,
    upi_name: detail.upi_name || null,
  };
}

function publicApplication(application, paymentDetail = null) {
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
    kyc_status: application.kyc_status || "not_submitted",
    payment_details_status: application.payment_details_status || "pending_verification",
    kyc_review_notes: application.kyc_review_notes || null,
    kyc_reviewed_at: application.kyc_reviewed_at || null,
    kyc_reviewed_by: application.kyc_reviewed_by || null,
    payment_details_review_notes: application.payment_details_review_notes || null,
    payment_detail: publicPaymentDetail(paymentDetail),
    discovery_source: application.discovery_source || application.referral_source || null,
    discovery_source_other_description: application.discovery_source_other_description || null,
    pan_number_masked: application.pan_number_masked || null,
    gstin_masked: application.gstin_masked || null,
    submitted_at: application.submitted_at || application.created_at,
    active_at: application.active_at || null,
    approved_at: application.approved_at || null,
  };
}

async function currentPaymentDetail(applicationId) {
  const { data, error } = await supabase
    .from("partner_payment_details")
    .select("*")
    .eq("partner_application_id", applicationId)
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw error;
  return data || null;
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

function validatePayment(body) {
  const payment = body?.commission_payment || {};
  const method = normalizePaymentMethod(payment.method);
  if (!method) throw Object.assign(new Error("Select Bank Account or UPI for commission payments."), { statusCode: 400 });
  if (method === "bank_account") {
    const account = clean(payment.account_number);
    const confirm = clean(payment.account_number_confirm);
    if (!clean(payment.account_holder_name) || !clean(payment.bank_name) || !account || !confirm || !clean(payment.ifsc_code) || !clean(payment.account_type)) {
      throw Object.assign(new Error("Please fill all mandatory bank account fields."), { statusCode: 400 });
    }
    if (account !== confirm) throw Object.assign(new Error("Bank account number and re-entered account number do not match."), { statusCode: 400 });
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(clean(payment.ifsc_code))) throw Object.assign(new Error("Please enter a valid IFSC code."), { statusCode: 400 });
  }
  if (method === "upi") {
    const upi = clean(payment.upi_id).toLowerCase();
    const confirm = clean(payment.upi_id_confirm).toLowerCase();
    if (!upi || !confirm || !clean(payment.upi_name)) throw Object.assign(new Error("Please fill all mandatory UPI fields."), { statusCode: 400 });
    if (upi !== confirm) throw Object.assign(new Error("UPI ID and re-entered UPI ID do not match."), { statusCode: 400 });
    if (!/^[a-z0-9.\-_]{2,}@[a-z0-9.\-_]{2,}$/i.test(upi)) throw Object.assign(new Error("Please enter a valid UPI ID."), { statusCode: 400 });
  }
  return { ...payment, method };
}

async function insertPaymentDetail(applicationId, payment) {
  const payload = {
    partner_application_id: applicationId,
    payment_method: payment.method,
    account_holder_name: payment.method === "bank_account" ? clean(payment.account_holder_name) : null,
    bank_name: payment.method === "bank_account" ? clean(payment.bank_name) : null,
    account_number_ciphertext: payment.method === "bank_account" ? encryptSensitive(payment.account_number) : null,
    account_number_last4: payment.method === "bank_account" ? clean(payment.account_number).replace(/\D/g, "").slice(-4) : null,
    ifsc_code: payment.method === "bank_account" ? clean(payment.ifsc_code).toUpperCase() : null,
    account_type: payment.method === "bank_account" ? clean(payment.account_type).toLowerCase() : null,
    branch_name: payment.method === "bank_account" ? clean(payment.branch_name) || null : null,
    upi_id_ciphertext: payment.method === "upi" ? encryptSensitive(payment.upi_id.toLowerCase()) : null,
    upi_id_masked: payment.method === "upi" ? maskUpi(payment.upi_id) : null,
    upi_name: payment.method === "upi" ? clean(payment.upi_name) : null,
    status: "pending_verification",
    is_current: true,
  };
  const { data, error } = await supabase.from("partner_payment_details").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

/**
 * @route POST /api/partner/verify-referral
 * @desc Live verification endpoint for Vendor Registration form to validate Partner details
 */
router.post("/verify-referral", async (req, res) => {
  try {
    const { partner_id, referral_id, phone, partner_name } = req.body || {};
    const cleanPhone = normalizePhone(phone);
    const phoneTail = cleanPhone.slice(-10);
    const cleanId = clean(partner_id || referral_id).toUpperCase();
    const cleanName = clean(partner_name).toLowerCase();

    if (!cleanPhone && !cleanId) {
      return res.status(400).json({ success: false, verified: false, error: "Provide a Partner ID or Registered Mobile Number to verify." });
    }

    let query = supabase
      .from("partner_applications")
      .select("id, partner_id, referral_code, application_id, applicant_name, phone, status, kyc_status, payment_details_status")
      .eq("status", "active");

    if (cleanId) {
      query = query.or(`partner_id.eq.${cleanId},referral_code.eq.${cleanId},application_id.eq.${cleanId}`);
    } else if (phoneTail) {
      query = query.or(`phone.eq.${cleanPhone},phone.ilike.%${phoneTail}`);
    }

    const { data: matches, error } = await query;
    if (error) throw error;

    if (!matches || matches.length === 0) {
      return res.status(404).json({
        success: false,
        verified: false,
        error: "No active Partner found matching the provided details. Please verify the mobile number or Partner ID."
      });
    }

    const matchedPartner = matches.find((p) => cleanName ? clean(p.applicant_name).toLowerCase().includes(cleanName) : true) || matches[0];

    return res.json({
      success: true,
      verified: true,
      partner: {
        id: matchedPartner.id,
        partner_id: matchedPartner.partner_id || matchedPartner.referral_code || matchedPartner.application_id,
        display_name: maskPartnerName(matchedPartner.applicant_name),
        referral_code: matchedPartner.referral_code || matchedPartner.partner_id || matchedPartner.application_id,
        status: "active"
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, verified: false, error: error.message });
  }
});

/**
 * @route POST /api/partner/referrals/attribute
 * @desc Attributes a newly registered vendor to an active partner via referral code or partner ID
 */
router.post("/referrals/attribute", requireAuth, async (req, res) => {
  try {
    const { vendor_id, partner_id, referral_id, referral_code, phone, referral_confirmed_by_vendor } = req.body || {};
    const cleanCode = clean(referral_code || referral_id || partner_id).toUpperCase();
    const cleanPhone = normalizePhone(phone);
    const phoneTail = cleanPhone.slice(-10);

    if (!vendor_id || (!cleanCode && !phoneTail)) {
      return res.status(400).json({ success: false, error: "Vendor profile and Partner ID, referral code, or registered mobile number are required." });
    }

    const referralActorIsAdmin = ["admin", "company_admin", "super_admin", "master_admin", "national_admin", "state_admin", "district_admin", "city_admin"].includes(String(req.auth?.role || "").toLowerCase());
    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("id, owner_user_id, attributed_partner_id, partner_attribution_locked, phone")
      .eq("id", vendor_id)
      .maybeSingle();

    if (vendorError || !vendor) {
      return res.status(404).json({ success: false, error: "Vendor profile was not found for referral attribution." });
    }

    if (!referralActorIsAdmin && vendor.owner_user_id !== req.auth?.user_id) {
      return res.status(403).json({ success: false, error: "You can attribute only your own vendor profile." });
    }

    if (vendor.partner_attribution_locked && !referralActorIsAdmin) {
      return res.status(409).json({ success: false, error: "This vendor already has a locked Partner referral attribution. Contact SabSewa support for correction." });
    }

    let partnerQuery = supabase
      .from("partner_applications")
      .select("id, partner_id, referral_code, application_id, phone, status, kyc_status, payment_details_status, revenue_share_percent");

    if (cleanCode) {
      partnerQuery = partnerQuery.or(`referral_code.eq.${cleanCode},partner_id.eq.${cleanCode},application_id.eq.${cleanCode},id.eq.${partner_id || "00000000-0000-0000-0000-000000000000"}`);
    } else {
      partnerQuery = partnerQuery.or(`phone.eq.${cleanPhone},phone.ilike.%${phoneTail}`);
    }

    const { data: partner, error: partnerError } = await partnerQuery.maybeSingle();

    if (partnerError || !partner) {
      return res.status(404).json({ success: false, error: "Invalid or inactive partner referral code." });
    }

    if (partner.status !== "active") {
      return res.status(400).json({ success: false, error: "This partner program account is currently not active." });
    }

    const vendorPhoneTail = normalizePhone(vendor.phone).slice(-10);
    const partnerPhoneTail = normalizePhone(partner.phone).slice(-10);
    if (vendorPhoneTail && partnerPhoneTail && vendorPhoneTail === partnerPhoneTail) {
      return res.status(400).json({ success: false, error: "Self-referral is not allowed for Partner attribution." });
    }

    const now = new Date().toISOString();
    const canonicalCode = partnerCodeFor(partner, cleanCode);
    const attributionMethod = cleanCode ? "partner_id_or_referral_code" : "registered_mobile";
    const { data: referral, error: referralError } = await supabase
      .from("partner_referred_vendors")
      .upsert({
        partner_application_id: partner.id,
        vendor_id,
        partner_id: partner.partner_id || null,
        referral_code: canonicalCode,
        referral_status: "attributed",
        vendor_onboarding_date: now,
        referral_source: "vendor_registration_partner_referral",
        referral_source_type: "approved_partner",
        referral_confirmed_by_vendor: referral_confirmed_by_vendor !== false,
        attribution_method: attributionMethod,
        validated_at: now,
        validated_by: req.auth?.user_id || null,
        commission_eligibility_status: "pending_eligible_revenue",
        benefit_percent: Number(partner.revenue_share_percent || DEFAULT_BENEFIT_PERCENT),
        attributed_at: now,
        updated_at: now,
      }, { onConflict: "vendor_id" })
      .select()
      .single();

    if (referralError) throw referralError;

    const { error: vendorUpdateError } = await supabase
      .from("vendors")
      .update({
        attributed_partner_id: partner.id,
        referred_by_partner_flag: true,
        partner_referral_code_used: canonicalCode,
        referral_source_type: "approved_partner",
        referrer_partner_id: partner.id,
        referral_code_entered: cleanCode || cleanPhone,
        referral_status: "attributed",
        referred_at: now,
        referral_confirmed_by_vendor: referral_confirmed_by_vendor !== false,
        attribution_method: attributionMethod,
        referral_validated_at: now,
        referral_validated_by: req.auth?.user_id || null,
        commission_eligibility_status: "pending_eligible_revenue",
        partner_attribution_verified_at: now,
        partner_attribution_locked: true,
      })
      .eq("id", vendor_id);

    if (vendorUpdateError) throw vendorUpdateError;

    await supabase.from("partner_referral_attribution_audit").insert({
      vendor_id,
      previous_partner_application_id: vendor.attributed_partner_id || null,
      new_partner_application_id: partner.id,
      previous_referral_code: null,
      new_referral_code: canonicalCode,
      action: "vendor_registration_partner_referral",
      actor_user_id: req.auth?.user_id || null,
      actor_role: req.auth?.role || null,
      metadata: {
        attribution_method: attributionMethod,
        referral_confirmed_by_vendor: referral_confirmed_by_vendor !== false,
      },
    }).then(({ error: auditError }) => {
      if (auditError) console.warn("Partner referral attribution audit insert failed", auditError.message);
    });

    return res.status(201).json({ success: true, referral });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/applications", async (req, res) => {
  let insertedApplication = null;
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
    if (!body.terms_accepted) return res.status(400).json({ success: false, error: "Partner Program Terms must be accepted before submission." });
    if (!body.kyc_declaration_accepted) return res.status(400).json({ success: false, error: "Partner KYC and confidentiality declaration must be accepted before submission." });
    const payment = validatePayment(body);

    const existing = await findExistingByPhone(phone);
    if (existing) {
      return res.status(200).json({
        success: true,
        duplicate: true,
        message: "A Partner Application already exists for this mobile number.",
        application: publicApplication(existing, await currentPaymentDetail(existing.id)),
      });
    }

    const acceptanceSummary =
      "Applicant accepted Partner Program terms, vendor onboarding and local customer awareness responsibilities, KYC/payment verification, confidentiality, suspension/termination rules, no employment/equity rights, configurable benefit initially 10%, eligible-revenue exclusions and company review rights.";

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
      discovery_source: clean(body.discovery_source) || clean(body.referral_source) || "Other",
      discovery_source_other_description: clean(body.discovery_source) === "Other" ? clean(body.discovery_source_other_description) : null,
      referral_source: clean(body.discovery_source) || clean(body.referral_source) || null,
      referral_code: generateReferralCode(body.applicant_name),
      revenue_share_percent: DEFAULT_BENEFIT_PERCENT,
      net_revenue_definition:
        "Eligible company revenue excludes GST/statutory taxes, refundable security deposits, refunds, chargebacks, discounts, payment-gateway charges and legally required deductions. This is not equity or company ownership.",
      terms_version: clean(body.terms_version) || PARTNER_TERMS_VERSION,
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
      acceptance_summary: acceptanceSummary,
      status: "pending",
      kyc_status: "not_submitted",
      payment_details_status: "pending_verification",
      pan_number_masked: maskPan(body.pan_number),
      pan_name: clean(body.pan_name) || null,
      tax_profile_type: clean(body.tax_profile_type).toLowerCase() || null,
      gstin_masked: maskGstin(body.gstin),
    };

    const { data, error } = await supabase.from("partner_applications").insert(payload).select("*").single();
    if (error) throw error;
    insertedApplication = data;
    const paymentDetail = await insertPaymentDetail(data.id, payment);

    return res.status(201).json({
      success: true,
      duplicate: false,
      message: "Partner Application submitted successfully. KYC and payment details are pending verification.",
      application: publicApplication(data, paymentDetail),
    });
  } catch (error) {
    if (insertedApplication?.id) {
      await supabase.from("partner_applications").delete().eq("id", insertedApplication.id);
    }
    console.error("Partner application submit failed", { message: error.message, code: error.code || null });
    return res.status(error.statusCode || 500).json({ success: false, error: error.message || "Unable to submit Partner Application right now." });
  }
});

/**
 * @route GET /api/partner/applications/status
 * @desc Public endpoint to check partner application & KYC status by registered mobile number
 */
router.get("/applications/status", async (req, res) => {
  try {
    const phone = clean(req.query.phone);
    if (!phone) return res.status(400).json({ success: false, error: "Mobile number is required." });
    
    const existing = await findExistingByPhone(phone);
    if (!existing) {
      return res.json({ success: true, application: null });
    }

    const payment = await currentPaymentDetail(existing.id);

    // Fetch existing KYC documents
    const { data: kycDocs } = await supabase
      .from("partner_kyc_documents")
      .select("id, document_section, document_type, document_label, status, file_name, created_at")
      .eq("partner_application_id", existing.id)
      .neq("status", "deleted");

    const appData = {
      ...publicApplication(existing, payment),
      kyc_documents: kycDocs || [],
    };

    return res.json({ success: true, application: appData });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Unable to check Partner Application status." });
  }
});

router.post("/applications/:application_id/kyc-documents", upload.single("document"), async (req, res) => {
  try {
    const applicationId = req.params.application_id;
    const phone = clean(req.body.phone);
    const documentSection = clean(req.body.document_section);
    const documentType = clean(req.body.document_type);
    const documentLabel = clean(req.body.document_label) || documentType;
    if (!phone) return res.status(400).json({ success: false, error: "Mobile number is required for Partner KYC upload." });
    if (!KYC_SECTIONS[documentSection]?.includes(documentType)) return res.status(400).json({ success: false, error: "Invalid Partner KYC document type." });
    if (!req.file?.buffer) return res.status(400).json({ success: false, error: "Please select a document file before uploading." });

    const { data: application, error: appError } = await supabase
      .from("partner_applications")
      .select("id, phone, partner_type, kyc_status")
      .eq("id", applicationId)
      .maybeSingle();
    if (appError) throw appError;
    if (!application || normalizePhone(application.phone) !== normalizePhone(phone)) {
      return res.status(404).json({ success: false, error: "Partner Application was not found for this mobile number." });
    }

    const uploadResult = await uploadPartnerKycDocument({
      partnerApplicationId: application.id,
      documentType,
      documentSection,
      fileBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
    });

    const { data: doc, error: docError } = await supabase
      .from("partner_kyc_documents")
      .insert({
        partner_application_id: application.id,
        document_section: documentSection,
        document_type: documentType,
        document_label: documentLabel,
        file_name: req.file.originalname,
        ...uploadResult,
        metadata: { uploaded_by: "partner_applicant" },
      })
      .select("*")
      .single();
    if (docError) throw docError;

    await supabase
      .from("partner_applications")
      .update({
        kyc_status: application.kyc_status === "verified" ? "verified" : "documents_submitted",
        kyc_submitted_at: new Date().toISOString(),
      })
      .eq("id", application.id);

    return res.status(201).json({ success: true, document: doc });
  } catch (error) {
    console.error("Partner KYC upload failed", { message: error.message, code: error.code || null, diagnostic: error.diagnostic || null });
    return res.status(error.statusCode || 500).json({ success: false, error: error.publicMessage || error.message || "Unable to upload Partner KYC document.", diagnostic: error.diagnostic || undefined });
  }
});

router.post("/applications/:application_id/submit-kyc", async (req, res) => {
  try {
    const applicationId = req.params.application_id;
    const phone = clean(req.body.phone);
    const { data: application, error: appError } = await supabase
      .from("partner_applications")
      .select("id, phone, partner_type")
      .eq("id", applicationId)
      .maybeSingle();
    if (appError) throw appError;
    if (!application || normalizePhone(application.phone) !== normalizePhone(phone)) return res.status(404).json({ success: false, error: "Partner Application was not found." });

    const { data: docs, error: docsError } = await supabase
      .from("partner_kyc_documents")
      .select("document_section, status")
      .eq("partner_application_id", application.id)
      .neq("status", "deleted");
    if (docsError) throw docsError;
    const sections = new Set((docs || []).map((doc) => doc.document_section));
    const isOrg = /organization|ngo|institution|company|llp/i.test(String(application.partner_type || ""));
    const missing = ["identity_proof", "partner_photo"];
    if (!sections.has("address_proof")) missing.push("address_proof");
    if (isOrg && !sections.has("organization_document")) missing.push("organization_document");
    const actualMissing = missing.filter((section) => !sections.has(section));
    if (actualMissing.length) {
      return res.status(400).json({ success: false, error: `Mandatory Partner KYC documents missing: ${actualMissing.join(", ")}` });
    }
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("partner_applications")
      .update({ kyc_status: "under_review", kyc_submitted_at: now })
      .eq("id", application.id)
      .select("*")
      .single();
    if (error) throw error;
    return res.json({ success: true, application: publicApplication(data, await currentPaymentDetail(data.id)) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Unable to submit Partner KYC for review." });
  }
});

router.get("/admin/applications", ...requireAdmin, async (req, res) => {
  try {
    const { data: applications, error } = await supabaseAdmin
      .from("partner_applications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw error;

    const applicationIds = (applications || []).map((row) => row.id).filter(Boolean);
    if (!applicationIds.length) {
      return res.json({ success: true, applications: [] });
    }

    const [paymentResult, kycResult, referralResult, commissionResult, auditResult] = await Promise.all([
      supabaseAdmin
        .from("partner_payment_details")
        .select("id, partner_application_id, payment_method, account_number_last4, bank_name, account_holder_name, ifsc_code, account_type, upi_id_masked, upi_name, status, is_current")
        .in("partner_application_id", applicationIds),
      supabaseAdmin
        .from("partner_kyc_documents")
        .select("id, partner_application_id, document_section, document_type, document_label, status, file_name, created_at")
        .in("partner_application_id", applicationIds)
        .neq("status", "deleted"),
      supabaseAdmin
        .from("partner_referred_vendors")
        .select("id, partner_application_id, referral_status, vendor_id, eligible_revenue_amount, benefit_earned_amount, vendor_onboarding_date, vendor_activation_date")
        .in("partner_application_id", applicationIds),
      supabaseAdmin
        .from("partner_commission_events")
        .select("id, partner_application_id, status, gross_revenue, net_revenue, commission_amount, created_at")
        .in("partner_application_id", applicationIds),
      supabaseAdmin
        .from("partner_admin_audit_logs")
        .select("id, partner_application_id, action, previous_status, new_status, reason, actor_admin_id, actor_admin_name, metadata, created_at")
        .in("partner_application_id", applicationIds)
        .order("created_at", { ascending: false }),
    ]);

    const firstError = paymentResult.error || kycResult.error || referralResult.error || commissionResult.error || auditResult.error;
    if (firstError) throw firstError;

    function groupByApplication(rows) {
      return (rows || []).reduce((acc, row) => {
        const key = row.partner_application_id;
        if (!acc[key]) acc[key] = [];
        acc[key].push(row);
        return acc;
      }, {});
    }

    const paymentsByApplication = groupByApplication(paymentResult.data);
    const kycByApplication = groupByApplication(kycResult.data);
    const referralsByApplication = groupByApplication(referralResult.data);
    const commissionsByApplication = groupByApplication(commissionResult.data);
    const auditByApplication = groupByApplication(auditResult.data);

    const rows = (applications || []).map((row) => {
      const payments = paymentsByApplication[row.id] || [];
      const current = payments.find((item) => item.is_current) || payments[0] || null;
      const kycDocuments = kycByApplication[row.id] || [];
      const referrals = referralsByApplication[row.id] || [];
      const commissionEvents = commissionsByApplication[row.id] || [];
      const reviewHistory = auditByApplication[row.id] || [];
      return {
        ...publicApplication(row, current),
        raw: {
          ...row,
          partner_payment_details: payments,
          partner_kyc_documents: kycDocuments,
          partner_referred_vendors: referrals,
          partner_commission_events: commissionEvents,
        },
        kyc_documents: kycDocuments,
        referrals,
        commission_events: commissionEvents,
        review_history: reviewHistory,
      };
    });

    return res.json({ success: true, applications: rows });
  } catch (error) {
    console.error("Partner admin applications load failed", {
      message: error?.message,
      code: error?.code || null,
      details: error?.details || null,
    });
    return res.status(500).json({ success: false, error: error.message || "Unable to load Partner Applications." });
  }
});

router.post("/admin/applications/:application_id/review", ...requireAdmin, async (req, res) => {
  try {
    const applicationId = req.params.application_id;
    const action = clean(req.body.action);
    const reason = clean(req.body.reason || req.body.rejection_reason);
    const adminRemarks = clean(req.body.admin_remarks || req.body.remarks);
    const requiredInformation = clean(req.body.required_information);
    const followUpDate = clean(req.body.follow_up_date);
    const documentsReviewed = Array.isArray(req.body.documents_reviewed) ? req.body.documents_reviewed.map(clean).filter(Boolean) : [];
    const now = new Date().toISOString();

    const { data: current, error: currentError } = await supabaseAdmin
      .from("partner_applications")
      .select("*")
      .eq("id", applicationId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return res.status(404).json({ success: false, error: "Partner Application was not found." });

    const reasonRequired = new Set([
      "request_kyc_correction",
      "request_further_information",
      "reject_kyc",
      "reject_payment_details",
      "suspend_partner",
      "terminate_partner",
      "revoke_partner",
    ]);
    if (reasonRequired.has(action) && !reason && !adminRemarks && !requiredInformation) {
      return res.status(400).json({ success: false, error: "Reason or admin remarks are required for this Partner action." });
    }
    if (reason.toLowerCase() === "other" && !adminRemarks) {
      return res.status(400).json({ success: false, error: "Admin remarks are required when reason is Other." });
    }

    const previousStatus = current.status || "pending";
    const previousKycStatus = current.kyc_status || "not_submitted";
    const previousPaymentStatus = current.payment_details_status || "pending_verification";
    const reviewNoteParts = [
      reason ? `Reason: ${reason}` : "",
      adminRemarks ? `Remarks: ${adminRemarks}` : "",
      requiredInformation ? `Required information: ${requiredInformation}` : "",
      followUpDate ? `Follow-up date: ${followUpDate}` : "",
    ].filter(Boolean);
    const reviewNotes = reviewNoteParts.join("\n") || null;
    const patch = { reviewed_by: req.auth.user_id, reviewed_at: now };

    if (action === "approve_kyc" || action === "verify_kyc") {
      Object.assign(patch, {
        kyc_status: "verified",
        kyc_reviewed_by: req.auth.user_id,
        kyc_reviewed_at: now,
        kyc_review_notes: reviewNotes,
      });
    } else if (action === "request_kyc_correction" || action === "request_further_information") {
      Object.assign(patch, {
        kyc_status: "additional_information_required",
        kyc_reviewed_by: req.auth.user_id,
        kyc_reviewed_at: now,
        kyc_review_notes: reviewNotes,
      });
    } else if (action === "reject_kyc") {
      Object.assign(patch, {
        kyc_status: "rejected",
        kyc_reviewed_by: req.auth.user_id,
        kyc_reviewed_at: now,
        kyc_review_notes: reviewNotes,
      });
    } else if (action === "verify_payment_details") {
      Object.assign(patch, {
        payment_details_status: "verified",
        payment_details_reviewed_by: req.auth.user_id,
        payment_details_reviewed_at: now,
        payment_details_review_notes: reviewNotes,
      });
    } else if (action === "reject_payment_details") {
      Object.assign(patch, {
        payment_details_status: "rejected_correction_required",
        payment_details_reviewed_by: req.auth.user_id,
        payment_details_reviewed_at: now,
        payment_details_review_notes: reviewNotes,
      });
    } else if (action === "activate_partner") {
      if (current.kyc_status !== "verified" || current.payment_details_status !== "verified") {
        return res.status(400).json({ success: false, error: "Partner can be activated only after KYC and payment details are verified." });
      }
      Object.assign(patch, {
        status: "active",
        active_at: now,
        approved_at: now,
        referral_code: current.referral_code || generateReferralCode(current.applicant_name),
      });
    } else if (action === "suspend_partner") {
      if (!["active", "approved"].includes(String(current.status || ""))) {
        return res.status(400).json({ success: false, error: "Suspension is allowed only for an approved or active Partner. Use KYC rejection or further enquiry for applicants." });
      }
      Object.assign(patch, {
        status: "suspended",
        compliance_status: "suspended_investigation_pending",
        suspension_reason: reviewNotes || "Suspended pending investigation",
        suspended_by: req.auth.user_id,
        suspended_at: now,
      });
    } else if (action === "reinstate_partner" || action === "reactivate_partner") {
      Object.assign(patch, {
        status: "active",
        compliance_status: "clear",
        suspension_reason: null,
      });
    } else if (action === "terminate_partner" || action === "revoke_partner") {
      Object.assign(patch, {
        status: "revoked",
        compliance_status: "terminated",
        terminated_by: req.auth.user_id,
        terminated_at: now,
      });
    } else {
      return res.status(400).json({ success: false, error: "Unsupported Partner review action." });
    }

    const { data, error } = await supabaseAdmin
      .from("partner_applications")
      .update(patch)
      .eq("id", applicationId)
      .select("*")
      .single();
    if (error) throw error;

    if (["approve_kyc", "verify_kyc", "request_kyc_correction", "request_further_information", "reject_kyc"].includes(action)) {
      const docStatus = (action === "approve_kyc" || action === "verify_kyc")
        ? "verified"
        : action === "reject_kyc"
          ? "rejected"
          : "additional_information_required";
      await supabaseAdmin
        .from("partner_kyc_documents")
        .update({
          status: docStatus,
          rejection_reason: docStatus === "verified" ? null : (reviewNotes || reason || null),
          reviewed_by: req.auth.user_id,
          reviewed_at: now,
        })
        .eq("partner_application_id", applicationId)
        .neq("status", "deleted");
    }

    const auditMetadata = {
      previous_kyc_status: previousKycStatus,
      new_kyc_status: data.kyc_status || null,
      previous_payment_details_status: previousPaymentStatus,
      new_payment_details_status: data.payment_details_status || null,
      admin_remarks: adminRemarks || null,
      required_information: requiredInformation || null,
      follow_up_date: followUpDate || null,
      documents_reviewed: documentsReviewed,
    };

    await writeAdminAudit({
      req,
      action: `partner.${action}`,
      entityType: "partner_application",
      entityId: applicationId,
      metadata: { reason: reason || null, ...auditMetadata },
    });
    await supabaseAdmin.from("partner_admin_audit_logs").insert({
      actor_user_id: req.auth.user_id,
      actor_admin_id: req.adminProfile?.admin_id || null,
      actor_admin_name: req.adminProfile?.admin_name || null,
      partner_application_id: applicationId,
      action,
      previous_status: `${previousStatus} / KYC: ${previousKycStatus} / Payment: ${previousPaymentStatus}`,
      new_status: `${data.status || "pending"} / KYC: ${data.kyc_status || "not_submitted"} / Payment: ${data.payment_details_status || "pending_verification"}`,
      reason: reason || adminRemarks || requiredInformation || null,
      metadata: auditMetadata,
    });

    return res.json({
      success: true,
      application: {
        ...publicApplication(data, await currentPaymentDetail(data.id)),
        raw: data,
      },
    });
  } catch (error) {
    console.error("Partner review action failed", {
      message: error?.message,
      code: error?.code || null,
      details: error?.details || null,
    });
    return res.status(500).json({ success: false, error: error.message || "Unable to update Partner record." });
  }
});

/**
 * @route POST /api/partner/admin/reattribute-vendor
 * @desc Master Admin restricted endpoint to reattribute a vendor to a different Partner with an audit log
 */
router.post("/admin/reattribute-vendor", ...requireAdmin, async (req, res) => {
  try {
    const { vendor_id, new_partner_application_id, reason } = req.body || {};

    if (!vendor_id || !new_partner_application_id || !reason) {
      return res.status(400).json({ success: false, error: "Internal vendor reference, new Partner record, and an explicit reason are required." });
    }

    const { data: newPartner, error: partnerErr } = await supabase
      .from("partner_applications")
      .select("id, partner_id, referral_code, applicant_name, status")
      .eq("id", new_partner_application_id)
      .single();

    if (partnerErr || newPartner.status !== "active") {
      return res.status(400).json({ success: false, error: "Target partner account is not active." });
    }

    const { data: previousVendor } = await supabase
      .from("vendors")
      .select("attributed_partner_id, partner_referral_code_used")
      .eq("id", vendor_id)
      .maybeSingle();

    const now = new Date().toISOString();
    const canonicalCode = partnerCodeFor(newPartner);
    const { error: vendorUpdateError } = await supabase
      .from("vendors")
      .update({
        attributed_partner_id: newPartner.id,
        referred_by_partner_flag: true,
        partner_referral_code_used: canonicalCode,
        referral_source_type: "admin_assisted",
        referrer_partner_id: newPartner.id,
        referral_code_entered: canonicalCode,
        referral_status: "verified",
        referred_at: now,
        referral_confirmed_by_vendor: true,
        attribution_method: "admin_correction",
        referral_validated_at: now,
        referral_validated_by: req.auth?.user_id || null,
        commission_eligibility_status: "pending_eligible_revenue",
        partner_attribution_verified_at: now,
        partner_attribution_locked: true,
      })
      .eq("id", vendor_id);

    if (vendorUpdateError) throw vendorUpdateError;

    await supabase.from("partner_referred_vendors").upsert({
      vendor_id,
      partner_application_id: newPartner.id,
      partner_id: newPartner.partner_id || null,
      referral_code: canonicalCode,
      referral_status: "verified",
      referral_source: "admin_partner_referral_correction",
      referral_source_type: "admin_assisted",
      referral_confirmed_by_vendor: true,
      attribution_method: "admin_correction",
      validated_at: now,
      validated_by: req.auth?.user_id || null,
      commission_eligibility_status: "pending_eligible_revenue",
      notes: `Reattributed by Master Admin. Reason: ${reason}`,
      updated_at: now,
    }, { onConflict: "vendor_id" });

    await supabase.from("partner_referral_attribution_audit").insert({
      vendor_id,
      previous_partner_application_id: previousVendor?.attributed_partner_id || null,
      new_partner_application_id: newPartner.id,
      previous_referral_code: previousVendor?.partner_referral_code_used || null,
      new_referral_code: canonicalCode,
      action: "admin_partner_referral_correction",
      reason,
      actor_user_id: req.auth?.user_id || null,
      actor_role: req.auth?.role || null,
      metadata: { source: "partner_admin_reattribute_vendor" },
    }).then(({ error: auditError }) => {
      if (auditError) console.warn("Partner referral attribution audit insert failed", auditError.message);
    });

    await writeAdminAudit({
      req,
      action: "partner.reattribute_vendor",
      entityType: "vendor",
      entityId: vendor_id,
      metadata: { new_partner_id: newPartner.id, reason }
    });

    return res.json({ success: true, message: `Vendor successfully reattributed to Partner ${newPartner.applicant_name}.` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route POST /api/partner/admin/generate-monthly-ledger
 * @desc Admin endpoint to calculate and generate monthly benefit ledger statements (10% rate on eligible revenue)
 */
router.post("/admin/generate-monthly-ledger", ...requireAdmin, async (req, res) => {
  try {
    const { period_month } = req.body || {};
    if (!period_month || !/^\d{4}-\d{2}$/.test(period_month)) {
      return res.status(400).json({ success: false, error: "Valid period_month format (YYYY-MM) is required." });
    }

    const { data: activePartners, error: partnerError } = await supabase
      .from("partner_applications")
      .select("id, revenue_share_percent")
      .eq("status", "active");

    if (partnerError) throw partnerError;

    const statementsGenerated = [];

    for (const partner of activePartners || []) {
      const { data: referrals } = await supabase
        .from("partner_referred_vendors")
        .select("vendor_id, eligible_revenue_amount")
        .eq("partner_application_id", partner.id);

      const eligibleCount = referrals?.length || 0;
      const totalEligibleRevenue = (referrals || []).reduce((acc, curr) => acc + Number(curr.eligible_revenue_amount || 0), 0);
      const commissionRate = partner.revenue_share_percent || DEFAULT_BENEFIT_PERCENT;
      const grossCommission = Math.round((totalEligibleRevenue * commissionRate) / 100);
      const tdsTax = Math.round((grossCommission * 5) / 100);
      const netPayable = grossCommission - tdsTax;

      const { data: statement, error: stmtError } = await supabase
        .from("partner_monthly_commission_statements")
        .upsert(
          {
            partner_application_id: partner.id,
            period_month,
            eligible_vendor_count: eligibleCount,
            eligible_revenue: totalEligibleRevenue,
            commission_rate: commissionRate,
            gross_commission: grossCommission,
            deductions: 0,
            tds_tax: tdsTax,
            net_payable: netPayable,
            payment_status: netPayable > 0 ? "processing" : "no_payable_revenue",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "partner_application_id, period_month" }
        )
        .select()
        .single();

      if (!stmtError && statement) {
        statementsGenerated.push(statement);
      }
    }

    return res.json({ success: true, count: statementsGenerated.length, statements: statementsGenerated });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/admin/kyc-documents/:document_id/view", ...requireAdmin, async (req, res) => {
  try {
    const { data: doc, error } = await supabase.from("partner_kyc_documents").select("*").eq("id", req.params.document_id).maybeSingle();
    if (error) throw error;
    if (!doc) return res.status(404).json({ success: false, error: "Partner KYC document not found." });
    const { data, error: signedError } = await supabase.storage.from(doc.storage_bucket).createSignedUrl(doc.storage_path, 180);
    if (signedError) throw signedError;
    await writeAdminAudit({ req, action: "partner.kyc_document_viewed", entityType: "partner_kyc_document", entityId: doc.id, metadata: { partner_application_id: doc.partner_application_id } });
    return res.json({ success: true, url: data?.signedUrl });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Unable to create secure preview link." });
  }
});

router.get("/admin/payouts", ...requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("partner_monthly_commission_statements")
      .select("*, partner_applications(id, application_id, partner_id, applicant_name, phone, email, city, district, state, revenue_share_percent, payment_details_status, partner_payment_details(payment_method, account_number_last4, bank_name, upi_id_masked, status, is_current))")
      .order("period_month", { ascending: false })
      .limit(300);
    if (error) throw error;
    const payouts = (data || []).map((item) => {
      const app = item.partner_applications || {};
      const detail = (app.partner_payment_details || []).find((row) => row.is_current) || (app.partner_payment_details || [])[0] || null;
      return {
        id: item.id,
        period_month: item.period_month,
        partner_id: app.partner_id || app.application_id,
        partner_name: app.applicant_name,
        phone: app.phone,
        city: app.city,
        district: app.district,
        state: app.state,
        payment_method: detail?.payment_method || null,
        masked_payment_details: detail?.payment_method === "bank_account" ? `Bank ending ${detail.account_number_last4 || "----"}` : detail?.upi_id_masked || null,
        eligible_vendor_count: item.eligible_vendor_count,
        eligible_revenue: item.eligible_revenue,
        commission_rate: item.commission_rate,
        gross_commission: item.gross_commission,
        deductions: item.deductions,
        tds_tax: item.tds_tax,
        net_payable: item.net_payable,
        payment_status: item.payment_status,
        payment_date: item.payment_date,
        reference_number: item.reference_number,
      };
    });
    return res.json({ success: true, payouts });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Unable to load Partner payouts." });
  }
});

router.get("/applications/:application_id/commission-statements", async (req, res) => {
  try {
    const applicationId = req.params.application_id;
    const phone = clean(req.query.phone);
    const { data: application, error: appError } = await supabase.from("partner_applications").select("id, phone, applicant_name, partner_id, referral_code, status").eq("id", applicationId).maybeSingle();
    if (appError) throw appError;
    if (!application || normalizePhone(application.phone) !== normalizePhone(phone)) return res.status(404).json({ success: false, error: "Partner record not found." });
    const { data, error } = await supabase.from("partner_monthly_commission_statements").select("*").eq("partner_application_id", applicationId).order("period_month", { ascending: false }).limit(60);
    if (error) throw error;
    return res.json({ success: true, partner: publicApplication(application), statements: data || [] });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Unable to load Partner commission dashboard." });
  }
});

export default router;
