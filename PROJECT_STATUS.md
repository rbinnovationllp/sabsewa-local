# SabSewa Local Project Status

Updated: 2026-07-31

Scope: `C:\Users\HP\SabSewa-Local`

Current Supabase project: `sabsewa-local` at `https://xodmazgfibftorrlbotk.supabase.co`

Production web URL: `https://www.sabsewa.in`

Production backend API URL: `https://api.sabsewa.in`

Official support contact: `support@sabsewa.in`, `+91 8450092846`, `+91 8178113449`

## Hackathon Guideline Alignment

The latest supplied guideline has been documented in:

`C:\Users\HP\SabSewa-Local\docs\HACKATHON_ALIGNMENT.md`

Gemini handover instructions have been prepared in:

`C:\Users\HP\SabSewa-Local\docs\GEMINI_HANDOVER_PROMPT.md`

Deadline gap and readiness report:

`C:\Users\HP\SabSewa-Local\docs\DEADLINE_GAP_AND_READINESS_REPORT_2026-07-31.md`

Official rule check completed on 2026-07-31:

- Build with Gemini XPRIZE submission deadline is August 17, 2026 at 1:00 PM PDT.
- Submissions require repository access, text description, under-three-minute demo video, product-running evidence, Gemini/API usage evidence, user evidence, revenue/expense evidence and required disclosures.
- If the Google Play developer account is a new personal account created after November 13, 2023, Google requires closed testing with at least 12 opted-in testers for 14 continuous days before applying for production access. The owner must confirm the exact Play Console requirement shown for this account.

Confirmed project direction:

- AWS S3 may remain the file and image storage layer.
- Supabase may remain the authentication, database, RLS and realtime backend layer.
- Razorpay remains for vendor advance-wallet deposits and top-ups only.
- Revised vendor payment policy is now implemented in code/docs: first payment Rs 5,500, split into Rs 500 non-refundable activation/service charge and Rs 5,000 refundable advance wallet credit; later standard top-ups Rs 5,000.
- Gemini through Google AI Studio or Vertex AI must power meaningful business workflows.
- Google Workspace/Drive should not be used as the product-image storage backend.

Current compliance status:

- Implemented in code: Gemini backend routes, Gemini audit logging, inventory capture, conversational ordering and smart rejection/support paths.
- Implemented in docs: demo runbook, local vendor traction log, compliance checklist, hackathon alignment guide, Hostinger deployment guide and Devpost submission checklist.
- Hostinger web export command is configured through `mobile/package.json` as `npm run export:web:hostinger`; it exports Expo Web and copies `.htaccess` into `mobile/dist`.
- Still requires live proof: Gemini API key configuration, real Gemini calls, usage dashboard screenshots, redacted logs and a recorded demo showing live AI outputs.
- Eligibility risk: the older combined SabSewa project must be disclosed as prototype/reference work. The standalone SabSewa Local business and repository must be presented honestly as hackathon-period work where applicable.

## Deadline-Focused Production Readiness Classification

Current go/no-go recommendation: **not ready for unrestricted production launch today**.

Recommended path before August 17, 2026: **controlled Bengaluru pilot through the PWA after P0 checks pass, with Android internal/closed testing running in parallel**.

## Society Pilot Launch Direction

The owner has decided to launch first as a production-oriented mobile-friendly web/PWA pilot inside the owner's housing society, initially onboarding:

- One local vegetable and fruit vendor.
- One local kirana/general-store vendor.

Pilot objective:

- Allow consenting residents to order groceries, vegetables, fruits and essentials from verified nearby shops.
- Use real vendors, real customers, real orders and truthful revenue/usage records only.
- Use the PWA at `https://www.sabsewa.in` as the primary launch surface while Android Play testing continues.

Pilot operations documents added:

- `C:\Users\HP\SabSewa-Local\docs\SOCIETY_PILOT_LAUNCH_RUNBOOK.md`
- `C:\Users\HP\SabSewa-Local\docs\PILOT_FEEDBACK_FORM.md`
- `C:\Users\HP\SabSewa-Local\docs\PILOT_DAILY_MONITORING_REPORT.md`
- `C:\Users\HP\SabSewa-Local\docs\PILOT_REVENUE_AND_ORDER_LOG_TEMPLATE.csv`

Pilot go/no-go rule:

- Do not invite residents or accept real vendor money until live Supabase migrations, RLS, registration, vendor activation, Razorpay, order placement, Rs 15 deduction, customer-detail protection, Gemini logs, S3 upload and PWA installability have been verified with evidence.

Market launch recommendation:

- Start only with a controlled society pilot after P0 checks pass.
- Do not expand to another society until at least 20 successful pilot orders complete without P0 privacy, payment, wallet or order-flow defects.

Fully implemented and locally verified:

- TypeScript compile checks for the mobile/web codebase.
- Backend syntax checks for changed order, delivery-settings and server entry files.
- Hostinger web export with `.htaccess`, PWA manifest, service worker, offline shell and icons.
- Static `mobile/dist` scan for server-only secret names and localhost backend URL.
- Localization foundation smoke test for English, Hindi and Kannada.

