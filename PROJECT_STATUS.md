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

## 2026-07-31 Razorpay Live-Mode Hardening Update

Implemented after Gemini payment-readiness review:

- Added explicit Razorpay environment detection through `RAZORPAY_ENVIRONMENT` / `RAZORPAY_MODE`.
- Added backend readiness route: `GET /api/admin/payment-environment`.
- Added Company CRM environment banner:
  - `TEST MODE - NO REAL MONEY WILL BE COLLECTED`
  - `LIVE MODE - REAL PAYMENTS ENABLED`
- Added Vendor Wallet environment banner and pre-checkout warning.
- Test Mode checkout warning states that no real money will be collected, no production wallet balance will be credited and no commercial order activation will happen.
- Browser/mobile callback route now verifies the payment response but does not credit the wallet or activate the vendor in live mode.
- Added verified Razorpay webhook route:
  - `POST /api/payments/razorpay/webhook`
  - Verifies `x-razorpay-signature` with HMAC-SHA256.
  - Processes wallet credits only for `payment.captured`.
  - Records webhook event IDs for replay/idempotency protection.
  - Ignores duplicate webhook deliveries without duplicate wallet credit.
- Added separated test-payment evidence table:
  - `vendor_payment_test_events`
- Added Razorpay webhook audit table:
  - `razorpay_webhook_events`
- Updated server environment templates:
  - `mobile/server/.env.example`
  - `backend/.env.example`
- Added readiness guide:
  - `docs/RAZORPAY_LIVE_MODE_READINESS.md`
- Added SQL runner:
  - `supabase/RUN_ONLY_RAZORPAY_ENVIRONMENT_SAFEGUARDS.sql`

Current Razorpay recommendation:

- **Safe to onboard vendors for registration and training only.**
- **Safe to conduct a controlled test pilot without real money.**
- **Not safe to accept real vendor payments until live Razorpay keys, live webhook secret, HTTPS webhook configuration, duplicate webhook replay test and reconciliation are verified.**

Basic payment behaviour confirmed:

- Razorpay Test Mode transactions are simulations.
- Test Mode does not collect or settle real money.
- No vendor should be marked payment-verified, credited with real wallet balance or allowed to receive commercial orders from a Test Mode payment.
- Test and Live Razorpay environments must use separate keys, secrets, webhooks, reconciliation records and wallet-credit evidence.

## 2026-07-31 Registration OTP Flow Fix

Implemented after customer/vendor OTP delivery complaint:

- Added shared Indian mobile-number normalisation helper:
  - `mobile/lib/phone.ts`
- Auth provider now sends and verifies Supabase SMS OTP using E.164 format, e.g. `+91XXXXXXXXXX`.
- Registration now routes directly to OTP entry after a successful OTP request instead of returning to a fresh `Send OTP` screen.
- Login/OTP screen now supports direct OTP entry when registration has already requested the OTP.
- Added `Resend OTP` action on the OTP screen.
- Improved OTP send error message so Supabase phone/SMS configuration issues are easier to identify.

Verified:

- `npx.cmd tsc --noEmit --pretty false` passed from `mobile`.

Still requires Supabase dashboard verification:

- Phone provider must be enabled under Supabase Authentication.
- SMS provider credentials/templates must be configured and active.
- Phone OTP settings/rate limits must permit the tested mobile number.
- Auth logs should show whether Supabase accepted, rate-limited, failed or delivered the OTP request.

Follow-up registration storage fix:

- Fixed web/PWA registration error reported as `n.default.getValueWithKeyAsynk is not a function`.
- Root cause: registration audit metadata and Supabase session storage could attempt native `expo-secure-store` methods inside the web/PWA runtime.
- Updated `mobile/lib/deviceIdentity.ts` so web/PWA uses browser `localStorage` for the device audit identifier and native mobile uses Expo SecureStore only when the native methods exist.
- Updated `mobile/lib/secureSessionStorage.ts` so web/PWA Supabase session persistence uses browser `localStorage`, while Android/iOS continue using SecureStore where available.
- This applies to both customer and vendor registration because both use the same auth/session/device metadata path.
- Verified with `npx.cmd tsc --noEmit --pretty false`.
- Rebuilt Hostinger PWA bundle with `npm.cmd run export:web:hostinger`; validation passed and archive `20260731171544` was created.

## 2026-08-01 Registration Localization And OTP Reliability Update

Implemented after the full registration workflow review:

