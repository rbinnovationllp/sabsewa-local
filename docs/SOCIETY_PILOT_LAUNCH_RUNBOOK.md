# SabSewa Local Society Pilot Launch Runbook

Date: 2026-07-31

Pilot objective: launch SabSewa Local first as a production-oriented, mobile-friendly PWA for consenting residents in the owner's housing society, with at least one vegetable/fruit vendor and one kirana/general-store vendor.

Pilot access URL: https://www.sabsewa.in

Support: support@sabsewa.in, +91 8450092846, +91 8178113449

## Launch Rule

Do not invite real residents or accept real vendor money until the P0 checklist is complete:

- Live Supabase migrations applied successfully.
- RLS tested with separate customer, vendor, rider and admin accounts.
- Backend API at `https://api.sabsewa.in` is reachable.
- PWA uploaded to Hostinger and installable on mobile Chrome.
- Customer OTP registration tested.
- Vendor onboarding and terminal activation tested.
- Razorpay activation/top-up tested in the intended mode.
- Rs 15 acceptance deduction tested once and duplicate-click protection verified.
- Customer phone/address remains hidden until vendor acceptance.
- Gemini live call writes `gemini_agent_logs`.
- AWS S3 image upload and private image access tested.

## Pilot Scope

Included:

- Grocery/kirana products.
- Vegetables and fruits.
- Mobile browser and installable PWA use.
- Customer/vendor registration.
- Vendor catalogue, daily stock and pricing.
- Direct customer-vendor order payment.
- Vendor advance wallet and Rs 15 platform facilitation deduction after valid vendor acceptance.
- Vendor-defined delivery fee, free-delivery threshold and delivery estimate.
- English, Hindi and Kannada launch-language foundation.
- Support, feedback and dispute evidence.

Excluded from first pilot:

- Public advertising outside the society.
- Unverified vendors.
- Fake orders, fake testimonials or fabricated revenue.
- Company collection of customer order payments on behalf of vendors.
- Guaranteed fast-delivery promises.
- Automated credit recovery or company-guaranteed credit.

## Vendor Onboarding Checklist

Use one checklist per vendor.

- Vendor type: vegetable/fruit or kirana/general store.
- Vendor owner/proprietor name collected.
- Public shop/trade name collected.
- Business address and shop location verified.
- Registered mobile number OTP verified.
- Category selected correctly.
- GSTIN/PAN/FSSAI/drug licence collected where applicable.
- Shop photo captured with consent.
- Vendor Terms, Privacy Notice, Refund/Cancellation and Grievance policy shown.
- Vendor accepted legal terms using an unticked checkbox.
- Vendor understands customer order payment is direct between customer and vendor.
- Vendor understands the first activation payment is Rs 5,500:
  - Rs 500 one-time non-refundable activation/service charge.
  - Rs 5,000 refundable advance wallet balance.
- Vendor understands Rs 15 is deducted when they accept an order and will not be refunded merely because they later claim cancellation or private handling.
- Vendor understands customer phone/address remains hidden until formal acceptance.
- Vendor understands delivery estimates are not guaranteed countdown deadlines.
- Vendor sets:
  - Free-delivery minimum.
  - Delivery charge below minimum.
  - Service radius.
  - Estimated delivery window.
  - Pickup availability, if applicable.
- Vendor adds at least 10 real products.
- Product images are vendor-owned or properly permitted.
- Daily availability reviewed.
- Test order completed before live residents are invited.
- Vendor support contact confirmed.

## Customer Onboarding Message For Society Residents

Suggested WhatsApp/society notice:

```text
Hello everyone,

We are starting a small controlled pilot of SabSewa Local in our society.

SabSewa Local helps residents order groceries, vegetables, fruits and other daily essentials from trusted nearby shops through a mobile-friendly website: https://www.sabsewa.in

For this pilot, only verified local vendors will be listed. You can browse available products, place an order, and pay the vendor directly using the payment method accepted by that vendor.

SabSewa Local does not collect the order amount on behalf of vendors. Delivery timing shown in the app is an estimate, not a guaranteed deadline.

Please use the service only if you are comfortable participating in a pilot and sharing feedback. If you face any issue, contact support@sabsewa.in or call +91 8450092846 / +91 8178113449.

Your feedback will help improve the service before we expand it to more residents and nearby shops.
```

## Pilot Testing Checklist

Customer workflow:

- Customer opens `https://www.sabsewa.in` on mobile browser.
- Customer installs PWA to home screen.
- Customer selects English, Hindi or Kannada.
- Customer registers with OTP.
- Customer remains signed in after closing and reopening browser/PWA.
- Customer selects location/PIN/locality.
- Customer finds listed vendor within service area.
- Customer sees only available products.
- Customer adds items to cart.
- Delivery charge/free-delivery threshold/estimated window shown before confirmation.
- Customer places order without entering vendor/terminal IDs.
- Customer receives order status updates.
- Customer sees vendor contact/delivery details only after valid vendor acceptance.

Vendor workflow:

- Vendor registers and accepts Terms.
- Vendor verification status recorded.
- Vendor pays activation amount or is marked for approved test-mode pilot according to owner decision.
- Vendor adds/updates products, images, stock, price and availability.
- Vendor configures delivery settings.
- Vendor sees limited order summary before acceptance.
- Vendor accepts full order or offers partial fulfilment.
- Rs 15 deduction occurs exactly once after valid acceptance.
- Vendor sees wallet transaction with order ID and balance before/after.
- Vendor updates order status through completion.
- Vendor can download/view transaction evidence.

Admin/company workflow:

- Admin can review vendor verification.
- Admin can view orders, wallets, disputes and audit logs.
- Admin can search order ID, vendor, customer and transaction record.
- Admin can record pilot issue and resolution.

Gemini workflow:

- Vendor tests inventory capture from shelf/photo/list.
- Customer tests conversational order parsing.
- Gemini outputs are human-reviewed before saving/ordering.
- `gemini_agent_logs` rows appear with model, workflow and timestamp.

## Feedback Form

Use this form for every pilot customer/vendor feedback entry.

```text
Feedback date/time:
Participant role: Customer / Vendor / Admin
Participant consent to record feedback: Yes / No
Name or anonymised identifier:
Mobile/email, if consented:
Language used:
Device/browser:
Workflow tested:
Order ID, if any:
Vendor/shop, if any:
What worked well:
What was confusing:
Any error message:
Payment/wallet issue:
Delivery/availability issue:
Product quality/quantity issue:
Suggested improvement:
Can this feedback be used in hackathon evidence? Yes / No
Can the participant be contacted again? Yes / No
Resolution owner:
Resolution status:
```

## Daily Pilot Monitoring Report

Complete once per pilot day.

```text
Date:
Pilot day number:
Active vendors:
Active customers:
New registrations:
Products added/updated:
Orders placed:
Orders accepted:
Orders partially accepted:
Orders rejected:
Orders completed:
Orders cancelled:
Gross vendor order value:
SabSewa Rs 15 deductions:
Vendor wallet top-ups:
Razorpay failures:
Gemini calls:
Gemini failures:
S3 uploads:
Customer complaints:
Vendor complaints:
Delivery delays:
Privacy/security incidents:
Bugs found:
Bugs fixed:
Open blockers:
Decision for next day: Continue / Pause / Limit / Expand
Owner notes:
```

## Genuine Orders And Revenue Recording Process

Every genuine pilot order must have:

- Order ID.
- Customer ID or anonymised customer reference.
- Vendor ID and shop name.
- Terminal ID, if applicable.
- Order date/time.
- Item list and quantities.
- Vendor acceptance timestamp.
- Rs 15 wallet deduction transaction ID.
- Vendor wallet balance before/after.
- Direct payment method used by customer and vendor, if disclosed.
- Vendor-confirmed order value.
- Delivery charge, if applicable.
- Order status and completion timestamp.
- Complaint/dispute flag.
- Evidence source: app record, wallet ledger, vendor statement, customer confirmation or screenshot.

Revenue evidence must never be fabricated. If no paid pilot transaction has occurred, record `Rs 0` revenue and explain that the pilot is pre-revenue or test-mode only.

## Issues To Resolve Before Expansion Outside Society

Do not expand outside the society until:

- At least 20 successful pilot orders complete without privacy, wallet or payment errors.
- At least two vendors can independently update catalogue, daily availability and orders.
- Rs 15 deductions are verified and explainable through wallet statements.
- No vendor can access customer phone/address before acceptance.
- RLS isolation is tested and documented.
- PWA install and deep links work reliably.
- Hindi/Kannada critical flows are understandable to real users.
- Legal/accounting review is complete.
- Support response process is stable.
- Data backup/recovery and incident process is documented.
- Owner has reviewed pilot feedback and fixed P0/P1 defects.

## Go/No-Go For Society Pilot

Go only when the P0 checklist passes with evidence.

If any P0 item fails, pause invitations, fix the issue and retest with internal users before involving residents or vendors.
