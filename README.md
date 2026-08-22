![SabSewa Local](mobile/assets/images/sabsewa-local-readme-banner.png)

# SabSewa Local

SabSewa Local is a mobile-first hyperlocal marketplace connecting customers with verified nearby shops, including kirana stores, vegetable and fruit sellers, medical stores, dairy shops, bakeries, restaurants and tiffin providers.

The platform supports local product discovery, multilingual ordering, vendor catalogues, delivery tracking, vendor advance wallets, category-based platform base fees plus GST linked to confirmed vendor order acceptance, optional monthly accepted-order plans for higher-volume vendors, and vendor-managed customer credit records.

SabSewa Local is an independent project. It does not include SabSewa Pro, SabSewa Job or SabSewa SHG.

---

## Build with Gemini XPRIZE

Hackathon category: **Small Business Services**

Live web app target: [https://www.sabsewa.in](https://www.sabsewa.in)  
Backend API target: [https://api.sabsewa.in](https://api.sabsewa.in)  
Support: `support@sabsewa.in` | `+91 8450092846` | `+91 8178113449`

SabSewa Local uses Gemini as the AI operating layer for small local vendors:

1. **Multimodal vendor inventory capture:** Gemini reads shelf photos, invoices and handwritten product lists, then returns structured catalogue drafts for vendor review.
2. **Multilingual customer ordering:** Gemini parses English, Hindi, Hinglish and local-language order requests into structured carts.
3. **Gemini Flash dynamic translation:** Dynamic vendor/customer text is translated only through the secure backend with privacy redaction, cache reuse and cost telemetry.
4. **Human-in-the-loop audit logging:** Gemini outputs are validated by the app workflow and logged in Supabase `gemini_agent_logs` for transparency and submission evidence.

---

## Hackathon Positioning & Compliance

SabSewa Local is prepared for participation in the Gemini XPRIZE / AI Hackathon. Its principal AI workflows use Gemini and Google Cloud services:

1. Vendor inventory creation from shelf, invoice or handwritten-list photographs.
2. Customer conversational ordering in English, Hindi and other Indian languages.
3. Intelligent product discovery and order assistance.
4. Helpful customer messages when a vendor cannot fully or partially fulfil an order.
5. Structured AI outputs with appropriate validation and audit records (`gemini_agent_logs`).

### Architecture & Third-Party Services
* **Frontend:** React Native / Expo Web static export hosted on Hostinger `public_html/`.
* **Backend:** Node.js API hosted on AWS EC2 (`api.sabsewa.in`) orchestrating privileged operations and Gemini API endpoints.
* **Database & Auth:** Supabase (PostgreSQL, RLS policies, Auth Sessions).
* **Storage:** AWS S3 is used for secure file and image storage (product catalogues and vendor documents).

### Essential Documentation Links
* **Hackathon Alignment & Eligibility:** [`docs/HACKATHON_ALIGNMENT.md`](docs/HACKATHON_ALIGNMENT.md) and [`docs/DEADLINE_GAP_AND_READINESS_REPORT_2026-07-31.md`](docs/DEADLINE_GAP_AND_READINESS_REPORT_2026-07-31.md)
* **Devpost Submission Guide:** [`docs/DEVPOST_SUBMISSION_CHECKLIST.md`](docs/DEVPOST_SUBMISSION_CHECKLIST.md)
* **Final AI Handover:** [`docs/GEMINI_HANDOVER_PROMPT.md`](docs/GEMINI_HANDOVER_PROMPT.md)
* **Society Pilot Runbook:** [`docs/SOCIETY_PILOT_LAUNCH_RUNBOOK.md`](docs/SOCIETY_PILOT_LAUNCH_RUNBOOK.md)
* **Razorpay Live-Mode Readiness:** [`docs/RAZORPAY_LIVE_MODE_READINESS.md`](docs/RAZORPAY_LIVE_MODE_READINESS.md)

---

## Core Features

- **Hyperlocal Discovery:** Nearby vendor discovery within 500 metres to 1 kilometre.
- **Unified Workflows:** Dedicated customer, vendor, rider and Company CRM interfaces.
- **Catalogue & Inventory:** Vendor catalogue setup after registration with searchable multi-select master catalogue, image pending handling, and daily availability toggles.
- **Order Fulfilment:** Full/partial order acceptance with customer details hidden until vendor accepts.
- **Secure Order Conversation:** Before acceptance, customer/vendor clarification and alternative-product proposals stay inside an order-specific SabSewa Local conversation. Direct phone, email, WhatsApp, UPI, external-payment and bypass-link sharing is blocked server-side and logged.
- **Order Alerts:** New customer orders are submitted to the vendor notification system, shown in the vendor order inbox with a 10-minute response countdown, and keep customer contact/address locked until vendor acceptance. The vendor order screen repeats a three-burst bell/vibration alert while pending orders require action.
- **Customer Payment Sync:** Customer order payments remain direct between customer and vendor, while the vendor records Fully Paid - Cash, Fully Paid - UPI, Partially Paid, On Credit/Udhaar or Unpaid so the customer order state and vendor-owned credit ledger stay synchronized.
- **Restricted Delivery Staff Terminal:** Vendors can add delivery staff for a shop terminal, assign accepted/packed orders, revoke staff access, track assigned deliveries, record staff-reported cash collection and reconcile cash handover. Delivery staff cannot accept/reject orders, approve credit, modify catalogue, access KYC, billing or customer databases.
- **Simple Vendor Delivery Models:** Each vendor terminal can use Self Delivery, One Delivery Staff, or Multiple Delivery Staff. One-person shops can mark vendor self-delivery without creating staff accounts, one-staff shops can use a default staff member for one-tap assignment, and larger shops can select among multiple staff.
- **Vendor CRM Shop Snapshot:** The vendor dashboard summarizes orders, completed sales, cash/UPI received, Credit/Udhaar given and recovered, delivery status, cash pending handover from delivery staff and attention items using existing order, payment, credit and delivery records.
- **Partner Referral Attribution:** Vendor onboarding supports Partner-only referral attribution. A vendor may enter a Partner ID/referral ID or the Partner's registered mobile number, or explicitly choose direct/company onboarding. The backend re-validates active Partners before saving a permanent vendor-to-partner attribution used later by the Partner commission ledger.
- **Monetization Structure:** Vendors can stay on category-based Pay As You Go pricing charged as base platform fee plus GST, or choose an optional monthly accepted-order plan. Covered monthly-plan orders are not also charged a category-based accepted-order fee; orders above the monthly allowance use the selected plan's configurable overage fee plus GST.
- **Razorpay Payments:** Vendor onboarding payments are collected only after KYC approval/provisional clearance. The refundable Rs 5,000 security deposit is kept separate from the non-refundable onboarding/platform fee and GST. Standard wallet top-ups remain Rs 5,000.
- **Web-Resilient Routing:** Hard browser fallback handlers (`window.location.href`) guaranteeing smooth state transitions after OTP verification on web builds.

---

## Payment Safety & Environment Isolation

Vendor payments are strictly separated by Razorpay mode:

* **Test Mode:** Transactions are simulated; no real money is collected, no production wallet balance is credited, and commercial order activation is disabled.
* **Live Mode:** Wallet credits are applied exclusively via verified server-side HMAC-SHA256 signature checks on the `payment.captured` webhook (`POST /api/payments/razorpay/webhook`). Replay protection is enforced via `razorpay_webhook_events`.

## Vendor Pricing Models

## Vendor Onboarding Entity, Branch and Payment Model

Vendor registration now separates normal users from internal records:

- Owner account: the authenticated person/owner.
- Legal business entity: the registered business controlled by that owner.
- Branch/shop: the actual operating location visible to customers after approval.
- Authorized terminal/device: operational access for catalogue, order and delivery workflows.

If an existing vendor is detected, the registration page asks the applicant whether to open the existing dashboard, continue KYC/payment, register another branch, register another legal entity, add another terminal/device, or contact support if the registration does not belong to them. Additional branches and additional legal entities remain subject to Company CRM review, applicable KYC and approval before any payment is collected or activation is allowed.

The current onboarding plan foundation is:

- Plan 1: Rs 5,590 = Rs 5,000 refundable security deposit + Rs 500 onboarding/platform fee + Rs 90 GST.
- Plan 2: Rs 6,180 = Rs 5,000 refundable security deposit + Rs 1,000 onboarding/platform fee + Rs 180 GST.
- Plan 3: Rs 7,360 = Rs 5,000 refundable security deposit + Rs 2,000 onboarding/platform fee + Rs 360 GST.

GST is applied only on the non-refundable onboarding/platform fee. The vendor wallet must show only the refundable security-deposit balance, while fee, GST, gateway reconciliation and refund treatment remain separate accounting/ledger lines.

Run `supabase/RUN_ONLY_VENDOR_ENTITY_BRANCH_ONBOARDING_FOUNDATION_2026_08_22.sql` before testing this foundation in production.

## Vendor Pricing Models

SabSewa Local supports two vendor pricing models. The default Pay As You Go model charges a category-based base platform fee plus GST only when the vendor accepts a real customer order. Current base fees are Rs 15 for fruits/vegetables, Rs 20 for kirana/general stores, and Rs 25 for pharmacies, restaurants/food and other default categories. At 18% GST, the current payable totals are Rs 17.70, Rs 23.60 and Rs 29.50 respectively. The backend resolves the applicable category fee and GST breakup; the frontend never decides the charge.

The optional monthly accepted-order plan model is available for shops with larger order volumes and narrow margins.

Monthly plans:

- Standard: up to 300 accepted orders, Rs 3,000 base + Rs 540 GST = Rs 3,540/month, Rs 3,750 required refundable/adjustable advance balance.
- Plus: up to 750 accepted orders, Rs 7,000 base + Rs 1,260 GST = Rs 8,260/month, Rs 8,750 required refundable/adjustable advance balance.
- Pro: up to 1,500 accepted orders, Rs 13,500 base + Rs 2,430 GST = Rs 15,930/month, Rs 16,875 required refundable/adjustable advance balance.

Monthly plan prices are displayed as base fee plus GST, with the advance/security balance shown separately. Plan-specific overage fees are configurable in the backend/database and are currently seeded as Standard Rs 10 + GST/order, Plus Rs 9 + GST/order, and Pro Rs 8 + GST/order after the included allowance is exhausted. Final order acceptance is allowed only when the complete GST-inclusive platform deduction succeeds or an active monthly plan covers the order. If wallet balance is insufficient, the vendor must top up before acceptance and customer contact/address details remain hidden. Vendors choose the model from Vendor Billing, and all selections/changes are recorded in pricing audit tables. Run the revised `supabase/RUN_ONLY_VENDOR_MONTHLY_ORDER_PRICING_2026_08_17.sql` and strict wallet guard `supabase/RUN_ONLY_STRICT_ORDER_ACCEPTANCE_FULL_GST_WALLET_2026_08_22.sql` before production use.

Platform fees and monthly terminal-subscription charges are exclusive of statutory taxes. Applicable GST will be charged additionally at the prevailing rate.

## Order Conversation And Alternative Proposals

Pre-acceptance communication is order-specific and privacy controlled. Vendors may ask availability questions, send structured alternative proposals, price-change notices or partial-availability replies without seeing the customer's phone number, full address or external contact details. Customers may respond inside SabSewa Local. Messaging and alternative proposals do not trigger any platform fee. The applicable base fee plus GST is charged only when the vendor finally accepts the original order or a customer-approved modified order, or the order is recorded as covered by an active monthly plan.

Run `supabase/RUN_ONLY_ORDER_CONVERSATIONS_PRIVACY_2026_08_22.sql` and deploy the backend route mounted at `/api/order/orders/:order_id/conversation` before enabling the UI entry points.

## Partner Commission Retention And Archive

Partner commission statements now support a 15-calendar-day post-payment review period and protected financial archive. Paid/reconciled statements can move out of active transaction-detail view after the review period, but payment proof, eligible revenue evidence, GST/TDS/accounting data, dispute history and audit records remain in the protected archive for statutory retention. The default supported retention period is 96 months, subject to final Chartered Accountant/legal review. Legal hold blocks archival/minimization and exceptional deletion.

Run `supabase/RUN_ONLY_PARTNER_COMMISSION_RETENTION_ARCHIVE_2026_08_22.sql` before using the Partner commission archive endpoints:

- `POST /api/partner/admin/commission-archive/run`
- `POST /api/partner/admin/commission-statements/:statement_id/legal-hold`

## Direct Customer Payment Records

SabSewa Local does not collect customer order payments for vendors. For cash, UPI and other direct payments, the vendor records what was actually received. Full payments update the customer order as paid. Partial payments automatically push the remaining balance into the vendor-owned customer credit ledger, and full-credit orders record the entire amount as Udhaar/Credit. Run `supabase/RUN_ONLY_ORDER_PAYMENT_STATUS_SYNC_2026_08_22.sql` before deploying the payment-status synchronization backend because it expands the database check constraints for partial and disputed payment states.

## Delivery Staff Access

Delivery staff are restricted operational users created and controlled by the vendor for a specific terminal. They receive a tokenized delivery terminal link and can only see deliveries assigned to them. They can update location, mark pickup/delivery, report cash collected, and request vendor approval when a customer asks for credit/Udhaar. Credit approval, payment finalization, catalogue management, KYC, billing, customer database access and order acceptance remain vendor/admin responsibilities. Run `supabase/RUN_ONLY_DELIVERY_STAFF_RESTRICTED_ACCESS_2026_08_22.sql` before enabling the restricted delivery-staff backend in production.

Vendor delivery setup is intentionally flexible. A terminal may be configured as `vendor_self`, `single_staff`, or `multiple_staff` using Delivery Settings. Run `supabase/RUN_ONLY_VENDOR_DELIVERY_MODEL_2026_08_22.sql` before deploying this model-aware assignment flow.

## Vendor CRM Reporting

The Vendor Dashboard is the shopkeeper's operating console. It now uses `GET /api/vendor/crm/:vendor_id/summary` to summarize Today, This Week, This Month and All Time figures from existing source-of-truth tables rather than duplicate reporting tables. The Customer Credit Ledger shows customer-wise Udhaar balances, current outstanding, recovered amount, ageing buckets, repayment requests and a controlled Request Payment action that queues a reminder through the existing credit reminder infrastructure.

## Partner Referral During Vendor Onboarding

Vendor registration includes an optional Partner Referral section. If a vendor was onboarded by a SabSewa Partner, the vendor can provide the Partner ID/referral ID or the Partner's registered mobile number. The displayed confirmation uses a masked Partner name only; Partner private details are not exposed. Name alone is not an authoritative identifier.

If no Partner is involved, the vendor chooses direct/company onboarding. If a Partner is provided, the app stores the vendor's confirmation and the backend endpoint `POST /api/partner/referrals/attribute` performs the final active-Partner validation, prevents self-referral and duplicate non-admin attribution, writes `partner_referred_vendors`, and locks the attribution. Partner commission is still generated only later when eligible company revenue is recorded for the referred vendor.

The public Home "Register Your Shop" and `/hlm` "Register as Vendor" actions navigate to the dedicated public route `/vendor/register`, which reuses the existing vendor registration form while bypassing the generic `/auth` role-redirect guard. This prevents an already signed-in Admin/Master Admin session from being redirected to `/company` when inspecting or starting vendor onboarding. The legacy `/vendor-registration` route also forwards to `/vendor/register`. If the same browser/device has already stored a registered vendor mobile number, the vendor registration page itself shows a visible warning that the device was already used for vendor registration and offers the vendor dashboard while keeping the form visible for inspection.

Run `supabase/RUN_ONLY_VENDOR_PARTNER_REFERRAL_HARDENING_2026_08_22.sql` before deploying this flow because the vendor registration profile writes the hardened referral status columns.

---

## Authentication & OTP Architecture

* **Phone Auth:** Integrates Supabase Phone Auth. For MSG91 integration, Supabase acts as the OTP authority using a Supabase Edge Function SMS Hook (`supabase/functions/send-sms-msg91`).
* **Environment Safeguard:** Controlled via `EXPO_PUBLIC_PHONE_AUTH_ENABLED`. All secrets (`MSG91_AUTH_KEY`, `RAZORPAY_KEY_SECRET`, `GEMINI_API_KEY`) are stored strictly in server-side secret stores or Edge Functions, never in client bundles.
* **Web Fallback:** Clean navigation logic in `app/auth/login.tsx` ensures instant redirection to `/customer/discover` or `/vendor/dashboard` post-verification without getting stuck on the OTP screen.
* **Admin Routing Safety:** Public pages and language selection do not auto-open the Company CRM merely because an admin session exists. `/company` requires an authenticated admin role plus backend Master Admin session/secret verification; Master Admin secrets must remain server-side only.

---

## Multilingual Support

English, Hindi and Kannada form the core Bengaluru launch-language foundation across onboarding, registration, discovery and checkout. Other Eighth Schedule Indian languages are tagged as `Coming Soon`. Dynamic marketplace text (product details, vendor notes) is translated on the fly via Gemini Flash through backend endpoints (`POST /api/gemini/translation/dynamic`) with strict PII redaction and cache optimization.

The active app language is managed by `mobile/providers/LanguageProvider.tsx` and persists on web through localStorage and on mobile through SecureStore/AsyncStorage. Missing translation keys are logged during development/testing so placeholder language buttons can be identified.

Customer nearby-vendor discovery now passes the selected language and product query to the backend. The discovery API enriches vendor catalogue items from `master_product_catalog` and searches across standard English titles, Hindi/Kannada/local names, aliases, spelling variants and search keywords. Vendor, shop, product and user-entered names are not automatically translated; stored local names are used only where available.

Current limitation: the multilingual foundation is functional for core discovery/search flows, but some legacy admin, vendor, partner, wallet and legal text remains English-first and requires phased localization/legal review before production claims of complete Hindi/Kannada coverage.

---

## Project Structure

```text
SabSewa-Local/
â”œâ”€â”€ backend/            Root backend service
â”œâ”€â”€ mobile/             Expo React Native application (Web & Mobile)
â”‚   â”œâ”€â”€ app/            Expo Router screens (auth, customer, vendor, company)
â”‚   â”œâ”€â”€ components/     Shared UI components (PWA prompts, ProductGrid)
â”‚   â”œâ”€â”€ lib/            Utility helpers (phone, secureStorage, deviceIdentity)
â”‚   â””â”€â”€ server/         Active SabSewa Local Express backend API
â”œâ”€â”€ supabase/           Database schema, migrations, RLS policies, and functions
â”œâ”€â”€ PRD/                Product requirements and specifications
â”œâ”€â”€ docs/               Hackathon compliance, runbooks, and deployment guides
â”œâ”€â”€ README.md           Project overview
â””â”€â”€ PROJECT_STATUS.md   Live status, changelog, and readiness audits

## 2026-08-08 Vendor Onboarding, KYC Upload and Payment Readiness

- Vendor onboarding now follows the mandatory sequence: registration, KYC document upload, KYC verification, payment unlock, Razorpay payment verification, and final activation.
- Vendor KYC document sections are flexible: Identity Proof and Address/Business Proof are mandatory; Restricted/Regulated Business Licence is conditional and optional for ordinary Vegetable Shops.
- KYC upload now starts from Take Photo, Gallery or Files selection. The separate manual upload button was removed from the final workflow.
- Upload status is backend-driven: Missing changes to Uploaded only after Supabase Storage succeeds and a `vendor_kyc_documents` row is created.
- KYC uploads use the private Supabase bucket `vendor-kyc-private`, with signed preview and delete/re-upload support.
- Backend KYC upload diagnostics now report the failing stage, including bucket lookup/creation, MIME validation, image compression, storage upload and metadata insert.
- Browser/file-picker uploads infer MIME from filename when the picker reports `application/octet-stream`, so JPG/JPEG/PNG/WEBP/PDF documents are handled correctly.
- Vendor payment configuration is category-aware through `vendor_fee_rules`; `Vegetable Shops` maps to the vegetables fee rule after running `supabase/RUN_FIX_VENDOR_ONBOARDING_PRICING_AND_ACTIVATION_2026_08_08.sql`.
- Required manual Supabase SQL before production KYC/payment testing: `supabase/RUN_FIX_VENDOR_KYC_PRIVATE_BUCKET_2026_08_08.sql`, `supabase/RUN_FIX_VENDOR_KYC_DOCUMENT_FLEXIBLE_TYPES_2026_08_08.sql`, and `supabase/RUN_FIX_VENDOR_ONBOARDING_PRICING_AND_ACTIVATION_2026_08_08.sql`.
## 2026-08-09 - Master Admin Secret-Code CRM Security

- Added a Master Admin CRM gate requiring both authenticated `master_admin` role and backend-verified Master Admin Secret Code.
- The Master Admin secret is not stored in frontend code, GitHub, SQL migrations, or client-visible environment variables. The backend verifies a `crypto.scrypt` hash stored only in backend environment variables.
- Added short-lived server-signed Master Admin CRM session tokens. Admin API calls include the token in `x-master-admin-session`; protected company routes reject requests without it.
- Added rate limiting / temporary lockout for repeated incorrect secret attempts and audit logging for successful/failed Master Admin access attempts.
- Added `mobile/server/scripts/generate-master-admin-secret.mjs` so the secret can be entered privately in PowerShell/terminal and converted into backend-only `.env` values.
- Manual Supabase action: run `supabase/RUN_ONLY_MASTER_ADMIN_ACCESS_SECURITY_2026_08_09.sql` if audit/user-profile support is not already present.

## Admin KYC Monitoring And Vendor Notifications

- Company CRM includes Master Admin KYC counters and a review queue for pending, SLA-risk, provisional, approved, rejected and resubmission-required vendor KYC cases.
- Admin profiles now carry Admin Name, generated Admin ID, phone, optional email, role, jurisdiction, status and audit identity.
- Vendor order operations include in-app notification records, web-push dispatch when VAPID keys are configured, and a visible New Orders counter on the Vendor Orders screen.
- Run `supabase/RUN_ONLY_ADMIN_KYC_MONITORING_AND_VENDOR_ORDER_NOTIFICATIONS_2026_08_10.sql` before production testing these workflows.

## Partner Program

SabSewa Local includes a Partner With Us program for eligible customers, vendors, independent individuals, local promoters and organizations who can help build active hyperlocal marketplaces. Partners are expected to help onboard suitable local vendors and also create customer awareness around those vendors so nearby people know they can order through SabSewa Local.

The initial partner benefit is 10% of eligible SabSewa Local company revenue attributable to vendors successfully onboarded through the partner, subject to final Partner Program Terms and Master Admin configuration. The benefit is not company equity or ownership, and excludes GST/statutory taxes, refundable security deposits, refunds, chargebacks, discounts, payment-gateway charges and other legally required deductions.

Run `supabase/RUN_ONLY_PARTNER_PROGRAM_EXPANSION_2026_08_10.sql` to enable Partner ID/referral code/link generation, partner attribution and management metrics.
## Customer Vendor Dropdown

The customer Place Your Order screen provides a database-driven nearby-vendor dropdown in the "Shop name, category or product" field. It refreshes from the existing discovery API when category, GPS location, PIN code or locality changes, shows verified active vendors only, and lets the customer choose the preferred shop before preparing the order/cart.
### Bulk catalogue upload

Vendors can keep adding products individually, or use `Vendor > Bulk Upload Products` to import a CSV/XLSX catalogue. Only Product/Medicine Name is mandatory; brand, category, pack, price, MRP, stock status and image URL are optional. Product photographs are not required, and rows without images use the catalogue placeholder flow. Company Admin/Partner assisted imports are available from `Company CRM > Bulk Catalogue Upload` and must be linked to the correct vendor ID.
### Scan / Upload Existing Product List

Vendors now have three catalogue creation choices: add products manually, bulk upload a structured Excel/CSV file, or scan/upload an existing printed, handwritten, photographed, scanned or PDF product/price list. The scan flow uses backend AI extraction to identify visible product names and optional brand/category/pack/MRP/price/availability fields, marks uncertain rows for vendor review, supports multiple pages, and imports only after review/confirmation. The uploaded list is not treated as an individual product photograph; product images remain optional.
### Partner Application confirmation

Partner applications are submitted through the backend at `POST /api/partner/applications` so the applicant only sees success after the database record is saved. The confirmation screen shows the generated Partner Application ID, applicant name, mobile number, proposed area and current status. Duplicate mobile-number submissions return the existing Application ID/status instead of creating another application. Run `supabase/RUN_ONLY_PARTNER_APPLICATION_CONFIRMATION_WORKFLOW_2026_08_10.sql` to enable `SSL-P-000123` style application tracking IDs.

## Partner Commission Payment, KYC and Compliance Workflow

The Partner Program now supports commission payment details, Partner KYC, admin review, compliance actions and payout ledger tracking. Partner payment details are submitted through the backend and sensitive account/UPI values require the server-only `PARTNER_PAYMENT_DETAILS_ENCRYPTION_KEY`; do not expose this value in frontend `EXPO_PUBLIC_*` variables or commit it to GitHub.

Required setup after pulling this code:

1. Run `supabase/RUN_ONLY_PARTNER_COMMISSION_PAYMENT_KYC_AND_COMPLIANCE_2026_08_10.sql` in the production Supabase SQL Editor.
2. Set `PARTNER_PAYMENT_DETAILS_ENCRYPTION_KEY` only on the backend EC2 `.env`.
3. Restart PM2 and rebuild/upload `mobile/dist`.

Partner activation flow: Application Submitted -> Partner KYC Uploaded/Submitted -> Partner KYC Verified -> Payment Details Verified -> Master Admin Approval -> Active Partner. Commission statements are accounting records only and do not automatically transfer funds.


### 2026-08-10 language selection functionality
- Connected language selection to the shared LanguageProvider persistence path for English, Hindi and Kannada.
- Added Hindi/Kannada translation keys for core navigation, Home, customer order placement, Vendor KYC, Partner Program/KYC, commission/payment labels and notification titles.
- Dynamic user-entered data such as shop names, vendor names and product names remains untranslated by design.
- Required validation: run `cd mobile && npm.cmd run test:localization && npm.cmd run deploy:validate`, then rebuild `mobile/dist`.


### 2026-08-10 language completion repair
- Completed missing English locale keys so Hindi/Kannada additions are part of the typed localization dictionary.
- Language selector note now uses the persisted selector message key.
- Language restore now reads both the current `sabsewa_local_language` key and the older `user_language` key for compatibility.
- Customer order and Partner payment screens have core labels connected to localization keys; long legal/user-entered content remains unchanged unless separately translated.

- Partner applicants receive a database-confirmed success/status panel after submission; Partner privileges remain locked until KYC, payment-details verification and Master Admin activation are complete.


### 2026-08-11 partner commission automation
- Added backend commission automation service to create partner commission events when referred vendors generate eligible SabSewa platform revenue.
- Eligible revenue excludes GST and refundable/pass-through amounts; onboarding commission is calculated on the onboarding fee portion only.
- Added Supabase SQL support file: supabase/RUN_FIX_PARTNER_COMMISSION_AUTOMATION_2026_08_11.sql.
- Remaining manual step: run the SQL in Supabase before relying on idempotent commission event creation in production.

### Vendor KYC Review Policy Controls
Vendor KYC review uses a separate applicant workflow: Approve / Verify KYC, Request Further Information, or Reject KYC. Suspension/reactivation/revocation remain lifecycle actions for already approved or active vendors. Review decisions are written to vendor_status_history and vendor_notifications.

### Partner and Vendor KYC Review Controls

Company CRM review screens support explicit approval, rejection, and additional-information decisions for Partner and Vendor KYC. Partner lifecycle suspension/revocation is separate from applicant KYC review. Review actions require admin authentication and record audit metadata where the backend tables are available.

### Partner and Vendor KYC Review Controls

Company CRM review screens support explicit approval, rejection, and additional-information decisions for Partner and Vendor KYC. Partner lifecycle suspension/revocation is separate from applicant KYC review. Review actions require admin authentication and record audit metadata where the backend tables are available.
### Vendor Identity and Referral Attribution
SabSewa Local continues to generate an internal Vendor ID for relational integrity, audit logs, KYC records, orders, Partner attribution and commission calculation. Public/vendor-facing workflows should not treat the Vendor ID as the primary visible identity. Vendors should normally be identified by vendor/owner name, registered mobile number, shop name and locality/area. Company Admin screens may still expose internal references where required for secure operations.\n\n## Admin Appointment Workflow
Master Admin can open Company CRM -> Admin Directory to authorize additional admins. Search the proposed admin by registered phone/email, select the Supabase Auth user, enter Admin Name, mobile number, optional email, role and jurisdiction, then authorize. Supported roles include national_admin, state_admin, district_admin, city_admin, kyc_reviewer, support_admin and finance_admin. Admin suspension/reactivation/revocation is handled from the same directory and is audit logged.\n