- Root cause found in application code:
  - `mobile/app/auth/Register.tsx` showed a fixed `+91` label but limited the phone input to 10 characters and validated only digit length.
  - This made `+91` / spaced / hyphenated Indian numbers difficult or impossible to enter correctly and could still allow invalid 10-digit values that do not match Indian mobile numbering.
  - Registration used a direct Supabase OTP call while login used the auth provider path, causing inconsistent phone handling and error handling.
  - Customer/vendor registration had many hardcoded English labels, placeholders, legal-link labels, retry messages and OTP messages.
- Fixed Indian mobile handling:
  - `mobile/lib/phone.ts` now normalizes Indian mobile numbers to E.164 `+91XXXXXXXXXX`.
  - Accepts normal 10-digit numbers and `+91` numbers with spaces/hyphens/brackets.
  - Rejects invalid starts, leading-zero patterns, duplicate `+91`, unsupported foreign country codes, letters and invalid lengths.
  - Adds phone masking for OTP screens.
  - Adds error classification for unsupported country, rate limit, expired/incorrect OTP, network failure and SMS-provider failure.
- Registration now uses the shared auth provider OTP path:
  - `mobile/providers/AuthProvider.tsx`
  - `mobile/app/auth/Register.tsx`
- OTP verification/profile completion is now idempotent and resumable:
  - New helper: `mobile/lib/registrationCompletion.ts`
  - After OTP verification, it upserts `user_profiles`, records `user_policy_acceptances`, saves the customer primary address and creates/updates a pending vendor profile for vendor registrations.
  - `AuthProvider` attempts recovery if an authenticated session exists but profile creation was incomplete.
- Login/OTP screen improved:
  - `mobile/app/auth/Login.tsx`
  - Shows masked OTP destination.
  - Keeps original technical error in logs and a small diagnostic detail for support while showing localized user-facing messages.
  - Provides resend, change-mobile and email-registration alternatives.
  - Shows localized customer/vendor registration success messages only after profile completion succeeds.
- Registration localization improved:
  - Added English/Hindi/Kannada keys for registration method selection, field labels, placeholders, validation messages, OTP messages, legal document links, consent text, retry options and success messages.
  - Updated files:
    - `mobile/locales/en/common.ts`
    - `mobile/locales/hi/common.ts`
    - `mobile/locales/kn/common.ts`
- Updated localization smoke test:
  - `mobile/scripts/verify-multilingual-foundation.mjs`
  - It now verifies the shared registration completion helper instead of old duplicated inline profile-saving code.

Verified locally:

- `npx.cmd tsc --noEmit --pretty false` passed from `mobile`.
- `npm.cmd run test:localization` passed from `mobile`.

Still requires live Supabase/SMS verification before real-customer launch:

- Confirm Supabase Phone Auth is enabled for project `xodmazgfibftorrlbotk`.
- Confirm the SMS provider is configured for India and the tested number is allowed.
- Confirm TRAI/DLT sender ID and OTP template approval, if the provider requires it for India.
- Check Supabase Auth logs for the original `Unsupported phone number` response after retrying a real permitted Indian mobile number.
- Test valid Indian mobile, `+91` format, spaced/hyphenated format, leading zero, too short/too long, unsupported foreign number, OTP resend cooldown, incorrect/expired OTP and successful customer/vendor profile save.
- Do not mark registration production-ready until a real permitted Indian mobile number receives OTP, verifies successfully, saves profile/address/Terms acceptance and restores the session after closing/reopening the PWA.

## 2026-07-31 PWA And Static Deployment Safety Update

Implemented after Hostinger `public_html` audit:

- Confirmed from the supplied Hostinger screenshot that `public_html` contains static frontend/PWA files only: `_expo`, `assets`, `pwa-icons`, `.htaccess`, `favicon.ico`, `index.html`, `manifest.webmanifest`, `metadata.json`, `offline.html` and `service-worker.js`.
- Added version-controlled public web assets under:
  - `mobile/web-public/.htaccess`
  - `mobile/web-public/manifest.webmanifest`
  - `mobile/web-public/service-worker.js`
  - `mobile/web-public/offline.html`
  - `mobile/web-public/robots.txt`
  - `mobile/web-public/sitemap.xml`
  - `mobile/web-public/domain-verification/README.md`
- Added PWA install/update UI:
  - `mobile/components/PwaInstallPrompt.tsx`
  - Android/desktop supported browsers see an install action when available.
  - iPhone users see Safari Add to Home Screen guidance.
  - Updates are surfaced through a refresh action when a waiting service worker is available.
