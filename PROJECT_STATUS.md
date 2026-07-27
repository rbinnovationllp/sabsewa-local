# SabSewa Local Project Status

Updated: 2026-07-26

Scope: `C:\Users\HP\SabSewa-Local`

Current Supabase project: `sabsewa-local` at `https://xodmazgfibftorrlbotk.supabase.co`

## Important Supabase Note

The shared catalogue migration failed because `202607260006_vendor_shared_product_catalogue.sql` was run before the helper-function/RLS migration that creates `public.owns_vendor(uuid)`.

Do not rerun `RUN_ALL_MIGRATIONS_FOR_SABSEWA_LOCAL.sql` on the current database because some base tables and policies already exist. For the current Supabase project, run:

`C:\Users\HP\SabSewa-Local\supabase\RUN_INCREMENTAL_AFTER_INITIAL_SUCCESS.sql`

Use `RUN_ALL_MIGRATIONS_FOR_SABSEWA_LOCAL.sql` only on a blank/fresh Supabase project.

## Completed In This Pass

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

- Run `RUN_INCREMENTAL_AFTER_INITIAL_SUCCESS.sql` in the new Supabase SQL Editor.
- Test the `accept_order_with_wallet_fee` RPC in the live Supabase database.
- Test customer order placement against real vendor item availability.
- Test Razorpay top-up with live/test keys.
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
