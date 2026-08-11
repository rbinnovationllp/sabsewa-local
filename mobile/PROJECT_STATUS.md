# SabSewa Local Mobile Project Status

Updated: 2026-07-26

Latest implementation note: the business model is now direct customer-to-vendor payment for every order. SabSewa Local does not collect, settle, refund, or recover vendor order amounts. Vendors deposit a minimum Rs 5,000 advance balance with SabSewa Local, and the company deducts a fixed Rs 15 platform fee only after an order is successfully completed. Vendor-owned customer credit remains a vendor/customer arrangement only; SabSewa Local records and enforces vendor-specific limits/status for credit orders and does not finance, guarantee, collect, or recover credit.

Supabase project note: local setup files have been prepared for a separate Supabase project named `SabSewa-Local`. The current live project ref previously found in local env files was the old combined project `fpzvqnlbxegwebjvzjgz`; create the new Supabase dashboard project and apply `C:\Users\HP\SabSewa-Local\supabase\migrations` there before production use.

## Scope

SabSewa Local is now scoped as an independent Expo/React Native mobile application for the hyperlocal marketplace only. The active app tree is customer, vendor, rider, hyperlocal marketplace, auth, legal, providers, shared components, services, Supabase client code, AWS S3 upload support, Razorpay vendor advance balance top-up support, and the Node API backend.

The app is not production-ready yet. It is cleaner and locally type-checking, but payment, Supabase, S3, Gemini, push notification, and real-device workflows still require live credentials and end-to-end validation.

## Old SabSewa Module Isolation

Archived, not deleted:

- `C:\Users\HP\SabSewa-Local\mobile\_archived_non_local_20260725\app`
- `C:\Users\HP\SabSewa-Local\mobile\_archived_non_local_20260725\(tabs)`
- `C:\Users\HP\SabSewa-Local\mobile\_archived_non_local_20260725\lib`
- `C:\Users\HP\SabSewa-Local\mobile\_archived_non_local_20260725\supabase`

The archived material contains the old combined-project routes and helpers for SabSewa SHG, SabSewa Pro, SabSewa Job, worker, volunteer, verifier, old wallet tabs, and old Supabase functions. It remains available as a recovery backup but is excluded from the active TypeScript project.

Active scan result:

- Command: `rg` scan for SabSewa SHG, SabSewa Pro, SabSewa Job, SHG, Pro, Job, prowallet, job-subscription, worker, volunteer, verifier, emergency, federation, skilled labour, AI Landing in active `app`, `utils`, and `src`.
- Result: no active matches.
- False-positive remaining outside app code: `supabase/config.toml` contains Supabase product comments such as "Supabase Pro plan" and `per_worker`; lockfiles contain dependency names such as `jest-worker` and `metro-transform-worker`. These are third-party/generated references, not SabSewa modules.

## Files Updated In This Cleanup