- Added safe service-worker caching rules:
  - Caches only app shell/static assets.
  - Does not cache Supabase, API, auth, OTP, profile, address, wallet, payment, Razorpay or private responses.
  - Provides `offline.html` for network failure on navigation.
- Added web-push subscription persistence route and migration:
  - `mobile/server/notifications/webPushRoutes.js`
  - `supabase/migrations/202607310003_pwa_web_push_subscriptions.sql`
  - `supabase/RUN_ONLY_PWA_WEB_PUSH_SUBSCRIPTIONS.sql`
- Added delivery-address confirmation in checkout:
  - `mobile/app/hyperlocal/cart.tsx`
  - Saved customer name, phone and primary address are loaded for convenience.
  - Customer must confirm the delivery address/contact before each order attempt.
- Added deployment validation and rollback tooling:
  - `mobile/scripts/validate-production-web-build.js`
  - `mobile/scripts/archive-web-build.js`
  - `mobile/scripts/rollback-web-build.js`
  - `npm run export:web:hostinger` now exports, copies PWA public assets, validates production target and archives the successful build.
  - `npm run deploy:validate` blocks deployment if `https://api.sabsewa.in` or Supabase project ref `xodmazgfibftorrlbotk` is missing/wrong, if localhost appears, or if server secrets/server folders/migrations are present in `dist`.

Architecture confirmation:

- Hostinger stores only the static PWA frontend.
- Supabase stores customer, vendor, order, wallet, payment, credit, support and audit records.
- AWS S3 stores product images and vendor documents.
- EC2 at `https://api.sabsewa.in` runs backend logic, Gemini calls, Razorpay verification and privileged Supabase operations.
- Routine frontend deployment must not execute database migrations, S3 deletion or backend deployment.

Additional PWA home-screen install update:

- `mobile/components/PwaInstallPrompt.tsx` now shows a clearly visible but non-intrusive home-page floating action labelled `Install SabSewa Local`.
- Supporting text explains that customers can add SabSewa Local to the phone home screen and avoid typing `www.sabsewa.in` each time.
- The install guide opens in the selected app language and includes tabs for Android, iPhone/iPad and Computer.
- Android/desktop browsers use the browser PWA prompt where supported through an explicit `Install Now` action.
- iPhone/iPad instructions explain Safari's Share menu and do not claim the website can install itself automatically.
- The prompt is keyboard-accessible, dismissible and remembers dismissal for 14 days.
- The prompt is not shown while the PWA is already running in standalone mode.
- Only privacy-safe local PWA events are emitted: guide opened, prompt accepted/dismissed, installed and push enabled.

Personalized greeting update:

- `mobile/app/index.tsx` now loads the authenticated user's saved profile name after session restore.
- Greetings are generated from local translation files in English, Hindi and Kannada, not Gemini or paid dynamic translation.
- Customer greeting: `Hello, {name}! How can we help you today?`
- Vendor greeting: `Hello, {name}! Let us manage and grow your local business today.`
- If no safe preferred name is available, the app shows a generic greeting.
- The app avoids displaying email addresses, long phone-like numbers or customer IDs as greeting names.
- A visible `Switch account or log out` action is shown for shared-device safety.

## 2026-07-31 Image-Based Customer Product Catalogue Update

Assessment against the attached reference screenshot:

- Previous state: **partially implemented**.
- Evidence: customer discovery used vendor `available_products` from `GET /api/discovery/vendors`, but displayed them as simple text rows inside each vendor card.
- Missing before this update: responsive product-card grid, image placeholder handling, add/increase/decrease controls, customer-side product search by brand/local names, clean hidden-price labels and selected-product cart handoff.

Implemented:

- Added reusable original SabSewa Local product-card grid:
  - `mobile/components/ProductGrid.tsx`
- Updated nearby-shop discovery to show available products in a responsive image-based grid:
  - `mobile/app/customer/discover.tsx`
- Product grid supports:
  - Approved image URL when available.
  - Clean SabSewa placeholder when no image is available.
  - Product name, local-language names if provided, brand, variant, pack size, unit, category, availability and optional offer label.
  - `Add` button and quantity increase/decrease controls after adding.
  - Search by product name, brand, variant, English/Hindi/Kannada/local-name fields where present in API data.
  - Products without images remain searchable and addable.
  - Hidden-price items display `Price confirmation required from vendor`; no `Rs 0`, null or blank price is shown.
  - Unavailable/out-of-stock items cannot be added.
- Updated discovery API product payload:
  - `mobile/server/hyperlocal/discoveryRoutes.js`
  - Sends up to 50 currently available products per terminal instead of 6.
  - Avoids `Rs 0.00` labels when no valid published price exists.
