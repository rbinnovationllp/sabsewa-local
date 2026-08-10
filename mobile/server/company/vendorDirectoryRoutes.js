import express from "express";
import { supabase } from "../connection.js";
import { requireUserJwt } from "../security/apiSecurity.js";
import { requireCompanyAdmin, writeAdminAudit } from "./adminProfileService.js";

const router = express.Router();
const requireAnyCompanyAdmin = [requireUserJwt(supabase), requireCompanyAdmin("vendors.manage")];
const requireKycReviewer = [requireUserJwt(supabase), requireCompanyAdmin("kyc.review")];
const SLA_MS = 48 * 60 * 60 * 1000;
const APPROACHING_MS = 6 * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function deadlineFrom(dateValue) {
  const base = dateValue ? new Date(dateValue) : new Date();
  return new Date(base.getTime() + SLA_MS).toISOString();
}

function classifyKyc(vendor) {
  const status = vendor.kyc_status || "kyc_not_started";
  const deadline = vendor.kyc_review_deadline_at ? new Date(vendor.kyc_review_deadline_at).getTime() : null;
  const remaining = deadline ? deadline - Date.now() : null;
  return {
    ...vendor,
    kyc_sla: {
      deadline_at: vendor.kyc_review_deadline_at || null,
      milliseconds_remaining: remaining,
      hours_pending: vendor.kyc_submitted_at ? Math.max(0, (Date.now() - new Date(vendor.kyc_submitted_at).getTime()) / 36e5) : null,
      is_overdue: status === "kyc_under_review" && remaining != null && remaining <= 0,
      is_approaching_deadline: status === "kyc_under_review" && remaining != null && remaining > 0 && remaining <= APPROACHING_MS,
    },
  };
}

async function applyKycSlaAutoProvisionalClearance() {
  const { data: overdue, error } = await supabase
    .from("vendors")
    .select("id, kyc_status, kyc_review_deadline_at")
    .eq("kyc_status", "kyc_under_review")
    .lte("kyc_review_deadline_at", nowIso())
    .limit(100);
  if (error) throw error;
  if (!overdue?.length) return [];

  const ids = overdue.map((vendor) => vendor.id);
  const { data, error: updateError } = await supabase
    .from("vendors")
    .update({
      kyc_status: "kyc_provisionally_cleared",
      kyc_provisional_clearance_at: nowIso(),
      lifecycle_status: "payment_pending",
      status: "payment_pending",
      updated_at: nowIso(),
    })
    .in("id", ids)
    .select("id, shop_name, kyc_status, kyc_provisional_clearance_at");
  if (updateError) throw updateError;

  await Promise.all((data || []).map((vendor) =>
    supabase.from("vendor_status_history").insert({
      vendor_id: vendor.id,
      previous_status: "kyc_under_review",
      next_status: "kyc_provisionally_cleared",
      change_reason: "Automatic provisional clearance after 48-hour KYC review SLA elapsed",
    })
  ));
  return data || [];
}