Implemented but not end-to-end production verified:

- Customer OTP registration and profile/address/policy persistence.
- Vendor registration, verification and terminal activation.
- Razorpay vendor activation/top-up order creation and signature verification.
- Rs 15 vendor-wallet deduction on valid vendor acceptance.
- Customer information lock before vendor acceptance.
- Customer discovery within 500 metres expanding to 1 kilometre.
- Vendor catalogue, brand/variant and daily availability flows.
- Full/partial order acceptance and quote approval.
- Wallet dispute evidence and admin reversal workflow.
- AWS S3 upload limits, private access and quota accounting.
- Gemini live inventory, ordering, smart rejection/support and translation usage.
- PWA installation on Android/iOS/desktop browsers after Hostinger upload.
- Android APK/AAB real-device testing after the latest code changes.

Partially implemented:

- Hindi and Kannada coverage exists for the foundation/core strings, but not every customer, vendor, rider, company CRM, wallet and legal sentence is legally reviewed in all three languages.
- Web persistent login avoids server-only keys but does not yet use a backend HttpOnly-cookie auth proxy; production web auth should be hardened before broad release.
- Monitoring, backup, incident response and recovery runbooks exist only partially through documentation and migration structure.

Blocked by owner/external services:

- Supabase SQL execution and live RLS verification.
- Razorpay test/live merchant credentials and webhook configuration.
- AWS IAM/S3 credential policy verification.
- Gemini API key, billing and usage evidence.
- Google Play Console account-specific testing requirement, Data Safety form and closed-test timeline.
- Legal/accounting review for Terms, GST treatment, refunds, retention and vendor agreements.
- Real pilot vendor/customer consent, revenue and testimonial evidence.

Critical P0 target completion before pilot revenue:

- Apply live Supabase migrations and capture success evidence.
- Verify RLS with separate customer, vendor, rider and admin accounts.
- Verify customer registration, vendor onboarding, Razorpay activation payment, order placement, vendor acceptance, Rs 15 deduction, detail unlock and order completion with real test accounts.
- Verify Gemini API calls write `gemini_agent_logs`.
- Verify S3 image upload controls.
- Upload refreshed PWA to Hostinger and test deep links/installability.

Business impact if not completed:

- Taking real money before payment, wallet and RLS verification creates financial, privacy and legal risk.
- Submitting without Gemini logs, user evidence, revenue/expense evidence and demo video weakens or may fail hackathon evaluation.
- Delaying Play closed testing may prevent public Play Store launch before the hackathon deadline, so PWA must be the practical public access route.

## 2026-07-31 Bengaluru Language, Registration, PWA And Delivery-Safety Update

Implemented in this pass:

- Enabled Bengaluru launch languages as functional languages: English, Hindi and Kannada.
- Added Kannada bundled translations and wired `knCommon` into the language provider.
- Added registration and delivery-safety translation keys across English, Hindi and Kannada.
- Fixed customer registration completion flow so the app does not show success until profile, policy acceptance and customer address persistence are attempted and checked after OTP verification.
- Added duplicate-submission protection to the registration screen.
- Added delivery settings route and vendor screen for free-delivery threshold, delivery charge, service radius, delivery window, delivery availability and pickup availability.
- Added cart/order delivery snapshots for delivery charge, free-delivery threshold, delivery provider and estimated delivery window.
- Added delivery estimate and safety messaging to checkout and customer tracking.
- Added PWA export support: `manifest.webmanifest`, service worker, offline shell and PWA icons are generated into `mobile/dist` by `mobile/scripts/copy-hostinger-htaccess.js`.
- Replaced the remaining customer-facing `Gemini Conversational Ordering` title in the legacy screen with `Place Your Order`.
- Updated Terms, Customer Terms and Vendor Terms with delivery-estimate, delivery-charge and delivery-safety clauses.
- Updated Terms and Vendor Terms to state that once a vendor formally accepts an order and the Rs 15 platform facilitation fee is deducted, the company will not refund, reverse or adjust the Rs 15 merely because the vendor later claims cancellation, non-completion, private settlement or outside-platform handling. Corrections remain possible only for company-confirmed duplicate deduction, technical error, unauthorised transaction or legal requirement.

Database migration added:

- `C:\Users\HP\SabSewa-Local\supabase\migrations\202607310001_bengaluru_languages_registration_delivery_pwa.sql`
- SQL Editor runner: `C:\Users\HP\SabSewa-Local\supabase\RUN_ONLY_BENGALURU_LANGUAGES_REGISTRATION_DELIVERY_PWA.sql`

RLS policies added/amended:

- New `vendor_delivery_settings_audit` table has RLS enabled.
- Vendors can read their own terminal delivery-settings audit records.
- Company admins can read delivery-settings audit records.

Root cause found for customer-profile saving failure:

- Customer registration sent OTP first and relied on auth metadata, while customer profile/address/policy rows were only created later during OTP verification.
- The OTP completion flow did not strictly fail when profile, address or policy persistence failed, so the user could see an apparent registration flow without reliable database evidence.
- The updated OTP completion flow now checks these Supabase write results and reports a localized retryable error instead of silently continuing.

Session-storage method:

- Mobile uses Supabase refresh sessions with secure device storage via the existing secure session storage adapter, backed by operating-system secure storage where available.
- Static web currently avoids server-only keys but does not yet provide a full HttpOnly-cookie auth proxy. For final production web security, implement backend-managed HttpOnly, Secure, SameSite session cookies or a Supabase-supported SSR/auth helper layer before declaring web persistent login fully complete.

PWA installation status:

- Source-side PWA manifest/service-worker/offline-shell generation is implemented.
- The latest web export must be rebuilt and uploaded to Hostinger `public_html` before `https://www.sabsewa.in` can be verified as installable.

Local tests added:

- `mobile/scripts/verify-multilingual-foundation.mjs`
- `mobile/package.json` script: `npm run test:localization`

Still not verified end-to-end:

- The new SQL runner must be executed in the live SabSewa Local Supabase project.
- Customer registration must be tested with a real OTP/customer account after the SQL migration is applied.
- Vendor delivery settings must be tested with a real vendor/terminal and verified in `vendor_delivery_settings_audit`.
- Checkout and tracking delivery snapshots must be verified against live order rows.
- PWA installability must be checked in Chrome/Android and Safari/iOS after uploading the refreshed `mobile/dist`.
- Full Terms in Hindi and Kannada still require legal-language review by a qualified Indian lawyer before production reliance.

## Important Supabase Note

The shared catalogue migration failed because `202607260006_vendor_shared_product_catalogue.sql` was run before the helper-function/RLS migration that creates `public.owns_vendor(uuid)`.

Do not rerun `RUN_ALL_MIGRATIONS_FOR_SABSEWA_LOCAL.sql` on the current database because some base tables and policies already exist. For the current Supabase project, run:

`C:\Users\HP\SabSewa-Local\supabase\RUN_INCREMENTAL_AFTER_INITIAL_SUCCESS.sql`

Use `RUN_ALL_MIGRATIONS_FOR_SABSEWA_LOCAL.sql` only on a blank/fresh Supabase project.

## Completed In This Pass

- Added functional multilingual-support foundation using the supplied Gemini Flash instruction:
  - Homepage and core entry-point strings now use translation keys instead of hardcoded screen text.
  - Reviewed bundled strings are stored in structured locale files:
    - `mobile/locales/en/common.ts`
    - `mobile/locales/hi/common.ts`
  - `mobile/providers/LanguageProvider.tsx` now restores the selected language from secure device storage on mobile and local storage on web, updates the web document language, and falls back to English for missing keys.
  - `mobile/components/LanguageSelector.tsx` now enables only quality-tested languages and disables incomplete languages with a visible `Coming Soon` label.
  - English and Hindi are currently functional; the remaining Eighth Schedule languages remain listed but disabled until reviewed translations or validated language packs are available.
  - `mobile/lib/translate.ts` now calls the backend dynamic translation endpoint instead of returning placeholder text.
  - Backend Gemini translation model is configurable through `GEMINI_TRANSLATION_MODEL`.
  - Added backend route `POST /api/gemini/translation/dynamic` in `mobile/server/gemini/geminiRoutes.js` for Gemini Flash dynamic translation of marketplace text only.
  - Dynamic translation route normalises and hashes text, redacts phone/PIN/email/payment-like sensitive content, checks cache first, validates protected commerce values, records usage telemetry and writes privacy-safe Gemini audit evidence.
  - Added Supabase migration and SQL runner for translation cache and usage reporting:
    - `supabase/migrations/202607300001_gemini_translation_cache_usage.sql`
    - `supabase/RUN_ONLY_GEMINI_TRANSLATION_CACHE_USAGE.sql`
  - Added backend `.env.example` keys for Gemini translation model, version, input/output limits and estimated INR cost.
  - Verified with `npx.cmd tsc --noEmit --pretty false`.
  - Verified backend syntax with `node --check gemini\geminiRoutes.js`, `node --check gemini\geminiClient.js` and `node --check index.js`.
  - Not yet complete: full translated coverage for every customer/vendor/rider/company screen, downloadable language packs, Company CRM translation-cost dashboard, Supabase live migration run and live Gemini translation call evidence.

- Removed customer-facing raw Vendor ID and Terminal ID entry from Gemini Conversational Ordering:
  - Updated `mobile/app/customer/GeminiOrder.tsx` to require customer-friendly shop discovery and selection before creating a Gemini cart draft.
  - Customers can search by category, shop name/product text, location permission, PIN code or locality.
  - Selected shop display shows shop name, locality/distance, status and verified label; internal `vendor_id` and `terminal_id` remain hidden in route/state.
  - Gemini cart matching now uses the selected shop's available catalogue and sends customers to cart review instead of final order submission.
  - Updated `mobile/server/hyperlocal/placeOrder.js` so the backend explicitly rejects orders for missing, inactive, unapproved or unverified vendors before terminal/item/wallet validation.
  - Customer/hyperlocal screen scan found no visible labels for `Vendor ID`, `Terminal ID`, `vendor id`, or `terminal id`.
  - Updated PRD customer discovery and Gemini ordering sections to document hidden internal identifier handling.