- Updated cart/order wording for hidden-price items:
  - `mobile/app/hyperlocal/cart.tsx`
  - `mobile/server/hyperlocal/placeOrder.js`
  - Cart marks these as `Price pending`; backend labels them `Price confirmation required from vendor`.

No third-party copyrighted assets copied:

- The reference screenshot was used only for usability comparison.
- No Amazon branding, code, images, descriptions or proprietary content were copied.
- Product images continue to come only from vendor/master/SabSewa-approved sources already represented by the catalogue data.

Still requires live data verification:

- Test with a real vendor/terminal containing:
  - Vegetable with approved image and displayed price.
  - Vegetable without image.
  - Branded grocery product with image, brand and pack size.
  - Unbranded grocery product without image.
  - Hidden-price product.
  - Temporarily unavailable product.
  - English, Hindi and Kannada/local product names.
- Verify AWS S3 thumbnail delivery and image moderation records once real product images are uploaded.
- Capture mobile screenshots after deploying the refreshed `mobile/dist` to Hostinger.

## 2026-07-31 Vendor Catalogue Setup After Registration Update

Implemented against the supplied vendor-catalogue setup instruction:

- Added a mobile-friendly vendor catalogue setup screen:
  - `mobile/app/vendor/CatalogueSetup.tsx`
- Vendor Dashboard now opens this workflow through `Catalogue Setup`:
  - `mobile/app/vendor/dashboard.tsx`
- Added protected backend catalogue setup routes:
  - `mobile/server/catalog/catalogueSetupRoutes.js`
  - Mounted in `mobile/server/index.js` under `/api/catalog`.
- Added database migration and SQL runner:
  - `supabase/migrations/202607310004_vendor_catalogue_setup_workflow.sql`
  - `supabase/RUN_ONLY_VENDOR_CATALOGUE_SETUP_WORKFLOW.sql`
- Updated the PRD:
  - `PRD/SABSEWA_HLM_MOBILE_PRD.md`

Functional coverage added:

- Searchable/category-filtered Master Product Catalogue selection.
- Multi-select product cards with checkbox controls and `Add selected items to my store`.
- Vendor-specific catalogue entries reference `master_product_catalog`; they do not duplicate master product records.
- Vendor-specific fields are stored on `vendor_items`: price, price display mode, daily availability, stock quantity, maximum order quantity, branch/terminal and review status.
- Products without approved images show an `Image pending` placeholder and remain usable.
- `Can't find an item? Add a new product` flow now captures product name, local name, category, brand, variant, pack/unit, barcode, description, optional price, visibility, stock, optional image and image-reuse consent.
- Backend duplicate-check route searches likely master catalogue matches before a new vendor submission is created.
- Vendor-created products are added to that vendor's own catalogue with `pending_review` / `pending master-catalogue review` status.
- New `vendor_product_submissions` and `vendor_product_submission_audit` schema supports Company CRM moderation: approve, reject, request correction, link to existing or promote to master catalogue.
- Image-reuse consent is explicit and unchecked by default; shared reuse remains subject to moderation and evidence retention.

Verified locally:

- `node --check mobile\server\catalog\catalogueSetupRoutes.js` passed.
- `node --check mobile\server\index.js` passed.
- `npx.cmd tsc --noEmit --pretty false` passed from `mobile`.

Still requires live Supabase verification:

- Run `supabase/RUN_ONLY_VENDOR_CATALOGUE_SETUP_WORKFLOW.sql` in the `sabsewa-local` Supabase SQL Editor after the master catalogue migrations are already applied.
- Test with two real vendor accounts to confirm vendor-specific catalogue isolation.
- Test adding master products with and without images.
- Test submitting a missing product with and without image-reuse consent.
- Test Company CRM moderation actions after the admin moderation screen is connected to the new `vendor_product_submissions` table.
- Verify AWS S3 malware scanning/metadata stripping/thumbnail generation with the production upload pipeline.

Still requires live verification:

- Run `supabase/RUN_ONLY_PWA_WEB_PUSH_SUBSCRIPTIONS.sql` in the live Supabase project.
- Rebuild and upload the refreshed `mobile/dist` to Hostinger.
- Test PWA installability and update handling on Android Chrome, iPhone Safari and desktop.
- Configure a real VAPID public/private key pair before enabling production web push notifications.

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

## 2026-08-01 Phone OTP Provider Blocker And Registration UI Correction

