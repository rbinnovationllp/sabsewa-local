import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [settlement, wallet, orders, storage, payments, credit, reminderJob, index, pkg, customerLedger, migration] = await Promise.all([
  read("../settlement/settlementRoutes.js"),
  read("../securityWallet/securityWalletRoutes.js"),
  read("../hyperlocal/vendorOrderActions.js"),
  read("../storage/s3Routes.js"),
  read("../payments/razorpayWebhookRoutes.js"),
  read("../credit/vendorCreditService.js"),
  read("../credit/creditReminderJob.js"),
  read("../index.js"),
  read("../package.json"),
  read("../../app/customer/CreditLedger.tsx"),
  read("../../../supabase/RUN_ONLY_FINANCIAL_SECURITY_AND_CREDIT_REMINDER_DEDUPE_2026_09_28.sql"),
]);

for (const [name, source] of [["settlement", settlement], ["wallet", wallet], ["orders", orders]]) {
  assert.match(source, /router\.use\(requireAuth\)/, `${name} routes must reject unauthenticated requests`);
}
assert.match(settlement, /requireOwnedVendor/, "Settlement vendor resources need ownership checks");
assert.match(settlement, /requireOrderParticipant/, "Order payment context needs participant authorization");
assert.match(settlement, /storage\/admin\/overview", requireRole/, "Storage administration must be admin-only");
assert.match(wallet, /admin\/disputes", requireRole/, "Wallet disputes must be admin-only");
assert.match(wallet, /:vendor_id", requireOwnedVendor/, "Vendor wallet reads need ownership checks");
assert.match(orders, /vendorOwnedByUser\(order\.vendor_id, req\.auth\.user_id\)/, "Order actions need authenticated vendor ownership");
assert.match(orders, /requireCustomerOrderOwner/, "Customer responses need order ownership");
assert.match(storage, /presign-product-image", requireAuth, requireOwnedVendor/, "Vendor image uploads need authenticated ownership");
assert.match(storage, /vendor\/:vendor_id\/usage", requireAuth, requireOwnedVendor/, "Vendor storage usage needs authenticated ownership");
assert.match(storage, /uploaded_by: req\.auth\.user_id/, "Storage audit identity must come from the JWT");
assert.match(payments, /verify-vendor-invoice", requireAuth/, "Manual payment verification must require authentication");
assert.match(payments, /owner_user_id", req\.auth\.user_id/, "Manual payment verification must enforce invoice vendor ownership");
assert.match(credit, /NEAR_LIMIT_RATIO = 0\.9/, "Credit alert threshold must be 90%");
assert.match(reminderJob, /limit \* 0\.9/, "Scheduled credit reminder threshold must be 90%");
assert.match(credit, /idempotency_key: reminderKey/, "Credit reminders need stable idempotency keys");
assert.match(customerLedger, /Credit Limit Alert/, "Customer must see the vendor-specific 90% warning");
assert.match(index, /import\("\.\/cron\/reminders\.js"\)/, "Reminder scheduler must load at startup");
assert.equal(JSON.parse(pkg).dependencies["node-cron"].startsWith("^3."), true, "node-cron must be installed");
assert.match(migration, /uq_vendor_credit_reminder_idempotency/, "Reminder idempotency needs a database constraint");

console.log("Financial route authorization and credit reminder validation passed.");