- Added a rights-compliant SabSewa Local Master Product Catalogue foundation:
  - New migration: `supabase/migrations/202607290001_rights_compliant_master_product_catalogue.sql`
  - New SQL runner: `supabase/RUN_ONLY_RIGHTS_COMPLIANT_MASTER_PRODUCT_CATALOGUE.sql`
  - Updated bundled SQL: `supabase/RUN_INCREMENTAL_AFTER_INITIAL_SUCCESS.sql` and `supabase/RUN_ALL_MIGRATIONS_FOR_SABSEWA_LOCAL.sql`
  - New catalogue tables: `master_product_catalog`, `master_product_images`, `master_product_image_consents`, `master_product_image_takedown_audit`
  - Seeded standard product catalogue entries for kirana/general stores, vegetables and fruits using original structured data only; no third-party photos, copied descriptions, logos or hotlinks.
  - All seeded products default to `image_pending`.
  - Added rights/audit fields for source vendor, source user, consent reference, consent timestamp, original filename, checksum, perceptual hash, moderation status, approval admin, withdrawal and takedown status.
  - Vendor item records can reference `master_product_id` and `master_image_id`; approved master images are referenced only and do not consume the receiving vendor's storage quota.
  - Updated backend catalogue route `mobile/server/catalog/catalogRoutes.js` to serve `master_product_catalog` instead of a missing/legacy `global_catalog`.
  - Added backend S3 routes in `mobile/server/storage/s3Routes.js` for approved master-image search, private presigned display URLs, vendor master-image submission, and reuse-by-reference.
  - Updated `mobile/app/vendor/AddItem.tsx` so vendors can select master catalogue products, search approved master images, and save an item as `image_pending` when no authorised image is available.
  - Updated PRD with copyright-safe catalogue and image-source policy.

- Added brand, variant and vendor-specific catalogue workflow:
  - New migration: `supabase/migrations/202607290002_brand_variant_vendor_listing_workflow.sql`
  - SQL Editor runner: `supabase/RUN_ONLY_BRAND_VARIANT_VENDOR_LISTING_WORKFLOW.sql`
  - Added master product -> brand -> variant structure through `product_brands` and `product_variants`.
  - Extended `vendor_items` so every vendor has a separate shop item record with vendor-specific brand, manufacturer, variant, pack size, price, MRP, barcode, stock, expiry, substitution policy and review status.
  - Vendor Add Item screen now allows fixed price, Ask Vendor and Market Price.
  - Backend order placement validates selected vendor item, brand/pack variant and current availability before creating an order.
  - Customer discovery displays product, brand, variant and pack size instead of combining different variants into one item.

- Renamed the customer ordering screen for everyday users:
  - `mobile/app/customer/GeminiOrder.tsx` now displays `Place Your Order`.
  - Customer copy now says: `Select a nearby shop and type or speak what you need. We will prepare a cart for your review before placing the order.`
  - Customer dashboard/cart/landing no longer show customer-facing `Gemini` ordering labels.
  - Technical documentation and hackathon material may still describe the feature as `AI-powered conversational ordering using Gemini`.
  - Rebuilt Hostinger web output in `mobile/dist`.

- Updated home page, registration and trusted-device login:
  - `mobile/app/index.tsx` now presents `SabSewa Local` with `Everything Local. One Trusted Marketplace.`
  - Home page includes location/search inputs, language selector, nearby categories, customer actions and vendor actions.
  - Signed-in customer/vendor actions are role-aware where user metadata is available.
  - `mobile/app/auth/Register.tsx` now collects customer delivery address/location and vendor shop name/shop address/location more clearly before OTP verification.
  - `mobile/app/auth/Login.tsx` now shows `Trust this device`; trusted-device records are created only after OTP verification and checkbox confirmation.
  - `mobile/providers/AuthProvider.tsx` no longer auto-registers every signed-in session as a trusted device.
  - No-vendor customer flows now show the required message and `Request a Vendor in My Area`.
  - Unserved-area leads preserve locality/category/consent and requested item text in metadata without storing exact address for recruitment.

- Prepared Android AAB release and shared-backend architecture:
  - `mobile/app.json` now uses Android package and iOS bundle identifier `in.sabsewa.local`.
  - Added Android `versionCode: 1`.
  - Added production camera/photo/location permission explanations.
  - Added `mobile/eas.json` with separate `internal-apk` and `production` profiles.
  - `internal-apk` generates APK for device/internal testing.
  - `production` generates Android App Bundle for Google Play.
  - Both mobile and web point to shared backend `https://api.sabsewa.in`.
  - Added `docs/ANDROID_AAB_RELEASE_CHECKLIST.md`.
  - Added Git ignore protections for APK/AAB and signing-key files.
  - EAS/Google Play build commands still require owner-run PowerShell because they need Expo/EAS login, signing credentials and Google Play account access.