Screenshot reviewed: customer/vendor registration reached Supabase phone auth but returned `Unsupported phone provider`; no OTP was delivered.

Evidence-based conclusion:
- App-side E.164 normalization is in place and sends Indian numbers as `+91XXXXXXXXXX`.
- The latest failure is not proven to be an unsupported Indian country code. It is a Supabase Phone Auth/SMS-provider configuration blocker.
- Phone registration must remain unavailable for real users until Supabase Phone Auth, a production SMS provider, Indian +91 delivery, TRAI/DLT sender/template approval where required, rate limits and callback behavior are verified in the `sabsewa-local` Supabase project.

Changes made:
- `mobile/lib/phone.ts` now classifies `Unsupported phone provider` as an OTP/SMS-provider issue instead of showing the wrong country-code message.
- `mobile/app/auth/Register.tsx` and `mobile/app/auth/Login.tsx` no longer expose raw internal provider errors such as `Unsupported phone provider` to ordinary users.
- Added a public build switch: `EXPO_PUBLIC_PHONE_AUTH_ENABLED=false` in `mobile/.env.example`. Keep it false until real OTP delivery is verified; set it to true only after production SMS readiness is complete.
- Mobile OTP registration is visibly unavailable when the switch is false, and email registration remains available.
- Hindi registration/login retry labels were corrected from Roman Hindi to Devanagari, including retry, change mobile number, email registration, location success, shop/trade labels and OTP messages.
- Kannada and English translation keys were kept complete for the new phone-auth-disabled state and support-reference message.

Manual owner/Supabase actions still required:
- Confirm the frontend uses `https://xodmazgfibftorrlbotk.supabase.co`.
- In Supabase Dashboard, enable Phone Authentication for the SabSewa Local project.
- Configure a supported SMS provider with production credentials.
- Confirm provider support for Indian `+91` OTP delivery.
- Complete TRAI/DLT sender ID and OTP template approval if the selected provider requires it.
- Verify OTP rate limits/CAPTCHA settings.
- Send a real OTP to a permitted Indian mobile number, verify it, and confirm `user_profiles`, `customer_addresses` and `user_policy_acceptances` are saved.

Local tests passed after this correction:
- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run test:localization`

Registration status:
- Email registration path remains the safe fallback for pilot onboarding.
- Mobile-number registration is not production-ready until a real Indian OTP is delivered, verified, profile/address/Terms acceptance are saved, and the session restores after closing/reopening the PWA.

## 2026-08-01 Vendor Email Registration Rectification

Screenshot reviewed: vendor registration showed mobile OTP disabled and selected Email OTP, but the vendor could not receive/complete verification and therefore could not reach catalogue, orders, wallet or terminal testing.

Confirmed code-level causes fixed:
- `mobile/app/auth/Register.tsx` previously defaulted to Email OTP when phone auth was disabled, even though production SMTP/email OTP template delivery had not been verified.
- `mobile/app/auth/Login.tsx` previously verified only phone/SMS OTP. Email OTP registrations were routed to a screen that did not call `verifyEmailOtp(...)`.
- `mobile/providers/AuthProvider.tsx` now sets email auth redirect URLs back to SabSewa Local (`/auth`) so email/password verification links can return to the PWA.

Changes made:
- Added `EXPO_PUBLIC_EMAIL_OTP_ENABLED=false` and `EXPO_PUBLIC_AUTH_REDIRECT_URL=https://www.sabsewa.in/auth` to `mobile/.env.example`.
- Email/password registration is now the default fallback while mobile SMS and numeric email OTP are unverified.
- Email OTP remains implemented but is visibly unavailable unless `EXPO_PUBLIC_EMAIL_OTP_ENABLED=true` is deliberately set after SMTP/template verification.
- Login now supports distinct email OTP verification through Supabase `verifyEmailOtp(...)`; it no longer treats email OTP as a phone OTP.
- Vendor registration success copy now states that the shop profile is awaiting verification and does not imply commercial activation.
- Hindi and Kannada translation keys were added for email OTP disabled, email OTP send/entry and the vendor pending-verification success state.

Manual owner/Supabase actions still required before declaring email registration production-ready:
- In Supabase Auth for project `https://xodmazgfibftorrlbotk.supabase.co`, enable Email Auth.
- Configure and verify production SMTP sender/domain.
- Set Site URL to `https://www.sabsewa.in`.
- Add permitted redirect URL `https://www.sabsewa.in/auth` and any required local testing URL.
- Decide whether Email OTP will use a numeric token template or only verification/magic links. Do not enable `EXPO_PUBLIC_EMAIL_OTP_ENABLED=true` until the numeric token email template is verified.
- Send a real verification email, open the link or enter the OTP, confirm Supabase session creation, and verify `user_profiles`, `vendors` and `user_policy_acceptances` are saved.

