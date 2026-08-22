import { MASTER_ADMIN_SESSION_STORAGE_KEY } from "@/lib/backend";

export const ACTIVE_ROLE_CONTEXT_STORAGE_KEY = "sabsewa_active_role_context";

type VendorProfile = {
  id?: string | null;
  status?: string | null;
  lifecycle_status?: string | null;
  kyc_status?: string | null;
  onboarding_payment_status?: string | null;
};

function clean(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function vendorPath(path: string, vendorId: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ vendor: vendorId, ...params });
  return `${path}?${query.toString()}`;
}

export function clearStaleAdminNavigationState() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(MASTER_ADMIN_SESSION_STORAGE_KEY);
  window.sessionStorage.removeItem("returnTo");
  window.sessionStorage.removeItem("redirectTo");
  window.sessionStorage.removeItem("sabsewa_return_to");
  window.sessionStorage.removeItem("sabsewa_redirect_to");
  window.sessionStorage.removeItem("last_module");
}

export function setVendorSessionContext() {
  if (typeof window === "undefined") return;
  clearStaleAdminNavigationState();
  window.sessionStorage.setItem(ACTIVE_ROLE_CONTEXT_STORAGE_KEY, "vendor");
}

export function clearRoleSessionContext() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(ACTIVE_ROLE_CONTEXT_STORAGE_KEY);
}

export function getRoleSessionContext() {
  if (typeof window === "undefined") return "";
  return clean(window.sessionStorage.getItem(ACTIVE_ROLE_CONTEXT_STORAGE_KEY));
}

export function vendorDestinationForStatus(vendor: VendorProfile) {
  const vendorId = String(vendor?.id || "");
  if (!vendorId) return "/vendor/register";

  const kycStatus = clean(vendor.kyc_status);
  const paymentStatus = clean(vendor.onboarding_payment_status);
  const lifecycleStatus = clean(vendor.lifecycle_status || vendor.status);
  const publicStatus = clean(vendor.status);

  if (["suspended", "terminated", "revoked", "blocked"].includes(lifecycleStatus) || ["suspended", "terminated", "revoked", "blocked"].includes(publicStatus)) {
    return vendorPath("/vendor/Onboarding", vendorId, { status: "suspended" });
  }

  if (publicStatus === "active" || lifecycleStatus === "active") {
    return vendorPath("/vendor/dashboard", vendorId);
  }

  if (["additional_information_required", "kyc_rejected", "resubmission_required"].includes(kycStatus)) {
    return vendorPath("/vendor/KYC", vendorId, { resubmission: "1" });
  }

  if (["kyc_under_review", "kyc_submitted", "manual_review_pending"].includes(kycStatus)) {
    return vendorPath("/vendor/KYC", vendorId, { status: "under_review" });
  }

  if (["kyc_verified", "kyc_provisionally_cleared", "provisional_approved"].includes(kycStatus)) {
    if (["payment_completed", "paid", "confirmed"].includes(paymentStatus)) {
      return vendorPath("/vendor/Onboarding", vendorId, { activation_pending: "1" });
    }
    if (["payment_processing", "processing", "created"].includes(paymentStatus)) {
      return vendorPath("/vendor/Onboarding", vendorId, { payment_status: "processing" });
    }
    return vendorPath("/vendor/Onboarding", vendorId, { payment_pending: "1" });
  }

  return vendorPath("/vendor/KYC", vendorId);
}