- `C:\Users\HP\SabSewa-Local\mobile\app\index.tsx`: Local-only landing screen with customer, vendor, and rider entry points.
- `C:\Users\HP\SabSewa-Local\mobile\app\auth\index.tsx`: removed old customer/vendor-worker/volunteer copy; routes authenticated users correctly.
- `C:\Users\HP\SabSewa-Local\mobile\app\auth\Login.tsx`: OTP login now redirects to the resolved Local role route.
- `C:\Users\HP\SabSewa-Local\mobile\app\auth\Register.tsx`: roles limited to customer, vendor, rider.
- `C:\Users\HP\SabSewa-Local\mobile\app\customer\dashboard.tsx`: removed active-job/SHG/wallet references and points to Gemini ordering, cart, tracking, and support.
- `C:\Users\HP\SabSewa-Local\mobile\app\customer\support.tsx`: replaced worker/payment split copy with Local order/payment support copy.
- `C:\Users\HP\SabSewa-Local\mobile\app\vendor\index.tsx`: vendor route guard now allows vendor only.
- `C:\Users\HP\SabSewa-Local\mobile\app\vendor\dashboard.tsx`: fixed terminal route casing.
- `C:\Users\HP\SabSewa-Local\mobile\app\vendor\TerminalSelector.tsx`: removed route to missing `/vendor/Inventory`.
- `C:\Users\HP\SabSewa-Local\mobile\app\rider\index.tsx`: restored actual rider assignment screen from the mixed tab folder.
- `C:\Users\HP\SabSewa-Local\mobile\app\rider\order.tsx`: restored actual rider GPS/order action screen from the mixed tab folder.
- `C:\Users\HP\SabSewa-Local\mobile\app\vendor\assign-delivery.tsx`: restored Local vendor delivery assignment screen.
- `C:\Users\HP\SabSewa-Local\mobile\app\vendor\track-rider.tsx`: restored Local rider tracking screen.
- `C:\Users\HP\SabSewa-Local\mobile\app.json`: Local mobile app metadata; removed Expo web target config.
- `C:\Users\HP\SabSewa-Local\mobile\package.json`: renamed package to `sabsewa-local-mobile`, removed the web script, updated description.
- `C:\Users\HP\SabSewa-Local\mobile\package-lock.json`: aligned package name.
- `C:\Users\HP\SabSewa-Local\mobile\tsconfig.json`: excludes the archive folder and active-checks only Local scope.
- `C:\Users\HP\SabSewa-Local\mobile\server\credit\vendorCreditService.js`: backend service for vendor-owned credit accounts, limits, purchases, payments, suspension, and reminders.
- `C:\Users\HP\SabSewa-Local\mobile\server\credit\vendorCreditRoutes.js`: vendor credit API for account approval, payment recording, suspension, and history.
- `C:\Users\HP\SabSewa-Local\mobile\server\credit\creditReminderJob.js`: queues automatic repayment reminders for near-limit, due-soon, overdue, exhausted, and suspended credit accounts.
- `C:\Users\HP\SabSewa-Local\mobile\server\hyperlocal\placeOrder.js`: credit orders now check the selected vendor's approved credit account; prepaid orders remain allowed independently.
- `C:\Users\HP\SabSewa-Local\mobile\app\hyperlocal\cart.tsx`: added separate prepaid and vendor-approved credit order actions.
- `C:\Users\HP\SabSewa-Local\mobile\app\vendor\CreditList.tsx`: vendor can approve/update limits, record payments, suspend credit, and view vendor-wise outstanding balances through backend APIs.
- `C:\Users\HP\SabSewa-Local\mobile\supabase\migrations\202607250002_create_vendor_owned_credit_controls.sql`: adds vendor credit accounts, transactions, reminders, and order payment method/status fields.
- `C:\Users\HP\SabSewa-Local\mobile\app\(legal)\terms.tsx` and `app\(legal)\policy.tsx`: added explicit credit responsibility disclaimer.
- `C:\Users\HP\SabSewa-Local\supabase\migrations`: consolidated SabSewa-Local database migrations for applying to the new separate Supabase project.
- `C:\Users\HP\SabSewa-Local\supabase\config.toml`: local Supabase CLI project id set to `sabsewa-local`.
- `C:\Users\HP\SabSewa-Local\supabase\README.md`: created setup instructions for the new `SabSewa-Local` Supabase project.
- `C:\Users\HP\SabSewa-Local\docs\SABSEWA_LOCAL_SUPABASE_AND_GITHUB_SETUP.md`: created Supabase and GitHub setup guide.
- `C:\Users\HP\SabSewa-Local\.gitignore`: added protection for real `.env` secrets before GitHub upload.

## Fully Implemented And Locally Verified