Local tests passed:
- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run test:localization`

Current safe testing route:
- Use email/password registration for vendor onboarding tests after Supabase SMTP and redirect URLs are configured.
- Keep mobile OTP and numeric email OTP disabled until their provider/template delivery is proven end to end.

## 2026-08-01 Mobile OTP Separate Readiness Status

Immediate status: **MOBILE OTP IS NOT ACTIVE**.

Important evidence rule:
- TypeScript, localization and web export checks only prove that the code builds and can be packaged.
- They do not prove that SMS or email OTP delivery works.
- Mobile OTP becomes production-ready only after a real permitted Indian mobile number receives an SMS, verifies the OTP, creates a Supabase session, saves the customer/vendor profile, records Terms acceptance and restores the session after reopening the PWA.

Mobile OTP control points:
- Frontend feature flag: `EXPO_PUBLIC_PHONE_AUTH_ENABLED` in `mobile/.env` / deployment environment.
- Template/default value: `EXPO_PUBLIC_PHONE_AUTH_ENABLED=false` in `mobile/.env.example`.
- Phone OTP request implementation: `mobile/providers/AuthProvider.tsx` uses Supabase `signInWithOtp({ phone })`.
- Phone OTP verification implementation: `mobile/providers/AuthProvider.tsx` uses Supabase `verifyOtp({ phone, token, type: "sms" })`.
- Phone validation/normalization: `mobile/lib/phone.ts`.
- Registration UI gating: `mobile/app/auth/Register.tsx`.
- OTP screen flow: `mobile/app/auth/Login.tsx`.
- Profile/Terms persistence after verification: `mobile/lib/registrationCompletion.ts`.
- Latest built PWA status: code export passed, but deployed SMS delivery is unverified.

| Area | Status | Evidence / blocker |
| --- | --- | --- |
| Mobile OTP frontend | Implemented but unverified | UI exists, but hidden/disabled while `EXPO_PUBLIC_PHONE_AUTH_ENABLED=false`. |
| Phone-number normalization | Implemented but unverified | Code normalizes valid Indian numbers to `+91XXXXXXXXXX`; real service delivery still untested. |
| Supabase Phone Auth | Blocked by external configuration | Must be checked/enabled in the `sabsewa-local` Supabase dashboard. |
| SMS provider | Blocked by external configuration | No verified provider delivery evidence recorded. |
| Indian `+91` delivery | Blocked by external configuration | Requires provider support and real delivery test. |
| TRAI/DLT approval | Blocked by external configuration | Entity/sender/template approval status not verified. |
| OTP delivery test | Blocked by external configuration | No real Indian SMS received evidence recorded. |
| OTP verification test | Blocked by external configuration | No successful real SMS OTP verification evidence recorded. |
| Customer-profile persistence after OTP | Implemented but unverified | Code path exists; must be tested after real OTP verification. |
| Vendor-profile persistence after OTP | Implemented but unverified | Code path exists; must be tested after real OTP verification. |
| Production deployment | Implemented but unverified | PWA export passes, but Hostinger deployment must be refreshed and tested with live Supabase/SMS. |

Manual Mobile OTP activation checklist:
1. Supabase Dashboard -> project `sabsewa-local` (`https://xodmazgfibftorrlbotk.supabase.co`) -> Authentication -> Providers -> Phone: enable Phone provider.
2. Supabase Dashboard -> Authentication -> Providers/Phone/SMS configuration: choose and configure a supported production SMS provider.
3. Add provider secrets only in Supabase/SMS-provider dashboard or approved secret storage. Do not put SMS secrets in GitHub, frontend code, screenshots or chat.
4. Confirm the provider supports India `+91` delivery and OTP use cases.
5. Complete TRAI/DLT entity registration, sender ID and OTP template approval if required by the provider for India.
6. Supabase Dashboard -> Authentication -> URL Configuration: confirm Site URL is `https://www.sabsewa.in` and required redirects are allowed.
7. Configure CAPTCHA/rate limits according to Supabase/provider guidance without blocking real pilot numbers.
8. Set `EXPO_PUBLIC_PHONE_AUTH_ENABLED=true` only after the provider is configured and ready for testing.
9. Rebuild the PWA with `npm.cmd run export:web:hostinger`.
10. Upload the refreshed `mobile/dist` contents to Hostinger `public_html`.
11. Test with a real permitted Indian number and record only masked evidence, for example `+91******2846`, delivery status, verification status and profile-save status.