- Added Daily Product Availability Management:
  - New migration: `supabase/migrations/202607290003_daily_product_availability_management.sql`
  - SQL Editor runner: `supabase/RUN_ONLY_DAILY_PRODUCT_AVAILABILITY_MANAGEMENT.sql`
  - Added daily status values: `available`, `limited_stock`, `temporarily_unavailable`, `out_of_stock`, `available_on_request`.
  - Added `vendor_item_availability_audit` to record vendor, terminal, item, previous/new status, quantity, reason, restock time, changed user/device and timestamp.
  - New backend route: `mobile/server/hyperlocal/availabilityRoutes.js`
  - New vendor mobile/CRM screen: `mobile/app/vendor/TodayAvailability.tsx`
  - Vendor Dashboard now links to `Vendor Dashboard -> Today's Availability`.
  - Terminal screen now routes stock updates to the new daily availability workflow.
  - Customer discovery and cart exclude unavailable/out-of-stock products by default.
  - Order placement rechecks daily availability, quantity, brand/pack variant, vendor and terminal status before creating the order.

- Completed production API URL alignment for the hybrid deployment:
  - `mobile/app.json` now defaults `EXPO_PUBLIC_BACKEND_URL` to `https://api.sabsewa.in`.
  - `mobile/.env.example` now shows `https://api.sabsewa.in` instead of localhost.
  - `mobile/lib/backend.ts` and `mobile/src/api/geminiAgents.ts` now fall back to `https://api.sabsewa.in` instead of `http://localhost:5001`.
  - Local ignored file `mobile/.env` was updated so Expo Web export no longer embeds localhost.
- Rebuilt the Hostinger static web bundle:
  - Command completed: `npx.cmd expo export --platform web`
  - Hostinger `.htaccess` was copied into `mobile/dist/.htaccess`.
  - Bundle output exists in `mobile/dist`.
  - Bundle audit found `https://api.sabsewa.in`.
  - Bundle audit found no `http://localhost:5001`.
  - Bundle audit found no private server secret names: `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `AWS_SECRET_ACCESS_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
- Updated deployment documentation:
  - `docs/HOSTINGER_WEB_DEPLOYMENT.md` now clearly states production exports must use `https://api.sabsewa.in`.
  - `mobile/server/AWS_PM2_DEPLOYMENT.md` now lists Gemini, Razorpay webhook, S3 bucket and public app URL environment fields for the EC2 backend.
- Verified locally:
  - `npx.cmd tsc --noEmit --pretty false` passed.
  - Git ignore check confirms `mobile/server/.env`, `mobile/.env` and `backend/.env` are ignored.
  - Tracked-file secret scan found no obvious Google API key, Razorpay key, JWT service-role token or AWS access-key pattern.

## Deployment Items Still Requiring Owner/Server Action

- EC2 commands must be run on the Ubuntu server:
  - `sudo certbot renew --dry-run`
  - `sudo systemctl status certbot.timer --no-pager`
  - `pm2 status`
  - `pm2 logs sabsewa-local-api`
  - `curl http://127.0.0.1:5001`
  - `curl https://api.sabsewa.in`
- Hostinger must be updated by uploading the latest contents of `mobile/dist` into `public_html`, including `.htaccess`.
- Browser checks must be completed after upload:
  - `https://www.sabsewa.in`
  - `https://www.sabsewa.in/vendor`
  - `https://www.sabsewa.in/customer`
  - `https://www.sabsewa.in/company`
  - `https://api.sabsewa.in`
- Live endpoint checks from this local shell were inconclusive because the Windows TLS client returned a receive/credential error. Verification should be done from the EC2 shell and a normal browser.

- Implemented revised vendor activation and wallet accounting policy:
  - Initial vendor Razorpay order is fixed at Rs 5,500.
  - Razorpay order notes identify `vendor_initial_activation`, `service_charge: 500`, `wallet_credit: 5000`, `application: sabsewa_local`, public vendor ID and internal vendor ID.
  - Standard post-activation top-ups are fixed at Rs 5,000 with purpose `vendor_wallet_topup`.
  - Server rejects standard top-up before activation and rejects a second activation fee after `activation_fee_paid`.
  - Server-side payment verification checks Razorpay signature, order ID, captured/authorised status and expected amount before crediting wallet.
  - Initial payment is recorded through `public.record_vendor_initial_activation_payment(...)` as one protected database operation with separate ledger rows for payment received, non-refundable activation fee and refundable wallet credit.
  - Vendor usable wallet balance displays Rs 5,000 after first Rs 5,500 payment, not Rs 5,500.
  - Voluntary closure refund calculation no longer deducts the Rs 500 activation/service charge again.
- Added wallet visibility improvements:
  - Vendor wallet remains accessible even when order receiving is stopped, suspended or under closure request.
  - Dashboard displays available refundable balance, opening balance, activation fee status, operational threshold, top-up/deduction history, balance before/after each transaction, refundable flag and CSV statement link.
  - First activation requires an unchecked vendor disclosure checkbox before Razorpay Checkout opens.