- Expo project foundation exists: `app.json`, `tsconfig.json`, `babel.config.js`, `metro.config.js`, `assets`, `components`, `providers`, `contexts`.
- Active app routes are Local-only after code inspection and scan.
- Customer catalogue browsing and cart placement screens exist: `app/hlm/index.tsx`, `app/hyperlocal/cart.tsx`.
- Vendor catalogue screens exist: `app/vendor/AddItem.tsx`, `app/vendor/EditItem.tsx`, `app/vendor/TerminalSelector.tsx`.
- Vendor order screens exist: `app/vendor/Orders.tsx`, `app/vendor/ManageOrder.tsx`.
- Rider assignment and GPS tracking screens exist: `app/rider/index.tsx`, `app/rider/order.tsx`.
- Vendor-owned credit controls are implemented in code: vendors can set customer limits/status, credit purchases are blocked when exhausted/overdue/suspended for that vendor, direct-payment orders remain separate, and credit reminders are queued.
- Vendor advance balance rules are implemented in code: minimum Rs 5,000 opening/top-up balance, Rs 1,000 reminder threshold, below Rs 515 new-order stop, Razorpay vendor top-up verification, transaction history, CSV statement route, and admin adjustment route. The Rs 515 threshold reserves Rs 500 activation/usage fee plus one Rs 15 completed-order platform fee.
- Vendor voluntary exit/refund workflow is partially implemented: `app/vendor/ExitAndRefund.tsx` shows the refund calculation before closure request, and `server/securityWallet` creates a closure request that stops new orders. It still needs admin approval/refund processing UI and live bank/payment refund process.
- Multilingual foundation is partially implemented: `constants/languages.ts` lists English plus all 22 Eighth Schedule languages, and `components/LanguageSelector.tsx` exposes language selection. Translation quality and full-screen coverage must be completed in phases.
- Vendor storage quota controls are partially implemented: `server/storage/s3Routes.js` computes quota from genuinely completed orders, starts vendors at 100 MB, blocks product image uploads beyond quota, blocks videos, caps product image uploads at 180 KB, records file metadata in `vendor_storage_files`, updates `vendor_storage_usage`, and exposes a Vendor CRM storage screen at `app/vendor/StorageUsage.tsx`.
- Vendor-contributed shared product catalogue is partially implemented: `shared_product_images` stores rights consent, moderation status and reusable image references; `server/storage/s3Routes.js` supports pending shared image submission and approved-image search; `app/vendor/AddItem.tsx` can select approved shared images or submit a new image with reuse consent. Admin moderation UI is still pending.
- The Rs 15 platform fee is now deducted by `server/hyperlocal/vendorOrderActions.js` when a vendor marks an order `completed`, not when the vendor accepts and unlocks customer details.
- Customer order payment is intentionally not collected by SabSewa Local. `app/hyperlocal/cart.tsx` places direct-payment orders and tells customers to pay the concerned vendor directly through that vendor's accepted methods.
- Backend route syntax passes for `server/index.js`, Gemini routes, S3 routes, security wallet routes, order placement, and vendor order actions.
- TypeScript check passes: `npx.cmd tsc --noEmit --pretty false`.
- JSON config parses: `package.json` and `app.json`.

## Partially Implemented Or Disconnected

- Supabase auth exists through `providers/AuthProvider.tsx`, `lib/supabase.ts`, and auth screens, but registration still behaves like a placeholder and does not persist complete customer/vendor/rider profiles.
- Vendor advance balance Razorpay top-up flow exists in `app/vendor/SecurityWallet.tsx` and `server/securityWallet`, but it needs real Razorpay keys, installed native SDK validation, and Android/iOS device testing.
- AWS S3 presigned upload exists in `server/storage/s3Routes.js` and is used by `app/vendor/AddItem.tsx` and `app/vendor/EditItem.tsx`; live S3 lifecycle cleanup for abandoned uploads, archived image versions, and thumbnail generation still needs AWS configuration.
- Gemini integration is meaningful but not submission-ready until live API credentials and demo evidence are produced. Files: `server/gemini/geminiRoutes.js`, `services/gemini.ts`, `app/customer/GeminiOrder.tsx`, `app/vendor/GeminiInventory.tsx`, `app/vendor/Orders.tsx`.
- Vendor advance balance enforcement exists on order placement, and order fee deduction happens on completion. It still needs live Supabase and real-device testing.
- Wallet warnings are stored as in-app warning rows, but push notification delivery is not fully implemented.
- Admin adjustment backend route exists at `server/securityWallet/securityWalletRoutes.js`, but there is no dedicated mobile admin review UI for wallet transactions, adjustments, or audit trails.
- Customer credit ledger is now vendor-owned and backend-mediated, but SMS/push delivery of queued reminders still needs live notification provider integration and testing.