Final Mobile OTP status:
- Production-ready: NO
- Real Indian SMS received: NO
- Profile saved after OTP verification: NO
- Owner action still required: configure Supabase Phone Auth, production SMS provider, India `+91` delivery, TRAI/DLT sender/template where required, enable `EXPO_PUBLIC_PHONE_AUTH_ENABLED=true`, rebuild/deploy Hostinger `dist`, and complete a real OTP delivery/verification/profile-persistence test.

## 2026-08-01 Twilio Verify Local Mobile OTP Test Activation

Owner reported that Supabase Phone Auth is now configured with a separate SabSewa Local Twilio Verify Service.

Current status: **MOBILE OTP IS CONFIGURED BUT NOT VERIFIED**.

Local-only change:
- Enabled `EXPO_PUBLIC_PHONE_AUTH_ENABLED=true` in `mobile/.env` for local testing only.
- Confirmed `mobile/.env` is ignored by Git through `.gitignore`; this local testing flag was not added to source-controlled `.env.example` and must not be deployed publicly until the full test succeeds.
- Kept `EXPO_PUBLIC_EMAIL_OTP_ENABLED=false`.

Code checks after local flag change:
- `npx.cmd tsc --noEmit --pretty false` passed.
- `npm.cmd run test:localization` passed.
- `git check-ignore -v mobile/.env` confirms local env is ignored.

End-to-end test still pending:
- Real Indian SMS delivery through Twilio Verify.
- OTP verification through Supabase.
- Supabase session creation.
- Customer or vendor profile save through `mobile/lib/registrationCompletion.ts`.
- Terms acceptance record in `user_policy_acceptances`.
- Session restoration after closing/reopening the PWA.

Do not deploy publicly yet:
- Do not upload a PWA build containing `EXPO_PUBLIC_PHONE_AUTH_ENABLED=true` to Hostinger until a real OTP request, Twilio delivery, OTP verification, profile save and Terms acceptance are confirmed.

## 2026-08-02 OTP Incident Review And MSG91 Migration Preparation

Owner supplied an MSG91 migration instruction after Twilio OTP remained unresolved for approximately 48 hours.

Current finding:
- The frontend phone-auth contract is correct for Supabase-managed OTP: `mobile/providers/AuthProvider.tsx` calls `supabase.auth.signInWithOtp({ phone })` and verifies with `supabase.auth.verifyOtp({ phone, token, type: "sms" })`.
- Indian mobile normalization is present in `mobile/lib/phone.ts` and produces `+91XXXXXXXXXX`.
- `mobile/app/auth/Register.tsx` and `mobile/app/auth/Login.tsx` gate phone OTP with `EXPO_PUBLIC_PHONE_AUTH_ENABLED`.
- `mobile/.env.example` is now reset to `EXPO_PUBLIC_PHONE_AUTH_ENABLED=false` so a public/template build is not accidentally enabled before a real provider test passes.
- `mobile/app/+html.tsx` no longer registers the PWA service worker on `localhost` or `127.0.0.1`, reducing stale-cache/blank-page confusion during local OTP testing.
- Added `supabase/functions/send-sms-msg91/index.ts` as a Supabase Send SMS Hook delivery function for MSG91. This preserves Supabase as the OTP generator and verifier.
- Added `docs/MSG91_SUPABASE_PHONE_AUTH_RUNBOOK.md` with the safe MSG91 architecture, required dashboard actions, secret-storage rules, local testing command and acceptance criteria.

Important blocker:
- `mobile/.env` is Git-ignored, but the reviewed local file still contains placeholder public values such as `replace_with_supabase_anon_key`. Local OTP testing cannot succeed until the real SabSewa Local Supabase anon key is placed in `mobile/.env` on the owner machine. Do not paste the key into chat.
- TypeScript validation could not be completed because `mobile/node_modules` is inconsistent: `package-lock.json` declares `typescript`, but the local `node_modules/.bin/tsc` binary is missing. `npm ci` was started to repair this but exceeded the tool timeout, so dependency repair must be completed before the next full validation.