- Added neutral vendor verification schema and legal language:
  - Migration adds vendor verification fields for business identity, licences, shop/location evidence, review status and discrepancy records.
  - New `vendor_verification_audit` table records reviewer, status changes, documents reviewed, discrepancies and mandatory reason.
  - Legal/Privacy/PRD text states SabSewa Local must not collect, investigate, rank or disclose vendor religion.
- Added product quantity/quality responsibility clauses:
  - Customer Terms and PRD now state vendors are responsible for product accuracy, legality, safety, quality, quantity, price, packaging and description.
  - Customers are instructed to check product, quantity, packaging/seals, expiry, visible condition, invoice, price and confirmed-order match where reasonably possible.
- Added SQL runners:
  - `supabase/migrations/202607280001_revised_vendor_activation_wallet_policy.sql`
  - `supabase/RUN_ONLY_REVISED_VENDOR_ACTIVATION_WALLET_POLICY.sql`
  - Updated `supabase/RUN_INCREMENTAL_AFTER_INITIAL_SUCCESS.sql`
  - Updated `supabase/RUN_ALL_MIGRATIONS_FOR_SABSEWA_LOCAL.sql`

- Integrated SabSewa Local brand assets:
  - Location-pin/store symbol: `mobile/assets/images/sabsewa-local-symbol.png`
  - GitHub README banner: `mobile/assets/images/sabsewa-local-readme-banner.png`
  - App header/CRM/document logo: `mobile/assets/images/sabsewa-local-app-header.png`
  - App splash screen logo: `mobile/assets/images/sabsewa-local-splash.png`
  - Expo app icon updated through `mobile/assets/images/icon.png`
  - Expo splash image updated through `mobile/assets/images/splash-icon.png`
- Added reusable app/document/CRM header component:
  - `mobile/components/BrandHeader.tsx`
- Added brand header to:
  - `mobile/app/index.tsx`
  - `mobile/app/hlm/index.tsx`
  - `mobile/app/customer/dashboard.tsx`
  - `mobile/app/vendor/dashboard.tsx`
  - `mobile/app/company/VendorDirectory.tsx`
  - `mobile/app/company/WalletDisputes.tsx`
  - `mobile/app/company/DataRecovery.tsx`
  - `mobile/app/company/UnservedAreaLeads.tsx`
  - `mobile/components/LegalDocumentScreen.tsx`
- Added GitHub README banner at the top of `README.md`.
- Added visible, separate user-facing legal documents required before registration:
  - `mobile/app/(legal)/customer-terms.tsx`
  - `mobile/app/(legal)/vendor-terms.tsx`
  - `mobile/app/(legal)/privacy.tsx`
  - `mobile/app/(legal)/credit-disclaimer.tsx`
  - `mobile/app/(legal)/refund-cancellation.tsx`
  - `mobile/app/(legal)/grievance-dispute.tsx`
  - `mobile/app/(legal)/terms.tsx`
- Added reusable legal document renderer:
  - `mobile/components/LegalDocumentScreen.tsx`
- Added version constants for the legal bundle:
  - `mobile/lib/legalVersions.ts`
- Registration now shows direct links to all required legal documents before the checkbox and `Accept and Register` button.
- Mandatory legal acceptance remains unchecked by default.
- Optional marketing consent is separate from mandatory service acceptance.
- Acceptance evidence now records user ID, role, Terms version, Privacy Notice version, legal bundle version, accepted document versions, acceptance statement, displayed language, device/session metadata, OTP verification status and optional marketing consent.
- Added migration and bundled SQL for legal acceptance:
  - `supabase/migrations/202607270002_terms_privacy_acceptance.sql`
  - `supabase/RUN_INCREMENTAL_AFTER_INITIAL_SUCCESS.sql`
  - `supabase/RUN_ALL_MIGRATIONS_FOR_SABSEWA_LOCAL.sql`
  - `supabase/RUN_ONLY_TERMS_PRIVACY_ACCEPTANCE.sql`
- Added missing RLS helper dependency path through `202607260004_harden_production_rls_policies.sql`.
- Added daily vendor availability and stock controls through `202607260007_order_acceptance_availability_rpc.sql`.
- Added atomic order acceptance function `public.accept_order_with_wallet_fee(...)`.
- Moved the Rs 15 fee to vendor acceptance, not order completion.
- Added idempotency key `order_acceptance_fee:<order_id>` so duplicate taps cannot create duplicate Rs 15 deductions.
- Vendor details remain locked until the secure backend transaction completes.
- Customers can order only items with `is_available = true`, `available_today = true`, and non-out-of-stock status.
- Vendor CRM can update available-today status, stock status, and daily stock quantity.
- Added partial fulfilment offer and customer confirmation fields.
- Added wallet transaction evidence, dispute, reversal and CSV export backend routes.
- Added Vendor CRM controls to view evidence and raise disputes from order-fee deductions.
- Added Company CRM screens:
  - `mobile/app/company/WalletDisputes.tsx`
  - `mobile/app/company/DataRecovery.tsx`