router.get("/vendors", ...requireAnyCompanyAdmin, async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const cityCode = String(req.query.city_code || "").trim().toUpperCase();
    const localityCode = String(req.query.locality_code || "").trim().toUpperCase();

    let vendorQuery = supabase
      .from("vendors")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (cityCode) vendorQuery = vendorQuery.eq("city_code", cityCode);
    if (localityCode) vendorQuery = vendorQuery.eq("locality_code", localityCode);

    if (search) {
      vendorQuery = vendorQuery.or(
        [
          `public_vendor_id.ilike.%${search}%`,
          `shop_name.ilike.%${search}%`,
          `owner_name.ilike.%${search}%`,
          `phone.ilike.%${search}%`,
          `city_code.ilike.%${search}%`,
          `locality_code.ilike.%${search}%`,
        ].join(",")
      );
    }

    const { data: vendors, error: vendorError } = await vendorQuery;
    if (vendorError) throw vendorError;

    const vendorIds = (vendors || []).map((vendor) => vendor.id);
    const { data: terminals } = vendorIds.length
      ? await supabase.from("vendor_terminals").select("*").in("vendor_id", vendorIds).order("created_at")
      : { data: [] };

    return res.json({
      success: true,
      vendors: (vendors || []).map((vendor) => ({
        ...classifyKyc(vendor),
        terminals: (terminals || []).filter((terminal) => terminal.vendor_id === vendor.id),
      })),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/kyc/summary", ...requireKycReviewer, async (req, res) => {
  try {
    const provisional = await applyKycSlaAutoProvisionalClearance();
    const { data: vendors, error } = await supabase
      .from("vendors")
      .select("id, kyc_status, kyc_submitted_at, kyc_review_deadline_at")
      .in("kyc_status", [
        "kyc_submitted",
        "kyc_under_review",
        "kyc_provisionally_cleared",
        "additional_information_required",
        "kyc_verified",
        "kyc_rejected",
      ]);
    if (error) throw error;

    const summary = {
      new_submitted: 0,
      pending_review: 0,
      approaching_deadline: 0,
      overdue: 0,
      provisionally_cleared: 0,
      approved: 0,
      rejected: 0,
      resubmission_required: 0,
      auto_provisioned_now: provisional.length,
    };

    for (const vendor of vendors || []) {
      const classified = classifyKyc(vendor);
      if (vendor.kyc_status === "kyc_submitted") summary.new_submitted += 1;
      if (vendor.kyc_status === "kyc_under_review") summary.pending_review += 1;
      if (classified.kyc_sla.is_approaching_deadline) summary.approaching_deadline += 1;
      if (classified.kyc_sla.is_overdue) summary.overdue += 1;
      if (vendor.kyc_status === "kyc_provisionally_cleared") summary.provisionally_cleared += 1;
      if (vendor.kyc_status === "kyc_verified") summary.approved += 1;
      if (vendor.kyc_status === "kyc_rejected") summary.rejected += 1;
      if (vendor.kyc_status === "additional_information_required") summary.resubmission_required += 1;
    }

    await writeAdminAudit({ req, action: "kyc_summary_view", entityType: "vendors", metadata: { summary } });
    return res.json({ success: true, summary });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/kyc/queue", ...requireKycReviewer, async (req, res) => {
  try {
    await applyKycSlaAutoProvisionalClearance();
    const filter = String(req.query.filter || "pending_review");
    let statuses = ["kyc_submitted", "kyc_under_review"];
    if (filter === "provisionally_cleared") statuses = ["kyc_provisionally_cleared"];
    if (filter === "approved") statuses = ["kyc_verified"];
    if (filter === "rejected") statuses = ["kyc_rejected"];
    if (filter === "resubmission_required") statuses = ["additional_information_required"];
    if (filter === "all") statuses = ["kyc_submitted", "kyc_under_review", "kyc_provisionally_cleared", "additional_information_required", "kyc_verified", "kyc_rejected"];

    const { data: vendors, error } = await supabase
      .from("vendors")
      .select("id, public_vendor_id, shop_name, owner_name, phone, category, city_code, locality_code, status, lifecycle_status, kyc_status, kyc_submitted_at, kyc_review_deadline_at, kyc_provisional_clearance_at, kyc_final_decision_at, created_at")
      .in("kyc_status", statuses)
      .order("kyc_submitted_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(250);
    if (error) throw error;

    await writeAdminAudit({ req, action: "kyc_queue_view", entityType: "vendors", metadata: { filter, count: vendors?.length || 0 } });
    return res.json({ success: true, vendors: (vendors || []).map(classifyKyc) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/admins", ...requireAnyCompanyAdmin, async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    let query = supabase
      .from("admin_profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(250);
    if (search) {
      query = query.or(`admin_name.ilike.%${search}%,admin_id.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,role.ilike.%${search}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return res.json({ success: true, admins: data || [] });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/admins", ...requireAnyCompanyAdmin, async (req, res) => {
  try {
    const { user_id, admin_name, phone, email = null, role, permissions = {}, jurisdiction = {} } = req.body || {};
    if (!user_id || !admin_name?.trim() || !phone?.trim() || !role?.trim()) {
      return res.status(400).json({ success: false, error: "User ID, admin name, mobile number and role are required." });
    }
    const { data, error } = await supabase
      .from("admin_profiles")
      .upsert({
        user_id,
        admin_name: admin_name.trim(),
        phone: phone.trim(),
        email: email || null,
        role,
        permissions,
        jurisdiction,
        account_status: "active",
        created_by: req.auth.user_id,
        authorized_by: req.auth.user_id,
        updated_at: nowIso(),
      }, { onConflict: "user_id" })
      .select()
      .single();
    if (error) throw error;

    await supabase.from("admin_role_assignments").upsert({
      user_id,
      role,
      permissions,
      is_active: true,
      assigned_by: req.auth.user_id,
      updated_at: nowIso(),
    }, { onConflict: "user_id,role" });

    await supabase.auth.admin.updateUserById(user_id, { user_metadata: { role } });
    await writeAdminAudit({ req, action: "admin_profile_authorized", entityType: "admin_profiles", entityId: data.id, targetUserId: user_id, metadata: { admin_id: data.admin_id, role } });
    return res.status(201).json({ success: true, admin: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.patch("/admins/:admin_id/status", ...requireAnyCompanyAdmin, async (req, res) => {
  try {
    const { account_status } = req.body || {};
    if (!["active", "suspended", "revoked"].includes(account_status)) {
      return res.status(400).json({ success: false, error: "Invalid admin account status." });
    }
    const patch = { account_status, updated_at: nowIso() };
    if (account_status === "suspended") patch.suspended_at = nowIso();
    if (account_status === "revoked") patch.revoked_at = nowIso();

    const { data, error } = await supabase
      .from("admin_profiles")
      .update(patch)
      .eq("id", req.params.admin_id)
      .select()
      .single();
    if (error) throw error;

    if (account_status !== "active") {
      await supabase.from("admin_role_assignments").update({ is_active: false, revoked_at: nowIso(), revoked_by: req.auth.user_id }).eq("user_id", data.user_id);
    }
    await writeAdminAudit({ req, action: `admin_${account_status}`, entityType: "admin_profiles", entityId: data.id, targetUserId: data.user_id, metadata: { admin_id: data.admin_id } });
    return res.json({ success: true, admin: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;