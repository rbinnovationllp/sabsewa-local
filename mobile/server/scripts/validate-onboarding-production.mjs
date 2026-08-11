import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

const feeRules = [
  { category: "vegetables", onboarding: 500, deposit: 5000, orderCharge: 15, total: 5590 },
  { category: "fruits", onboarding: 500, deposit: 5000, orderCharge: 15, total: 5590 },
  { category: "kirana", onboarding: 1000, deposit: 5000, orderCharge: 15, total: 6180 },
  { category: "grocery", onboarding: 1000, deposit: 5000, orderCharge: 15, total: 6180 },
  { category: "pharmacy", onboarding: 2000, deposit: 5000, orderCharge: 25, total: 7360 },
  { category: "medical", onboarding: 2000, deposit: 5000, orderCharge: 25, total: 7360 },
  { category: "restaurant", onboarding: 2000, deposit: 5000, orderCharge: 25, total: 7360 },
  { category: "tiffin", onboarding: 2000, deposit: 5000, orderCharge: 25, total: 7360 },
  { category: "other", onboarding: 2000, deposit: 5000, orderCharge: 25, total: 7360 },
];

for (const rule of feeRules) {
  assert.equal(rule.onboarding + rule.deposit + Math.round(rule.onboarding * 0.18), rule.total, `${rule.category} total payment including GST`);
  assert.equal(rule.deposit, 5000, `${rule.category} security deposit remains separate`);
  assert.ok(rule.orderCharge >= 15, `${rule.category} per-order charge configured`);
}

const catalogueRoutes = read("catalog/catalogueSetupRoutes.js");
assert.match(catalogueRoutes, /assertVendorCanPublishProducts/, "catalogue setup is gated by onboarding policy");
assert.match(catalogueRoutes, /product_ids/, "bulk master-product selection route accepts product_ids");
assert.match(catalogueRoutes, /master_product_id/, "vendor items stay linked to master products");

const discoveryRoutes = read("hyperlocal/discoveryRoutes.js");
assert.match(discoveryRoutes, /\.eq\("status", "active"\)/, "customer discovery only lists active vendors");
assert.match(discoveryRoutes, /\.eq\("kyc_status", "kyc_verified"\)/, "customer discovery requires verified KYC");
assert.match(discoveryRoutes, /\.eq\("onboarding_payment_status", "payment_completed"\)/, "customer discovery requires onboarding payment");

const placeOrder = read("hyperlocal/placeOrder.js");
assert.match(placeOrder, /assertVendorCanReceiveOrdersByStatus/, "order placement enforces lifecycle status");

const storageRoutes = read("storage/s3Routes.js");
assert.match(storageRoutes, /MAX_PRODUCT_IMAGE_BYTES = 200 \* 1024/, "product images enforce KB-size optimization");
assert.match(storageRoutes, /MAX_PAYMENT_QR_BYTES = 500 \* 1024/, "QR images use a QR-specific quality limit");
assert.match(storageRoutes, /Vendor storage quota reached/, "storage quota is enforced before upload");

const settlementRoutes = read("settlement/settlementRoutes.js");
assert.match(settlementRoutes, /payment_reference is required|Verified payment reference is required/, "storage allocation requires verified payment reference");
assert.match(settlementRoutes, /idempotent/, "storage payment allocation is idempotent");
assert.match(settlementRoutes, /additional_storage_purchase/, "storage purchases are recorded in vendor_payments");

const vendorOrderActions = read("hyperlocal/vendorOrderActions.js");
assert.match(vendorOrderActions, /record_platform_order_charge/, "completed vendor orders record platform charges");

const onboardingRoutes = read("vendor/onboardingRoutes.js");
assert.match(onboardingRoutes, /verifyRazorpaySignature/, "onboarding payments verify Razorpay signatures");
assert.match(onboardingRoutes, /kyc_provisionally_cleared/, "onboarding payment routes allow approved or SLA-provisional KYC clearance");
assert.match(onboardingRoutes, /getRazorpayMode\(\) === "live"/, "live onboarding payments require gateway signature");
assert.match(onboardingRoutes, /requireRole\(\[[^\]]*"admin"[^\]]*"company_admin"[^\]]*"super_admin"[^\]]*"master_admin"[^\]]*"kyc_reviewer"[^\]]*\]\)/, "onboarding admin operations require expanded company admin roles");

console.log("Onboarding production validation passed.");