- Added transaction retention fields so old wallet records move out of active view after the 15th of the following month but remain archived.
- Added six-month recovery metadata and `company_data_recovery_audit` for authorised recovery requests.
- Added credit settlement/archive support without deleting credit history.
- Added location-based public Vendor IDs and terminal branch IDs:
  - Format: `SL-[CITY]-[LOCALITY]-[NUMBER]`
  - Terminal format: `SL-[CITY]-[LOCALITY]-[NUMBER]-T01`
  - Internal UUID primary keys remain unchanged.
  - Vendor IDs are unique public/business identifiers and are not vendor-editable.
  - Location code directory and location-change history are included.
  - Existing vendors are safely backfilled using `UNK-GEN` if city/locality codes are not yet assigned.
  - Company CRM can search vendors by Vendor ID, shop, owner, phone, city, locality, and terminal.
- Added customer nearby-vendor discovery workflow:
  - Customer can use location permission or manual PIN/locality entry.
  - Category search supports Grocery/Kirana, Vegetables, Fruits, Dairy, Bakery, Medical, Restaurant/Tiffin.
  - Backend searches verified/open vendors within 500 metres first, then expands to 1 kilometre.
  - Vendor results respect each vendor's approved maximum service radius up to 1 kilometre.
  - Results include shop name, distance, category, open status, available-today products, prices, delivery/pickup availability, rating, fulfilment estimate, and delivery terms.
  - If no vendor is available, customer sees the required no-vendor message and can record a privacy-safe unserved-area lead.
  - Company CRM can view locality-wise demand hotspots, assign leads, track contacted vendors, and view approximate demand on a map.
- Added vendor-controlled product pricing display:
  - Vendors can mark each item as `show_price`, `hide_price`, or `market_price`.
  - Show-price items display price with unit label.
  - Hidden/market-price items become customer quote-request items.
  - Vendor must submit a quoted price before acceptance.
  - Customer must approve the quoted price before the vendor can accept the order and trigger the Rs 15 platform fee.
  - Item price changes are timestamped in `vendor_item_price_history`.
  - Existing order item snapshots keep the price/quote state captured at order placement.
  - Bulk price update backend route added for Vendor CRM/mobile workflows.

## Files Changed

- `mobile/server/hyperlocal/vendorOrderActions.js`
- `mobile/server/hyperlocal/placeOrder.js`
- `mobile/server/securityWallet/securityWalletService.js`
- `mobile/server/securityWallet/securityWalletRoutes.js`
- `mobile/server/credit/vendorCreditRoutes.js`
- `mobile/app/vendor/AddItem.tsx`
- `mobile/app/vendor/EditItem.tsx`
- `mobile/app/vendor/TodayAvailability.tsx`
- `mobile/app/vendor/TerminalSelector.tsx`
- `mobile/app/vendor/SecurityWallet.tsx`
- `mobile/app/vendor/ExitAndRefund.tsx`
- `mobile/app/(legal)/terms.tsx`
- `mobile/app/(legal)/vendor-terms.tsx`
- `mobile/app/(legal)/customer-terms.tsx`
- `mobile/app/(legal)/privacy.tsx`
- `mobile/app/(legal)/refund-cancellation.tsx`
- `mobile/app/customer/GeminiOrder.tsx`
- `mobile/app/hyperlocal/cart.tsx`
- `mobile/app/company/WalletDisputes.tsx`
- `mobile/app/company/DataRecovery.tsx`
- `mobile/app/company/VendorDirectory.tsx`
- `mobile/app/company/UnservedAreaLeads.tsx`
- `mobile/app/customer/discover.tsx`
- `mobile/server/company/vendorDirectoryRoutes.js`
- `mobile/server/hyperlocal/discoveryRoutes.js`
- `mobile/server/hyperlocal/availabilityRoutes.js`
- `mobile/server/hyperlocal/pricingRoutes.js`
- `mobile/server/index.js`
- `mobile/eas.json`
- `docs/ANDROID_AAB_RELEASE_CHECKLIST.md`
- `supabase/migrations/202607260007_order_acceptance_availability_rpc.sql`
- `supabase/migrations/202607260008_wallet_dispute_evidence.sql`
- `supabase/migrations/202607260009_location_based_vendor_ids.sql`
- `supabase/migrations/202607260010_customer_discovery_unserved_area_leads.sql`
- `supabase/migrations/202607270001_vendor_controlled_product_pricing.sql`
- `supabase/migrations/202607290002_brand_variant_vendor_listing_workflow.sql`
- `supabase/migrations/202607290003_daily_product_availability_management.sql`
- `supabase/RUN_ONLY_BRAND_VARIANT_VENDOR_LISTING_WORKFLOW.sql`
- `supabase/RUN_ONLY_DAILY_PRODUCT_AVAILABILITY_MANAGEMENT.sql`
- `supabase/migrations/202607280001_revised_vendor_activation_wallet_policy.sql`
- `supabase/RUN_ONLY_REVISED_VENDOR_ACTIVATION_WALLET_POLICY.sql`
- `supabase/RUN_INCREMENTAL_AFTER_INITIAL_SUCCESS.sql`
- `supabase/RUN_ALL_MIGRATIONS_FOR_SABSEWA_LOCAL.sql`
- `supabase/README.md`

