import express from "express";
import { supabase } from "../connection.js";
import { requireUserJwt } from "../security/apiSecurity.js";

const router = express.Router();
const requireAuth = requireUserJwt(supabase);

const ORDINARY_FIELDS = new Set([
  "shop_description",
  "business_hours",
  "delivery_radius_meters",
  "price_display_preference",
  "shop_support_contact_preference",
  "preferred_language",
  "notification_settings",
]);

const CHANGE_CATEGORIES = new Set([
  "sensitive_contact",
  "legal_identity",
  "business_address",
  "bank_details",
  "kyc_documents",
  "account_recovery",
]);

const MAX_TEXT_LENGTH = 1000;
const MAX_RADIUS_METERS = 5000;

function nowIso() {
  return new Date().toISOString();
}

function maskValue(field, value) {
  const raw = String(value || "");
  if (!raw) return null;
  if (field.toLowerCase().includes("bank") || field.toLowerCase().includes("account")) return `****${raw.slice(-4)}`;
  if (field.toLowerCase().includes("phone") || field.toLowerCase().includes("mobile")) return `******${raw.slice(-4)}`;
  if (field.toLowerCase().includes("email")) {
    const [name, domain] = raw.split("@");
    if (!domain) return "***";
    return `${name.slice(0, 2)}***@${domain}`;
  }
  if (field.toLowerCase().includes("pan") || field.toLowerCase().includes("gst")) return `****${raw.slice(-4)}`;
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

function cleanText(value) {
  if (value === undefined || value === null) return null;
  return String(value).trim().slice(0, MAX_TEXT_LENGTH);
}

function cleanOperationalChanges(body = {}) {
  const changes = {};
  for (const field of ORDINARY_FIELDS) {
    if (!(field in body)) continue;
    if (field === "delivery_radius_meters") {
      const radius = Number(body[field]);
      if (!Number.isFinite(radius) || radius < 0 || radius > MAX_RADIUS_METERS) {
        throw new Error(`Delivery radius must be between 0 and ${MAX_RADIUS_METERS} metres.`);
      }
      changes[field] = Math.round(radius);
    } else if (field === "notification_settings") {
      changes[field] = typeof body[field] === "object" && !Array.isArray(body[field]) ? body[field] : {};
    } else {
      changes[field] = cleanText(body[field]);
    }
  }
  return changes;
}

async function ownedVendor(vendorId, userId) {
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", vendorId)
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function writeAudit(event) {
  const { error } = await supabase.from("vendor_profile_change_audit").insert(event);
  if (error) console.warn("Vendor profile audit write failed", { code: error.code, message: error.message });
}

router.get("/:vendor_id/profile", requireAuth, async (req, res) => {
  try {
    const vendor = await ownedVendor(req.params.vendor_id, req.auth.user_id);
    if (!vendor) return res.status(404).json({ success: false, error: "Vendor profile not found for this authenticated user." });

    const { data: requests, error: requestError } = await supabase
      .from("vendor_profile_change_requests")
      .select("id, change_category, field_changes, supporting_document_ids, verification_status, review_status, submitted_at, reviewed_at, reviewer_id, reviewer_reason")
      .eq("vendor_id", vendor.id)
      .order("submitted_at", { ascending: false })
      .limit(25);
    if (requestError) throw requestError;

    return res.json({
      success: true,
      vendor: {
        id: vendor.id,
        shop_name: vendor.shop_name,
        owner_name: vendor.owner_name || vendor.vendor_name,
        phone: vendor.phone_number || vendor.phone,
        email: vendor.email,
        locality: vendor.locality || vendor.locality_code,
        city: vendor.city || vendor.city_code,
        category: vendor.category,
        status: vendor.status,
        lifecycle_status: vendor.lifecycle_status,
        kyc_status: vendor.kyc_status,
        onboarding_payment_status: vendor.onboarding_payment_status,
        shop_description: vendor.shop_description || "",
        business_hours: vendor.business_hours || "",
        delivery_radius_meters: vendor.delivery_radius_meters || null,
        price_display_preference: vendor.price_display_preference || "",
        shop_support_contact_preference: vendor.shop_support_contact_preference || "",
        preferred_language: vendor.preferred_language || "",
        notification_settings: vendor.notification_settings || {},
      },
      change_requests: requests || [],
      policy: {
        immediate_fields: Array.from(ORDINARY_FIELDS),
        manual_review_categories: Array.from(CHANGE_CATEGORIES).filter((item) => item !== "sensitive_contact"),
        step_up_categories: ["sensitive_contact", "account_recovery"],
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.patch("/:vendor_id/operational", requireAuth, async (req, res) => {
  try {
    const vendor = await ownedVendor(req.params.vendor_id, req.auth.user_id);
    if (!vendor) return res.status(404).json({ success: false, error: "Vendor profile not found for this authenticated user." });

    const changes = cleanOperationalChanges(req.body || {});
    if (!Object.keys(changes).length) return res.status(400).json({ success: false, error: "No ordinary operational fields were provided." });

    const before = {};
    for (const field of Object.keys(changes)) before[field] = vendor[field] ?? null;

    const { data, error } = await supabase
      .from("vendors")
      .update({ ...changes, updated_at: nowIso() })
      .eq("id", vendor.id)
      .eq("owner_user_id", req.auth.user_id)
      .select("id, shop_description, business_hours, delivery_radius_meters, price_display_preference, shop_support_contact_preference, preferred_language, notification_settings, updated_at")
      .single();
    if (error) throw error;

    await writeAudit({
      vendor_id: vendor.id,
      actor_user_id: req.auth.user_id,
      change_category: "ordinary_operational",
      field_changes: { previous: before, applied: changes },
      verification_status: "authenticated_trusted_session",
      review_status: "auto_applied",
      effective_at: nowIso(),
      device_or_session_reference: req.headers["x-sabsewa-device-id"] || null,
    });

    return res.json({ success: true, vendor: data });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

router.post("/:vendor_id/change-requests", requireAuth, async (req, res) => {
  try {
    const vendor = await ownedVendor(req.params.vendor_id, req.auth.user_id);
    if (!vendor) return res.status(404).json({ success: false, error: "Vendor profile not found for this authenticated user." });

    const category = String(req.body?.change_category || "").trim();
    if (!CHANGE_CATEGORIES.has(category)) {
      return res.status(400).json({ success: false, error: "Unsupported profile-change category." });
    }

    const proposed = req.body?.field_changes && typeof req.body.field_changes === "object" ? req.body.field_changes : {};
    if (!Object.keys(proposed).length) {
      return res.status(400).json({ success: false, error: "Provide the proposed changes for review." });
    }

    const masked = {};
    for (const [field, value] of Object.entries(proposed)) masked[field] = maskValue(field, value);

    const request = {
      vendor_id: vendor.id,
      actor_user_id: req.auth.user_id,
      change_category: category,
      field_changes: {
        proposed_masked: masked,
        proposed_private: proposed,
      },
      supporting_document_ids: Array.isArray(req.body?.supporting_document_ids) ? req.body.supporting_document_ids : [],
      verification_status: category === "sensitive_contact" ? "step_up_required" : "manual_review_required",
      review_status: "pending",
      submitted_at: nowIso(),
      device_or_session_reference: req.headers["x-sabsewa-device-id"] || null,
    };

    const { data, error } = await supabase
      .from("vendor_profile_change_requests")
      .insert(request)
      .select("id, change_category, verification_status, review_status, submitted_at")
      .single();
    if (error) throw error;

    await writeAudit({
      vendor_id: vendor.id,
      actor_user_id: req.auth.user_id,
      change_category: category,
      field_changes: { proposed_masked: masked },
      verification_status: request.verification_status,
      review_status: "pending",
      device_or_session_reference: request.device_or_session_reference,
    });

    return res.json({ success: true, request: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/:vendor_id/secure-account", requireAuth, async (req, res) => {
  try {
    const vendor = await ownedVendor(req.params.vendor_id, req.auth.user_id);
    if (!vendor) return res.status(404).json({ success: false, error: "Vendor profile not found for this authenticated user." });

    const now = nowIso();
    const { error } = await supabase
      .from("user_device_sessions")
      .update({ trusted: false, revoked_at: now, last_seen_at: now })
      .eq("user_id", req.auth.user_id)
      .is("revoked_at", null);
    if (error) throw error;

    await writeAudit({
      vendor_id: vendor.id,
      actor_user_id: req.auth.user_id,
      change_category: "secure_account",
      field_changes: { reason: cleanText(req.body?.reason || "Vendor reported unauthorized profile/device activity") },
      verification_status: "vendor_authenticated",
      review_status: "sessions_revoked",
      effective_at: now,
      device_or_session_reference: req.headers["x-sabsewa-device-id"] || null,
    });

    return res.json({ success: true, message: "Trusted devices were revoked. Please sign in again on devices you still control." });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
