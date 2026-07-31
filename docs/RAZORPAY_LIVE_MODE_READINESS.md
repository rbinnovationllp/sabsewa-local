# Razorpay Live Mode Readiness

Updated: 2026-07-31

## Current Decision

SabSewa Local is **not ready to accept real vendor payments** until live Razorpay credentials, live webhooks and reconciliation checks are completed.

Safe current use:

- Vendor registration
- Vendor verification
- Catalogue setup
- Staff/vendor training
- Controlled test pilot without real money

Do not mark a vendor as payment-verified or eligible for commercial orders based on a Razorpay Test Mode payment.

## Test Mode Behaviour

Razorpay Test Mode transactions are simulations. They do not collect or settle real money into the company bank account.

In Test Mode the backend must:

- Verify payment responses for training/demo purposes.
- Store test payment attempts separately in `vendor_payment_test_events`.
- Store webhook receipt/replay evidence in `razorpay_webhook_events`.
- Never credit the production wallet ledger.
- Never mark `activation_fee_paid` because of a test payment.
- Never activate commercial order receiving because of a test payment.

## Live Mode Requirements

Set these only on the secure backend server, such as the EC2 PM2 environment:

```ini
RAZORPAY_ENVIRONMENT=live
RAZORPAY_MODE=live
RAZORPAY_KEY_ID=rzp_live_xxxxx
RAZORPAY_KEY_SECRET=live_secret_from_razorpay_dashboard
RAZORPAY_WEBHOOK_SECRET=live_webhook_secret_from_razorpay_dashboard
PUBLIC_API_URL=https://api.sabsewa.in
PUBLIC_APP_URL=https://www.sabsewa.in
RAZORPAY_LIVE_RECONCILIATION_TESTED=true
```

Never put `RAZORPAY_KEY_SECRET` or `RAZORPAY_WEBHOOK_SECRET` in the mobile app, browser bundle, GitHub, screenshots or command arguments.

## Webhook Endpoint

Configure this endpoint in the Razorpay Dashboard:

```text
https://api.sabsewa.in/api/payments/razorpay/webhook
```

Required event:

```text
payment.captured
```

Recommended additional events for later reconciliation:

```text
payment.failed
refund.processed
```

## Code-Level Guardrails

- The browser/mobile callback route verifies the Razorpay checkout response but does not credit wallet balance.
- Wallet credits and vendor activation are applied only from the verified Razorpay webhook route.
- Webhook signature verification uses the `x-razorpay-signature` header with HMAC-SHA256.
- `razorpay_webhook_events.event_id` is unique, so duplicate webhook delivery is ignored.
- First activation remains Rs 5,500 and is split into Rs 500 activation/service charge plus Rs 5,000 refundable wallet credit.
- Later standard top-ups remain Rs 5,000.

## Supabase SQL To Run

Run this in the live SabSewa Local Supabase SQL Editor:

```text
C:\Users\HP\SabSewa-Local\supabase\RUN_ONLY_RAZORPAY_ENVIRONMENT_SAFEGUARDS.sql
```

Expected result:

- `vendor_payment_test_events` exists.
- `razorpay_webhook_events` exists.
- RLS is enabled on both.
- Admin read policies are present.
- `vendor_security_wallet_transactions.payment_environment` exists.

## Acceptance Tests Before Real Vendor Money

- Test Mode payment shows: `TEST MODE - NO REAL MONEY WILL BE COLLECTED`.
- Test payment creates no production wallet credit.
- Test payment does not activate vendor order receiving.
- Test webhook writes one `razorpay_webhook_events` row.
- Replaying the same webhook event returns duplicate ignored and does not credit twice.
- Live Mode dashboard shows: `LIVE MODE - REAL PAYMENTS ENABLED`.
- A single live Rs 5,500 payment is captured in Razorpay.
- Supabase wallet shows exactly Rs 5,000 usable refundable balance.
- The Rs 500 activation/service charge is recorded separately and not refundable.
- A later live Rs 5,000 top-up adds Rs 5,000 and does not charge another activation fee.

