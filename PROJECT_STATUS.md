# SabSewa Local Project Status

Updated: 2026-07-28

Scope: `C:\Users\HP\SabSewa-Local`

Current Supabase project: `sabsewa-local` at `https://xodmazgfibftorrlbotk.supabase.co`

Production web URL: `https://www.sabsewa.in`

Official support contact: `support@sabsewa.in`, `+91 8450092846`, `+91 8178113449`

## Hackathon Guideline Alignment

The latest supplied guideline has been documented in:

`C:\Users\HP\SabSewa-Local\docs\HACKATHON_ALIGNMENT.md`

Gemini handover instructions have been prepared in:

`C:\Users\HP\SabSewa-Local\docs\GEMINI_HANDOVER_PROMPT.md`

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

## Important Supabase Note

The shared catalogue migration failed because `202607260006_vendor_shared_product_catalogue.sql` was run before the helper-function/RLS migration that creates `public.owns_vendor(uuid)`.

Do not rerun `RUN_ALL_MIGRATIONS_FOR_SABSEWA_LOCAL.sql` on the current database because some base tables and policies already exist. For the current Supabase project, run:

`C:\Users\HP\SabSewa-Local\supabase\RUN_INCREMENTAL_AFTER_INITIAL_SUCCESS.sql`

Use `RUN_ALL_MIGRATIONS_FOR_SABSEWA_LOCAL.sql` only on a blank/fresh Supabase project.

## Completed In This Pass

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
- `mobile/server/hyperlocal/pricingRoutes.js`
- `supabase/migrations/202607260007_order_acceptance_availability_rpc.sql`
- `supabase/migrations/202607260008_wallet_dispute_evidence.sql`
- `supabase/migrations/202607260009_location_based_vendor_ids.sql`
- `supabase/migrations/202607260010_customer_discovery_unserved_area_leads.sql`
- `supabase/migrations/202607270001_vendor_controlled_product_pricing.sql`
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
- Verify customer discovery after running migration `202607260010_customer_discovery_unserved_area_leads.sql`.
- Verify vendor-controlled pricing after running migration `202607270001_vendor_controlled_product_pricing.sql`.
- Test quote-required order flow: customer places request, vendor submits price, customer approves, vendor accepts, Rs 15 fee deducts once.
- Update real vendor city/locality codes from `company_location_codes` before production launch.
- Confirm admin routes are protected by the deployed backend auth layer before production.

## Production Readiness

Not production-ready until the incremental SQL runs successfully in Supabase and the critical workflows are tested with real credentials.
