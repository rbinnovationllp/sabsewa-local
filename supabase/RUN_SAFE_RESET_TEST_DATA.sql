-- SabSewa Local - Controlled Test-Data Cleanup Framework
-- Date: 2026-08-23
--
-- IMPORTANT:
-- This script intentionally does NOT truncate tables, schemas or buckets.
-- It creates inventory, dry-run and scoped cleanup functions for approved test data only.
-- Run the dry-run function first, review the report, create/verify a backup, then run execute
-- only with explicit approved test user/vendor/partner IDs or test phone numbers.
--
-- Auth-user deletion is deliberately NOT performed here. Supabase Auth users must be
-- reviewed and deleted/revoked through protected backend/service-role admin tooling only.

begin;

create extension if not exists pgcrypto;

create table if not exists public.test_data_cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid,
  environment_label text not null default 'unknown',
  is_dry_run boolean not null default true,
  status text not null default 'created'
    check (status in ('created', 'dry_run_complete', 'blocked', 'executed', 'failed')),
  scope jsonb not null default '{}'::jsonb,
  environment_report jsonb not null default '{}'::jsonb,
  pre_counts jsonb not null default '{}'::jsonb,
  candidate_report jsonb not null default '{}'::jsonb,
  financial_conflict_report jsonb not null default '{}'::jsonb,
  deletion_plan jsonb not null default '{}'::jsonb,
  executed_report jsonb not null default '{}'::jsonb,
  backup_reference text,
  notes text,
  created_at timestamptz not null default now(),
  executed_at timestamptz
);

comment on table public.test_data_cleanup_runs is
  'Audited dry-run/execution reports for tightly scoped test-data cleanup. Does not store KYC documents or secrets.';

create or replace function public.ssl_table_exists(p_table text)
returns boolean
language sql
stable
as $$
  select to_regclass('public.' || p_table) is not null;
$$;

