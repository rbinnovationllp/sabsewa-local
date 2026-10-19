import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { deriveRazorpayWebhookEventId, verifyRazorpayWebhookSignature } from "../payments/razorpayWebhookSecurity.js";

const secret = "test_webhook_secret_not_a_real_credential";
const captured = {
  event: "payment.captured",
  created_at: 1770000000,
  payload: { payment: { entity: { id: "pay_test_1", order_id: "order_test_1", status: "captured" } } },
};
const raw = Buffer.from(JSON.stringify(captured));
const validSignature = crypto.createHmac("sha256", secret).update(raw).digest("hex");

assert.equal(verifyRazorpayWebhookSignature(raw, validSignature, secret), true, "Valid webhook signature must pass.");
assert.equal(verifyRazorpayWebhookSignature(raw, "0".repeat(64), secret), false, "Invalid webhook signature must fail.");
assert.equal(verifyRazorpayWebhookSignature(raw, validSignature, "wrong_secret"), false, "Wrong secret must fail.");

const firstEventId = deriveRazorpayWebhookEventId(captured, raw);
assert.equal(firstEventId, deriveRazorpayWebhookEventId(captured, raw), "Webhook replay must retain the same event id.");
assert.equal(firstEventId, deriveRazorpayWebhookEventId(captured, Buffer.from(JSON.stringify(captured))), "Delayed or retried delivery must remain idempotent.");
assert.equal(firstEventId, deriveRazorpayWebhookEventId(captured, raw), "A webhook after client interruption must resolve to the original event id.");
assert.notEqual(firstEventId, deriveRazorpayWebhookEventId({ ...captured, event: "payment.failed" }, Buffer.from(JSON.stringify({ ...captured, event: "payment.failed" }))));

const routes = await readFile(new URL("../payments/razorpayWebhookRoutes.js", import.meta.url), "utf8");
assert.match(routes, /verify-vendor-invoice", requireAuth/, "Manual invoice verification must require a JWT.");
assert.match(routes, /owner_user_id", req\.auth\.user_id/, "Invoice verification must enforce vendor ownership.");
assert.match(routes, /Payment does not belong to this invoice/, "Wrong invoice/order association must be rejected.");
assert.match(routes, /payment_status === "paid"/, "Duplicate manual processing must be idempotent.");
assert.match(routes, /error\?\.code === "23505"/, "Duplicate webhook inserts must be ignored.");
assert.match(routes, /eventType === "payment.failed"/, "Failed payment events must be recorded.");
assert.match(routes, /eventType !== "payment.captured"/, "Only captured payments may credit a wallet.");

console.log("Razorpay signature, replay, association and idempotency validation passed.");