## Verified Locally

Passed:

- `node --check mobile\server\hyperlocal\vendorOrderActions.js`
- `node --check mobile\server\hyperlocal\placeOrder.js`
- `node --check mobile\server\securityWallet\securityWalletRoutes.js`
- `node --check mobile\server\credit\vendorCreditRoutes.js`
- `node --check mobile\server\company\vendorDirectoryRoutes.js`
- `node --check mobile\server\hyperlocal\discoveryRoutes.js`
- `node --check mobile\server\hyperlocal\pricingRoutes.js`
- `node --check mobile\server\hyperlocal\placeOrder.js`
- `node --check mobile\server\hyperlocal\vendorOrderActions.js`
- `node --check mobile\server\index.js`
- `npx.cmd tsc --noEmit --pretty false` from `mobile`

## Still Requires Live Verification

- Configure live/test Gemini credentials and verify at least one production-like call for inventory capture, conversational ordering and smart rejection/support.
- Capture redacted `gemini_agent_logs` rows showing model name, route/workflow, structured output, timestamp, approval/override and error status.
- Capture Google AI Studio or Vertex AI usage-dashboard screenshots for submission evidence.
- Collect real vendor/customer pilot evidence and expense/revenue records for the hackathon submission.
- Run `RUN_INCREMENTAL_AFTER_INITIAL_SUCCESS.sql` in the new Supabase SQL Editor.
- Test the `accept_order_with_wallet_fee` RPC in the live Supabase database.
- Test customer order placement against real vendor item availability.
- Test Razorpay top-up with live/test keys.
- Run `supabase/RUN_ONLY_REVISED_VENDOR_ACTIVATION_WALLET_POLICY.sql` or the updated incremental bundle in the `sabsewa-local` Supabase project before testing the revised wallet flow.
- Test first-time Rs 5,500 Razorpay activation payment end to end with server-side verification.
- Verify exactly three ledger rows are created for first activation: `payment_received` Rs 5,500, `activation_fee` -Rs 500 non-refundable, and `security_deposit` Rs 5,000 refundable.
- Retry the same Razorpay callback/webhook and confirm the wallet is not credited twice and the Rs 500 activation fee is not charged twice.
- Test a later Rs 5,000 top-up and confirm no second activation fee entry appears.
- Test voluntary closure preview and confirm the Rs 500 fee is shown as already collected and not deducted again.
- Test AWS S3 upload with live credentials.
- Test vendor dispute creation and admin reversal approval.
- Test six-month recovery route with archived sample records.
- Verify generated public Vendor IDs and terminal IDs after running migration `202607260009_location_based_vendor_ids.sql`.
- Run and verify `supabase/RUN_ONLY_GEMINI_TRANSLATION_CACHE_USAGE.sql` in the SabSewa Local Supabase project.
- Add Gemini translation environment variables to the EC2 backend `.env`, then restart PM2 with `--update-env`.
- Test `POST /api/gemini/translation/dynamic` through `https://api.sabsewa.in` with redacted dynamic text and confirm rows appear in `gemini_translation_cache`, `gemini_translation_usage` and `gemini_agent_logs`.
- Build and upload the refreshed Hostinger web bundle so the homepage language selector changes are visible at `https://www.sabsewa.in`.
- Rebuild Android after the latest changes so the installed APK receives the corrected multilingual and Android startup configuration.
- Expand reviewed bundled translations beyond the homepage before marking Hindi or any other language complete across the whole product.
- Implement downloadable language-pack validation, checksum checking and removal controls before enabling more languages.
- Add the Company CRM Gemini translation usage dashboard and budget alerts before production launch.
- Verify customer discovery after running migration `202607260010_customer_discovery_unserved_area_leads.sql`.
- Verify vendor-controlled pricing after running migration `202607270001_vendor_controlled_product_pricing.sql`.
- Run and verify `RUN_ONLY_BRAND_VARIANT_VENDOR_LISTING_WORKFLOW.sql`.
- Run and verify `RUN_ONLY_DAILY_PRODUCT_AVAILABILITY_MANAGEMENT.sql`.
- Test Vendor Dashboard -> Today's Availability with a real vendor account and confirm audit rows appear in `vendor_item_availability_audit`.
- Test that unavailable products disappear from customer discovery/cart and cannot be ordered through Gemini.
- Test quote-required order flow: customer places request, vendor submits price, customer approves, vendor accepts, Rs 15 fee deducts once.
- Update real vendor city/locality codes from `company_location_codes` before production launch.
- Confirm admin routes are protected by the deployed backend auth layer before production.

## Production Readiness

Not production-ready until the incremental SQL runs successfully in Supabase and the critical workflows are tested with real credentials.