create or replace function public.ssl_count_table(p_table text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  result bigint := 0;
begin
  if not public.ssl_table_exists(p_table) then
    return 0;
  end if;
  execute format('select count(*) from public.%I', p_table) into result;
  return coalesce(result, 0);
end;
$$;

create or replace function public.ssl_column_exists(p_table text, p_column text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_column
  );
$$;

create or replace function public.ssl_count_by_uuid_column(p_table text, p_column text, p_ids uuid[])
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  result bigint := 0;
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;
  if not public.ssl_table_exists(p_table) or not public.ssl_column_exists(p_table, p_column) then
    return 0;
  end if;
  execute format('select count(*) from public.%I where %I = any($1)', p_table, p_column)
    using p_ids
    into result;
  return coalesce(result, 0);
end;
$$;

create or replace function public.ssl_delete_by_uuid_column(p_table text, p_column text, p_ids uuid[])
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  result bigint := 0;
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;
  if not public.ssl_table_exists(p_table) or not public.ssl_column_exists(p_table, p_column) then
    return 0;
  end if;
  execute format('delete from public.%I where %I = any($1)', p_table, p_column)
    using p_ids;
  get diagnostics result = row_count;
  return coalesce(result, 0);
end;
$$;

create or replace function public.ssl_normalize_phone_digits(p_value text)
returns text
language sql
immutable
as $$
  select right(regexp_replace(coalesce(p_value, ''), '\D', '', 'g'), 10);
$$;

create or replace function public.ssl_safe_test_reset_inventory()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  table_names text[] := array[
    'user_profiles',
    'customer_profiles',
    'customer_addresses',
    'vendors',
    'vendor_applications',
    'vendor_owner_accounts',
    'vendor_legal_entities',
    'vendor_branches',
    'vendor_terminals',
    'partner_applications',
    'partner_payment_details',
    'partner_kyc_documents',
    'partner_referred_vendors',
    'partner_commission_events',
    'partner_monthly_commission_statements',
    'vendor_kyc_documents',
    'vendor_kyc_review_assignments',
    'trusted_devices',
    'web_push_subscriptions',
    'carts',
    'cart_items',
    'orders',
    'order_items',
    'order_conversations',
    'order_conversation_messages',
    'order_alternative_proposals',
    'notifications',
    'vendor_items',
    'vendor_catalogue_items',
    'vendor_wallets',
    'vendor_wallet_ledger',
    'vendor_payment_attempts',
    'vendor_onboarding_payment_ledger',
    'razorpay_webhook_events',
    'refunds',
    'tax_invoices',
    'credit_ledgers',
    'customer_credit_accounts',
    'admin_profiles',
    'admin_role_assignments',
    'master_product_catalog',
    'master_product_images',
    'vendor_fee_rules',
    'vendor_onboarding_plans',
    'vendor_monthly_pricing_plans',
    'audit_logs',
    'admin_access_audit_logs'
  ];
  counts jsonb := '{}'::jsonb;
  next_table text;
begin
  foreach next_table in array table_names loop
    counts := counts || jsonb_build_object(next_table, public.ssl_count_table(next_table));
  end loop;

  return jsonb_build_object(
    'warning', 'Review this inventory before any cleanup. Production resets require backup and explicit test scope.',
    'database', current_database(),
    'current_user', current_user,
    'server_version', current_setting('server_version', true),
    'generated_at', now(),
    'table_counts', counts,
    'preserved_system_data', jsonb_build_array(
      'Master/Admin Auth users and roles',
      'admin_profiles',
      'admin_role_assignments',
      'Master Admin secret configuration',
      'pricing/GST/onboarding plan tables',
      'master_product_catalog',
      'approved master_product_images',
      'schema, migrations, RLS, functions, triggers and policies',
      'immutable audit/security/legal evidence'
    )
  );
end;
$$;

create or replace function public.ssl_safe_test_reset_dry_run(
  p_test_user_ids uuid[] default '{}'::uuid[],
  p_test_vendor_ids uuid[] default '{}'::uuid[],
  p_test_partner_ids uuid[] default '{}'::uuid[],
  p_test_phones text[] default '{}'::text[],
  p_environment_label text default 'production',
  p_backup_reference text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_phones text[];
  candidate_user_ids uuid[] := coalesce(p_test_user_ids, '{}'::uuid[]);
  candidate_vendor_ids uuid[] := coalesce(p_test_vendor_ids, '{}'::uuid[]);
  candidate_partner_ids uuid[] := coalesce(p_test_partner_ids, '{}'::uuid[]);
  candidate_customer_user_ids uuid[] := '{}'::uuid[];
  admin_user_ids uuid[] := '{}'::uuid[];
  financial_conflicts jsonb := '{}'::jsonb;
  deletion_plan jsonb := '{}'::jsonb;
  candidate_report jsonb := '{}'::jsonb;
  pre_counts jsonb;
  run_id uuid;
  next_phone text;
begin
  if coalesce(array_length(p_test_user_ids, 1), 0) = 0
     and coalesce(array_length(p_test_vendor_ids, 1), 0) = 0
     and coalesce(array_length(p_test_partner_ids, 1), 0) = 0
     and coalesce(array_length(p_test_phones, 1), 0) = 0 then
    raise exception 'Safe reset rejected: explicit test user IDs, vendor IDs, partner IDs or phone numbers are required.';
  end if;

  normalized_phones := '{}'::text[];
  foreach next_phone in array coalesce(p_test_phones, '{}'::text[]) loop
    if public.ssl_normalize_phone_digits(next_phone) <> '' then
      normalized_phones := array_append(normalized_phones, public.ssl_normalize_phone_digits(next_phone));
    end if;
  end loop;

  if coalesce(array_length(normalized_phones, 1), 0) > 0 then
    if to_regclass('auth.users') is not null then
      execute '
        select coalesce(array_agg(id), ''{}''::uuid[])
        from auth.users
        where right(regexp_replace(coalesce(phone, ''''), ''\D'', '''', ''g''), 10) = any($1)
           or right(regexp_replace(coalesce(raw_user_meta_data ->> ''phone'', ''''), ''\D'', '''', ''g''), 10) = any($1)
      ' using normalized_phones into candidate_user_ids;
    end if;

    if public.ssl_table_exists('vendors') then
      execute '
        select coalesce(array_agg(id), ''{}''::uuid[])
        from public.vendors
        where right(regexp_replace(coalesce(phone, ''''), ''\D'', '''', ''g''), 10) = any($1)
           or right(regexp_replace(coalesce(phone_number, ''''), ''\D'', '''', ''g''), 10) = any($1)
      ' using normalized_phones into candidate_vendor_ids;
    end if;

    if public.ssl_table_exists('partner_applications') then
      execute '
        select coalesce(array_agg(id), ''{}''::uuid[])
        from public.partner_applications
        where right(regexp_replace(coalesce(phone, ''''), ''\D'', '''', ''g''), 10) = any($1)
      ' using normalized_phones into candidate_partner_ids;
    end if;
  end if;

  candidate_user_ids := (
    select coalesce(array_agg(distinct value), '{}'::uuid[])
    from unnest(coalesce(candidate_user_ids, '{}'::uuid[])) as value
  );
  candidate_vendor_ids := (
    select coalesce(array_agg(distinct value), '{}'::uuid[])
    from unnest(coalesce(candidate_vendor_ids, '{}'::uuid[])) as value
  );
  candidate_partner_ids := (
    select coalesce(array_agg(distinct value), '{}'::uuid[])
    from unnest(coalesce(candidate_partner_ids, '{}'::uuid[])) as value
  );

  if public.ssl_table_exists('vendors') then
    execute '
      select coalesce(array_agg(distinct id), ''{}''::uuid[])
      from public.vendors
      where owner_user_id = any($1) or id = any($2)
    ' using candidate_user_ids, candidate_vendor_ids into candidate_vendor_ids;
  end if;

  if public.ssl_table_exists('customer_profiles') and public.ssl_column_exists('customer_profiles', 'user_id') then
    execute '
      select coalesce(array_agg(distinct user_id), ''{}''::uuid[])
      from public.customer_profiles
      where user_id = any($1)
    ' using candidate_user_ids into candidate_customer_user_ids;
  end if;

  if public.ssl_table_exists('admin_profiles') then
    execute '
      select coalesce(array_agg(distinct user_id), ''{}''::uuid[])
      from public.admin_profiles
      where user_id = any($1) and coalesce(account_status, ''active'') = ''active''
    ' using candidate_user_ids into admin_user_ids;
  end if;

  if public.ssl_table_exists('admin_role_assignments') then
    execute '
      select coalesce(array_agg(distinct user_id), ''{}''::uuid[])
      from public.admin_role_assignments
      where user_id = any($1) and coalesce(is_active, true) = true
    ' using candidate_user_ids into admin_user_ids;
  end if;

  financial_conflicts := jsonb_build_object(
    'vendor_payment_attempts', public.ssl_count_by_uuid_column('vendor_payment_attempts', 'vendor_id', candidate_vendor_ids),
    'vendor_onboarding_payment_ledger', public.ssl_count_by_uuid_column('vendor_onboarding_payment_ledger', 'vendor_id', candidate_vendor_ids),
    'vendor_wallets', public.ssl_count_by_uuid_column('vendor_wallets', 'vendor_id', candidate_vendor_ids),
    'vendor_wallet_ledger', public.ssl_count_by_uuid_column('vendor_wallet_ledger', 'vendor_id', candidate_vendor_ids),
    'partner_commission_events', public.ssl_count_by_uuid_column('partner_commission_events', 'partner_id', candidate_partner_ids),
    'partner_monthly_commission_statements', public.ssl_count_by_uuid_column('partner_monthly_commission_statements', 'partner_id', candidate_partner_ids)
  );

  deletion_plan := jsonb_build_object(
    'user_scoped_records', jsonb_build_object(
      'trusted_devices', public.ssl_count_by_uuid_column('trusted_devices', 'user_id', candidate_user_ids),
      'web_push_subscriptions', public.ssl_count_by_uuid_column('web_push_subscriptions', 'user_id', candidate_user_ids),
      'user_profiles_non_admin_only', public.ssl_count_by_uuid_column('user_profiles', 'user_id', candidate_user_ids)
    ),
    'vendor_scoped_records', jsonb_build_object(
      'vendor_kyc_documents', public.ssl_count_by_uuid_column('vendor_kyc_documents', 'vendor_id', candidate_vendor_ids),
      'vendor_kyc_review_assignments', public.ssl_count_by_uuid_column('vendor_kyc_review_assignments', 'vendor_id', candidate_vendor_ids),
      'vendor_items', public.ssl_count_by_uuid_column('vendor_items', 'vendor_id', candidate_vendor_ids),
      'vendor_catalogue_items', public.ssl_count_by_uuid_column('vendor_catalogue_items', 'vendor_id', candidate_vendor_ids),
      'vendor_terminals', public.ssl_count_by_uuid_column('vendor_terminals', 'vendor_id', candidate_vendor_ids),
      'vendor_branches', public.ssl_count_by_uuid_column('vendor_branches', 'vendor_id', candidate_vendor_ids),
      'vendor_legal_entities', public.ssl_count_by_uuid_column('vendor_legal_entities', 'vendor_id', candidate_vendor_ids),
      'vendor_applications', public.ssl_count_by_uuid_column('vendor_applications', 'vendor_id', candidate_vendor_ids),
      'vendors', coalesce(array_length(candidate_vendor_ids, 1), 0)
    ),
    'partner_scoped_records', jsonb_build_object(
      'partner_kyc_documents', public.ssl_count_by_uuid_column('partner_kyc_documents', 'partner_application_id', candidate_partner_ids),
      'partner_payment_details', public.ssl_count_by_uuid_column('partner_payment_details', 'partner_application_id', candidate_partner_ids),
      'partner_referred_vendors', public.ssl_count_by_uuid_column('partner_referred_vendors', 'partner_id', candidate_partner_ids),
      'partner_applications', coalesce(array_length(candidate_partner_ids, 1), 0)
    ),
    'auth_cleanup_required_manual_review', jsonb_build_object(
      'candidate_auth_user_ids', coalesce(to_jsonb(candidate_user_ids), '[]'::jsonb),
      'protected_admin_user_ids', coalesce(to_jsonb(admin_user_ids), '[]'::jsonb),
      'note', 'Auth users and sessions are not deleted by SQL. Revoke/delete only through protected backend service-role admin tooling after review.'
    )
  );

  candidate_report := jsonb_build_object(
    'test_user_ids', coalesce(to_jsonb(candidate_user_ids), '[]'::jsonb),
    'test_vendor_ids', coalesce(to_jsonb(candidate_vendor_ids), '[]'::jsonb),
    'test_partner_application_ids', coalesce(to_jsonb(candidate_partner_ids), '[]'::jsonb),
    'test_customer_user_ids', coalesce(to_jsonb(candidate_customer_user_ids), '[]'::jsonb),
    'normalized_test_phones_last4', (
      select coalesce(jsonb_agg(right(value, 4)), '[]'::jsonb)
      from unnest(coalesce(normalized_phones, '{}'::text[])) as value
    )
  );

  pre_counts := public.ssl_safe_test_reset_inventory();

  insert into public.test_data_cleanup_runs (
    environment_label,
    is_dry_run,
    status,
    scope,
    environment_report,
    pre_counts,
    candidate_report,
    financial_conflict_report,
    deletion_plan,
    backup_reference,
    notes
  )
  values (
    coalesce(p_environment_label, 'production'),
    true,
    case
      when exists (select 1 from jsonb_each_text(financial_conflicts) where value::bigint > 0)
      then 'blocked'
      else 'dry_run_complete'
    end,
    jsonb_build_object(
      'input_test_user_ids', coalesce(to_jsonb(p_test_user_ids), '[]'::jsonb),
      'input_test_vendor_ids', coalesce(to_jsonb(p_test_vendor_ids), '[]'::jsonb),
      'input_test_partner_ids', coalesce(to_jsonb(p_test_partner_ids), '[]'::jsonb),
      'input_test_phones_count', coalesce(array_length(p_test_phones, 1), 0)
    ),
    pre_counts - 'table_counts',
    pre_counts -> 'table_counts',
    candidate_report,
    financial_conflicts,
    deletion_plan,
    p_backup_reference,
    p_notes
  )
  returning id into run_id;

  return jsonb_build_object(
    'cleanup_run_id', run_id,
    'dry_run_only', true,
    'environment_label', coalesce(p_environment_label, 'production'),
    'warning', 'No records were deleted. Review backup, candidates, financial conflicts and deletion plan before execution.',
    'candidate_report', candidate_report,
    'financial_conflict_report', financial_conflicts,
    'deletion_plan', deletion_plan,
    'backup_required_before_execute', true
  );
end;
$$;

create or replace function public.ssl_safe_test_reset_execute(
  p_cleanup_run_id uuid,
  p_confirm_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  run_row public.test_data_cleanup_runs%rowtype;
  candidate_user_ids uuid[] := '{}'::uuid[];
  candidate_vendor_ids uuid[] := '{}'::uuid[];
  candidate_partner_ids uuid[] := '{}'::uuid[];
  admin_user_ids uuid[] := '{}'::uuid[];
  report jsonb := '{}'::jsonb;
  conflict_count bigint := 0;
  deleted_count bigint;
begin
  if p_confirm_text <> 'DELETE APPROVED TEST DATA ONLY' then
    raise exception 'Safe reset rejected: exact confirmation text is required.';
  end if;

  select * into run_row
  from public.test_data_cleanup_runs
  where id = p_cleanup_run_id
  for update;

  if not found then
    raise exception 'Safe reset rejected: cleanup run was not found.';
  end if;

  if run_row.status not in ('dry_run_complete') then
    raise exception 'Safe reset rejected: dry-run status is %, not executable.', run_row.status;
  end if;

  if nullif(run_row.backup_reference, '') is null then
    raise exception 'Safe reset rejected: backup_reference is required before execution.';
  end if;

  select count(*) into conflict_count
  from jsonb_each_text(run_row.financial_conflict_report)
  where value::bigint > 0;

  if conflict_count > 0 then
    update public.test_data_cleanup_runs set status = 'blocked'
    where id = p_cleanup_run_id;
    raise exception 'Safe reset rejected: financial/payment/wallet/commission conflicts were detected. Review financial_conflict_report.';
  end if;

  select coalesce(array_agg(value::uuid), '{}'::uuid[])
  into candidate_user_ids
  from jsonb_array_elements_text(run_row.candidate_report -> 'test_user_ids') as value;

  select coalesce(array_agg(value::uuid), '{}'::uuid[])
  into candidate_vendor_ids
  from jsonb_array_elements_text(run_row.candidate_report -> 'test_vendor_ids') as value;

  select coalesce(array_agg(value::uuid), '{}'::uuid[])
  into candidate_partner_ids
  from jsonb_array_elements_text(run_row.candidate_report -> 'test_partner_application_ids') as value;

  select coalesce(array_agg(value::uuid), '{}'::uuid[])
  into admin_user_ids
  from jsonb_array_elements_text(coalesce(run_row.deletion_plan #> '{auth_cleanup_required_manual_review,protected_admin_user_ids}', '[]'::jsonb)) as value;

  if coalesce(array_length(admin_user_ids, 1), 0) > 0 then
    candidate_user_ids := array(select value from unnest(candidate_user_ids) as value where not value = any(admin_user_ids));
  end if;

  -- Child/dependency records first. Missing tables/columns are skipped safely.
  deleted_count := public.ssl_delete_by_uuid_column('order_conversation_messages', 'vendor_id', candidate_vendor_ids);
  report := report || jsonb_build_object('order_conversation_messages_by_vendor_id', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('order_alternative_proposals', 'vendor_id', candidate_vendor_ids);
  report := report || jsonb_build_object('order_alternative_proposals_by_vendor_id', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('notifications', 'vendor_id', candidate_vendor_ids);
  report := report || jsonb_build_object('notifications_by_vendor_id', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('cart_items', 'vendor_id', candidate_vendor_ids);
  report := report || jsonb_build_object('cart_items_by_vendor_id', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('carts', 'vendor_id', candidate_vendor_ids);
  report := report || jsonb_build_object('carts_by_vendor_id', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('order_items', 'vendor_id', candidate_vendor_ids);
  report := report || jsonb_build_object('order_items_by_vendor_id', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('orders', 'vendor_id', candidate_vendor_ids);
  report := report || jsonb_build_object('orders_by_vendor_id', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('credit_ledgers', 'vendor_id', candidate_vendor_ids);
  report := report || jsonb_build_object('credit_ledgers_by_vendor_id', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('customer_credit_accounts', 'vendor_id', candidate_vendor_ids);
  report := report || jsonb_build_object('customer_credit_accounts_by_vendor_id', deleted_count);

  deleted_count := public.ssl_delete_by_uuid_column('vendor_kyc_review_assignments', 'vendor_id', candidate_vendor_ids);
  report := report || jsonb_build_object('vendor_kyc_review_assignments', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('vendor_kyc_documents', 'vendor_id', candidate_vendor_ids);
  report := report || jsonb_build_object('vendor_kyc_documents_metadata_only', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('vendor_items', 'vendor_id', candidate_vendor_ids);
  report := report || jsonb_build_object('vendor_items', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('vendor_catalogue_items', 'vendor_id', candidate_vendor_ids);
  report := report || jsonb_build_object('vendor_catalogue_items', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('vendor_terminals', 'vendor_id', candidate_vendor_ids);
  report := report || jsonb_build_object('vendor_terminals', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('vendor_branches', 'vendor_id', candidate_vendor_ids);
  report := report || jsonb_build_object('vendor_branches', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('vendor_legal_entities', 'vendor_id', candidate_vendor_ids);
  report := report || jsonb_build_object('vendor_legal_entities', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('vendor_applications', 'vendor_id', candidate_vendor_ids);
  report := report || jsonb_build_object('vendor_applications', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('vendors', 'id', candidate_vendor_ids);
  report := report || jsonb_build_object('vendors', deleted_count);

  deleted_count := public.ssl_delete_by_uuid_column('partner_kyc_documents', 'partner_application_id', candidate_partner_ids);
  report := report || jsonb_build_object('partner_kyc_documents_metadata_only', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('partner_payment_details', 'partner_application_id', candidate_partner_ids);
  report := report || jsonb_build_object('partner_payment_details', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('partner_referred_vendors', 'partner_id', candidate_partner_ids);
  report := report || jsonb_build_object('partner_referred_vendors', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('partner_applications', 'id', candidate_partner_ids);
  report := report || jsonb_build_object('partner_applications', deleted_count);

  deleted_count := public.ssl_delete_by_uuid_column('customer_addresses', 'user_id', candidate_user_ids);
  report := report || jsonb_build_object('customer_addresses', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('customer_profiles', 'user_id', candidate_user_ids);
  report := report || jsonb_build_object('customer_profiles', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('trusted_devices', 'user_id', candidate_user_ids);
  report := report || jsonb_build_object('trusted_devices', deleted_count);
  deleted_count := public.ssl_delete_by_uuid_column('web_push_subscriptions', 'user_id', candidate_user_ids);
  report := report || jsonb_build_object('web_push_subscriptions', deleted_count);

  if public.ssl_table_exists('user_profiles') and public.ssl_column_exists('user_profiles', 'user_id') then
    delete from public.user_profiles
    where user_id = any(candidate_user_ids)
      and coalesce(role, '') not in ('master_admin', 'super_admin', 'company_admin', 'admin', 'national_admin', 'state_admin', 'district_admin', 'city_admin', 'kyc_reviewer', 'finance_admin', 'support_admin');
    get diagnostics deleted_count = row_count;
    report := report || jsonb_build_object('user_profiles_non_admin_only', deleted_count);
  end if;

  update public.test_data_cleanup_runs
  set status = 'executed',
      is_dry_run = false,
      executed_report = jsonb_build_object(
        'deleted_public_records', report,
        'auth_users_not_deleted', coalesce(to_jsonb(candidate_user_ids), '[]'::jsonb),
        'storage_objects_not_deleted_by_sql', true,
        'post_counts', public.ssl_safe_test_reset_inventory() -> 'table_counts'
      ),
      executed_at = now()
  where id = p_cleanup_run_id;

  return jsonb_build_object(
    'cleanup_run_id', p_cleanup_run_id,
    'executed', true,
    'deleted_public_records', report,
    'auth_cleanup_remaining_manual_service_role_step', coalesce(to_jsonb(candidate_user_ids), '[]'::jsonb),
    'storage_cleanup_remaining_manual_review_step', true
  );
exception
  when others then
    update public.test_data_cleanup_runs
    set status = 'failed',
        notes = coalesce(notes, '') || E'\nExecution failed: ' || sqlerrm
    where id = p_cleanup_run_id;
    raise;
end;
$$;

revoke all on function public.ssl_safe_test_reset_inventory() from public, anon, authenticated;
revoke all on function public.ssl_safe_test_reset_dry_run(uuid[], uuid[], uuid[], text[], text, text, text) from public, anon, authenticated;
revoke all on function public.ssl_safe_test_reset_execute(uuid, text) from public, anon, authenticated;
revoke all on function public.ssl_table_exists(text) from public, anon, authenticated;
revoke all on function public.ssl_count_table(text) from public, anon, authenticated;
revoke all on function public.ssl_column_exists(text, text) from public, anon, authenticated;
revoke all on function public.ssl_count_by_uuid_column(text, text, uuid[]) from public, anon, authenticated;
revoke all on function public.ssl_delete_by_uuid_column(text, text, uuid[]) from public, anon, authenticated;
revoke all on function public.ssl_normalize_phone_digits(text) from public, anon, authenticated;

grant execute on function public.ssl_safe_test_reset_inventory() to service_role;
grant execute on function public.ssl_safe_test_reset_dry_run(uuid[], uuid[], uuid[], text[], text, text, text) to service_role;
grant execute on function public.ssl_safe_test_reset_execute(uuid, text) to service_role;
grant execute on function public.ssl_table_exists(text) to service_role;
grant execute on function public.ssl_count_table(text) to service_role;
grant execute on function public.ssl_column_exists(text, text) to service_role;
grant execute on function public.ssl_count_by_uuid_column(text, text, uuid[]) to service_role;
grant execute on function public.ssl_delete_by_uuid_column(text, text, uuid[]) to service_role;
grant execute on function public.ssl_normalize_phone_digits(text) to service_role;
grant all on public.test_data_cleanup_runs to service_role;

commit;

-- DRY-RUN EXAMPLE ONLY:
-- select public.ssl_safe_test_reset_inventory();
-- select public.ssl_safe_test_reset_dry_run(
--   p_test_user_ids := array[]::uuid[],
--   p_test_vendor_ids := array[]::uuid[],
--   p_test_partner_ids := array[]::uuid[],
--   p_test_phones := array['+91XXXXXXXXXX'],
--   p_environment_label := 'production',
--   p_backup_reference := 'MANUAL_BACKUP_REQUIRED_BEFORE_EXECUTE',
--   p_notes := 'Dry run only. No deletion.'
-- );
--
-- EXECUTION EXAMPLE ONLY AFTER BACKUP + EXPLICIT APPROVAL:
-- select public.ssl_safe_test_reset_execute(
--   p_cleanup_run_id := 'PUT-DRY-RUN-ID-HERE',
--   p_confirm_text := 'DELETE APPROVED TEST DATA ONLY'
-- );
