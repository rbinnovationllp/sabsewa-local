import express from "express";
import multer from "multer";
import Razorpay from "razorpay";
import { supabase } from "../connection.js";
import { getRazorpayMode } from "../payments/paymentEnvironment.js";
import { requireRole, requireUserJwt } from "../security/apiSecurity.js";
import { verifyRazorpaySignature } from "../securityWallet/securityWalletService.js";
import { getVendorOnboardingSummary } from "./onboardingPolicyService.js";
import { KYC_STORAGE_BUCKET, uploadKycDocument } from "./kycService.js";

const router = express.Router();
const requireAdmin = [requireUserJwt(supabase), requireRole(["admin", "company_admin", "super_admin", "master_admin", "national_admin", "state_admin", "district_admin", "city_admin", "kyc_reviewer"])];
const requireAuth = requireUserJwt(supabase);
const kycUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

function logKycUploadIngress(req, _res, next) {
  if (req.method === "POST" || req.method === "OPTIONS") {
    console.info("KYC upload ingress", {
      method: req.method,
      original_url: req.originalUrl,
      vendor_id: req.params?.vendor_id || null,
      content_type: req.headers["content-type"] || null,
      content_length: req.headers["content-length"] || null,
      has_authorization: Boolean(req.headers.authorization),
      origin: req.headers.origin || null,
      user_agent: req.headers["user-agent"] || null,
    });
  }
  next();
}

function runKycMulter(req, res, next) {
  kycUpload.single("document")(req, res, (error) => {
    if (!error) return next();
    const diagnostic = {
      stage: "multer_file_parse",
      code: error.code || null,
      field: error.field || null,
      message: error.message || String(error),
      content_type: req.headers["content-type"] || null,
      content_length: req.headers["content-length"] || null,
    };
    console.error("KYC multer upload failed", diagnostic);
    const publicMessage = error.code === "LIMIT_FILE_SIZE"
      ? "Document is larger than 8 MB. Please upload a smaller image or PDF."
      : `KYC upload request could not be read by the server: ${diagnostic.message}`;
    return res.status(400).json({ success: false, error: publicMessage, technical_error: diagnostic.message, diagnostic });
  });
}

router.use("/:vendor_id/kyc-documents", logKycUploadIngress);

function kycReviewDeadlineFrom(dateValue) {
  const base = dateValue ? new Date(dateValue) : new Date();
  return new Date(base.getTime() + 48 * 60 * 60 * 1000).toISOString();
}

async function adminIdentity(userId) {
  if (!userId) return { admin_id: null, admin_name: null };
  const { data } = await supabase
    .from("admin_profiles")
    .select("admin_id, admin_name")
    .eq("user_id", userId)
    .maybeSingle();
  return { admin_id: data?.admin_id || null, admin_name: data?.admin_name || null };
}

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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