## Missing Or Broken

- No confirmed real-device test was run in this session.
- No live Supabase database migration was applied or queried from this session.
- No live Razorpay vendor top-up payment or webhook verification was run.
- No live AWS S3 upload was run.
- No live Gemini API call was run.
- No live vendor-credit Supabase migration/application test was run.
- Expo lint did not complete because the CLI attempted network access and this session has restricted network access.
- Push notification infrastructure for advance-balance warnings and delivery updates is missing or incomplete.
- S3 lifecycle rules for abandoned pending uploads, old image versions, and inactive product image archiving are not yet configured on the live AWS bucket.
- Admin moderation workflow for shared product images is backend/schema-ready but does not yet have a Company CRM screen for approve/reject/remove decisions.
- Push/SMS delivery for vendor-credit reminders is still incomplete; reminders are queued in database records.
- Customer order payment collection, settlement, refund, and recovery flows are intentionally out of scope because order payment is direct between customer and vendor.
- Production admin controls are backend-only/partial; mobile admin UI and role validation need completion.

## Verification Log

- Passed: `npx.cmd tsc --noEmit --pretty false`
- Passed: `node --check .\server\index.js`
- Passed: `node --check` for `server\credit\vendorCreditService.js`, `server\credit\vendorCreditRoutes.js`, and `server\credit\creditReminderJob.js`
- Passed: `node --check` for `server/gemini/geminiRoutes.js`, `server/storage/s3Routes.js`, `server/securityWallet/securityWalletRoutes.js`, `server/hyperlocal/placeOrder.js`, `server/hyperlocal/vendorOrderActions.js`
- Passed: JSON parse check for `package.json` and `app.json`
- Passed: active old-module scan returned no SHG/Pro/Job app-code matches
- Blocked: `npm.cmd run lint` because Expo attempted network fetch and failed under restricted network
- Not run: real-device Expo launch, live Supabase, live Razorpay, live S3, live Gemini

## Priority Action Plan

1. Apply the new SabSewa-Local Supabase migrations, including `202607260001_update_vendor_advance_balance_rules.sql`, to the separate `SabSewa-Local` Supabase project.
2. Test Razorpay vendor advance balance deposit/top-up through UPI/card and confirm wallet transaction rows with payment references.
3. Run an end-to-end order flow: customer places a direct-payment order, vendor sees limited details, vendor accepts/unlocks details, service is completed, Rs 15 is deducted once from vendor advance balance.
4. Configure AWS S3 lifecycle cleanup for abandoned uploads, old image versions, thumbnails, inactive product image archiving, and unconfirmed shared-image submissions.
5. Implement push notifications for advance-balance warnings at Rs 1,000, below Rs 515 order stop, storage warnings at 80/90/100%, and eligibility restoration.
6. Connect queued vendor-credit reminders to approved push/SMS notification providers.
7. Add mobile admin wallet transaction review and adjustment screens with mandatory reason and audit trail.
8. Validate RLS policies against customer, vendor, rider, and admin users.
9. Run real-device Android testing for customer order, vendor accept/reject, Razorpay top-up, rider GPS tracking, delivery completion, wallet statement download, vendor-credit block/allow cases, storage quota upload blocking, and approved shared image reuse.
10. Prepare Gemini XPRIZE evidence: demo video, screenshots, logs from `gemini_agent_logs`, README demo steps, API key configuration proof without exposing secrets, and judging criteria mapping.

