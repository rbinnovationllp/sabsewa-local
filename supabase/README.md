# SabSewa-Local Supabase Setup

This folder is the database source of truth for the separate **SabSewa-Local** Supabase project.

Do not apply these migrations to the old combined **SabSewa** project unless you intentionally want to mix SabSewa Local data with SabSewa Job, SHG, and Pro.

## Correct Project

Create or use a Supabase dashboard project named:

```text
SabSewa-Local
```

Current new project URL:

```text
https://xodmazgfibftorrlbotk.supabase.co
```

The earlier mistaken Alert name is not used for this project:

```text
SabSewa-Alert
```

## Apply Tables

After creating the Supabase project, copy its project ref from Supabase Dashboard, then run:

```powershell
cd C:\Users\HP\SabSewa-Local
supabase login
supabase link --project-ref YOUR_NEW_SABSEWA_LOCAL_PROJECT_REF
supabase db push
```

The migration set includes:

- Core Local tables: `user_profiles`, `vendors`, `vendor_terminals`, `catalog_items`, `vendor_items`, `hyperlocal_orders`, `riders`, `rider_assignments`
- Vendor advance balance tables: `vendor_security_wallets`, `vendor_security_wallet_transactions`, `vendor_security_wallet_warnings`
- Gemini audit table: `gemini_agent_logs`
- Order privacy/audit table: `order_audit_logs`
- Vendor-owned credit tables: `vendor_credit_accounts`, `vendor_credit_transactions`, `vendor_credit_reminders`
- Vendor storage tables: `vendor_storage_usage`, `vendor_storage_files`
- Vendor-contributed shared catalogue table: `shared_product_images`
- Registration legal acceptance table: `user_policy_acceptances`
- Revised vendor activation and wallet policy migration: `202607280001_revised_vendor_activation_wallet_policy.sql`

For a completely blank Supabase database, run the full bundled file once:

```text
C:\Users\HP\SabSewa-Local\supabase\RUN_ALL_MIGRATIONS_FOR_SABSEWA_LOCAL.sql
```

Open Supabase Dashboard > `sabsewa-local` > SQL Editor, paste the full file, and run it once.

If the initial/base migrations were already applied and you got duplicate policy errors, do not rerun the full bundle. Run this incremental file instead:

```text
C:\Users\HP\SabSewa-Local\supabase\RUN_INCREMENTAL_AFTER_INITIAL_SUCCESS.sql
```

If you only need the registration Terms/Privacy/legal acceptance update after the full bundle failed with an existing policy such as `Approved vendors are public readable`, run only:

```text
C:\Users\HP\SabSewa-Local\supabase\RUN_ONLY_TERMS_PRIVACY_ACCEPTANCE.sql
```

If you only need the revised vendor activation payment and wallet accounting update, run only:

```text
C:\Users\HP\SabSewa-Local\supabase\RUN_ONLY_REVISED_VENDOR_ACTIVATION_WALLET_POLICY.sql
```

The `vendor_security_*` table names are legacy internal names. In SabSewa Local product wording, this is the vendor advance balance. The first vendor payment is Rs 5,500, split into a one-time non-refundable Rs 500 activation/service charge and Rs 5,000 refundable advance wallet credit. Later standard top-ups are Rs 5,000. Rs 15 is deducted when the vendor securely confirms and accepts a real-world order, and customer order payment remains direct between customer and vendor.

## After Applying

Update the mobile and backend environment files with the new project URL and keys:

```text
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_NEW_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_NEW_ANON_KEY
SUPABASE_URL=https://YOUR_NEW_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_NEW_SERVICE_ROLE_KEY
```

Then rotate any old service-role key that was accidentally stored in local `.env` files.

## Partner Commission Payment/KYC SQL - 2026-08-10

Run `RUN_ONLY_PARTNER_COMMISSION_PAYMENT_KYC_AND_COMPLIANCE_2026_08_10.sql` after the Partner Program expansion SQL. It adds Partner payment detail storage, Partner KYC document metadata, Partner monthly commission statements, compliance cases and audit logs. The `partner-kyc-private` bucket remains private; never make Partner KYC documents public.


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