Do not mark MSG91/mobile OTP production-ready until:
- Supabase Auth Hooks are confirmed available on the current Supabase project/plan.
- The MSG91 account, Indian transactional OTP/DLT entity, sender/header and template are active and approved.
- The Edge Function is deployed and configured as the Supabase Send SMS Hook.
- `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID`, `MSG91_SENDER_ID` and `SUPABASE_SEND_SMS_HOOK_SECRET` are stored only as Supabase Edge Function secrets.
- A real Indian `+91` number receives an OTP, verifies successfully, creates/restores a Supabase session, saves profile/address/Terms acceptance, rejects an incorrect OTP and respects resend cooldown.
- Only after that, set `EXPO_PUBLIC_PHONE_AUTH_ENABLED=true`, rebuild `mobile/dist`, confirm new bundle timestamps/hashes, audit for secret leakage and upload the complete fresh build to Hostinger.
Latest Milestones & Fixes:

2026-08-01 / 2026-08-02 OTP Verification & Web Routing Fixes: Documents the removal of native Alert blockages, implementation of window.location.href web-level route fallbacks, and the resolution of the stuck state after OTP verification on sabsewa.in.

Phone Auth & Provider Strategy: Captures the current status of Supabase Phone Auth, transition preparation for the MSG91 Supabase Hook, and the environment flag safeguards (EXPO_PUBLIC_PHONE_AUTH_ENABLED).

Hostinger Static PWA Export: Documents build validation, .htaccess copying, PWA service worker policies, and deployment checks via npm run export:web:hostinger.

Razorpay Live-Mode Hardening: Documents webhook signature verification (HMAC-SHA256), environment banners, idempotency tables (razorpay_webhook_events), and the updated Rs 5,500 vendor activation wallet policy.

Gemini XPRIZE Alignment: Outlines compliance status across AI backend logging (gemini_agent_logs), multilingual Flash translation, conversational ordering, and Devpost submission checklist items.
## 2026-08-08 - Vendor login role routing guard

- Fixed vendor sessions being able to remain on public/customer marketplace screens after OTP login or browser refresh.
- mobile/providers/AuthProvider.tsx now resolves the active role from auth metadata, user_profiles, and linked endors before routing.
- Vendors are redirected to /vendor/dashboard from /, /hlm, /customer/*, /hyperlocal/*, and auth screens.
- The global Home button now uses the resolved auth role instead of only user_metadata.role.
## 2026-08-08 - Vendor onboarding pricing repair

- Root cause fixed: database fee-rule lookup only matched exact slugs, so Vegetable Shops did not resolve to the egetables onboarding fee rule.
- Added Supabase repair SQL: supabase/RUN_FIX_VENDOR_ONBOARDING_PRICING_AND_ACTIVATION_2026_08_08.sql.
- Platform billing now resolves onboarding Razorpay amounts through the category-aware backend policy service.
- Onboarding page now includes a four-step progress indicator and clearer Pay Now/locked state text.
- KYC remains mandatory before Razorpay order creation; payment verification remains backend-only.
- Verified onboarding payment now activates a KYC-approved vendor in the database function.
## 2026-08-08 - Flexible vendor KYC document sections

- Vendor KYC now uses two mandatory dropdown-style sections: Identity Proof and Shop Address Proof / Business Registration.
- Added conditional Special / Restricted Item Licence section for pharmacy, food, liquor, alcohol, or other regulated categories.
- Uploads support Camera, Gallery, and Files and store document section/selected label in KYC metadata.
- Uploading documents moves the vendor to kyc_under_review; it does not auto-approve KYC or unlock payment.
- Admin KYC approval is blocked until mandatory KYC sections have acceptable submitted documents.
- Added Supabase SQL repair: supabase/RUN_FIX_VENDOR_KYC_DOCUMENT_FLEXIBLE_TYPES_2026_08_08.sql.
## 2026-08-08 - KYC section-level upload workflow

- Reworked Vendor KYC so each required document section has its own document selection, file picker, and Upload button.
- The bottom Submit For Verification action now submits only an already uploaded KYC package and blocks submission when mandatory sections are missing.
- Uploading one document no longer implies the full KYC package was submitted.
- KYC moves to kyc_under_review only after all mandatory uploaded documents are submitted for verification.
- Vendor-facing payment configuration errors no longer expose SQL/developer instructions.

## 2026-08-08 - KYC upload state synchronization

- Fixed Vendor KYC so "selected file" and "uploaded document" are separate states.
- Individual upload success is now based on the backend-created endor_kyc_documents row returned after storage upload.
- Submit KYC Package now reads the same backend document records as each document section.
- Normal vendors see restricted/regulated licence as Not Required / Optional unless their category legally requires it.
- KYC uploads now use the private endor-kyc-private Supabase bucket with signed preview and delete/re-upload routes.