router.post("/:vendor_id/register-category", requireAuth, async (req, res) => {
  try {
    const { vendor_id } = req.params;
    await assertVendorOwnerOrAdmin(req, vendor_id);

    const { category_id, custom_category_description } = req.body || {};

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
        actor_user_id: req.auth?.user_id || null,
        action: "custom_category_submitted",
        entity_type: "vendors",
        entity_id: vendor_id,
        metadata: { custom_category_description, assigned_category: "OTHER" }
      });
    }

    return res.json({ success: true, vendor: updatedVendor });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/:vendor_id/create-razorpay-order", requireAuth, async (req, res) => {
  try {
    const { vendor_id } = req.params;
    const vendor = await assertVendorOwnerOrAdmin(req, vendor_id);

    if (!["kyc_verified", "kyc_provisionally_cleared", "provisional_approved"].includes(vendor.kyc_status)) {
      return res.status(409).json({ success: false, error: "Complete KYC verification before creating an onboarding payment order." });
    }

    const canonicalId = resolveCanonicalId(vendor.category);
    const fallbackRules = CANONICAL_FEE_MATRIX[canonicalId] || CANONICAL_FEE_MATRIX.OTHER;

    const { data: feeRule } = await supabase
      .from("vendor_fee_rules")
      .select("onboarding_fee_amount, security_deposit_amount, tax_rate_percent, per_completed_order_charge")
      .in("category_slug", [canonicalId.toLowerCase(), "vegetables", "fruits", "kirana", "grocery", "pharmacy", "medical", "restaurant", "tiffin", "other"])
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
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
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

function categoryNeedsSpecialLicence(category) {
  const lower = String(category || "").toLowerCase();
  return (
    lower.includes("pharma") ||
    lower.includes("medical") ||
    lower.includes("chemist") ||
    lower.includes("drug") ||
    lower.includes("medicine") ||
    lower.includes("restaurant") ||
    lower.includes("tiffin") ||
    lower.includes("food") ||
    lower.includes("liquor") ||
    lower.includes("alcohol") ||
    lower.includes("restricted")
  );
}

function specialLicenceOptions(category) {
  const lower = String(category || "").toLowerCase();
  if (lower.includes("pharma") || lower.includes("medical") || lower.includes("chemist") || lower.includes("drug") || lower.includes("medicine")) {
    return [
      { type: "drug_license", label: "Drug licence / pharmacy licence" },
      { type: "restricted_goods_license", label: "Other medicine or restricted goods licence" },
      { type: "other_regulatory_license", label: "Other applicable regulatory licence" },
    ];
  }
  if (lower.includes("restaurant") || lower.includes("tiffin") || lower.includes("food")) {
    return [
      { type: "fssai_license", label: "FSSAI licence / food business registration" },
      { type: "other_regulatory_license", label: "Other applicable food licence" },
    ];
  }
  if (lower.includes("liquor") || lower.includes("alcohol")) {
    return [
      { type: "liquor_license", label: "Liquor / alcohol sales licence" },
      { type: "restricted_goods_license", label: "Restricted goods licence" },
      { type: "other_regulatory_license", label: "Other applicable regulatory licence" },
    ];
  }
  return [
    { type: "restricted_goods_license", label: "Restricted goods licence" },
    { type: "other_regulatory_license", label: "Other applicable regulatory licence" },
  ];
}

function requiredKycDocumentsForCategory(category) {
  const specialRequired = categoryNeedsSpecialLicence(category);
  return [
    {
      id: "identity_proof",
      title: "Identity Proof",
      required: true,
      note: "Select one government-issued identity proof for the shop owner, authorised person or caretaker.",
      options: [
        { type: "aadhaar", label: "Aadhaar Card" },
        { type: "pan_card", label: "PAN Card" },
        { type: "passport", label: "Passport" },
        { type: "voter_id", label: "Voter ID Card" },
        { type: "driving_licence", label: "Driving Licence" },
        { type: "other_identity_proof", label: "Other valid government-issued identity proof" },
      ],
    },
    {
      id: "business_address_proof",
      title: "Shop Address Proof / Business Registration",
      required: true,
      note: "Select one document proving shop/business address or lawful business presence.",
      options: [
        { type: "shop_establishment", label: "Shop & Establishment Registration Certificate" },
        { type: "rent_agreement", label: "Rent / Lease Agreement" },
        { type: "utility_bill", label: "Electricity / Utility Bill" },
        { type: "municipal_document", label: "Municipal / Local Authority document" },
        { type: "business_registration_address", label: "Business registration document containing shop address" },
        { type: "gst_certificate", label: "GST registration certificate, where applicable" },
        { type: "other_business_proof", label: "Other acceptable legal address/business proof" },
      ],
    },
    {
      id: "owner_photo",
      title: "Owner / Authorized Person Photograph with Shop View",
      required: true,
      note: "Please stand in front of your shop and take a clear photograph showing your face, shop front, shop name/signboard if available, and some shop items or business activity.",
      options: [
        { type: "owner_shop_photo", label: "Owner + Shop Photograph" },
      ],
    },
    {
      id: "regulated_license",
      title: "Special / Restricted Item Licence",
      required: specialRequired,
      conditional: true,
      note: specialRequired
        ? "Mandatory for this category. Upload the applicable valid licence before KYC can be approved."
        : "Normally not applicable. Upload only if the shop sells restricted or regulated products.",
      options: specialLicenceOptions(category),
    },
  ];
}

function flattenKycDocumentTypes(requirements) {
  return new Set(requirements.flatMap((section) => (section.options || []).map((option) => option.type)).concat(["authorisation", "trade_license", "shop_photo"]));
}

function documentBelongsToSection(section, document) {
  const allowed = new Set((section.options || []).map((option) => option.type));
  const metadataSection = document?.metadata?.document_section;
  if (metadataSection) return metadataSection === section.id && allowed.has(document.document_type);
  return allowed.has(document?.document_type);
}

function latestDocumentForSection(section, documents) {
  return (documents || []).find((document) => documentBelongsToSection(section, document));
}

function hasAcceptableSubmittedDocument(section, documents) {
  const latest = latestDocumentForSection(section, documents);
  return Boolean(latest && !["rejected", "additional_information_required"].includes(latest.status));
}

async function assertRequiredKycDocumentsSubmitted(vendorId, category) {
  const requirements = requiredKycDocumentsForCategory(category).filter((section) => section.required);
  const { data: documents, error } = await supabase
    .from("vendor_kyc_documents")
    .select("document_type, status, created_at, metadata")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const missing = requirements.filter((section) => !hasAcceptableSubmittedDocument(section, documents || []));
  if (missing.length > 0) {
    const err = new Error(`KYC cannot be submitted until required documents are uploaded: ${missing.map((section) => section.title).join(", ")}.`);
    err.statusCode = 409;
    throw err;
  }
}

async function assertVendorOwnerOrAdmin(req, vendorId) {
  const { data: vendor, error } = await supabase
    .from("vendors")
    .select("id, public_vendor_id, owner_user_id, category, kyc_status, onboarding_payment_status, status")
    .eq("id", vendorId)
    .single();
  if (error || !vendor) {
    const err = new Error("Vendor profile not found.");
    err.statusCode = 404;
    throw err;
  }
  const role = String(req.auth?.role || "");
  const admin = ["admin", "company_admin", "super_admin", "master_admin", "national_admin", "state_admin", "district_admin", "city_admin", "kyc_reviewer"].includes(role);
  if (!admin && vendor.owner_user_id !== req.auth?.user_id) {
    const err = new Error("You can access only your own vendor KYC.");
    err.statusCode = 403;
    throw err;
  }
  return vendor;
}

router.get("/:vendor_id/kyc-requirements", requireAuth, async (req, res) => {
  try {
    const vendor = await assertVendorOwnerOrAdmin(req, req.params.vendor_id);
    const { data: documents, error } = await supabase
      .from("vendor_kyc_documents")
      .select("id, document_type, status, file_name, mime_type, file_size_bytes, rejection_reason, metadata, created_at, reviewed_at")
      .eq("vendor_id", req.params.vendor_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const { data: latestReviewHistory } = await supabase
      .from("vendor_status_history")
      .select("previous_status, next_status, change_reason, changed_by, created_at")
      .eq("vendor_id", req.params.vendor_id)
      .in("next_status", ["kyc_verified", "additional_information_required", "kyc_rejected"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return res.json({
      success: true,
      vendor: {
        id: vendor.id,
        category: vendor.category,
        kyc_status: vendor.kyc_status || "kyc_not_started",
        payment_status: vendor.onboarding_payment_status || "payment_pending",
        kyc_review_notes: latestReviewHistory?.change_reason || null,
        kyc_reviewed_at: latestReviewHistory?.created_at || null,
      },
      required_documents: requiredKycDocumentsForCategory(vendor.category),
      documents: documents || [],
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/:vendor_id/kyc-documents", requireAuth, runKycMulter, async (req, res) => {
  try {
    const vendor = await assertVendorOwnerOrAdmin(req, req.params.vendor_id);
    const requirements = requiredKycDocumentsForCategory(vendor.category);
    const documentType = String(req.body?.document_type || "").trim();
    const documentSection = String(req.body?.document_section || "").trim();
    const documentLabel = String(req.body?.document_label || documentType).trim();
    const section = requirements.find((item) => item.id === documentSection);
    const allowedTypes = flattenKycDocumentTypes(requirements);

    if (!allowedTypes.has(documentType) || !section || !(section.options || []).some((option) => option.type === documentType)) {
      return res.status(400).json({ success: false, error: "Invalid KYC document selection. Please choose the document type again and retry." });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, error: "Please choose a document file before uploading." });
    }
    if (documentSection === "owner_photo") {
      const ownerPhotoMime = String(req.file.mimetype || "").toLowerCase();
      const ownerPhotoName = String(req.file.originalname || "").toLowerCase();
      const looksLikeImage = ownerPhotoMime.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/.test(ownerPhotoName);
      if (!looksLikeImage) {
        return res.status(400).json({ success: false, error: "Owner + Shop Photograph must be an image. Please take or upload a JPG, PNG or WEBP photo from the shop location." });
      }
    }

    const uploaded = await uploadKycDocument({
      vendorId: req.params.vendor_id,
      documentType,
      fileBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
    });

    const { data: documentRow, error: insertError } = await supabase
      .from("vendor_kyc_documents")
      .insert({
        vendor_id: req.params.vendor_id,
        document_type: documentType,
        storage_bucket: uploaded.storage_bucket,
        storage_path: uploaded.storage_path,
        file_name: req.file.originalname || `${documentType}`,
        mime_type: uploaded.mime_type,
        file_size_bytes: uploaded.file_size_bytes,
        status: "submitted",
        metadata: {
          document_section: documentSection,
          document_label: documentLabel || documentType,
          original_file_name: req.file.originalname || `${documentType}`,
          optimized_for_storage: req.file.mimetype?.startsWith("image/") || false,
          note: "Image compression only; legal document content is not altered or fabricated.",
        },
      })
      .select("id, document_type, status, file_name, mime_type, file_size_bytes, rejection_reason, metadata, created_at, reviewed_at")
      .single();

    if (insertError) {
      await supabase.storage.from(uploaded.storage_bucket).remove([uploaded.storage_path]);
      const err = new Error(`KYC database record failed: ${insertError.message}`);
      err.statusCode = 500;
      throw err;
    }

    const currentKycStatus = vendor.kyc_status || "kyc_not_started";
    return res.status(201).json({ success: true, document: documentRow, kyc_status: currentKycStatus });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.get("/:vendor_id/kyc-documents/:document_id/view", requireAuth, async (req, res) => {
  try {
    await assertVendorOwnerOrAdmin(req, req.params.vendor_id);
    const { data: documentRow, error } = await supabase
      .from("vendor_kyc_documents")
      .select("id, vendor_id, storage_bucket, storage_path, file_name")
      .eq("id", req.params.document_id)
      .eq("vendor_id", req.params.vendor_id)
      .single();
    if (error || !documentRow) return res.status(404).json({ success: false, error: "KYC document was not found." });

    const { data, error: signedError } = await supabase.storage
      .from(documentRow.storage_bucket || KYC_STORAGE_BUCKET)
      .createSignedUrl(documentRow.storage_path, 300);
    if (signedError) throw signedError;

    return res.json({ success: true, url: data.signedUrl, file_name: documentRow.file_name });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: "Unable to open this document. Please try again." });
  }
});

router.delete("/:vendor_id/kyc-documents/:document_id", requireAuth, async (req, res) => {
  try {
    await assertVendorOwnerOrAdmin(req, req.params.vendor_id);
    const { data: documentRow, error } = await supabase
      .from("vendor_kyc_documents")
      .select("id, vendor_id, storage_bucket, storage_path")
      .eq("id", req.params.document_id)
      .eq("vendor_id", req.params.vendor_id)
      .single();
    if (error || !documentRow) return res.status(404).json({ success: false, error: "KYC document was not found." });

    await supabase.storage.from(documentRow.storage_bucket || KYC_STORAGE_BUCKET).remove([documentRow.storage_path]);
    const { error: deleteError } = await supabase
      .from("vendor_kyc_documents")
      .delete()
      .eq("id", req.params.document_id)
      .eq("vendor_id", req.params.vendor_id);
    if (deleteError) throw deleteError;

    return res.json({ success: true });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: "Unable to delete this document. Please try again." });
  }
});

router.post("/:vendor_id/submit-kyc", requireAuth, async (req, res) => {
  try {
    const vendor = await assertVendorOwnerOrAdmin(req, req.params.vendor_id);
    if (vendor.kyc_status === "kyc_verified") {
      return res.json({ success: true, kyc_status: "kyc_verified" });
    }

    await assertRequiredKycDocumentsSubmitted(req.params.vendor_id, vendor.category);

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("vendors")
      .update({
        kyc_status: "kyc_under_review",
        status: vendor.status === "active" ? "active" : "kyc_pending",
        lifecycle_status: vendor.status === "active" ? "active" : "kyc_pending",
        kyc_submitted_at: now,
        kyc_review_deadline_at: kycReviewDeadlineFrom(now),
        updated_at: now,
      })
      .eq("id", req.params.vendor_id)
      .select("id, category, kyc_status, onboarding_payment_status")
      .single();
    if (error) throw error;

    await supabase.from("vendor_status_history").insert({
      vendor_id: req.params.vendor_id,
      previous_status: vendor.kyc_status || "kyc_not_started",
      next_status: "kyc_under_review",
      changed_by: req.auth?.user_id || null,
      change_reason: "Vendor submitted complete KYC package for verification",
    });

    return res.json({ success: true, vendor: data, kyc_status: "kyc_under_review" });
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

router.post("/:vendor_id/payment-record", requireAuth, async (req, res) => {
  try {
    const { gateway_order_id, gateway_payment_id, gateway_signature, metadata = {} } = req.body || {};

    if (!gateway_order_id || !gateway_payment_id) {
      return res.status(400).json({ success: false, error: "Verified gateway order id and payment id are required." });
    }

    const vendorForPayment = await assertVendorOwnerOrAdmin(req, req.params.vendor_id);

    if (!["kyc_verified", "kyc_provisionally_cleared", "provisional_approved"].includes(vendorForPayment.kyc_status)) {
      return res.status(409).json({ success: false, error: "Complete KYC verification before recording onboarding payment." });
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
        actor_user_id: req.auth?.user_id || null,
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
    const { status, reason, admin_remarks, required_information, follow_up_date } = req.body || {};
    const nextStatus = clean(status);
    const reviewReason = clean(reason);
    const reviewRemarks = clean(admin_remarks || req.body?.remarks);
    const requiredInfo = clean(required_information);
    const followUpDate = clean(follow_up_date);
    const allowed = new Set(["kyc_not_started", "kyc_submitted", "kyc_under_review", "additional_information_required", "kyc_verified", "kyc_rejected", "kyc_provisionally_cleared", "provisional_approved"]);
    if (!allowed.has(nextStatus)) return res.status(400).json({ success: false, error: "Invalid KYC status." });

    if (["additional_information_required", "kyc_rejected"].includes(nextStatus) && !reviewReason && !reviewRemarks && !requiredInfo) {
      return res.status(400).json({ success: false, error: "Reason, remarks, or required information must be provided for this KYC decision." });
    }
    if (String(reviewReason).toLowerCase() === "other" && !reviewRemarks) {
      return res.status(400).json({ success: false, error: "Admin remarks are required when reason is Other." });
    }

    const { data: current, error: currentError } = await supabase
      .from("vendors")
      .select("id, status, lifecycle_status, kyc_status, onboarding_payment_status, owner_user_id")
      .eq("id", req.params.vendor_id)
      .single();
    if (currentError || !current) return res.status(404).json({ success: false, error: "Vendor not found." });

    const now = new Date().toISOString();
    const noteParts = [
      reviewReason ? `Reason: ${reviewReason}` : "",
      reviewRemarks ? `Remarks: ${reviewRemarks}` : "",
      requiredInfo ? `Required information: ${requiredInfo}` : "",
      followUpDate ? `Follow-up date: ${followUpDate}` : "",
    ].filter(Boolean);
    const decisionNote = noteParts.join("\n") || "KYC status updated";

    if (nextStatus === "kyc_verified") {
      const { data: vendorForApproval, error: vendorForApprovalError } = await supabase
        .from("vendors")
        .select("id, category")
        .eq("id", req.params.vendor_id)
        .single();
      if (vendorForApprovalError || !vendorForApproval) return res.status(404).json({ success: false, error: "Vendor not found." });
      await assertRequiredKycDocumentsSubmitted(req.params.vendor_id, vendorForApproval.category);
    }

    if (nextStatus === "kyc_verified") {
      const { error: documentVerifyError } = await supabase
        .from("vendor_kyc_documents")
        .update({
          status: "verified",
          reviewer_user_id: req.auth?.user_id || null,
          reviewed_at: now,
          rejection_reason: null,
        })
        .eq("vendor_id", req.params.vendor_id)
        .neq("status", "rejected");
      if (documentVerifyError) throw documentVerifyError;
    }

    if (nextStatus === "additional_information_required" || nextStatus === "kyc_rejected") {
      const docStatus = nextStatus === "kyc_rejected" ? "rejected" : "additional_information_required";
      const { error: documentReviewError } = await supabase
        .from("vendor_kyc_documents")
        .update({
          status: docStatus,
          reviewer_user_id: req.auth?.user_id || null,
          reviewed_at: now,
          rejection_reason: decisionNote,
        })
        .eq("vendor_id", req.params.vendor_id)
        .neq("status", "deleted");
      if (documentReviewError) throw documentReviewError;
    }

    const nextLifecycle = nextStatus === "kyc_rejected"
      ? "kyc_rejected"
      : nextStatus === "kyc_verified" && current.onboarding_payment_status === "payment_completed"
        ? "approval_pending"
        : nextStatus === "kyc_verified" || nextStatus === "kyc_provisionally_cleared" || nextStatus === "provisional_approved"
          ? "payment_pending"
          : "kyc_pending";

    const { data, error } = await supabase
      .from("vendors")
      .update({
        kyc_status: nextStatus,
        status: current.status === "active" ? "active" : nextLifecycle,
        lifecycle_status: current.status === "active" ? "active" : nextLifecycle,
        kyc_last_reviewed_by: req.auth?.user_id || null,
        kyc_last_reviewed_by_admin_id: req.adminProfile?.admin_id || null,
        kyc_last_reviewed_by_admin_name: req.adminProfile?.admin_name || null,
        kyc_final_decision_at: ["kyc_verified", "kyc_rejected"].includes(nextStatus) ? now : null,
        updated_at: now,
      })
      .eq("id", req.params.vendor_id)
      .select()
      .single();
    if (error) throw error;

    await supabase.from("vendor_status_history").insert({
      vendor_id: req.params.vendor_id,
      previous_status: current.kyc_status,
      next_status: nextStatus,
      changed_by: req.auth?.user_id || null,
      change_reason: decisionNote,
    });

    const notificationText = nextStatus === "kyc_verified"
      ? "Your vendor KYC has been verified. Payment can now unlock according to the onboarding flow."
      : nextStatus === "additional_information_required"
        ? `Additional verification is required. ${decisionNote}`
        : nextStatus === "kyc_rejected"
          ? `Your vendor KYC was rejected. ${decisionNote}`
          : `Your vendor KYC status changed to ${nextStatus.replace(/_/g, " ")}.`;
    await supabase.from("vendor_notifications").insert({
      vendor_id: req.params.vendor_id,
      owner_user_id: current.owner_user_id || null,
      notification_type: "vendor_kyc_review",
      title: "Vendor KYC Update",
      body: notificationText,
      payload: {
        previous_status: current.kyc_status,
        next_status: nextStatus,
        reason: reviewReason || null,
        admin_remarks: reviewRemarks || null,
        required_information: requiredInfo || null,
        follow_up_date: followUpDate || null,
      },
    });

    return res.json({ success: true, vendor: data });
  } catch (error) {
    console.error("Vendor KYC status update failed", {
      message: error?.message,
      code: error?.code || null,
      details: error?.details || null,
    });
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/:vendor_id/activate", ...requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("id, status, kyc_status, onboarding_payment_status")
      .eq("id", req.params.vendor_id)
      .single();
    if (vendorError || !vendor) return res.status(404).json({ success: false, error: "Vendor not found." });

    if (!["kyc_verified", "kyc_provisionally_cleared", "provisional_approved"].includes(vendor.kyc_status) || vendor.onboarding_payment_status !== "payment_completed") {
      return res.status(409).json({ success: false, error: "Vendor can be activated only after verified/provisional KYC and completed onboarding payment." });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("vendors")
      .update({
        status: "active",
        lifecycle_status: "active",
        public_verification_badge: vendor.kyc_status === "kyc_verified",
        activated_at: now,
        activated_by: req.auth?.user_id || null,
      })
      .eq("id", req.params.vendor_id)
      .select()
      .single();
    if (error) throw error;

    await supabase.from("vendor_status_history").insert({
      vendor_id: req.params.vendor_id,
      previous_status: vendor.status,
      next_status: "active",
      changed_by: req.auth?.user_id || null,
      change_reason: reason || "Admin approved final activation",
    });

    return res.json({ success: true, vendor: data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

export default router;