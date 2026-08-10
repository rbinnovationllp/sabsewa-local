![SabSewa Local](mobile/assets/images/sabsewa-local-readme-banner.png)

# SabSewa Local

SabSewa Local is a mobile-first hyperlocal marketplace connecting customers with verified nearby shops, including kirana stores, vegetable and fruit sellers, medical stores, dairy shops, bakeries, restaurants and tiffin providers.

The platform supports local product discovery, multilingual ordering, vendor catalogues, delivery tracking, vendor advance wallets, fixed Rs 15 platform facilitation fees linked to confirmed vendor order acceptance, and vendor-managed customer credit records.

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
- **Monetization Structure:** Fixed Rs 15 platform facilitation fee on order acceptance; vendor advance-wallet deposits managed via Razorpay.
- **Razorpay Payments:** Rs 5,500 first vendor activation (Rs 500 non-refundable service charge + Rs 5,000 refundable advance wallet balance) and Rs 5,000 standard top-ups.
- **Web-Resilient Routing:** Hard browser fallback handlers (`window.location.href`) guaranteeing smooth state transitions after OTP verification on web builds.

---

## Payment Safety & Environment Isolation

Vendor payments are strictly separated by Razorpay mode:

* **Test Mode:** Transactions are simulated; no real money is collected, no production wallet balance is credited, and commercial order activation is disabled.
* **Live Mode:** Wallet credits are applied exclusively via verified server-side HMAC-SHA256 signature checks on the `payment.captured` webhook (`POST /api/payments/razorpay/webhook`). Replay protection is enforced via `razorpay_webhook_events`.

---

## Authentication & OTP Architecture

* **Phone Auth:** Integrates Supabase Phone Auth. For MSG91 integration, Supabase acts as the OTP authority using a Supabase Edge Function SMS Hook (`supabase/functions/send-sms-msg91`).
* **Environment Safeguard:** Controlled via `EXPO_PUBLIC_PHONE_AUTH_ENABLED`. All secrets (`MSG91_AUTH_KEY`, `RAZORPAY_KEY_SECRET`, `GEMINI_API_KEY`) are stored strictly in server-side secret stores or Edge Functions, never in client bundles.
* **Web Fallback:** Clean navigation logic in `app/auth/login.tsx` ensures instant redirection to `/customer/discover` or `/vendor/dashboard` post-verification without getting stuck on the OTP screen.

---

## Multilingual Support

English, Hindi and Kannada form the core Bengaluru launch-language foundation across onboarding, registration, discovery and checkout. Other Eighth Schedule Indian languages are tagged as `Coming Soon`. Dynamic marketplace text (product details, vendor notes) is translated on the fly via Gemini Flash through backend endpoints (`POST /api/gemini/translation/dynamic`) with strict PII redaction and cache optimization.

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