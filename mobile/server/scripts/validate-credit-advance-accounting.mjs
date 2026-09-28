import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateAdvanceApplication, calculateCreditPayment } from "../credit/creditAccounting.js";

const partial = calculateCreditPayment({ outstanding: 4500, payment: 2000 });
assert.equal(partial.outstanding_after, 2500);
assert.equal(partial.advance_after, 0);

const overpayment = calculateCreditPayment({ outstanding: 2500, payment: 3000 });
assert.equal(overpayment.outstanding_after, 0);
assert.equal(overpayment.advance_after, 500);

const largerOrder = calculateAdvanceApplication({ outstanding: 0, advance: 500, orderAmount: 800, creditLimit: 5000 });
assert.deepEqual({ advance: largerOrder.advance_after, credit: largerOrder.credit_required }, { advance: 0, credit: 300 });

const smallerOrder = calculateAdvanceApplication({ outstanding: 0, advance: 500, orderAmount: 300, creditLimit: 5000 });
assert.deepEqual({ advance: smallerOrder.advance_after, credit: smallerOrder.credit_required }, { advance: 200, credit: 0 });

const blocked = calculateAdvanceApplication({ outstanding: 4500, advance: 0, orderAmount: 600, creditLimit: 5000 });
assert.equal(blocked.allowed, false);

const vendorA = calculateCreditPayment({ outstanding: 2500, payment: 3000 });
const vendorB = calculateAdvanceApplication({ outstanding: 0, advance: 0, orderAmount: 300, creditLimit: 0 });
assert.equal(vendorA.advance_after, 500);
assert.equal(vendorB.advance_applied, 0, "Advance from one vendor relationship must not apply to another vendor.");

const root = path.resolve(process.cwd(), "..", "..");
const sql = fs.readFileSync(path.join(root, "supabase", "RUN_ONLY_VENDOR_CUSTOMER_CREDIT_ADVANCE_ATOMIC_2026_09_28.sql"), "utf8");
const routes = fs.readFileSync(path.join(root, "mobile", "server", "credit", "vendorCreditRoutes.js"), "utf8");
const settlement = fs.readFileSync(path.join(root, "mobile", "server", "settlement", "settlementRoutes.js"), "utf8");
const vendorActions = fs.readFileSync(path.join(root, "mobile", "server", "hyperlocal", "vendorOrderActions.js"), "utf8");
assert.match(sql, /for update/, "Atomic database functions must lock the vendor-customer credit account.");
assert.match(sql, /uq_vendor_credit_transaction_idempotency/, "Financial ledger needs an idempotency uniqueness constraint.");
assert.match(sql, /advance_balance/, "Vendor-specific advance balance must be persisted.");
assert.match(routes, /requireAuth, requireOwnedVendor/, "Vendor credit mutations must require authenticated ownership.");
assert.match(settlement, /requireAuth, requireOwnCustomer/, "Customer credit records must require the matching authenticated customer.");
assert.match(settlement, /repayment-request:\$\{request\.id\}/, "Repayment verification must use a stable idempotency key.");
assert.match(settlement, /deductConfirmedOrderFee\(\{ vendorId: order\.vendor_id, orderId: order\.id \}\)/, "Payment completion must deduct platform fee and GST from the vendor security wallet.");
assert.match(vendorActions, /deductConfirmedOrderFee\(\{ vendorId: req\.order\.vendor_id, orderId: order_id \}\)/, "Vendor completion must deduct platform fee and GST from the vendor security wallet.");

console.log("Vendor credit and vendor-specific advance accounting validation passed.");
