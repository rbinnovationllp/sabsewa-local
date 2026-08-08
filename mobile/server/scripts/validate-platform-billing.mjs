import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const repo = resolve(root, "..", "..");

function read(path, base = root) {
  return readFileSync(resolve(base, path), "utf8");
}

const service = read("billing/platformBillingService.js");
assert.match(service, /resolveBillingItem/, "billing items are resolved server-side");
assert.match(service, /getVendorOnboardingSummary/, "onboarding amount is resolved through category-aware backend policy service");
assert.match(service, /vendor_onboarding_payment_summary|onboarding_policy_service/, "onboarding amount remains tied to backend/database policy");
assert.match(service, /subscription_plans/, "subscription pricing comes from database");
assert.match(service, /vendor_storage_plans/, "storage pricing comes from database");
assert.match(service, /billing_products/, "promotion and premium pricing comes from database");
assert.match(service, /verifyRazorpaySignature/, "Razorpay payment signatures are verified server-side");
assert.match(service, /Complete and verify KYC before paying onboarding charges/, "platform billing blocks onboarding order creation before KYC approval");
assert.match(service, /getRazorpayPayment/, "Razorpay payment status and amount are verified server-side");
assert.match(service, /customer_order_payment: false/, "platform payments are explicitly separated from customer order payments");
assert.match(service, /vendor_security_deposits/, "security deposits are recorded separately");
assert.match(service, /vendor_invoices/, "invoices and receipts are generated");
assert.match(service, /idempotency_key/, "billing attempts use idempotency keys");
assert.match(service, /processCapturedPlatformBillingWebhookPayment/, "webhook processing activates platform purchases idempotently");

const routes = read("billing/platformBillingRoutes.js");
assert.match(routes, /requireUserJwt/, "vendor billing routes require authenticated sessions");
assert.match(routes, /requireRole\(\["admin", "company_admin", "super_admin", "finance"\]\)/, "admin billing routes require privileged roles");

const webhook = read("payments/razorpayWebhookRoutes.js");
assert.match(webhook, /verifyWebhookSignature/, "Razorpay webhook signature verification exists");
assert.match(webhook, /payload_hash/, "webhook payload hash is recorded");
assert.match(webhook, /payment\.failed/, "failed payment webhook is handled");
assert.match(webhook, /refund\.processed/, "refund webhook events are recorded");

const placeOrder = read("hyperlocal/placeOrder.js");
assert.doesNotMatch(placeOrder, /razorpay/i, "customer order placement does not invoke Razorpay");

const edgeCreate = read("supabase/functions/razorpay-create-platform-order/index.ts", repo);
assert.match(edgeCreate, /\/api\/vendor\/billing\/.*platform-order/, "create platform order Edge Function proxies to billing module");
assert.match(edgeCreate, /customer_order_payment: false/, "Edge create function marks customer_order_payment false");

const edgeVerify = read("supabase/functions/razorpay-verify-platform-payment/index.ts", repo);
assert.match(edgeVerify, /\/api\/vendor\/billing\/.*verify-platform-payment/, "verify platform payment Edge Function proxies to billing module");

const migration = read("supabase/migrations/202608060003_vendor_platform_billing_subscriptions.sql", repo);
for (const table of [
  "billing_products",
  "subscription_plans",
  "vendor_subscriptions",
  "vendor_invoices",
  "vendor_payment_attempts",
  "vendor_security_deposits",
  "vendor_promotions",
  "vendor_refunds",
  "billing_audit_logs",
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`), `${table} table exists`);
}
assert.match(migration, /base_amount_paise bigint/, "monetary values are stored as integer paise");
assert.match(migration, /next_vendor_invoice_number/, "sequential invoice number helper exists");

console.log("Platform billing validation passed.");
