import { supabase } from "../connection.js";

export const ACTIVE_VENDOR_STATUS = "active";

export function isVendorActive(vendor) {
  return (
    vendor?.status === ACTIVE_VENDOR_STATUS &&
    vendor?.kyc_status === "kyc_verified" &&
    vendor?.onboarding_payment_status === "payment_completed"
  );
}

export async function getVendorOnboardingSummary(vendorId) {
  const { data, error } = await supabase.rpc("vendor_onboarding_payment_summary", {
    p_vendor_id: vendorId,
  });
  if (error) throw error;
  return data;
}

export async function assertVendorCanPublishProducts(vendorId) {
  const { data: vendor, error } = await supabase
    .from("vendors")
    .select("id, status, lifecycle_status, kyc_status, onboarding_payment_status, category, shop_name")
    .eq("id", vendorId)
    .single();

  if (error || !vendor) {
    const err = new Error("Vendor profile was not found.");
    err.statusCode = 404;
    throw err;
  }

  if (isVendorActive(vendor)) return vendor;

  const summary = await getVendorOnboardingSummary(vendorId);
  const err = new Error(
    "Complete your SabSewa Local onboarding to list your store and publish products. Your payable amount includes the category-specific onboarding fee and the Rs 5,000 security deposit."
  );
  err.statusCode = 403;
  err.onboarding_required = true;
  err.vendor_status = vendor.status;
  err.kyc_status = vendor.kyc_status;
  err.payment_status = vendor.onboarding_payment_status;
  err.payment_summary = summary;
  throw err;
}

export async function assertVendorCanReceiveOrdersByStatus(vendorId) {
  const { data: vendor, error } = await supabase
    .from("vendors")
    .select("id, status, lifecycle_status, kyc_status, onboarding_payment_status, category, shop_name")
    .eq("id", vendorId)
    .single();

  if (error || !vendor) {
    const err = new Error("Vendor profile was not found.");
    err.statusCode = 404;
    throw err;
  }

  if (isVendorActive(vendor)) return vendor;

  const err = new Error("This shop is not active for customer orders. Vendor KYC and onboarding payment must be completed first.");
  err.statusCode = 409;
  throw err;
}
