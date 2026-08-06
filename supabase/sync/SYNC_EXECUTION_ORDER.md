# SabSewa Local Supabase Sync Execution Order

Run `RUN_000_FULL_DATABASE_SYNC_FROM_SCRATCH_TO_20260805.sql` once in the Supabase SQL editor, or execute the migration files below in this exact order.

The generated full sync script adds safety guards before `CREATE POLICY` and `CREATE TRIGGER` statements so it can recover from many partially-applied manual runs.

## Ordered Migrations

1. `001_hlm_core_schema.sql`
2. `202607240001_create_sabsewa_local_security_wallet.sql`
3. `202607240002_create_gemini_agent_logs.sql`
4. `202607250001_create_order_audit_and_acceptance_privacy.sql`
5. `202607250002_create_vendor_owned_credit_controls.sql`
6. `202607260001_update_vendor_advance_balance_rules.sql`
7. `202607260002_create_vendor_exit_requests.sql`
8. `202607260003_create_vendor_storage_quota.sql`
9. `202607260004_harden_production_rls_policies.sql`
10. `202607260005_device_login_addresses_and_upload_security.sql`
11. `202607260006_vendor_shared_product_catalogue.sql`
12. `202607260007_order_acceptance_availability_rpc.sql`
13. `202607260008_wallet_dispute_evidence.sql`
14. `202607260009_location_based_vendor_ids.sql`
15. `202607260010_customer_discovery_unserved_area_leads.sql`
16. `202607270001_vendor_controlled_product_pricing.sql`
17. `202607270002_terms_privacy_acceptance.sql`
18. `202607280001_revised_vendor_activation_wallet_policy.sql`
19. `202607290001_rights_compliant_master_product_catalogue.sql`
20. `202607290002_brand_variant_vendor_listing_workflow.sql`
21. `202607290003_daily_product_availability_management.sql`
22. `202607300001_gemini_translation_cache_usage.sql`
23. `202607310001_bengaluru_languages_registration_delivery_pwa.sql`
24. `202607310002_razorpay_environment_safeguards.sql`
25. `202607310003_pwa_web_push_subscriptions.sql`
26. `202607310004_vendor_catalogue_setup_workflow.sql`
27. `202608050001_vendor_qr_settlement_storage_management.sql`
28. `202608050002_platform_webhook_events.sql`
29. `202608050003_master_product_catalogue_onboarding_expansion.sql`
30. `202608050004_mrp_pricing_policy_for_bulk_catalogue.sql`
31. `202608050005_vendor_delivery_policy_and_order_override.sql`
32. `202608050006_legacy_route_compatibility_tables.sql`
33. `202608050007_partner_program_applications.sql`
34. `202608060001_vendor_onboarding_fee_lifecycle.sql`
35. `202608060002_storage_purchase_idempotency.sql`
36. `202608060003_vendor_platform_billing_subscriptions.sql`
37. `202608060004_public_active_vendor_discovery.sql`

## Latest Feature Coverage Confirmed

- Vendor QR, direct vendor settlement, repayment requests, storage plans, customer notifications, device push tokens: `202608050001_vendor_qr_settlement_storage_management.sql`
- Platform webhook audit table: `202608050002_platform_webhook_events.sql`
- Master Product Catalogue expansion for onboarding: `202608050003_master_product_catalogue_onboarding_expansion.sql`
- MRP policy pricing/triggers: `202608050004_mrp_pricing_policy_for_bulk_catalogue.sql`
- Dynamic vendor delivery policy and per-order delivery charge override fields: `202608050005_vendor_delivery_policy_and_order_override.sql`
- Legacy mounted route compatibility tables and Gemini audit constraint repair: `202608050006_legacy_route_compatibility_tables.sql`
- Partner With Us applications, referred vendors and commission event records: `202608050007_partner_program_applications.sql`
- Vendor onboarding lifecycle, KYC, category fee rules, onboarding payments and completed-order platform charges: `202608060001_vendor_onboarding_fee_lifecycle.sql`
- Storage purchase payment-reference idempotency guard: `202608060002_storage_purchase_idempotency.sql`
- Vendor platform billing, Razorpay payment attempts, subscriptions, invoices, promotions, refunds, coupons and audit logs: `202608060003_vendor_platform_billing_subscriptions.sql`
- Public active vendor discovery grants and RLS policies: `202608060004_public_active_vendor_discovery.sql`

## Manual Pre-Run Backup

- In Supabase Dashboard, create a database backup/export before running the full sync on production.
- Do not run old `RUN_ALL_MIGRATIONS_FOR_SABSEWA_LOCAL.sql` after this generated script; use this sync script as the current source of truth.