## Conclusion

Not ready--complete the listed technical work first.
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
## 2026-08-08 - KYC auto-upload after file selection

- KYC document pickers now start upload immediately after the vendor takes/selects a file.
- The document badge shows Uploading during the request and changes to Uploaded only after backend storage and metadata insertion succeeds.
- The old ambiguous "Ready to upload" wording was replaced with a clear fallback retry message for failed/manual retry cases.
## 2026-08-08 - KYC upload button request execution

- Hardened Vendor KYC upload buttons so each click visibly starts upload and logs the request path.
- Web uploads now append the real browser File object from Expo pickers when available instead of relying only on fetching a picker URI.
- Upload failures are shown inline inside the affected KYC section and logged to the browser console for debugging.
- Upload success still requires backend confirmation and a created endor_kyc_documents row before the badge changes to Uploaded.
## 2026-08-08 - KYC stable vendor-id auto upload

- Removed the separate manual KYC upload button from the vendor KYC sections.
- Upload now starts only from Take Photo, Gallery, or Files selection.
- The upload API uses a stable resolved vendor id even if the backend response omits endor.id.
- Removed contradictory "file selected but not uploaded, press upload" messaging.
- If upload cannot start, the section now shows the actual blocking reason instead of silently doing nothing.
## 2026-08-08 - KYC storage diagnostics and MIME inference

- KYC backend now infers MIME type from the selected filename when browser/file picker reports pplication/octet-stream.
- JPG/JPEG/PNG/WEBP images are compressed and uploaded as image/jpeg; PDFs remain PDFs.
- KYC upload now verifies or creates the private endor-kyc-private bucket using the backend service role.
- Storage/API failures return diagnostic stage/code/message to the frontend and are logged on the backend.
## 2026-08-09 - Master Admin Secret-Code CRM Security

- Added a Master Admin CRM gate requiring both authenticated `master_admin` role and backend-verified Master Admin Secret Code.
- The Master Admin secret is not stored in frontend code, GitHub, SQL migrations, or client-visible environment variables. The backend verifies a `crypto.scrypt` hash stored only in backend environment variables.
- Added short-lived server-signed Master Admin CRM session tokens. Admin API calls include the token in `x-master-admin-session`; protected company routes reject requests without it.
- Added rate limiting / temporary lockout for repeated incorrect secret attempts and audit logging for successful/failed Master Admin access attempts.
- Added `mobile/server/scripts/generate-master-admin-secret.mjs` so the secret can be entered privately in PowerShell/terminal and converted into backend-only `.env` values.
- Manual Supabase action: run `supabase/RUN_ONLY_MASTER_ADMIN_ACCESS_SECURITY_2026_08_09.sql` if audit/user-profile support is not already present.
## Completed Feature Modules

### Partner Acquisition & Vendor Financial Attribution System (Updated 2026-08-11)
- [x] **Acquisition Discovery Analysis:** Replaced generic "Referral Source" with structured survey options ("How did you hear about SabSewa Local Partner Program?") including "Other" text details.
- [x] **Live Vendor Registration Partner Verification:** Interactive verification API (`POST /api/partner/verify-referral`) allowing vendors to validate and link their referring Partner in real time before store creation.
- [x] **Permanent Attribution Safeguards:** Database relationships (`partner_applications` -> `partner_referred_vendors` -> `vendors`) enforce strict 1:1 attribution. Changing a vendor's linked partner requires Master Admin credentials with audit logging.
- [x] **Eligible Revenue Commission Ledger:** Revenue sharing (default 10%) is calculated strictly on eligible company revenues (vendor platform commissions and transaction charges) generated from attributed vendor orders, excluding customer order values and statutory taxes.
- [x] **Admin CRM Reporting:** Integrated dashboard displaying partner referrals, vendor activation status, generated eligible revenue, earned commissions, tax deductions (TDS 5%), and payout transaction histories.