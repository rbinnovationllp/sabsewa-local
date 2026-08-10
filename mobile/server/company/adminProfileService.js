import { supabase } from "../connection.js";
import { isMasterAdminRole, verifyMasterAdminSessionToken } from "../security/masterAdminSecurity.js";

const ROLE_PERMISSIONS = {
  master_admin: ["all"],
  national_admin: ["kyc.review", "vendors.manage", "reports.view", "admins.view"],
  state_admin: ["kyc.review", "vendors.manage", "reports.view"],
  district_admin: ["kyc.review", "vendors.manage"],
  city_admin: ["kyc.review", "vendors.manage"],
  kyc_reviewer: ["kyc.review"],
  support_admin: ["support.manage", "vendors.view"],
  finance_admin: ["payments.review", "reports.view"],
  admin: ["kyc.review", "vendors.manage"],
  company_admin: ["kyc.review", "vendors.manage", "reports.view"],
  super_admin: ["all"],
};

export function adminRoleAllows(role, permission) {
  const permissions = ROLE_PERMISSIONS[String(role || "").toLowerCase()] || [];
  return permissions.includes("all") || permissions.includes(permission);
}

export async function getAdminProfile(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("admin_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export function requireCompanyAdmin(permission = "kyc.review") {
  return async function companyAdminGuard(req, res, next) {
    try {
      if (!req.auth?.user_id) return res.status(401).json({ success: false, error: "Authentication is required." });
      const role = String(req.auth.role || "").toLowerCase();

      if (isMasterAdminRole(role)) {
        const sessionToken = req.headers["x-master-admin-session"];
        if (!verifyMasterAdminSessionToken(sessionToken, req.auth.user_id)) {
          return res.status(403).json({ success: false, error: "Master Admin secret verification is required." });
        }
      }

      const profile = await getAdminProfile(req.auth.user_id);
      const hasActiveProfile = profile && profile.account_status === "active";
      const assigned = await supabase
        .from("admin_role_assignments")
        .select("role, permissions, is_active")
        .eq("user_id", req.auth.user_id)
        .eq("is_active", true);
      if (assigned.error) throw assigned.error;

      const roles = new Set([role, profile?.role, ...(assigned.data || []).map((row) => row.role)].filter(Boolean).map((value) => String(value).toLowerCase()));
      const customPermission = (assigned.data || []).some((row) => {
        const permissions = row.permissions || {};
        return permissions.all === true || permissions[permission] === true;
      });

      const allowedByRole = Array.from(roles).some((nextRole) => adminRoleAllows(nextRole, permission));
      if (!hasActiveProfile && !customPermission && !allowedByRole) {
        return res.status(403).json({ success: false, error: "You are not allowed to access Company CRM." });
      }

      req.adminProfile = profile || {
        user_id: req.auth.user_id,
        admin_id: null,
        admin_name: req.auth.user?.user_metadata?.full_name || "Admin",
        role,
      };
      return next();
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  };
}

export async function writeAdminAudit({ req, action, entityType, entityId, targetUserId = null, metadata = {} }) {
  const profile = req.adminProfile || await getAdminProfile(req.auth?.user_id);
  await supabase.from("admin_audit_logs").insert({
    actor_user_id: req.auth?.user_id || null,
    actor_admin_id: profile?.admin_id || null,
    actor_admin_name: profile?.admin_name || null,
    target_user_id: targetUserId,
    action,
    entity_type: entityType || null,
    entity_id: entityId || null,
    metadata: {
      ...metadata,
      actor_role: profile?.role || req.auth?.role || null,
    },
  });
}