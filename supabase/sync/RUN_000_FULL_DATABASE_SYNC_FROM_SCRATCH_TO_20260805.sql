-- SabSewa Local full Supabase database synchronization script
-- Generated from supabase/migrations in chronological filename order.
-- Current coverage: project start through 2026-08-05 delivery policy / platform webhooks / catalogue / MRP / QR settlement / legacy route compatibility.
-- Safe rerun intent: tables, columns, indexes, functions use IF EXISTS/IF NOT EXISTS where migrations provide it.
-- This generated wrapper also drops existing policies/triggers before recreating them to support partially migrated databases.
-- IMPORTANT: Back up production before running.

set check_function_bodies = off;

-- ============================================================================
-- 001_hlm_core_schema.sql
-- ============================================================================
-- SabSewa Local HLM core schema
-- Apply in Supabase SQL editor or through Supabase CLI.

create extension if not exists "pgcrypto";

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null,
  role text not null check (role in ('customer', 'vendor', 'rider', 'terminal_admin', 'admin')),
  full_name text,
  phone text,
  city text,
  created_at timestamptz not null default now()
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  shop_name text not null,
  owner_name text,
  phone text,
  category text not null default 'kirana',
  address text,
  lat double precision,
  lng double precision,
  status text not null default 'pending' check (status in ('pending', 'approved', 'suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_terminals (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  terminal_name text not null,
  city text,
  phone text,
  lat double precision,
  lng double precision,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  image_url text,
  default_unit text,
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  terminal_id uuid references public.vendor_terminals(id) on delete set null,
  catalog_item_id uuid references public.catalog_items(id) on delete set null,
  item_name text not null,
  item_pic text,
  price numeric(10,2) not null check (price >= 0),
  stock_quantity numeric(10,2),
  unit text,
  is_available boolean not null default true,
  gemini_source_log_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.hyperlocal_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  terminal_id uuid references public.vendor_terminals(id) on delete set null,
  items jsonb not null default '[]'::jsonb,
  total_amount numeric(10,2) not null default 0,
  customer_address text not null,
  customer_phone text not null,
  customer_lat double precision,
  customer_lng double precision,
  status text not null default 'pending' check (
    status in ('pending', 'accepted', 'packed', 'out_for_delivery', 'completed', 'rejected')
  ),
  rejection_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.riders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null,
  full_name text,
  phone text,
  current_lat double precision,
  current_lng double precision,
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.rider_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.hyperlocal_orders(id) on delete cascade,
  rider_id uuid not null references public.riders(id) on delete restrict,
  status text not null default 'assigned' check (status in ('assigned', 'picked_up', 'delivered', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  customer_id uuid not null,
  order_id uuid references public.hyperlocal_orders(id) on delete set null,
  transaction_type text not null check (transaction_type in ('credit_order', 'payment_received', 'adjustment')),
  amount numeric(10,2) not null,
  balance_after numeric(10,2) not null,
  item_breakdown jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.gemini_agent_logs (
  id uuid primary key default gen_random_uuid(),
  agent_type text not null check (agent_type in ('inventory_capture', 'conversational_order', 'smart_rejection')),
  input_type text not null check (input_type in ('image', 'text', 'voice')),
  input_summary text,
  model text not null,
  response_json jsonb not null,
  confidence numeric(4,3),
  user_id uuid,
  vendor_id uuid references public.vendors(id) on delete set null,
  order_id uuid references public.hyperlocal_orders(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_vendors_owner_user_id on public.vendors(owner_user_id);
create index if not exists idx_vendor_items_vendor_terminal on public.vendor_items(vendor_id, terminal_id);
create index if not exists idx_orders_vendor_status on public.hyperlocal_orders(vendor_id, status);
create index if not exists idx_orders_customer on public.hyperlocal_orders(customer_id);
create index if not exists idx_credit_vendor_customer on public.vendor_credit_ledger(vendor_id, customer_id);
create index if not exists idx_gemini_logs_agent_created on public.gemini_agent_logs(agent_type, created_at desc);

alter table public.user_profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.vendor_terminals enable row level security;
alter table public.catalog_items enable row level security;
alter table public.vendor_items enable row level security;
alter table public.hyperlocal_orders enable row level security;
alter table public.riders enable row level security;
alter table public.rider_assignments enable row level security;
alter table public.vendor_credit_ledger enable row level security;
alter table public.gemini_agent_logs enable row level security;

-- Starter RLS policies. Tighten further after auth role mapping is finalized.
drop policy if exists "Approved vendors are public readable" on public.vendors;
create policy "Approved vendors are public readable"
  on public.vendors for select
  using (status = 'approved' or owner_user_id = auth.uid());

drop policy if exists "Vendor owners manage own vendor rows" on public.vendors;
create policy "Vendor owners manage own vendor rows"
  on public.vendors for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Catalog is readable" on public.catalog_items;
create policy "Catalog is readable"
  on public.catalog_items for select
  using (true);

drop policy if exists "Vendor items readable when available" on public.vendor_items;
create policy "Vendor items readable when available"
  on public.vendor_items for select
  using (is_available = true);

drop policy if exists "Vendor owners manage own items" on public.vendor_items;
create policy "Vendor owners manage own items"
  on public.vendor_items for all
  using (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_items.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_items.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );



-- ============================================================================
-- 202607240001_create_sabsewa_local_security_wallet.sql
-- ============================================================================
-- SabSewa Local Security Wallet
-- Backend-enforced vendor eligibility and Rs 15 completed-order deductions.

create extension if not exists "pgcrypto";

create table if not exists public.vendor_security_wallets (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null unique references public.vendors(id) on delete cascade,
  opening_balance numeric(12,2) not null default 0,
  current_balance numeric(12,2) not null default 0,
  minimum_security_deposit numeric(12,2) not null default 5000,
  reminder_threshold numeric(12,2) not null default 1000,
  final_warning_threshold numeric(12,2) not null default 500,
  stop_orders_threshold numeric(12,2) not null default 515,
  operational_minimum_balance numeric(12,2) not null default 515,
  eligibility_status text not null default 'security_deposit_required'
    check (eligibility_status in (
      'eligible',
      'low_balance',
      'final_warning',
      'orders_stopped',
      'security_deposit_required',
      'suspended'
    )),
  last_warning_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_security_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.vendor_security_wallets(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  order_id uuid references public.hyperlocal_orders(id) on delete set null,
  transaction_type text not null check (transaction_type in (
    'security_deposit',
    'top_up',
    'order_fee',
    'refund',
    'manual_adjustment'
  )),
  amount numeric(12,2) not null,
  balance_before numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  payment_reference text,
  admin_user_id uuid,
  admin_reason text,
  warning_level text check (warning_level in ('none', 'top_up_reminder', 'final_warning', 'orders_stopped')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_security_wallet_warnings (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  wallet_id uuid not null references public.vendor_security_wallets(id) on delete cascade,
  warning_level text not null check (warning_level in ('top_up_reminder', 'final_warning', 'orders_stopped', 'restored')),
  balance numeric(12,2) not null,
  message text not null,
  channel text not null default 'in_app' check (channel in ('in_app', 'push', 'sms', 'whatsapp')),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_security_wallet_vendor on public.vendor_security_wallets(vendor_id);
create index if not exists idx_security_wallet_tx_vendor_created
  on public.vendor_security_wallet_transactions(vendor_id, created_at desc);
create index if not exists idx_security_wallet_tx_order
  on public.vendor_security_wallet_transactions(order_id);
create index if not exists idx_security_wallet_warnings_vendor_created
  on public.vendor_security_wallet_warnings(vendor_id, created_at desc);

alter table public.vendor_security_wallets enable row level security;
alter table public.vendor_security_wallet_transactions enable row level security;
alter table public.vendor_security_wallet_warnings enable row level security;

drop policy if exists "Vendor owners can read own security wallet" on public.vendor_security_wallets;
create policy "Vendor owners can read own security wallet"
  on public.vendor_security_wallets for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_security_wallets.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Vendor owners can read own security wallet transactions" on public.vendor_security_wallet_transactions;
create policy "Vendor owners can read own security wallet transactions"
  on public.vendor_security_wallet_transactions for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_security_wallet_transactions.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Vendor owners can read own security wallet warnings" on public.vendor_security_wallet_warnings;
create policy "Vendor owners can read own security wallet warnings"
  on public.vendor_security_wallet_warnings for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_security_wallet_warnings.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

-- Writes must go through backend service role or secured RPC/admin routes.


-- ============================================================================
-- 202607240002_create_gemini_agent_logs.sql
-- ============================================================================
create table if not exists public.gemini_agent_logs (
  id uuid primary key default gen_random_uuid(),
  agent_type text not null check (agent_type in (
    'inventory_capture',
    'conversational_order',
    'smart_rejection'
  )),
  input_type text not null check (input_type in ('image', 'text', 'voice')),
  input_summary text not null,
  model text not null,
  response_json jsonb not null,
  confidence numeric,
  user_id uuid,
  vendor_id uuid references public.vendors(id) on delete set null,
  order_id uuid references public.hyperlocal_orders(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_gemini_agent_logs_type_created
  on public.gemini_agent_logs(agent_type, created_at desc);

create index if not exists idx_gemini_agent_logs_vendor_created
  on public.gemini_agent_logs(vendor_id, created_at desc);

create index if not exists idx_gemini_agent_logs_order_created
  on public.gemini_agent_logs(order_id, created_at desc);

alter table public.gemini_agent_logs enable row level security;

drop policy if exists "Vendor owners can read own Gemini logs" on public.gemini_agent_logs;
create policy "Vendor owners can read own Gemini logs"
  on public.gemini_agent_logs for select
  to authenticated
  using (
    vendor_id is not null
    and exists (
      select 1 from public.vendors
      where vendors.id = gemini_agent_logs.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

-- Writes must go through the backend service role so Gemini keys and audit integrity stay server-side.


-- ============================================================================
-- 202607250001_create_order_audit_and_acceptance_privacy.sql
-- ============================================================================
-- SabSewa Local order privacy and audit log.
-- Vendors see limited summaries until formal acceptance unlocks full customer/order details.

alter table public.hyperlocal_orders
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by_vendor_id uuid,
  add column if not exists vendor_detail_unlocked_at timestamptz;

create table if not exists public.order_audit_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.hyperlocal_orders(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  actor_user_id uuid,
  actor_role text not null default 'vendor',
  action text not null,
  from_status text,
  to_status text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_audit_order_created
  on public.order_audit_logs(order_id, created_at desc);

create index if not exists idx_order_audit_vendor_created
  on public.order_audit_logs(vendor_id, created_at desc);

alter table public.order_audit_logs enable row level security;

-- Writes must go through the backend service role. Admin read policies should be added
-- when the production admin role model is finalized.


-- ============================================================================
-- 202607250002_create_vendor_owned_credit_controls.sql
-- ============================================================================
-- SabSewa Local vendor-owned credit controls.
-- SabSewa Local and Rashi Bhartiya Innovation LLP only maintain records and do not
-- finance, guarantee, collect, or recover vendor-issued customer credit.

alter table public.hyperlocal_orders
  add column if not exists payment_method text not null default 'prepaid'
    check (payment_method in ('prepaid', 'credit')),
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'credit_due', 'refunded', 'failed'));

create table if not exists public.vendor_credit_accounts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  customer_id uuid not null,
  credit_limit numeric(12,2) not null default 0 check (credit_limit >= 0),
  outstanding_balance numeric(12,2) not null default 0,
  available_credit numeric(12,2) generated always as (greatest(credit_limit - outstanding_balance, 0)) stored,
  payment_due_days integer not null default 7 check (payment_due_days between 0 and 365),
  due_date date,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'exhausted', 'overdue', 'closed')),
  vendor_notes text,
  approved_by_vendor_user_id uuid,
  approved_at timestamptz not null default now(),
  suspended_at timestamptz,
  suspension_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, customer_id)
);

create table if not exists public.vendor_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  customer_id uuid not null,
  account_id uuid references public.vendor_credit_accounts(id) on delete set null,
  order_id uuid references public.hyperlocal_orders(id) on delete set null,
  transaction_type text not null check (transaction_type in (
    'limit_approved',
    'limit_changed',
    'credit_purchase',
    'payment_recorded',
    'manual_adjustment',
    'credit_suspended',
    'credit_reactivated'
  )),
  amount numeric(12,2) not null default 0,
  balance_before numeric(12,2) not null default 0,
  balance_after numeric(12,2) not null default 0,
  due_date date,
  notes text,
  vendor_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_credit_reminders (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  customer_id uuid not null,
  account_id uuid references public.vendor_credit_accounts(id) on delete set null,
  reminder_type text not null check (reminder_type in ('near_limit', 'due_soon', 'overdue', 'exhausted', 'suspended')),
  outstanding_balance numeric(12,2) not null default 0,
  credit_limit numeric(12,2) not null default 0,
  due_date date,
  channel text not null default 'in_app' check (channel in ('in_app', 'push', 'sms', 'whatsapp')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  message text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_vendor_credit_accounts_vendor_customer
  on public.vendor_credit_accounts(vendor_id, customer_id);

create index if not exists idx_vendor_credit_accounts_due_status
  on public.vendor_credit_accounts(vendor_id, status, due_date);

create index if not exists idx_vendor_credit_tx_vendor_customer_created
  on public.vendor_credit_transactions(vendor_id, customer_id, created_at desc);

create index if not exists idx_vendor_credit_reminders_vendor_created
  on public.vendor_credit_reminders(vendor_id, created_at desc);

alter table public.vendor_credit_accounts enable row level security;
alter table public.vendor_credit_transactions enable row level security;
alter table public.vendor_credit_reminders enable row level security;

drop policy if exists "Vendor owners can read own credit accounts" on public.vendor_credit_accounts;
create policy "Vendor owners can read own credit accounts"
  on public.vendor_credit_accounts for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_credit_accounts.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Vendor owners can read own credit transactions" on public.vendor_credit_transactions;
create policy "Vendor owners can read own credit transactions"
  on public.vendor_credit_transactions for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_credit_transactions.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

-- All writes should go through the backend service role so vendor decisions,
-- limits, purchases, payments, reminders, and status changes remain auditable.


-- ============================================================================
-- 202607260001_update_vendor_advance_balance_rules.sql
-- ============================================================================
-- SabSewa Local vendor advance balance update.
-- Business rule: vendors deposit a minimum Rs 5,000 advance balance, and
-- SabSewa Local deducts Rs 15 only for successfully completed orders.

alter table if exists public.vendor_security_wallets
  alter column minimum_security_deposit set default 5000;

alter table if exists public.vendor_security_wallets
  alter column stop_orders_threshold set default 515;

alter table if exists public.vendor_security_wallets
  alter column operational_minimum_balance set default 515;

update public.vendor_security_wallets
set
  minimum_security_deposit = 5000,
  stop_orders_threshold = 515,
  operational_minimum_balance = 515,
  updated_at = now()
where minimum_security_deposit <> 5000
   or stop_orders_threshold <> 515
   or operational_minimum_balance <> 515;

update public.vendor_security_wallets
set eligibility_status =
  case
    when coalesce(opening_balance, 0) < 5000 then 'security_deposit_required'
    when coalesce(current_balance, 0) < coalesce(stop_orders_threshold, 515) then 'orders_stopped'
    when coalesce(current_balance, 0) < coalesce(final_warning_threshold, 500) then 'final_warning'
    when coalesce(current_balance, 0) <= coalesce(reminder_threshold, 1000) then 'low_balance'
    else 'eligible'
  end,
  updated_at = now();


-- ============================================================================
-- 202607260002_create_vendor_exit_requests.sql
-- ============================================================================
-- Vendor voluntary exit and advance balance refund workflow.

alter table if exists public.vendor_security_wallets
  drop constraint if exists vendor_security_wallets_eligibility_status_check;

alter table if exists public.vendor_security_wallets
  add constraint vendor_security_wallets_eligibility_status_check
  check (eligibility_status in (
    'eligible',
    'low_balance',
    'final_warning',
    'orders_stopped',
    'security_deposit_required',
    'closure_requested',
    'refund_processing',
    'closed',
    'suspended'
  ));

alter table if exists public.vendor_security_wallet_transactions
  drop constraint if exists vendor_security_wallet_transactions_transaction_type_check;

alter table if exists public.vendor_security_wallet_transactions
  add constraint vendor_security_wallet_transactions_transaction_type_check
  check (transaction_type in (
    'security_deposit',
    'top_up',
    'order_fee',
    'activation_usage_charge',
    'refund',
    'refund_adjustment',
    'manual_adjustment'
  ));

create table if not exists public.vendor_exit_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  wallet_id uuid not null references public.vendor_security_wallets(id) on delete cascade,
  requested_by uuid,
  request_reason text,
  status text not null default 'closure_requested'
    check (status in ('closure_requested', 'under_review', 'approved', 'rejected', 'refund_processing', 'refunded', 'closed')),
  balance_at_request numeric(12,2) not null default 0,
  activation_usage_charge numeric(12,2) not null default 500,
  unpaid_order_fees numeric(12,2) not null default 0,
  legal_adjustments numeric(12,2) not null default 0,
  estimated_refund numeric(12,2) not null default 0,
  final_refund numeric(12,2),
  calculation jsonb not null default '{}'::jsonb,
  vendor_acknowledged boolean not null default false,
  vendor_acknowledged_at timestamptz,
  notice_sent_at timestamptz,
  response_deadline_at timestamptz,
  admin_user_id uuid,
  admin_reason text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendor_exit_requests_vendor_created
  on public.vendor_exit_requests(vendor_id, created_at desc);

alter table public.vendor_exit_requests enable row level security;

drop policy if exists "Vendor owners can read own exit requests" on public.vendor_exit_requests;
create policy "Vendor owners can read own exit requests"
  on public.vendor_exit_requests for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_exit_requests.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

-- Writes must go through backend service role or secured admin/vendor routes.


-- ============================================================================
-- 202607260003_create_vendor_storage_quota.sql
-- ============================================================================
-- Vendor storage quota and upload-cost controls.
-- Store media metadata only. Orders, invoices, credit records and wallet entries remain database records.

create table if not exists public.vendor_storage_usage (
  vendor_id uuid primary key references public.vendors(id) on delete cascade,
  quota_bytes bigint not null default 104857600,
  used_bytes bigint not null default 0,
  successful_order_count integer not null default 0,
  warning_level text not null default 'none'
    check (warning_level in ('none', '80_percent', '90_percent', '100_percent')),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_storage_files (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  object_key text not null unique,
  public_url text,
  original_file_name text,
  content_type text not null,
  byte_size bigint not null,
  purpose text not null default 'product_image'
    check (purpose in ('product_image', 'product_thumbnail', 'kyc_document', 'business_document')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'archived', 'abandoned', 'deleted')),
  duplicate_key text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_vendor_storage_files_vendor_status
  on public.vendor_storage_files(vendor_id, status, created_at desc);

create index if not exists idx_vendor_storage_files_duplicate
  on public.vendor_storage_files(vendor_id, duplicate_key)
  where duplicate_key is not null and status in ('pending', 'active');

alter table public.vendor_storage_usage enable row level security;
alter table public.vendor_storage_files enable row level security;

drop policy if exists "Vendor owners can read own storage usage" on public.vendor_storage_usage;
create policy "Vendor owners can read own storage usage"
  on public.vendor_storage_usage for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_storage_usage.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Vendor owners can read own storage files" on public.vendor_storage_files;
create policy "Vendor owners can read own storage files"
  on public.vendor_storage_files for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_storage_files.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

-- Writes must go through backend service role routes.


-- ============================================================================
-- 202607260004_harden_production_rls_policies.sql
-- ============================================================================
-- SabSewa Local production RLS hardening.
-- Apply after all earlier SabSewa Local migrations.
-- Sensitive writes remain backend-service-role only unless explicitly allowed here.

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_profiles where user_id = auth.uid() limit 1
$$;

create or replace function public.is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('admin'), false)
$$;

create or replace function public.owns_vendor(target_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.vendors
    where id = target_vendor_id
    and owner_user_id = auth.uid()
  )
$$;

create or replace function public.is_rider_for_assignment(target_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rider_assignments ra
    join public.riders r on r.id = ra.rider_id
    where ra.id = target_assignment_id
    and r.user_id = auth.uid()
  )
$$;

create or replace function public.is_rider_for_order(target_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rider_assignments ra
    join public.riders r on r.id = ra.rider_id
    where ra.order_id = target_order_id
    and r.user_id = auth.uid()
  )
$$;

drop policy if exists "Users can read own profile" on public.user_profiles;
drop policy if exists "Users can insert own profile" on public.user_profiles;
drop policy if exists "Users can update own non-admin profile" on public.user_profiles;
drop policy if exists "Admins can read all vendors" on public.vendors;
drop policy if exists "Vendor owners can read own terminals" on public.vendor_terminals;
drop policy if exists "Vendor owners manage own terminals" on public.vendor_terminals;
drop policy if exists "Admins manage catalog" on public.catalog_items;
drop policy if exists "Admins read all vendor items" on public.vendor_items;
drop policy if exists "Customers read own orders" on public.hyperlocal_orders;
drop policy if exists "Vendors read own order rows" on public.hyperlocal_orders;
drop policy if exists "Riders read assigned order rows" on public.hyperlocal_orders;
drop policy if exists "Customers can create own orders" on public.hyperlocal_orders;
drop policy if exists "Riders can read own rider profile" on public.riders;
drop policy if exists "Riders can update own location availability" on public.riders;
drop policy if exists "Riders read own assignments" on public.rider_assignments;
drop policy if exists "Vendors read assignments for own orders" on public.rider_assignments;
drop policy if exists "Vendors read own legacy credit ledger" on public.vendor_credit_ledger;
drop policy if exists "Customers read own legacy credit ledger" on public.vendor_credit_ledger;
drop policy if exists "Customers read own vendor credit accounts" on public.vendor_credit_accounts;
drop policy if exists "Customers read own vendor credit transactions" on public.vendor_credit_transactions;
drop policy if exists "Vendors read own credit reminders" on public.vendor_credit_reminders;
drop policy if exists "Customers read own credit reminders" on public.vendor_credit_reminders;
drop policy if exists "Admins read all Gemini logs" on public.gemini_agent_logs;
drop policy if exists "Customers read own Gemini logs" on public.gemini_agent_logs;
drop policy if exists "Admins read all wallet rows" on public.vendor_security_wallets;
drop policy if exists "Admins read all wallet transactions" on public.vendor_security_wallet_transactions;
drop policy if exists "Admins read all wallet warnings" on public.vendor_security_wallet_warnings;
drop policy if exists "Admins read all order audit logs" on public.order_audit_logs;
drop policy if exists "Vendor owners read own order audit logs" on public.order_audit_logs;
drop policy if exists "Admins read all exit requests" on public.vendor_exit_requests;
drop policy if exists "Admins read all storage usage" on public.vendor_storage_usage;
drop policy if exists "Admins read all storage files" on public.vendor_storage_files;

alter table public.user_profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.vendor_terminals enable row level security;
alter table public.catalog_items enable row level security;
alter table public.vendor_items enable row level security;
alter table public.hyperlocal_orders enable row level security;
alter table public.riders enable row level security;
alter table public.rider_assignments enable row level security;
alter table public.vendor_credit_ledger enable row level security;
alter table public.gemini_agent_logs enable row level security;
alter table public.vendor_security_wallets enable row level security;
alter table public.vendor_security_wallet_transactions enable row level security;
alter table public.vendor_security_wallet_warnings enable row level security;
alter table public.order_audit_logs enable row level security;
alter table public.vendor_credit_accounts enable row level security;
alter table public.vendor_credit_transactions enable row level security;
alter table public.vendor_credit_reminders enable row level security;
alter table public.vendor_exit_requests enable row level security;
alter table public.vendor_storage_usage enable row level security;
alter table public.vendor_storage_files enable row level security;

drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile"
  on public.user_profiles for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

drop policy if exists "Users can insert own profile" on public.user_profiles;
create policy "Users can insert own profile"
  on public.user_profiles for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own non-admin profile" on public.user_profiles;
create policy "Users can update own non-admin profile"
  on public.user_profiles for update
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin())
  with check (
    public.is_company_admin()
    or (user_id = auth.uid() and role in ('customer', 'vendor', 'rider', 'terminal_admin'))
  );

drop policy if exists "Admins can read all vendors" on public.vendors;
create policy "Admins can read all vendors"
  on public.vendors for select
  to authenticated
  using (public.is_company_admin());

drop policy if exists "Vendor owners can read own terminals" on public.vendor_terminals;
create policy "Vendor owners can read own terminals"
  on public.vendor_terminals for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Vendor owners manage own terminals" on public.vendor_terminals;
create policy "Vendor owners manage own terminals"
  on public.vendor_terminals for all
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin())
  with check (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Admins manage catalog" on public.catalog_items;
create policy "Admins manage catalog"
  on public.catalog_items for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

drop policy if exists "Admins read all vendor items" on public.vendor_items;
create policy "Admins read all vendor items"
  on public.vendor_items for select
  to authenticated
  using (public.is_company_admin());

drop policy if exists "Customers read own orders" on public.hyperlocal_orders;
create policy "Customers read own orders"
  on public.hyperlocal_orders for select
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin());

drop policy if exists "Vendors read own order rows" on public.hyperlocal_orders;
create policy "Vendors read own order rows"
  on public.hyperlocal_orders for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Riders read assigned order rows" on public.hyperlocal_orders;
create policy "Riders read assigned order rows"
  on public.hyperlocal_orders for select
  to authenticated
  using (public.is_rider_for_order(id) or public.is_company_admin());

drop policy if exists "Customers can create own orders" on public.hyperlocal_orders;
create policy "Customers can create own orders"
  on public.hyperlocal_orders for insert
  to authenticated
  with check (customer_id = auth.uid());

drop policy if exists "Riders can read own rider profile" on public.riders;
create policy "Riders can read own rider profile"
  on public.riders for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

drop policy if exists "Riders can update own location availability" on public.riders;
create policy "Riders can update own location availability"
  on public.riders for update
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin())
  with check (user_id = auth.uid() or public.is_company_admin());

drop policy if exists "Riders read own assignments" on public.rider_assignments;
create policy "Riders read own assignments"
  on public.rider_assignments for select
  to authenticated
  using (public.is_rider_for_assignment(id) or public.is_company_admin());

drop policy if exists "Vendors read assignments for own orders" on public.rider_assignments;
create policy "Vendors read assignments for own orders"
  on public.rider_assignments for select
  to authenticated
  using (
    exists (
      select 1 from public.hyperlocal_orders o
      where o.id = rider_assignments.order_id
      and public.owns_vendor(o.vendor_id)
    )
    or public.is_company_admin()
  );

drop policy if exists "Vendors read own legacy credit ledger" on public.vendor_credit_ledger;
create policy "Vendors read own legacy credit ledger"
  on public.vendor_credit_ledger for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Customers read own legacy credit ledger" on public.vendor_credit_ledger;
create policy "Customers read own legacy credit ledger"
  on public.vendor_credit_ledger for select
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin());

drop policy if exists "Customers read own vendor credit accounts" on public.vendor_credit_accounts;
create policy "Customers read own vendor credit accounts"
  on public.vendor_credit_accounts for select
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin());

drop policy if exists "Customers read own vendor credit transactions" on public.vendor_credit_transactions;
create policy "Customers read own vendor credit transactions"
  on public.vendor_credit_transactions for select
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin());

drop policy if exists "Vendors read own credit reminders" on public.vendor_credit_reminders;
create policy "Vendors read own credit reminders"
  on public.vendor_credit_reminders for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Customers read own credit reminders" on public.vendor_credit_reminders;
create policy "Customers read own credit reminders"
  on public.vendor_credit_reminders for select
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin());

drop policy if exists "Admins read all Gemini logs" on public.gemini_agent_logs;
create policy "Admins read all Gemini logs"
  on public.gemini_agent_logs for select
  to authenticated
  using (public.is_company_admin());

drop policy if exists "Customers read own Gemini logs" on public.gemini_agent_logs;
create policy "Customers read own Gemini logs"
  on public.gemini_agent_logs for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

drop policy if exists "Admins read all wallet rows" on public.vendor_security_wallets;
create policy "Admins read all wallet rows"
  on public.vendor_security_wallets for select
  to authenticated
  using (public.is_company_admin());

drop policy if exists "Admins read all wallet transactions" on public.vendor_security_wallet_transactions;
create policy "Admins read all wallet transactions"
  on public.vendor_security_wallet_transactions for select
  to authenticated
  using (public.is_company_admin());

drop policy if exists "Admins read all wallet warnings" on public.vendor_security_wallet_warnings;
create policy "Admins read all wallet warnings"
  on public.vendor_security_wallet_warnings for select
  to authenticated
  using (public.is_company_admin());

drop policy if exists "Admins read all order audit logs" on public.order_audit_logs;
create policy "Admins read all order audit logs"
  on public.order_audit_logs for select
  to authenticated
  using (public.is_company_admin());

drop policy if exists "Vendor owners read own order audit logs" on public.order_audit_logs;
create policy "Vendor owners read own order audit logs"
  on public.order_audit_logs for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Admins read all exit requests" on public.vendor_exit_requests;
create policy "Admins read all exit requests"
  on public.vendor_exit_requests for select
  to authenticated
  using (public.is_company_admin());

drop policy if exists "Admins read all storage usage" on public.vendor_storage_usage;
create policy "Admins read all storage usage"
  on public.vendor_storage_usage for select
  to authenticated
  using (public.is_company_admin());

drop policy if exists "Admins read all storage files" on public.vendor_storage_files;
create policy "Admins read all storage files"
  on public.vendor_storage_files for select
  to authenticated
  using (public.is_company_admin());

-- Deliberately no direct client write policies for:
-- wallet balances/transactions, order audit logs, credit transactions/reminders,
-- exit requests, storage file confirmations, and Gemini logs.
-- These must be written through protected backend service-role routes/functions.



-- ============================================================================
-- 202607260005_device_login_addresses_and_upload_security.sql
-- ============================================================================
-- Device recognition, customer addresses, auth security events, and upload metadata hardening.

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  label text not null default 'Home',
  full_address text not null,
  city text,
  lat double precision,
  lng double precision,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_fingerprint text not null,
  device_name text,
  platform text,
  app_version text,
  trusted boolean not null default true,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, device_fingerprint)
);

create table if not exists public.auth_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  event_type text not null check (event_type in (
    'login_otp_sent',
    'login_success',
    'login_failed',
    'device_registered',
    'device_revoked',
    'password_reset_requested',
    'password_reset_completed',
    'sensitive_reauth_required',
    'sensitive_reauth_success'
  )),
  device_fingerprint text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.auth_recovery_attempts (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  channel text not null check (channel in ('phone_otp', 'email_link', 'email_otp')),
  status text not null default 'requested' check (status in ('requested', 'verified', 'failed', 'blocked')),
  attempt_count integer not null default 1,
  blocked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vendor_storage_files
  add column if not exists original_byte_size bigint,
  add column if not exists image_width integer,
  add column if not exists image_height integer,
  add column if not exists optimized boolean not null default false,
  add column if not exists metadata_scan_status text not null default 'pending'
    check (metadata_scan_status in ('pending', 'passed', 'failed')),
  add column if not exists replaced_by_file_id uuid references public.vendor_storage_files(id) on delete set null;

create index if not exists idx_customer_addresses_customer
  on public.customer_addresses(customer_id, is_primary desc, created_at desc);

create index if not exists idx_user_device_sessions_user_seen
  on public.user_device_sessions(user_id, last_seen_at desc);

create index if not exists idx_auth_security_events_user_created
  on public.auth_security_events(user_id, created_at desc);

alter table public.customer_addresses enable row level security;
alter table public.user_device_sessions enable row level security;
alter table public.auth_security_events enable row level security;
alter table public.auth_recovery_attempts enable row level security;

drop policy if exists "Customers manage own addresses" on public.customer_addresses;
drop policy if exists "Users read own devices" on public.user_device_sessions;
drop policy if exists "Users revoke own devices" on public.user_device_sessions;
drop policy if exists "Users read own auth security events" on public.auth_security_events;
drop policy if exists "Admins read auth recovery attempts" on public.auth_recovery_attempts;

drop policy if exists "Customers manage own addresses" on public.customer_addresses;
create policy "Customers manage own addresses"
  on public.customer_addresses for all
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin())
  with check (customer_id = auth.uid() or public.is_company_admin());

drop policy if exists "Users read own devices" on public.user_device_sessions;
create policy "Users read own devices"
  on public.user_device_sessions for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

drop policy if exists "Users revoke own devices" on public.user_device_sessions;
create policy "Users revoke own devices"
  on public.user_device_sessions for update
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin())
  with check (user_id = auth.uid() or public.is_company_admin());

drop policy if exists "Users read own auth security events" on public.auth_security_events;
create policy "Users read own auth security events"
  on public.auth_security_events for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

drop policy if exists "Admins read auth recovery attempts" on public.auth_recovery_attempts;
create policy "Admins read auth recovery attempts"
  on public.auth_recovery_attempts for select
  to authenticated
  using (public.is_company_admin());

-- Inserts for device registration, security events and recovery attempts should
-- go through protected backend service-role routes so rate limits and notices
-- cannot be bypassed by mobile or web clients.


-- ============================================================================
-- 202607260006_vendor_shared_product_catalogue.sql
-- ============================================================================
-- Vendor-contributed shared product catalogue images.
-- SabSewa Local facilitates moderated reuse; uploaders remain responsible for image rights.

alter table public.catalog_items
  add column if not exists shared_image_id uuid,
  add column if not exists image_source text not null default 'company_or_vendor'
    check (image_source in ('company_or_vendor', 'vendor_contributed_shared', 'vendor_private'));

create table if not exists public.shared_product_images (
  id uuid primary key default gen_random_uuid(),
  uploader_vendor_id uuid not null references public.vendors(id) on delete restrict,
  storage_file_id uuid references public.vendor_storage_files(id) on delete set null,
  catalog_item_id uuid references public.catalog_items(id) on delete set null,
  product_name text not null,
  brand text,
  barcode text,
  public_url text not null,
  object_key text not null unique,
  content_type text not null,
  byte_size bigint not null,
  original_byte_size bigint,
  image_width integer,
  image_height integer,
  rights_confirmation text not null,
  rights_confirmed_at timestamptz not null default now(),
  reuse_authorised boolean not null default true,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected', 'removed')),
  moderation_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.vendor_items
  add column if not exists shared_image_id uuid references public.shared_product_images(id) on delete set null;

create index if not exists idx_shared_product_images_status_name
  on public.shared_product_images(moderation_status, product_name);

create index if not exists idx_shared_product_images_vendor_created
  on public.shared_product_images(uploader_vendor_id, created_at desc);

alter table public.shared_product_images enable row level security;

drop policy if exists "Vendors read approved shared product images" on public.shared_product_images;
drop policy if exists "Uploader vendors read own shared image submissions" on public.shared_product_images;
drop policy if exists "Admins read all shared product images" on public.shared_product_images;

drop policy if exists "Vendors read approved shared product images" on public.shared_product_images;
create policy "Vendors read approved shared product images"
  on public.shared_product_images for select
  to authenticated
  using (moderation_status = 'approved' and reuse_authorised = true);

drop policy if exists "Uploader vendors read own shared image submissions" on public.shared_product_images;
create policy "Uploader vendors read own shared image submissions"
  on public.shared_product_images for select
  to authenticated
  using (public.owns_vendor(uploader_vendor_id) or public.is_company_admin());

drop policy if exists "Admins read all shared product images" on public.shared_product_images;
create policy "Admins read all shared product images"
  on public.shared_product_images for select
  to authenticated
  using (public.is_company_admin());

-- Inserts, moderation, rejection/removal and usage-count updates must go
-- through backend service-role routes or secure admin tooling.


-- ============================================================================
-- 202607260007_order_acceptance_availability_rpc.sql
-- ============================================================================
-- Daily availability, partial fulfilment, and atomic vendor acceptance.
-- Apply after 202607260004 so helper functions such as owns_vendor() exist.

alter table public.vendor_items
  add column if not exists available_today boolean not null default true,
  add column if not exists stock_status text not null default 'in_stock'
    check (stock_status in ('in_stock', 'low_stock', 'out_of_stock')),
  add column if not exists daily_stock_quantity numeric,
  add column if not exists daily_availability_updated_at timestamptz,
  add column if not exists daily_availability_note text;

alter table public.vendor_terminals
  add column if not exists is_open_today boolean not null default true,
  add column if not exists opening_status_updated_at timestamptz,
  add column if not exists opening_status_note text;

alter table public.hyperlocal_orders
  add column if not exists requested_delivery_time text,
  add column if not exists order_instructions text,
  add column if not exists safe_order_instructions text,
  add column if not exists general_delivery_area text,
  add column if not exists approx_distance_km numeric,
  add column if not exists partial_fulfillment_offer jsonb,
  add column if not exists partial_fulfillment_status text not null default 'none'
    check (partial_fulfillment_status in ('none', 'pending_customer_confirmation', 'customer_accepted', 'customer_rejected')),
  add column if not exists partial_fulfillment_offered_at timestamptz,
  add column if not exists partial_fulfillment_confirmed_at timestamptz,
  add column if not exists accepted_items jsonb;

alter table public.vendor_security_wallet_transactions
  add column if not exists idempotency_key text,
  add column if not exists terminal_id uuid references public.vendor_terminals(id) on delete set null,
  add column if not exists linked_audit_log_id uuid references public.order_audit_logs(id) on delete set null,
  add column if not exists reversal_of_transaction_id uuid references public.vendor_security_wallet_transactions(id) on delete restrict;

create unique index if not exists uniq_vendor_wallet_tx_idempotency_key
  on public.vendor_security_wallet_transactions(idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_vendor_items_daily_availability
  on public.vendor_items(vendor_id, terminal_id, available_today, is_available);

create index if not exists idx_vendor_terminals_open_today
  on public.vendor_terminals(vendor_id, is_open_today);

create or replace function public.accept_order_with_wallet_fee(
  p_order_id uuid,
  p_vendor_id uuid,
  p_actor_user_id uuid default null,
  p_vendor_comment text default null,
  p_accepted_items jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.hyperlocal_orders%rowtype;
  v_wallet public.vendor_security_wallets%rowtype;
  v_existing_tx public.vendor_security_wallet_transactions%rowtype;
  v_balance_before numeric;
  v_balance_after numeric;
  v_next_status text;
  v_warning_level text;
  v_audit_log_id uuid;
  v_now timestamptz := now();
begin
  select *
    into v_order
    from public.hyperlocal_orders
   where id = p_order_id
     and vendor_id = p_vendor_id
   for update;

  if not found then
    raise exception 'Order not found for this vendor.';
  end if;

  if v_order.status = 'accepted' then
    select *
      into v_wallet
      from public.vendor_security_wallets
     where vendor_id = p_vendor_id
     limit 1;

    return jsonb_build_object('order', to_jsonb(v_order), 'wallet', to_jsonb(v_wallet));
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Only pending orders can be accepted.';
  end if;

  if v_order.partial_fulfillment_status = 'pending_customer_confirmation' then
    raise exception 'Customer must confirm the revised order before acceptance.';
  end if;

  if v_order.partial_fulfillment_status = 'customer_rejected' then
    raise exception 'Customer rejected the revised order.';
  end if;

  select *
    into v_wallet
    from public.vendor_security_wallets
   where vendor_id = p_vendor_id
   for update;

  if not found then
    raise exception 'Vendor advance wallet is not available.';
  end if;

  if v_wallet.opening_balance < 5000 then
    raise exception 'Vendor must deposit the minimum Rs 5,000 advance balance before accepting orders.';
  end if;

  if v_wallet.current_balance < 515 then
    raise exception 'Vendor advance balance is below Rs 515. Order cannot be accepted and customer details remain locked.';
  end if;

  select *
    into v_existing_tx
    from public.vendor_security_wallet_transactions
   where vendor_id = p_vendor_id
     and order_id = p_order_id
     and transaction_type = 'order_fee'
   limit 1
   for update;

  if not found then
    v_balance_before := v_wallet.current_balance;
    v_balance_after := v_balance_before - 15;
    v_next_status :=
      case
        when v_wallet.opening_balance < 5000 then 'security_deposit_required'
        when v_balance_after < 515 then 'orders_stopped'
        when v_balance_after < 500 then 'final_warning'
        when v_balance_after <= 1000 then 'low_balance'
        else 'eligible'
      end;

    v_warning_level :=
      case
        when v_next_status = 'orders_stopped' then 'orders_stopped'
        when v_next_status = 'final_warning' then 'final_warning'
        when v_next_status = 'low_balance' then 'top_up_reminder'
        else 'none'
      end;

    update public.vendor_security_wallets
       set current_balance = v_balance_after,
           eligibility_status = v_next_status,
           updated_at = v_now,
           last_warning_sent_at = case
             when v_warning_level = 'none' then last_warning_sent_at
             else v_now
           end
     where id = v_wallet.id
     returning * into v_wallet;

    insert into public.vendor_security_wallet_transactions (
      wallet_id,
      vendor_id,
      order_id,
      transaction_type,
      amount,
      balance_before,
      balance_after,
      payment_reference,
      idempotency_key,
      terminal_id,
      warning_level,
      metadata
    ) values (
      v_wallet.id,
      p_vendor_id,
      p_order_id,
      'order_fee',
      -15,
      v_balance_before,
      v_balance_after,
      'PLATFORM_FACILITATION_CHARGE_' || p_order_id::text,
      'order_acceptance_fee:' || p_order_id::text,
      v_order.terminal_id,
      v_warning_level,
      jsonb_build_object(
        'platform_facilitation_charge', 15,
        'charge_trigger', 'vendor_order_acceptance',
        'charge_description', 'Rs 15 platform facilitation fee recorded when the vendor accepts a real-world SabSewa Local order'
      )
    );

    if v_warning_level <> 'none' then
      insert into public.vendor_security_wallet_warnings (
        vendor_id,
        wallet_id,
        warning_level,
        balance,
        message,
        channel
      ) values (
        p_vendor_id,
        v_wallet.id,
        v_warning_level,
        v_balance_after,
        case
          when v_warning_level = 'orders_stopped' then 'New SabSewa Local orders are stopped because your vendor advance balance is below Rs 515.'
          when v_warning_level = 'final_warning' then 'Final warning: your SabSewa Local vendor advance balance is below Rs 500.'
          else 'Your SabSewa Local vendor advance balance is Rs 1,000 or below. Please top up soon.'
        end,
        'in_app'
      );
    end if;
  end if;

  update public.hyperlocal_orders
     set status = 'accepted',
         vendor_comment = p_vendor_comment,
         accepted_at = v_now,
         accepted_by_vendor_id = p_vendor_id,
         vendor_detail_unlocked_at = v_now,
         accepted_items = coalesce(p_accepted_items, accepted_items, partial_fulfillment_offer->'items', items),
         updated_at = v_now
   where id = p_order_id
   returning * into v_order;

  insert into public.order_audit_logs (
    order_id,
    vendor_id,
    actor_user_id,
    action,
    from_status,
    to_status,
    metadata
  ) values (
    p_order_id,
    p_vendor_id,
    p_actor_user_id,
    'vendor_accept_order_unlock_details',
    'pending',
    'accepted',
    jsonb_build_object(
      'customer_details_unlocked', true,
      'invoice_unlocked', true,
      'fee_deducted', true,
      'fee_amount', 15,
      'wallet_threshold_checked', 515,
      'vendor_comment', p_vendor_comment,
      'idempotency_key', 'order_acceptance_fee:' || p_order_id::text
    )
  )
  returning id into v_audit_log_id;

  update public.vendor_security_wallet_transactions
     set linked_audit_log_id = v_audit_log_id
   where vendor_id = p_vendor_id
     and order_id = p_order_id
     and transaction_type = 'order_fee'
     and linked_audit_log_id is null;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'wallet', jsonb_build_object(
      'id', v_wallet.id,
      'vendor_id', v_wallet.vendor_id,
      'current_balance', v_wallet.current_balance,
      'eligibility_status', v_wallet.eligibility_status
    )
  );
end;
$$;

revoke all on function public.accept_order_with_wallet_fee(uuid, uuid, uuid, text, jsonb) from public;
grant execute on function public.accept_order_with_wallet_fee(uuid, uuid, uuid, text, jsonb) to service_role;


-- ============================================================================
-- 202607260008_wallet_dispute_evidence.sql
-- ============================================================================
-- Wallet dispute and transaction evidence module.
-- Financial history is append-only: reversals are separate positive entries.

alter table if exists public.vendor_security_wallet_transactions
  drop constraint if exists vendor_security_wallet_transactions_transaction_type_check;

alter table if exists public.vendor_security_wallet_transactions
  add constraint vendor_security_wallet_transactions_transaction_type_check
  check (transaction_type in (
    'security_deposit',
    'top_up',
    'order_fee',
    'activation_usage_charge',
    'refund',
    'refund_adjustment',
    'manual_adjustment',
    'dispute_reversal'
  ));

create table if not exists public.wallet_transaction_disputes (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  wallet_transaction_id uuid not null references public.vendor_security_wallet_transactions(id) on delete restrict,
  order_id uuid references public.hyperlocal_orders(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'under_review', 'approved_reversal', 'rejected', 'closed')),
  complaint_text text not null,
  supporting_documents jsonb not null default '[]'::jsonb,
  raised_by_user_id uuid,
  raised_by_role text not null default 'vendor'
    check (raised_by_role in ('vendor', 'admin')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  reversal_transaction_id uuid references public.vendor_security_wallet_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.vendor_security_wallet_transactions
  add column if not exists statement_month date,
  add column if not exists archive_after date,
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text,
  add column if not exists soft_deleted_at timestamptz,
  add column if not exists soft_deleted_by uuid,
  add column if not exists soft_delete_reason text,
  add column if not exists recoverable_until date,
  add column if not exists recovered_at timestamptz,
  add column if not exists recovered_by uuid,
  add column if not exists recovery_reason text;

update public.vendor_security_wallet_transactions
   set statement_month = date_trunc('month', created_at)::date
 where statement_month is null;

update public.vendor_security_wallet_transactions
   set archive_after = (date_trunc('month', created_at) + interval '1 month' + interval '14 days')::date
 where archive_after is null;

update public.vendor_security_wallet_transactions
   set archived_at = now(),
       archive_reason = 'Moved from active Vendor CRM view after the 15th day of the following month; retained centrally for audit and dispute retrieval.'
 where archived_at is null
   and archive_after < current_date;

update public.vendor_security_wallet_transactions
   set recoverable_until = (coalesce(soft_deleted_at, archived_at, created_at)::date + interval '6 months')::date
 where recoverable_until is null;

create index if not exists idx_wallet_disputes_vendor_created
  on public.wallet_transaction_disputes(vendor_id, created_at desc);

create index if not exists idx_wallet_disputes_tx
  on public.wallet_transaction_disputes(wallet_transaction_id);

create index if not exists idx_wallet_transactions_archive_lookup
  on public.vendor_security_wallet_transactions(vendor_id, statement_month, archived_at, order_id);

alter table public.vendor_credit_accounts
  add column if not exists settlement_status text not null default 'active'
    check (settlement_status in ('active', 'paid', 'settled', 'suspended')),
  add column if not exists settled_at timestamptz,
  add column if not exists settlement_amount numeric(12,2),
  add column if not exists settlement_acknowledgement text,
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text,
  add column if not exists soft_deleted_at timestamptz,
  add column if not exists soft_deleted_by uuid,
  add column if not exists soft_delete_reason text,
  add column if not exists recoverable_until date,
  add column if not exists recovered_at timestamptz,
  add column if not exists recovered_by uuid,
  add column if not exists recovery_reason text;

create index if not exists idx_vendor_credit_accounts_archive
  on public.vendor_credit_accounts(vendor_id, customer_id, settlement_status, archived_at);

alter table public.hyperlocal_orders
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text,
  add column if not exists soft_deleted_at timestamptz,
  add column if not exists soft_deleted_by uuid,
  add column if not exists soft_delete_reason text,
  add column if not exists recoverable_until date,
  add column if not exists recovered_at timestamptz,
  add column if not exists recovered_by uuid,
  add column if not exists recovery_reason text;

alter table public.wallet_transaction_disputes
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text,
  add column if not exists soft_deleted_at timestamptz,
  add column if not exists soft_deleted_by uuid,
  add column if not exists soft_delete_reason text,
  add column if not exists recoverable_until date,
  add column if not exists recovered_at timestamptz,
  add column if not exists recovered_by uuid,
  add column if not exists recovery_reason text;

create table if not exists public.company_data_recovery_audit (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null,
  target_table text not null,
  target_record_id uuid,
  vendor_id uuid,
  customer_id uuid,
  order_id uuid,
  transaction_id uuid,
  statement_month date,
  recovery_scope text not null default 'read_only_lookup'
    check (recovery_scope in ('read_only_lookup', 'restore_to_active_view', 'soft_delete_reversal')),
  reason text not null,
  result_count integer not null default 0,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_company_data_recovery_audit_lookup
  on public.company_data_recovery_audit(vendor_id, customer_id, order_id, transaction_id, statement_month, created_at desc);

alter table public.company_data_recovery_audit enable row level security;

drop policy if exists "Admins read recovery audit" on public.company_data_recovery_audit;

drop policy if exists "Admins read recovery audit" on public.company_data_recovery_audit;
create policy "Admins read recovery audit"
  on public.company_data_recovery_audit for select
  to authenticated
  using (public.is_company_admin());

-- Recovery writes are restricted to protected backend service-role routes.

alter table public.wallet_transaction_disputes enable row level security;

drop policy if exists "Vendors read own wallet disputes" on public.wallet_transaction_disputes;
drop policy if exists "Admins read all wallet disputes" on public.wallet_transaction_disputes;

drop policy if exists "Vendors read own wallet disputes" on public.wallet_transaction_disputes;
create policy "Vendors read own wallet disputes"
  on public.wallet_transaction_disputes for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Admins read all wallet disputes" on public.wallet_transaction_disputes;
create policy "Admins read all wallet disputes"
  on public.wallet_transaction_disputes for select
  to authenticated
  using (public.is_company_admin());

-- Inserts, reviews, reversals and document evidence updates must be done through
-- protected backend routes using the Supabase service-role key.

create or replace function public.approve_wallet_dispute_reversal(
  p_dispute_id uuid,
  p_admin_user_id uuid,
  p_review_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute public.wallet_transaction_disputes%rowtype;
  v_original_tx public.vendor_security_wallet_transactions%rowtype;
  v_wallet public.vendor_security_wallets%rowtype;
  v_balance_before numeric;
  v_balance_after numeric;
  v_reversal_amount numeric;
  v_reversal_tx public.vendor_security_wallet_transactions%rowtype;
  v_next_status text;
begin
  if coalesce(trim(p_review_reason), '') = '' then
    raise exception 'Mandatory reversal reason is required.';
  end if;

  select *
    into v_dispute
    from public.wallet_transaction_disputes
   where id = p_dispute_id
   for update;

  if not found then
    raise exception 'Wallet dispute not found.';
  end if;

  if v_dispute.status = 'approved_reversal' then
    select *
      into v_reversal_tx
      from public.vendor_security_wallet_transactions
     where id = v_dispute.reversal_transaction_id;
    return jsonb_build_object('dispute', to_jsonb(v_dispute), 'reversal_transaction', to_jsonb(v_reversal_tx));
  end if;

  select *
    into v_original_tx
    from public.vendor_security_wallet_transactions
   where id = v_dispute.wallet_transaction_id
   for update;

  if not found then
    raise exception 'Original wallet transaction not found.';
  end if;

  if v_original_tx.amount >= 0 then
    raise exception 'Only debit transactions can be reversed through this dispute flow.';
  end if;

  select *
    into v_wallet
    from public.vendor_security_wallets
   where vendor_id = v_dispute.vendor_id
   for update;

  if not found then
    raise exception 'Vendor wallet not found.';
  end if;

  v_reversal_amount := abs(v_original_tx.amount);
  v_balance_before := v_wallet.current_balance;
  v_balance_after := v_balance_before + v_reversal_amount;
  v_next_status :=
    case
      when v_wallet.opening_balance < 5000 then 'security_deposit_required'
      when v_balance_after < 515 then 'orders_stopped'
      when v_balance_after < 500 then 'final_warning'
      when v_balance_after <= 1000 then 'low_balance'
      else 'eligible'
    end;

  update public.vendor_security_wallets
     set current_balance = v_balance_after,
         eligibility_status = v_next_status,
         updated_at = now()
   where id = v_wallet.id
   returning * into v_wallet;

  insert into public.vendor_security_wallet_transactions (
    wallet_id,
    vendor_id,
    order_id,
    terminal_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    payment_reference,
    admin_user_id,
    admin_reason,
    idempotency_key,
    reversal_of_transaction_id,
    metadata
  ) values (
    v_wallet.id,
    v_dispute.vendor_id,
    v_original_tx.order_id,
    v_original_tx.terminal_id,
    'dispute_reversal',
    v_reversal_amount,
    v_balance_before,
    v_balance_after,
    'DISPUTE_REVERSAL_' || p_dispute_id::text,
    p_admin_user_id,
    p_review_reason,
    'wallet_dispute_reversal:' || p_dispute_id::text,
    v_original_tx.id,
    jsonb_build_object(
      'dispute_id', p_dispute_id,
      'original_transaction_id', v_original_tx.id,
      'review_reason', p_review_reason
    )
  )
  returning * into v_reversal_tx;

  update public.wallet_transaction_disputes
     set status = 'approved_reversal',
         reviewed_by = p_admin_user_id,
         reviewed_at = now(),
         review_reason = p_review_reason,
         reversal_transaction_id = v_reversal_tx.id,
         updated_at = now()
   where id = p_dispute_id
   returning * into v_dispute;

  return jsonb_build_object(
    'dispute', to_jsonb(v_dispute),
    'wallet', to_jsonb(v_wallet),
    'original_transaction', to_jsonb(v_original_tx),
    'reversal_transaction', to_jsonb(v_reversal_tx)
  );
end;
$$;

revoke all on function public.approve_wallet_dispute_reversal(uuid, uuid, text) from public;
grant execute on function public.approve_wallet_dispute_reversal(uuid, uuid, text) to service_role;


-- ============================================================================
-- 202607260009_location_based_vendor_ids.sql
-- ============================================================================
-- Location-based public Vendor IDs and Terminal IDs.
-- UUID remains the immutable internal primary key.

create sequence if not exists public.sabsewa_local_vendor_public_number_seq
  as integer
  start with 1
  increment by 1
  minvalue 1;

create table if not exists public.company_location_codes (
  id uuid primary key default gen_random_uuid(),
  city_code text not null check (city_code ~ '^[A-Z0-9]{2,5}$'),
  city_name text not null,
  locality_code text not null check (locality_code ~ '^[A-Z0-9]{2,6}$'),
  locality_name text not null,
  state text,
  country text not null default 'IN',
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_code, locality_code)
);

insert into public.company_location_codes (city_code, city_name, locality_code, locality_name, state)
values
  ('BLR', 'Bengaluru', 'WFD', 'Whitefield', 'Karnataka'),
  ('BLR', 'Bengaluru', 'INR', 'Indiranagar', 'Karnataka'),
  ('GGM', 'Gurugram', 'S48', 'Sector 48', 'Haryana'),
  ('UNK', 'Unknown', 'GEN', 'General', null)
on conflict (city_code, locality_code) do nothing;

alter table public.vendors
  add column if not exists public_vendor_id text,
  add column if not exists city_code text,
  add column if not exists locality_code text,
  add column if not exists locality_name text,
  add column if not exists public_vendor_number integer,
  add column if not exists public_id_assigned_at timestamptz,
  add column if not exists public_id_assigned_by uuid;

alter table public.vendor_terminals
  add column if not exists public_terminal_id text,
  add column if not exists terminal_number integer,
  add column if not exists locality_code text,
  add column if not exists locality_name text,
  add column if not exists public_id_assigned_at timestamptz;

alter table public.vendor_security_wallet_transactions
  add column if not exists public_vendor_id text,
  add column if not exists public_terminal_id text;

alter table public.vendor_credit_accounts
  add column if not exists public_vendor_id text;

alter table public.wallet_transaction_disputes
  add column if not exists public_vendor_id text;

create unique index if not exists uniq_vendors_public_vendor_id
  on public.vendors(public_vendor_id)
  where public_vendor_id is not null;

create unique index if not exists uniq_vendor_terminals_public_terminal_id
  on public.vendor_terminals(public_terminal_id)
  where public_terminal_id is not null;

create index if not exists idx_vendors_public_search
  on public.vendors(public_vendor_id, shop_name, owner_name, phone, city_code, locality_code);

create table if not exists public.vendor_location_history (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  public_vendor_id text,
  old_city_code text,
  old_locality_code text,
  old_address text,
  old_lat double precision,
  old_lng double precision,
  new_city_code text,
  new_locality_code text,
  new_address text,
  new_lat double precision,
  new_lng double precision,
  changed_by uuid,
  change_reason text not null default 'Location updated',
  created_at timestamptz not null default now()
);

create index if not exists idx_vendor_location_history_vendor
  on public.vendor_location_history(vendor_id, created_at desc);

create or replace function public.assign_sabsewa_local_vendor_id()
returns trigger
language plpgsql
as $$
declare
  v_number integer;
  v_city text;
  v_locality text;
begin
  if new.public_vendor_id is not null then
    new.public_vendor_id := upper(new.public_vendor_id);
    return new;
  end if;

  v_city := upper(coalesce(nullif(new.city_code, ''), 'UNK'));
  v_locality := upper(coalesce(nullif(new.locality_code, ''), 'GEN'));
  v_number := nextval('public.sabsewa_local_vendor_public_number_seq');

  new.city_code := v_city;
  new.locality_code := v_locality;
  new.public_vendor_number := v_number;
  new.public_vendor_id := format('SL-%s-%s-%s', v_city, v_locality, lpad(v_number::text, 6, '0'));
  new.public_id_assigned_at := coalesce(new.public_id_assigned_at, now());
  return new;
end;
$$;

drop trigger if exists trg_assign_sabsewa_local_vendor_id on public.vendors;
drop trigger if exists trg_assign_sabsewa_local_vendor_id on public.vendors;
create trigger trg_assign_sabsewa_local_vendor_id
before insert on public.vendors
for each row execute function public.assign_sabsewa_local_vendor_id();

create or replace function public.record_vendor_location_change()
returns trigger
language plpgsql
as $$
begin
  if old.city_code is distinct from new.city_code
     or old.locality_code is distinct from new.locality_code
     or old.address is distinct from new.address
     or old.lat is distinct from new.lat
     or old.lng is distinct from new.lng then
    insert into public.vendor_location_history (
      vendor_id,
      public_vendor_id,
      old_city_code,
      old_locality_code,
      old_address,
      old_lat,
      old_lng,
      new_city_code,
      new_locality_code,
      new_address,
      new_lat,
      new_lng,
      changed_by,
      change_reason
    ) values (
      old.id,
      old.public_vendor_id,
      old.city_code,
      old.locality_code,
      old.address,
      old.lat,
      old.lng,
      new.city_code,
      new.locality_code,
      new.address,
      new.lat,
      new.lng,
      auth.uid(),
      'Location updated'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_record_vendor_location_change on public.vendors;
drop trigger if exists trg_record_vendor_location_change on public.vendors;
create trigger trg_record_vendor_location_change
after update on public.vendors
for each row execute function public.record_vendor_location_change();

create or replace function public.assign_sabsewa_local_terminal_id()
returns trigger
language plpgsql
as $$
declare
  v_vendor_public_id text;
  v_terminal_number integer;
begin
  if new.public_terminal_id is not null then
    new.public_terminal_id := upper(new.public_terminal_id);
    return new;
  end if;

  select public_vendor_id
    into v_vendor_public_id
    from public.vendors
   where id = new.vendor_id;

  if v_vendor_public_id is null then
    raise exception 'Vendor public ID must be assigned before terminal public ID.';
  end if;

  select coalesce(max(terminal_number), 0) + 1
    into v_terminal_number
    from public.vendor_terminals
   where vendor_id = new.vendor_id;

  new.terminal_number := v_terminal_number;
  new.public_terminal_id := format('%s-T%s', v_vendor_public_id, lpad(v_terminal_number::text, 2, '0'));
  new.public_id_assigned_at := coalesce(new.public_id_assigned_at, now());
  return new;
end;
$$;

drop trigger if exists trg_assign_sabsewa_local_terminal_id on public.vendor_terminals;
drop trigger if exists trg_assign_sabsewa_local_terminal_id on public.vendor_terminals;
create trigger trg_assign_sabsewa_local_terminal_id
before insert on public.vendor_terminals
for each row execute function public.assign_sabsewa_local_terminal_id();

update public.vendors
   set city_code = upper(coalesce(nullif(city_code, ''), 'UNK')),
       locality_code = upper(coalesce(nullif(locality_code, ''), 'GEN'))
 where city_code is null or locality_code is null;

update public.vendors
   set public_vendor_number = nextval('public.sabsewa_local_vendor_public_number_seq'),
       public_id_assigned_at = now()
 where public_vendor_id is null;

update public.vendors
   set public_vendor_id = format('SL-%s-%s-%s', city_code, locality_code, lpad(public_vendor_number::text, 6, '0'))
 where public_vendor_id is null;

with numbered_terminals as (
  select id,
         vendor_id,
         row_number() over (partition by vendor_id order by created_at, id)::integer as rn
    from public.vendor_terminals
   where public_terminal_id is null
)
update public.vendor_terminals vt
   set terminal_number = nt.rn,
       public_terminal_id = format('%s-T%s', v.public_vendor_id, lpad(nt.rn::text, 2, '0')),
       public_id_assigned_at = now()
  from numbered_terminals nt
  join public.vendors v on v.id = nt.vendor_id
 where vt.id = nt.id;

update public.vendor_security_wallet_transactions tx
   set public_vendor_id = v.public_vendor_id,
       public_terminal_id = coalesce(
         (
           select t.public_terminal_id
             from public.vendor_terminals t
            where t.id = tx.terminal_id
            limit 1
         ),
         tx.public_terminal_id
       )
  from public.vendors v
 where tx.vendor_id = v.id
   and (tx.public_vendor_id is null or tx.public_terminal_id is null);

update public.vendor_credit_accounts ca
   set public_vendor_id = v.public_vendor_id
  from public.vendors v
 where ca.vendor_id = v.id
   and ca.public_vendor_id is null;

update public.wallet_transaction_disputes d
   set public_vendor_id = v.public_vendor_id
  from public.vendors v
 where d.vendor_id = v.id
   and d.public_vendor_id is null;

create or replace function public.fill_wallet_transaction_public_ids()
returns trigger
language plpgsql
as $$
begin
  if new.public_vendor_id is null then
    select public_vendor_id
      into new.public_vendor_id
      from public.vendors
     where id = new.vendor_id;
  end if;

  if new.public_terminal_id is null and new.terminal_id is not null then
    select public_terminal_id
      into new.public_terminal_id
      from public.vendor_terminals
     where id = new.terminal_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fill_wallet_transaction_public_ids on public.vendor_security_wallet_transactions;
create trigger trg_fill_wallet_transaction_public_ids
before insert or update of vendor_id, terminal_id, public_vendor_id, public_terminal_id
on public.vendor_security_wallet_transactions
for each row execute function public.fill_wallet_transaction_public_ids();

alter table public.company_location_codes enable row level security;
alter table public.vendor_location_history enable row level security;

drop policy if exists "Authenticated users read active location codes" on public.company_location_codes;
drop policy if exists "Admins manage location codes" on public.company_location_codes;
drop policy if exists "Admins read vendor location history" on public.vendor_location_history;
drop policy if exists "Vendor owners read own location history" on public.vendor_location_history;

drop policy if exists "Authenticated users read active location codes" on public.company_location_codes;
create policy "Authenticated users read active location codes"
  on public.company_location_codes for select
  to authenticated
  using (is_active = true or public.is_company_admin());

drop policy if exists "Admins manage location codes" on public.company_location_codes;
create policy "Admins manage location codes"
  on public.company_location_codes for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

drop policy if exists "Admins read vendor location history" on public.vendor_location_history;
create policy "Admins read vendor location history"
  on public.vendor_location_history for select
  to authenticated
  using (public.is_company_admin());

drop policy if exists "Vendor owners read own location history" on public.vendor_location_history;
create policy "Vendor owners read own location history"
  on public.vendor_location_history for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

-- Vendor IDs are public/business identifiers only. Vendors must not edit these fields.


-- ============================================================================
-- 202607260010_customer_discovery_unserved_area_leads.sql
-- ============================================================================
-- Customer discovery, vendor service radius, and unserved-area demand leads.

alter table public.vendors
  add column if not exists max_service_radius_m integer not null default 1000
    check (max_service_radius_m between 100 and 1000),
  add column if not exists delivery_available boolean not null default true,
  add column if not exists pickup_available boolean not null default true,
  add column if not exists delivery_terms text,
  add column if not exists estimated_fulfilment_minutes integer not null default 45
    check (estimated_fulfilment_minutes between 5 and 240),
  add column if not exists rating numeric(3,2) not null default 0
    check (rating >= 0 and rating <= 5),
  add column if not exists rating_count integer not null default 0
    check (rating_count >= 0);

alter table public.vendor_terminals
  add column if not exists operating_hours jsonb not null default '{}'::jsonb,
  add column if not exists delivery_available boolean not null default true,
  add column if not exists pickup_available boolean not null default true,
  add column if not exists estimated_fulfilment_minutes integer;

create table if not exists public.unserved_area_leads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,
  category text not null,
  locality text,
  pincode text,
  city text,
  lat double precision,
  lng double precision,
  search_radius_m integer not null default 1000,
  consent_given boolean not null default false,
  requested_buttons jsonb not null default '[]'::jsonb,
  status text not null default 'new'
    check (status in ('new', 'assigned', 'vendors_contacted', 'vendor_registered', 'notified_customers', 'closed')),
  assigned_to uuid,
  customer_count integer not null default 1,
  first_requested_at timestamptz not null default now(),
  last_requested_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.unserved_area_vendor_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.unserved_area_leads(id) on delete cascade,
  vendor_name text not null,
  contact_name text,
  phone text,
  category text,
  contact_status text not null default 'identified'
    check (contact_status in ('identified', 'contacted', 'interested', 'registered', 'not_interested', 'invalid')),
  registered_vendor_id uuid references public.vendors(id) on delete set null,
  notes text,
  contacted_by uuid,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_unserved_area_leads_hotspots
  on public.unserved_area_leads(category, pincode, locality, status, customer_count desc);

create index if not exists idx_unserved_area_leads_location
  on public.unserved_area_leads(lat, lng, category);

alter table public.unserved_area_leads enable row level security;
alter table public.unserved_area_vendor_contacts enable row level security;

drop policy if exists "Customers read own unserved area leads" on public.unserved_area_leads;
drop policy if exists "Admins read all unserved area leads" on public.unserved_area_leads;
drop policy if exists "Admins manage unserved vendor contacts" on public.unserved_area_vendor_contacts;

drop policy if exists "Customers read own unserved area leads" on public.unserved_area_leads;
create policy "Customers read own unserved area leads"
  on public.unserved_area_leads for select
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin());

drop policy if exists "Admins read all unserved area leads" on public.unserved_area_leads;
create policy "Admins read all unserved area leads"
  on public.unserved_area_leads for select
  to authenticated
  using (public.is_company_admin());

drop policy if exists "Admins manage unserved vendor contacts" on public.unserved_area_vendor_contacts;
create policy "Admins manage unserved vendor contacts"
  on public.unserved_area_vendor_contacts for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

-- Inserts and updates for unserved leads are routed through the backend so exact
-- customer addresses are never stored for vendor recruitment.


-- ============================================================================
-- 202607270001_vendor_controlled_product_pricing.sql
-- ============================================================================
-- Vendor-controlled product price display and quotation workflow.

alter table public.vendor_items
  add column if not exists price_display_mode text not null default 'show_price'
    check (price_display_mode in ('show_price', 'hide_price', 'market_price')),
  add column if not exists price_unit_label text,
  add column if not exists previous_price numeric(10,2),
  add column if not exists discount_label text,
  add column if not exists price_updated_at timestamptz,
  add column if not exists price_updated_by uuid;

alter table public.hyperlocal_orders
  add column if not exists price_quote_required boolean not null default false,
  add column if not exists price_quote_status text not null default 'not_required'
    check (price_quote_status in ('not_required', 'pending_vendor_quote', 'pending_customer_approval', 'customer_accepted', 'customer_rejected')),
  add column if not exists vendor_price_quote jsonb,
  add column if not exists vendor_price_quoted_at timestamptz,
  add column if not exists customer_price_quote_responded_at timestamptz,
  add column if not exists quoted_total_amount numeric(10,2);

create table if not exists public.vendor_item_price_history (
  id uuid primary key default gen_random_uuid(),
  vendor_item_id uuid not null references public.vendor_items(id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  terminal_id uuid references public.vendor_terminals(id) on delete set null,
  old_price numeric(10,2),
  new_price numeric(10,2),
  old_price_display_mode text,
  new_price_display_mode text,
  old_price_unit_label text,
  new_price_unit_label text,
  changed_by uuid,
  change_reason text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_vendor_item_price_history_item_created
  on public.vendor_item_price_history(vendor_item_id, created_at desc);

create index if not exists idx_vendor_item_price_history_vendor_created
  on public.vendor_item_price_history(vendor_id, created_at desc);

create or replace function public.record_vendor_item_price_change()
returns trigger
language plpgsql
as $$
begin
  if old.price is distinct from new.price
     or old.price_display_mode is distinct from new.price_display_mode
     or old.price_unit_label is distinct from new.price_unit_label then
    insert into public.vendor_item_price_history (
      vendor_item_id,
      vendor_id,
      terminal_id,
      old_price,
      new_price,
      old_price_display_mode,
      new_price_display_mode,
      old_price_unit_label,
      new_price_unit_label,
      changed_by,
      change_reason,
      metadata
    ) values (
      new.id,
      new.vendor_id,
      new.terminal_id,
      old.price,
      new.price,
      old.price_display_mode,
      new.price_display_mode,
      old.price_unit_label,
      new.price_unit_label,
      auth.uid(),
      'Vendor item price or display mode updated',
      jsonb_build_object(
        'previous_price', new.previous_price,
        'discount_label', new.discount_label
      )
    );

    new.price_updated_at := coalesce(new.price_updated_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_record_vendor_item_price_change on public.vendor_items;
drop trigger if exists trg_record_vendor_item_price_change on public.vendor_items;
create trigger trg_record_vendor_item_price_change
before update on public.vendor_items
for each row execute function public.record_vendor_item_price_change();

alter table public.vendor_item_price_history enable row level security;

drop policy if exists "Vendors read own item price history" on public.vendor_item_price_history;
drop policy if exists "Admins read all item price history" on public.vendor_item_price_history;

drop policy if exists "Vendors read own item price history" on public.vendor_item_price_history;
create policy "Vendors read own item price history"
  on public.vendor_item_price_history for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Admins read all item price history" on public.vendor_item_price_history;
create policy "Admins read all item price history"
  on public.vendor_item_price_history for select
  to authenticated
  using (public.is_company_admin());

create or replace function public.prevent_unapproved_price_quote_acceptance()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'accepted'
     and old.status is distinct from 'accepted'
     and new.price_quote_required = true
     and new.price_quote_status <> 'customer_accepted' then
    raise exception 'Customer must approve the vendor quoted price before the order can be accepted.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_unapproved_price_quote_acceptance on public.hyperlocal_orders;
drop trigger if exists trg_prevent_unapproved_price_quote_acceptance on public.hyperlocal_orders;
create trigger trg_prevent_unapproved_price_quote_acceptance
before update of status on public.hyperlocal_orders
for each row execute function public.prevent_unapproved_price_quote_acceptance();

-- Price changes affect only future order snapshots. Existing order items retain
-- the price, display mode and quote state captured when the order was placed.


-- ============================================================================
-- 202607270002_terms_privacy_acceptance.sql
-- ============================================================================
-- Versioned Terms/Privacy acceptance evidence for SabSewa Local registration.
-- Registration must not complete unless the user actively accepts the current
-- Terms of Use and acknowledges the Privacy Notice.

alter table public.user_profiles
  add column if not exists preferred_language text default 'en',
  add column if not exists terms_version text,
  add column if not exists privacy_version text,
  add column if not exists policy_bundle_version text,
  add column if not exists accepted_document_versions jsonb not null default '{}'::jsonb,
  add column if not exists policies_accepted_at timestamptz,
  add column if not exists policies_accepted_language text,
  add column if not exists policy_acceptance_required boolean not null default true;

create table if not exists public.user_policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role text not null check (role in ('customer', 'vendor', 'rider', 'terminal_admin', 'admin')),
  terms_version text not null,
  privacy_version text not null,
  policy_bundle_version text not null,
  accepted_document_versions jsonb not null default '{}'::jsonb,
  accepted_statement text not null,
  accepted_at timestamptz not null default now(),
  displayed_language text not null default 'en',
  device_id text,
  device_name text,
  platform text,
  app_version text,
  session_id text,
  otp_verified boolean not null default true,
  marketing_consent boolean not null default false,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_policy_acceptances_user
  on public.user_policy_acceptances(user_id, accepted_at desc);

create index if not exists idx_user_policy_acceptances_versions
  on public.user_policy_acceptances(terms_version, privacy_version, accepted_at desc);

alter table public.user_policy_acceptances enable row level security;

drop policy if exists "Users read own policy acceptances" on public.user_policy_acceptances;
drop policy if exists "Users insert own policy acceptances" on public.user_policy_acceptances;
drop policy if exists "Admins read all policy acceptances" on public.user_policy_acceptances;

drop policy if exists "Users read own policy acceptances" on public.user_policy_acceptances;
create policy "Users read own policy acceptances"
  on public.user_policy_acceptances for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

drop policy if exists "Users insert own policy acceptances" on public.user_policy_acceptances;
create policy "Users insert own policy acceptances"
  on public.user_policy_acceptances for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Admins read all policy acceptances" on public.user_policy_acceptances;
create policy "Admins read all policy acceptances"
  on public.user_policy_acceptances for select
  to authenticated
  using (public.is_company_admin());

-- If terms materially change, compare the latest accepted versions with the
-- current application constants and require fresh acceptance in the app.


-- ============================================================================
-- 202607280001_revised_vendor_activation_wallet_policy.sql
-- ============================================================================
-- Revised vendor activation and wallet policy.
-- Initial payment: Rs 5,500 = Rs 500 non-refundable activation/service charge
-- plus Rs 5,000 refundable advance wallet credit.

alter table if exists public.vendor_security_wallets
  add column if not exists activation_fee_paid boolean not null default false,
  add column if not exists activation_fee_amount numeric(12,2) not null default 500,
  add column if not exists activation_fee_payment_id text,
  add column if not exists activation_fee_paid_at timestamptz,
  add column if not exists wallet_credit_amount numeric(12,2) not null default 5000,
  add column if not exists initial_payment_amount numeric(12,2) not null default 5500,
  add column if not exists activation_gst_config jsonb not null default '{"ca_confirmation_required": true}'::jsonb;

alter table if exists public.vendor_security_wallet_transactions
  add column if not exists is_refundable boolean not null default true,
  add column if not exists statement_month date generated always as (date_trunc('month', created_at)::date) stored;

alter table if exists public.vendor_security_wallet_transactions
  drop constraint if exists vendor_security_wallet_transactions_transaction_type_check;

alter table if exists public.vendor_security_wallet_transactions
  add constraint vendor_security_wallet_transactions_transaction_type_check
  check (transaction_type in (
    'payment_received',
    'activation_fee',
    'security_deposit',
    'top_up',
    'order_fee',
    'refund',
    'manual_adjustment',
    'reversal'
  ));

create unique index if not exists uq_vendor_single_activation_fee
  on public.vendor_security_wallet_transactions(vendor_id)
  where transaction_type = 'activation_fee';

drop index if exists public.uq_vendor_wallet_razorpay_payment_once;

create unique index if not exists uq_vendor_wallet_razorpay_payment_type_once
  on public.vendor_security_wallet_transactions(razorpay_payment_id, transaction_type)
  where razorpay_payment_id is not null;

alter table if exists public.vendor_exit_requests
  add column if not exists non_refundable_activation_fee_previously_collected numeric(12,2) not null default 500,
  add column if not exists activation_fee_deducted_again boolean not null default false,
  add column if not exists final_statement_url text;

alter table if exists public.vendors
  add column if not exists legal_entity_name text,
  add column if not exists public_trade_name text,
  add column if not exists business_address text,
  add column if not exists business_phone text,
  add column if not exists authorised_representative text,
  add column if not exists pan text,
  add column if not exists gstin text,
  add column if not exists fssai_license text,
  add column if not exists drug_license text,
  add column if not exists other_registrations jsonb not null default '[]'::jsonb,
  add column if not exists verification_status text not null default 'pending'
    check (verification_status in ('pending', 'under_review', 'verified', 'rejected', 'suspended', 'expired')),
  add column if not exists verification_reviewed_by uuid,
  add column if not exists verification_reviewed_at timestamptz,
  add column if not exists verification_expires_at date,
  add column if not exists verification_documents jsonb not null default '[]'::jsonb,
  add column if not exists verification_discrepancies jsonb not null default '[]'::jsonb,
  add column if not exists verification_declaration_accepted boolean not null default false,
  add column if not exists verification_declaration_accepted_at timestamptz,
  add column if not exists public_profile_consent boolean not null default false;

create table if not exists public.vendor_verification_audit (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  previous_status text,
  next_status text not null,
  reviewed_by uuid,
  reviewed_at timestamptz not null default now(),
  documents_reviewed jsonb not null default '[]'::jsonb,
  discrepancies jsonb not null default '[]'::jsonb,
  mandatory_reason text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_vendor_verification_audit_vendor
  on public.vendor_verification_audit(vendor_id, reviewed_at desc);

alter table public.vendor_verification_audit enable row level security;

drop policy if exists "Admins read vendor verification audit" on public.vendor_verification_audit;
drop policy if exists "Vendor owners read own verification audit" on public.vendor_verification_audit;

drop policy if exists "Admins read vendor verification audit" on public.vendor_verification_audit;
create policy "Admins read vendor verification audit"
  on public.vendor_verification_audit for select
  to authenticated
  using (public.is_company_admin());

drop policy if exists "Vendor owners read own verification audit" on public.vendor_verification_audit;
create policy "Vendor owners read own verification audit"
  on public.vendor_verification_audit for select
  to authenticated
  using (public.owns_vendor(vendor_id));

-- Religion must not be collected, ranked, investigated or disclosed as part of
-- vendor verification. Verification is based on lawful business identity,
-- address, category-specific licences and objective platform rules only.

create or replace function public.record_vendor_initial_activation_payment(
  p_vendor_id uuid,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_razorpay_signature text,
  p_payment_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.vendor_security_wallets%rowtype;
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
  v_now timestamptz := now();
begin
  select *
    into v_wallet
  from public.vendor_security_wallets
  where vendor_id = p_vendor_id
  for update;

  if not found then
    insert into public.vendor_security_wallets (
      vendor_id,
      opening_balance,
      current_balance,
      minimum_security_deposit,
      wallet_credit_amount,
      activation_fee_paid,
      reminder_threshold,
      final_warning_threshold,
      stop_orders_threshold,
      operational_minimum_balance,
      eligibility_status
    )
    values (
      p_vendor_id,
      0,
      0,
      5000,
      5000,
      false,
      1000,
      500,
      515,
      515,
      'security_deposit_required'
    )
    returning * into v_wallet;
  end if;

  if v_wallet.activation_fee_paid then
    return to_jsonb(v_wallet);
  end if;

  if exists (
    select 1
    from public.vendor_security_wallet_transactions
    where vendor_id = p_vendor_id
      and transaction_type = 'activation_fee'
  ) then
    update public.vendor_security_wallets
    set activation_fee_paid = true,
        updated_at = v_now
    where id = v_wallet.id
    returning * into v_wallet;

    return to_jsonb(v_wallet);
  end if;

  v_balance_before := coalesce(v_wallet.current_balance, 0);
  v_balance_after := v_balance_before + 5000;

  update public.vendor_security_wallets
  set opening_balance = 5000,
      current_balance = v_balance_after,
      minimum_security_deposit = 5000,
      wallet_credit_amount = 5000,
      initial_payment_amount = 5500,
      activation_fee_paid = true,
      activation_fee_amount = 500,
      activation_fee_payment_id = p_razorpay_payment_id,
      activation_fee_paid_at = v_now,
      eligibility_status = 'eligible',
      updated_at = v_now
  where id = v_wallet.id
  returning * into v_wallet;

  insert into public.vendor_security_wallet_transactions (
    wallet_id,
    vendor_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    payment_reference,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    is_refundable,
    metadata
  )
  values
    (
      v_wallet.id,
      p_vendor_id,
      'payment_received',
      5500,
      v_balance_before,
      v_balance_before,
      p_razorpay_payment_id,
      p_razorpay_order_id,
      p_razorpay_payment_id,
      p_razorpay_signature,
      false,
      p_payment_metadata || jsonb_build_object('accounting_entry', 'PAYMENT_RECEIVED')
    ),
    (
      v_wallet.id,
      p_vendor_id,
      'activation_fee',
      -500,
      v_balance_before,
      v_balance_before,
      p_razorpay_payment_id,
      p_razorpay_order_id,
      p_razorpay_payment_id,
      p_razorpay_signature,
      false,
      p_payment_metadata || jsonb_build_object('accounting_entry', 'NON_REFUNDABLE_ACTIVATION_FEE')
    ),
    (
      v_wallet.id,
      p_vendor_id,
      'security_deposit',
      5000,
      v_balance_before,
      v_balance_after,
      p_razorpay_payment_id,
      p_razorpay_order_id,
      p_razorpay_payment_id,
      p_razorpay_signature,
      true,
      p_payment_metadata || jsonb_build_object('accounting_entry', 'REFUNDABLE_WALLET_CREDIT')
    );

  return to_jsonb(v_wallet);
end;
$$;

revoke all on function public.record_vendor_initial_activation_payment(uuid, text, text, text, jsonb) from public;
grant execute on function public.record_vendor_initial_activation_payment(uuid, text, text, text, jsonb) to service_role;


-- ============================================================================
-- 202607290001_rights_compliant_master_product_catalogue.sql
-- ============================================================================
-- Rights-compliant SabSewa Local Master Product Catalogue.
-- This stores product structure and lawful image references only.
-- No third-party commercial website images, descriptions, logos or photos are included.

create extension if not exists "pgcrypto";

alter table public.catalog_items
  add column if not exists standard_title text,
  add column if not exists subcategory text,
  add column if not exists local_names jsonb not null default '{}'::jsonb,
  add column if not exists common_units text[] not null default '{}'::text[],
  add column if not exists brand_name text,
  add column if not exists pack_size text,
  add column if not exists search_keywords text[] not null default '{}'::text[],
  add column if not exists alternative_spellings text[] not null default '{}'::text[],
  add column if not exists image_status text not null default 'image_pending'
    check (image_status in ('image_pending', 'vendor_contributed_pending', 'approved_shared_image', 'private_vendor_image', 'takedown_disabled')),
  add column if not exists rights_notes text not null default 'No external third-party image is authorised for this master product by default.';

create table if not exists public.master_product_catalog (
  id uuid primary key default gen_random_uuid(),
  standard_title text not null,
  category text not null check (category in ('kirana', 'vegetables', 'fruits')),
  subcategory text not null,
  local_names jsonb not null default '{}'::jsonb,
  common_units text[] not null default '{}'::text[],
  brand_name text,
  pack_size text,
  search_keywords text[] not null default '{}'::text[],
  alternative_spellings text[] not null default '{}'::text[],
  image_status text not null default 'image_pending'
    check (image_status in ('image_pending', 'vendor_contributed_pending', 'approved_shared_image', 'private_vendor_image', 'takedown_disabled')),
  image_policy_note text not null default 'Use only vendor-contributed, manufacturer-authorised, properly licensed, or SabSewa-commissioned images.',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.master_product_image_consents (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.master_product_catalog(id) on delete restrict,
  source_vendor_id uuid references public.vendors(id) on delete restrict,
  source_user_id uuid,
  consent_text text not null,
  consent_terms_version text not null,
  original_filename text,
  content_checksum text not null,
  perceptual_hash text,
  declared_ownership boolean not null default false,
  allow_shared_catalogue_use boolean not null default false,
  consented_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawal_reason text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.master_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.master_product_catalog(id) on delete restrict,
  product_title text not null,
  category text not null,
  subcategory text not null,
  s3_object_key text not null unique,
  thumbnail_object_key text not null unique,
  source_type text not null check (source_type in ('vendor_contributed', 'manufacturer_distributor_permission', 'commercial_reuse_licence', 'sabsewa_commissioned')),
  source_vendor_id uuid references public.vendors(id) on delete restrict,
  source_user_id uuid,
  licence_or_consent_reference uuid references public.master_product_image_consents(id) on delete restrict,
  consent_timestamp timestamptz,
  original_filename text,
  content_checksum text not null unique,
  perceptual_hash text,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected', 'disabled', 'takedown_pending')),
  approval_administrator uuid,
  approved_at timestamptz,
  rejection_reason text,
  withdrawal_requested_at timestamptz,
  withdrawal_reason text,
  takedown_status text not null default 'none'
    check (takedown_status in ('none', 'disputed', 'disabled', 'resolved')),
  takedown_reason text,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.master_product_image_takedown_audit (
  id uuid primary key default gen_random_uuid(),
  master_image_id uuid not null references public.master_product_images(id) on delete restrict,
  action text not null check (action in ('dispute_reported', 'disabled', 'reinstated', 'rejected', 'withdrawal_requested', 'withdrawal_accepted')),
  actor_user_id uuid,
  actor_role text,
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.vendor_items
  add column if not exists master_product_id uuid references public.master_product_catalog(id) on delete set null,
  add column if not exists master_image_id uuid references public.master_product_images(id) on delete set null,
  add column if not exists image_reference_type text not null default 'vendor_private'
    check (image_reference_type in ('vendor_private', 'master_shared', 'image_pending'));

create index if not exists idx_master_product_catalog_category
  on public.master_product_catalog(category, subcategory, standard_title);

create index if not exists idx_master_product_catalog_keywords
  on public.master_product_catalog using gin(search_keywords);

create unique index if not exists uniq_master_product_catalog_business_key
  on public.master_product_catalog (
    standard_title,
    category,
    subcategory,
    coalesce(brand_name, ''),
    coalesce(pack_size, '')
  );

create index if not exists idx_master_product_images_product_status
  on public.master_product_images(product_id, moderation_status, takedown_status);

alter table public.master_product_catalog enable row level security;
alter table public.master_product_image_consents enable row level security;
alter table public.master_product_images enable row level security;
alter table public.master_product_image_takedown_audit enable row level security;

drop policy if exists "Authenticated users read active master catalogue" on public.master_product_catalog;
drop policy if exists "Authenticated users read active master catalogue" on public.master_product_catalog;
create policy "Authenticated users read active master catalogue"
  on public.master_product_catalog for select
  to authenticated
  using (is_active = true);

drop policy if exists "Admins manage master catalogue" on public.master_product_catalog;
drop policy if exists "Admins manage master catalogue" on public.master_product_catalog;
create policy "Admins manage master catalogue"
  on public.master_product_catalog for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

drop policy if exists "Vendors read own image consents" on public.master_product_image_consents;
drop policy if exists "Vendors read own image consents" on public.master_product_image_consents;
create policy "Vendors read own image consents"
  on public.master_product_image_consents for select
  to authenticated
  using (public.owns_vendor(source_vendor_id) or public.is_company_admin());

drop policy if exists "Users read approved active master images" on public.master_product_images;
drop policy if exists "Users read approved active master images" on public.master_product_images;
create policy "Users read approved active master images"
  on public.master_product_images for select
  to authenticated
  using (moderation_status = 'approved' and takedown_status = 'none');

drop policy if exists "Admins read all master images" on public.master_product_images;
drop policy if exists "Admins read all master images" on public.master_product_images;
create policy "Admins read all master images"
  on public.master_product_images for select
  to authenticated
  using (public.is_company_admin());

drop policy if exists "Admins read takedown audit" on public.master_product_image_takedown_audit;
drop policy if exists "Admins read takedown audit" on public.master_product_image_takedown_audit;
create policy "Admins read takedown audit"
  on public.master_product_image_takedown_audit for select
  to authenticated
  using (public.is_company_admin());

-- Inserts, approval, withdrawal and takedown actions should be performed by
-- protected backend service-role routes with full audit metadata.

insert into public.master_product_catalog
  (standard_title, category, subcategory, local_names, common_units, brand_name, pack_size, search_keywords, alternative_spellings, image_status)
values
  ('Rice', 'kirana', 'staples', '{"hi":["chawal"],"bn":["chal"],"ta":["arisi"],"kn":["akki"]}', array['kg','gram','packet'], null, null, array['rice','chawal','raw rice','boiled rice'], array['chaval','chaawal'], 'image_pending'),
  ('Wheat Flour', 'kirana', 'staples', '{"hi":["atta"],"pa":["atta"],"mr":["kanik"]}', array['kg','packet'], null, null, array['wheat flour','atta','chakki atta'], array['aata'], 'image_pending'),
  ('Besan', 'kirana', 'staples', '{"hi":["besan"],"gu":["chana lot"]}', array['gram','kg','packet'], null, null, array['besan','gram flour','chana flour'], array['basan'], 'image_pending'),
  ('Toor Dal', 'kirana', 'pulses', '{"hi":["arhar dal","toor dal"],"kn":["togari bele"]}', array['kg','gram','packet'], null, null, array['toor dal','arhar dal','pigeon pea'], array['tur dal'], 'image_pending'),
  ('Moong Dal', 'kirana', 'pulses', '{"hi":["moong dal"],"kn":["hesaru bele"]}', array['kg','gram','packet'], null, null, array['moong dal','green gram dal'], array['mung dal'], 'image_pending'),
  ('Masoor Dal', 'kirana', 'pulses', '{"hi":["masoor dal"]}', array['kg','gram','packet'], null, null, array['masoor dal','red lentil'], array['massor dal'], 'image_pending'),
  ('Chana Dal', 'kirana', 'pulses', '{"hi":["chana dal"]}', array['kg','gram','packet'], null, null, array['chana dal','bengal gram'], array['channa dal'], 'image_pending'),
  ('Sugar', 'kirana', 'staples', '{"hi":["chini","shakkar"]}', array['kg','gram','packet'], null, null, array['sugar','chini','shakkar'], array['cheeni'], 'image_pending'),
  ('Salt', 'kirana', 'staples', '{"hi":["namak"]}', array['kg','gram','packet'], null, null, array['salt','namak','iodised salt'], array['namak'], 'image_pending'),
  ('Jaggery', 'kirana', 'staples', '{"hi":["gud"]}', array['kg','gram','piece'], null, null, array['jaggery','gud'], array['gur'], 'image_pending'),
  ('Cooking Oil', 'kirana', 'staples', '{"hi":["tel"],"kn":["enne"]}', array['litre','ml','packet','bottle'], null, null, array['cooking oil','edible oil','tel'], array['oil'], 'image_pending'),
  ('Mustard Oil', 'kirana', 'staples', '{"hi":["sarson ka tel"]}', array['litre','ml','bottle'], null, null, array['mustard oil','sarson oil'], array['sarso tel'], 'image_pending'),
  ('Turmeric Powder', 'kirana', 'spices', '{"hi":["haldi powder"],"kn":["arisina pudi"]}', array['gram','packet'], null, null, array['turmeric','haldi','haldi powder'], array['haldi'], 'image_pending'),
  ('Red Chilli Powder', 'kirana', 'spices', '{"hi":["lal mirch powder"]}', array['gram','packet'], null, null, array['red chilli powder','lal mirch'], array['chili powder','mirchi powder'], 'image_pending'),
  ('Coriander Powder', 'kirana', 'spices', '{"hi":["dhaniya powder"]}', array['gram','packet'], null, null, array['coriander powder','dhaniya powder'], array['dhaniya'], 'image_pending'),
  ('Cumin Seeds', 'kirana', 'spices', '{"hi":["jeera"]}', array['gram','packet'], null, null, array['cumin','jeera','cumin seeds'], array['jira'], 'image_pending'),
  ('Garam Masala', 'kirana', 'spices', '{"hi":["garam masala"]}', array['gram','packet'], null, null, array['garam masala','spice mix'], array['garam masala powder'], 'image_pending'),
  ('Tea', 'kirana', 'beverages', '{"hi":["chai patti"]}', array['gram','packet'], null, null, array['tea','chai','chai patti'], array['tea powder'], 'image_pending'),
  ('Coffee', 'kirana', 'beverages', '{"hi":["coffee"]}', array['gram','packet','bottle'], null, null, array['coffee','coffee powder'], array['cofee'], 'image_pending'),
  ('Milk', 'kirana', 'dairy', '{"hi":["doodh"],"ta":["paal"],"kn":["haalu"]}', array['litre','ml','packet'], null, null, array['milk','doodh','packet milk'], array['dudh'], 'image_pending'),
  ('Curd', 'kirana', 'dairy', '{"hi":["dahi"]}', array['gram','kg','packet','cup'], null, null, array['curd','dahi','yogurt'], array['yoghurt'], 'image_pending'),
  ('Paneer', 'kirana', 'dairy', '{"hi":["paneer"]}', array['gram','packet'], null, null, array['paneer','cottage cheese'], array['panir'], 'image_pending'),
  ('Bread', 'kirana', 'packaged-food', '{"hi":["bread"]}', array['packet','piece'], null, null, array['bread','loaf'], array['bred'], 'image_pending'),
  ('Biscuits', 'kirana', 'packaged-food', '{"hi":["biscuit"]}', array['packet'], null, null, array['biscuits','cookies','biscuit packet'], array['biskut'], 'image_pending'),
  ('Noodles', 'kirana', 'packaged-food', '{"hi":["noodles"]}', array['packet'], null, null, array['noodles','instant noodles'], array['nudles'], 'image_pending'),
  ('Soap', 'kirana', 'personal-care', '{"hi":["sabun"]}', array['piece','pack'], null, null, array['soap','bath soap','sabun'], array['saabun'], 'image_pending'),
  ('Shampoo', 'kirana', 'personal-care', '{"hi":["shampoo"]}', array['ml','bottle','sachet'], null, null, array['shampoo','hair wash'], array['shampu'], 'image_pending'),
  ('Toothpaste', 'kirana', 'personal-care', '{"hi":["toothpaste","dant manjan"]}', array['gram','tube'], null, null, array['toothpaste','dental cream'], array['tooth paste'], 'image_pending'),
  ('Detergent Powder', 'kirana', 'household', '{"hi":["detergent powder"]}', array['kg','gram','packet'], null, null, array['detergent','washing powder'], array['detergent'], 'image_pending'),
  ('Dishwash Bar', 'kirana', 'household', '{"hi":["bartan sabun"]}', array['piece','pack'], null, null, array['dishwash bar','dish wash soap'], array['dish bar'], 'image_pending'),
  ('Potato', 'vegetables', 'root-vegetables', '{"hi":["aloo"],"bn":["alu"],"ta":["urulai"],"kn":["alugadde"]}', array['kg','gram'], null, null, array['potato','aloo'], array['alu'], 'image_pending'),
  ('Onion', 'vegetables', 'bulb-vegetables', '{"hi":["pyaz"],"bn":["peyaj"],"ta":["vengayam"],"kn":["eerulli"]}', array['kg','gram'], null, null, array['onion','pyaz'], array['pyaaz'], 'image_pending'),
  ('Tomato', 'vegetables', 'common-vegetables', '{"hi":["tamatar"],"ta":["thakkali"],"kn":["tomato"]}', array['kg','gram'], null, null, array['tomato','tamatar'], array['tomatoe'], 'image_pending'),
  ('Green Chilli', 'vegetables', 'common-vegetables', '{"hi":["hari mirch"]}', array['gram','kg'], null, null, array['green chilli','hari mirch'], array['green chili'], 'image_pending'),
  ('Ginger', 'vegetables', 'root-vegetables', '{"hi":["adrak"]}', array['gram','kg'], null, null, array['ginger','adrak'], array['adarak'], 'image_pending'),
  ('Garlic', 'vegetables', 'bulb-vegetables', '{"hi":["lahsun"]}', array['gram','kg'], null, null, array['garlic','lahsun'], array['lasun'], 'image_pending'),
  ('Coriander Leaves', 'vegetables', 'leafy-vegetables', '{"hi":["hara dhaniya"]}', array['bunch','gram'], null, null, array['coriander leaves','hara dhaniya','cilantro'], array['dhaniya leaves'], 'image_pending'),
  ('Spinach', 'vegetables', 'leafy-vegetables', '{"hi":["palak"]}', array['bunch','gram','kg'], null, null, array['spinach','palak'], array['paalak'], 'image_pending'),
  ('Cauliflower', 'vegetables', 'common-vegetables', '{"hi":["phool gobhi"]}', array['piece','kg'], null, null, array['cauliflower','phool gobhi'], array['gobi'], 'image_pending'),
  ('Cabbage', 'vegetables', 'common-vegetables', '{"hi":["patta gobhi"]}', array['piece','kg'], null, null, array['cabbage','patta gobhi'], array['band gobhi'], 'image_pending'),
  ('Carrot', 'vegetables', 'root-vegetables', '{"hi":["gajar"]}', array['kg','gram'], null, null, array['carrot','gajar'], array['gazar'], 'image_pending'),
  ('Beans', 'vegetables', 'common-vegetables', '{"hi":["beans","sem"]}', array['kg','gram'], null, null, array['beans','green beans'], array['french beans'], 'image_pending'),
  ('Capsicum', 'vegetables', 'common-vegetables', '{"hi":["shimla mirch"]}', array['kg','gram','piece'], null, null, array['capsicum','bell pepper','shimla mirch'], array['capcicum'], 'image_pending'),
  ('Brinjal', 'vegetables', 'common-vegetables', '{"hi":["baingan"],"ta":["kathirikai"]}', array['kg','gram'], null, null, array['brinjal','baingan','eggplant'], array['brinjal'], 'image_pending'),
  ('Bottle Gourd', 'vegetables', 'gourds', '{"hi":["lauki","dudhi"]}', array['piece','kg'], null, null, array['bottle gourd','lauki','dudhi'], array['ghiya'], 'image_pending'),
  ('Bitter Gourd', 'vegetables', 'gourds', '{"hi":["karela"]}', array['kg','gram'], null, null, array['bitter gourd','karela'], array['karela'], 'image_pending'),
  ('Cucumber', 'vegetables', 'common-vegetables', '{"hi":["kheera"]}', array['kg','piece'], null, null, array['cucumber','kheera'], array['khira'], 'image_pending'),
  ('Peas', 'vegetables', 'common-vegetables', '{"hi":["matar"]}', array['kg','gram'], null, null, array['peas','matar','green peas'], array['mutter'], 'image_pending'),
  ('Lemon', 'vegetables', 'common-vegetables', '{"hi":["nimbu"]}', array['piece','dozen','kg'], null, null, array['lemon','nimbu'], array['limbu'], 'image_pending'),
  ('Apple', 'fruits', 'fresh-fruits', '{"hi":["seb"]}', array['kg','piece'], null, null, array['apple','seb'], array['aple'], 'image_pending'),
  ('Banana', 'fruits', 'fresh-fruits', '{"hi":["kela"]}', array['dozen','piece'], null, null, array['banana','kela'], array['bananna'], 'image_pending'),
  ('Orange', 'fruits', 'fresh-fruits', '{"hi":["santra"]}', array['kg','piece','dozen'], null, null, array['orange','santra'], array['santara'], 'image_pending'),
  ('Mango', 'fruits', 'seasonal-fruits', '{"hi":["aam"]}', array['kg','piece','dozen'], null, null, array['mango','aam'], array['mangoes'], 'image_pending'),
  ('Grapes', 'fruits', 'fresh-fruits', '{"hi":["angoor"]}', array['kg','gram'], null, null, array['grapes','angoor'], array['grape'], 'image_pending'),
  ('Pomegranate', 'fruits', 'fresh-fruits', '{"hi":["anar"]}', array['kg','piece'], null, null, array['pomegranate','anar'], array['pomogranate'], 'image_pending'),
  ('Papaya', 'fruits', 'fresh-fruits', '{"hi":["papita"]}', array['kg','piece'], null, null, array['papaya','papita'], array['papita'], 'image_pending'),
  ('Watermelon', 'fruits', 'seasonal-fruits', '{"hi":["tarbooj"]}', array['piece','kg'], null, null, array['watermelon','tarbooj'], array['tarbuj'], 'image_pending'),
  ('Muskmelon', 'fruits', 'seasonal-fruits', '{"hi":["kharbooja"]}', array['piece','kg'], null, null, array['muskmelon','kharbooja'], array['kharbuja'], 'image_pending'),
  ('Guava', 'fruits', 'fresh-fruits', '{"hi":["amrood"]}', array['kg','piece'], null, null, array['guava','amrood'], array['amrud'], 'image_pending'),
  ('Pineapple', 'fruits', 'fresh-fruits', '{"hi":["ananas"]}', array['piece','kg'], null, null, array['pineapple','ananas'], array['annanas'], 'image_pending'),
  ('Coconut', 'fruits', 'fresh-fruits', '{"hi":["nariyal"]}', array['piece'], null, null, array['coconut','nariyal'], array['narial'], 'image_pending'),
  ('Sweet Lime', 'fruits', 'fresh-fruits', '{"hi":["mosambi"]}', array['kg','piece','dozen'], null, null, array['sweet lime','mosambi'], array['mausambi'], 'image_pending')
on conflict do nothing;

insert into public.catalog_items
  (name, standard_title, category, subcategory, image_url, default_unit, local_names, common_units, brand_name, pack_size, search_keywords, alternative_spellings, image_status, rights_notes)
select
  standard_title,
  standard_title,
  category,
  subcategory,
  null,
  coalesce(common_units[1], 'piece'),
  local_names,
  common_units,
  brand_name,
  pack_size,
  search_keywords,
  alternative_spellings,
  image_status,
  image_policy_note
from public.master_product_catalog
where not exists (
  select 1
  from public.catalog_items ci
  where coalesce(ci.standard_title, ci.name) = public.master_product_catalog.standard_title
    and ci.category = public.master_product_catalog.category
    and coalesce(ci.subcategory, '') = public.master_product_catalog.subcategory
    and coalesce(ci.brand_name, '') = coalesce(public.master_product_catalog.brand_name, '')
    and coalesce(ci.pack_size, '') = coalesce(public.master_product_catalog.pack_size, '')
);


-- ============================================================================
-- 202607290002_brand_variant_vendor_listing_workflow.sql
-- ============================================================================
-- Brand, variant and missing-item workflow for SabSewa Local.
-- Generic master products remain separate from brand/pack-size purchasable variants.

create extension if not exists "pgcrypto";

create table if not exists public.product_brands (
  id uuid primary key default gen_random_uuid(),
  master_product_id uuid not null references public.master_product_catalog(id) on delete restrict,
  brand_name text not null,
  manufacturer text,
  source_status text not null default 'approved'
    check (source_status in ('approved', 'pending_review', 'rejected', 'disabled')),
  submitted_by_vendor_id uuid references public.vendors(id) on delete set null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_product_brands_business_key
  on public.product_brands (
    master_product_id,
    lower(brand_name),
    coalesce(lower(manufacturer), '')
  );

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  master_product_id uuid not null references public.master_product_catalog(id) on delete restrict,
  product_brand_id uuid references public.product_brands(id) on delete restrict,
  variant_name text,
  pack_size numeric(10,2),
  pack_unit text,
  barcode text,
  sku text,
  ean text,
  mrp numeric(10,2),
  source_status text not null default 'approved'
    check (source_status in ('approved', 'pending_review', 'rejected', 'disabled')),
  submitted_by_vendor_id uuid references public.vendors(id) on delete set null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pack_size is null or pack_size > 0)
);

create unique index if not exists uniq_product_variants_business_key
  on public.product_variants (
    master_product_id,
    coalesce(product_brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(lower(variant_name), ''),
    coalesce(pack_size, 0),
    coalesce(lower(pack_unit), ''),
    coalesce(lower(barcode), ''),
    coalesce(lower(sku), ''),
    coalesce(lower(ean), '')
  );

alter table public.vendor_items
  add column if not exists product_brand_id uuid references public.product_brands(id) on delete set null,
  add column if not exists product_variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists generic_product_name text,
  add column if not exists brand_name text,
  add column if not exists manufacturer text,
  add column if not exists variant_name text,
  add column if not exists pack_size numeric(10,2),
  add column if not exists pack_unit text,
  add column if not exists mrp numeric(10,2),
  add column if not exists barcode text,
  add column if not exists sku text,
  add column if not exists ean text,
  add column if not exists expiry_date date,
  add column if not exists best_before_date date,
  add column if not exists substitution_policy text not null default 'customer_approval_required'
    check (substitution_policy in ('no_substitution', 'customer_approval_required', 'allow_same_brand_different_pack', 'allow_any_brand_with_customer_approval')),
  add column if not exists listing_review_status text not null default 'approved'
    check (listing_review_status in ('approved', 'pending_review', 'rejected', 'disabled')),
  add column if not exists listing_review_reason text;

create table if not exists public.customer_item_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  terminal_id uuid references public.vendor_terminals(id) on delete set null,
  item_name text not null,
  preferred_brand text,
  required_variant text,
  pack_size text,
  quantity text,
  optional_photo_key text,
  barcode text,
  voice_description text,
  allow_other_brand boolean not null default false,
  customer_notes text,
  status text not null default 'pending_vendor_response'
    check (status in ('pending_vendor_response', 'available_as_requested', 'alternative_available', 'partially_available', 'not_available', 'customer_approved_alternative', 'closed')),
  vendor_response jsonb not null default '{}'::jsonb,
  customer_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendor_items_variant_lookup
  on public.vendor_items(vendor_id, terminal_id, master_product_id, product_brand_id, product_variant_id, available_today, stock_status);

create index if not exists idx_vendor_items_brand_search
  on public.vendor_items(vendor_id, terminal_id, lower(coalesce(generic_product_name, item_name)), lower(coalesce(brand_name, '')), lower(coalesce(variant_name, '')));

create index if not exists idx_customer_item_requests_vendor_status
  on public.customer_item_requests(vendor_id, status, created_at desc);

alter table public.product_brands enable row level security;
alter table public.product_variants enable row level security;
alter table public.customer_item_requests enable row level security;

drop policy if exists "Users read approved product brands" on public.product_brands;
drop policy if exists "Users read approved product brands" on public.product_brands;
create policy "Users read approved product brands"
  on public.product_brands for select
  to authenticated
  using (source_status = 'approved' or public.is_company_admin() or public.owns_vendor(submitted_by_vendor_id));

drop policy if exists "Users read approved product variants" on public.product_variants;
drop policy if exists "Users read approved product variants" on public.product_variants;
create policy "Users read approved product variants"
  on public.product_variants for select
  to authenticated
  using (source_status = 'approved' or public.is_company_admin() or public.owns_vendor(submitted_by_vendor_id));

drop policy if exists "Customers read own item requests" on public.customer_item_requests;
drop policy if exists "Customers read own item requests" on public.customer_item_requests;
create policy "Customers read own item requests"
  on public.customer_item_requests for select
  to authenticated
  using (customer_id = auth.uid() or public.owns_vendor(vendor_id) or public.is_company_admin());

-- Writes and vendor responses should use protected backend routes so
-- selected vendor/terminal/listing references are revalidated.


-- ============================================================================
-- 202607290003_daily_product_availability_management.sql
-- ============================================================================
-- Daily product availability management for SabSewa Local.
-- Keeps vendor catalogues persistent while allowing each vendor to decide what is orderable today.

alter table public.vendor_items
  add column if not exists daily_availability_status text not null default 'available'
    check (daily_availability_status in ('available', 'limited_stock', 'temporarily_unavailable', 'out_of_stock', 'available_on_request')),
  add column if not exists daily_availability_reason text,
  add column if not exists expected_restock_at timestamptz,
  add column if not exists availability_review_policy text not null default 'keep_last_confirmed'
    check (availability_review_policy in ('keep_last_confirmed', 'confirm_every_day', 'auto_unavailable_fresh')),
  add column if not exists availability_reviewed_at timestamptz,
  add column if not exists availability_reviewed_by uuid;

create table if not exists public.vendor_item_availability_audit (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  terminal_id uuid references public.vendor_terminals(id) on delete set null,
  vendor_item_id uuid not null references public.vendor_items(id) on delete restrict,
  previous_status text,
  new_status text not null,
  previous_available_today boolean,
  new_available_today boolean not null,
  previous_quantity numeric,
  new_quantity numeric,
  reason text,
  effective_at timestamptz not null default now(),
  expected_restock_at timestamptz,
  changed_by uuid,
  device_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_vendor_items_daily_status
  on public.vendor_items(vendor_id, terminal_id, daily_availability_status, available_today, availability_reviewed_at);

create index if not exists idx_vendor_item_availability_audit_lookup
  on public.vendor_item_availability_audit(vendor_id, terminal_id, vendor_item_id, created_at desc);

alter table public.vendor_item_availability_audit enable row level security;

drop policy if exists "Vendors and admins read availability audit" on public.vendor_item_availability_audit;
drop policy if exists "Vendors and admins read availability audit" on public.vendor_item_availability_audit;
create policy "Vendors and admins read availability audit"
  on public.vendor_item_availability_audit for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

-- Writes should use protected backend routes so vendor, terminal and item ownership are rechecked.


-- ============================================================================
-- 202607300001_gemini_translation_cache_usage.sql
-- ============================================================================
-- SabSewa Local Gemini Flash dynamic translation cache and usage reporting.
-- Run this in the SabSewa Local Supabase project: https://xodmazgfibftorrlbotk.supabase.co

create table if not exists public.gemini_translation_cache (
  id uuid primary key default gen_random_uuid(),
  source_text_hash text not null,
  source_language text not null default 'auto',
  target_language text not null,
  content_type text not null,
  model_name text not null,
  translation_version text not null,
  translated_text text not null,
  is_approved boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_text_hash, source_language, target_language, content_type, model_name, translation_version)
);

create table if not exists public.gemini_translation_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  vendor_id uuid null,
  order_id uuid null,
  source_language text not null default 'auto',
  target_language text not null,
  content_type text not null,
  model_name text not null,
  cache_hit boolean not null default false,
  input_chars integer not null default 0,
  output_chars integer not null default 0,
  estimated_tokens integer not null default 0,
  estimated_cost_inr numeric(12, 6) not null default 0,
  latency_ms integer null,
  source_text_hash text null,
  privacy_redacted boolean not null default true,
  validation_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_gemini_translation_cache_lookup
  on public.gemini_translation_cache (source_text_hash, source_language, target_language, content_type, translation_version);

create index if not exists idx_gemini_translation_usage_created
  on public.gemini_translation_usage (created_at desc);

create index if not exists idx_gemini_translation_usage_vendor
  on public.gemini_translation_usage (vendor_id, created_at desc);

alter table public.gemini_translation_cache enable row level security;
alter table public.gemini_translation_usage enable row level security;

drop policy if exists "Translation cache server managed" on public.gemini_translation_cache;
drop policy if exists "Translation cache server managed" on public.gemini_translation_cache;
create policy "Translation cache server managed"
  on public.gemini_translation_cache
  for all
  using (false)
  with check (false);

drop policy if exists "Translation usage server managed" on public.gemini_translation_usage;
drop policy if exists "Translation usage server managed" on public.gemini_translation_usage;
create policy "Translation usage server managed"
  on public.gemini_translation_usage
  for all
  using (false)
  with check (false);

comment on table public.gemini_translation_cache is
  'Server-managed cache for privacy-redacted Gemini Flash dynamic translations. Clients must access through backend only.';

comment on table public.gemini_translation_usage is
  'Server-managed Gemini Flash translation usage ledger for cost controls, XPRIZE evidence, and Company CRM reporting.';


-- ============================================================================
-- 202607310001_bengaluru_languages_registration_delivery_pwa.sql
-- ============================================================================
-- SabSewa Local launch-language, reliable registration and delivery-safety update.
-- Run in the SabSewa Local Supabase project after earlier successful migrations.

alter table public.user_profiles
  add column if not exists primary_address text,
  add column if not exists registration_completed_at timestamptz,
  add column if not exists last_login_at timestamptz;

create unique index if not exists uniq_customer_addresses_customer_label
  on public.customer_addresses(customer_id, label);

create unique index if not exists uniq_user_policy_acceptance_version
  on public.user_policy_acceptances(user_id, terms_version, privacy_version, policy_bundle_version, displayed_language);

alter table public.vendor_terminals
  add column if not exists free_delivery_min_order numeric(10,2) not null default 500 check (free_delivery_min_order >= 0),
  add column if not exists delivery_fee_below_min numeric(10,2) not null default 30 check (delivery_fee_below_min >= 0),
  add column if not exists service_radius_meters integer not null default 500 check (service_radius_meters between 100 and 1000),
  add column if not exists estimated_delivery_min_minutes integer not null default 30 check (estimated_delivery_min_minutes between 15 and 240),
  add column if not exists estimated_delivery_max_minutes integer not null default 60 check (estimated_delivery_max_minutes between 15 and 240),
  add column if not exists delivery_available boolean not null default true,
  add column if not exists pickup_available boolean not null default true,
  add column if not exists delivery_provider_type text not null default 'vendor'
    check (delivery_provider_type in ('vendor', 'authorised_provider'));

alter table public.hyperlocal_orders
  add column if not exists delivery_charge numeric(10,2) not null default 0 check (delivery_charge >= 0),
  add column if not exists free_delivery_min_order numeric(10,2) not null default 0 check (free_delivery_min_order >= 0),
  add column if not exists estimated_delivery_window text,
  add column if not exists delivery_provider_type text not null default 'vendor'
    check (delivery_provider_type in ('vendor', 'authorised_provider')),
  add column if not exists delivery_safety_notice text not null default
    'The delivery time shown is an estimate provided by the vendor and is not a guaranteed deadline. SabSewa Local does not support unsafe or unrealistic delivery commitments. Actual delivery time may vary, and road safety will always take priority over speed.';

create table if not exists public.vendor_delivery_settings_audit (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  terminal_id uuid not null references public.vendor_terminals(id) on delete cascade,
  changed_by_user_id uuid,
  previous_settings jsonb not null default '{}'::jsonb,
  new_settings jsonb not null default '{}'::jsonb,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_vendor_delivery_settings_audit_vendor
  on public.vendor_delivery_settings_audit(vendor_id, created_at desc);

alter table public.vendor_delivery_settings_audit enable row level security;

drop policy if exists "Vendors read own delivery settings audit" on public.vendor_delivery_settings_audit;
drop policy if exists "Vendors read own delivery settings audit" on public.vendor_delivery_settings_audit;
create policy "Vendors read own delivery settings audit"
  on public.vendor_delivery_settings_audit
  for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Admins read all delivery settings audit" on public.vendor_delivery_settings_audit;
drop policy if exists "Admins read all delivery settings audit" on public.vendor_delivery_settings_audit;
create policy "Admins read all delivery settings audit"
  on public.vendor_delivery_settings_audit
  for select
  to authenticated
  using (public.is_company_admin());

comment on table public.vendor_delivery_settings_audit is
  'Audit trail for vendor/terminal delivery fee, free-delivery threshold, service radius, pickup and estimated delivery-window changes.';

comment on column public.hyperlocal_orders.delivery_safety_notice is
  'Snapshot of the customer-facing safe-delivery statement shown before order confirmation.';


-- ============================================================================
-- 202607310002_razorpay_environment_safeguards.sql
-- ============================================================================
-- Razorpay Test/Live environment safeguards for SabSewa Local.
-- Test-mode payment attempts are recorded separately and must not credit
-- production vendor wallets or activate commercial orders.

create table if not exists public.vendor_payment_test_events (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.vendors(id) on delete set null,
  razorpay_order_id text,
  razorpay_payment_id text,
  purpose text not null,
  amount numeric(12,2) not null default 0,
  environment text not null default 'test' check (environment in ('test')),
  payment_status text,
  payment_method text,
  wallet_credit_applied boolean not null default false,
  vendor_activation_applied boolean not null default false,
  readiness_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_vendor_payment_test_event_payment
  on public.vendor_payment_test_events(razorpay_payment_id)
  where razorpay_payment_id is not null;

alter table public.vendor_payment_test_events enable row level security;

drop policy if exists "Admins read Razorpay test payment events" on public.vendor_payment_test_events;
drop policy if exists "Admins read Razorpay test payment events" on public.vendor_payment_test_events;
create policy "Admins read Razorpay test payment events"
  on public.vendor_payment_test_events
  for select
  to authenticated
  using (public.is_company_admin());

comment on table public.vendor_payment_test_events is
  'Separated Razorpay Test Mode payment attempts. These records must never activate production wallet balance or commercial order eligibility.';

create table if not exists public.razorpay_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  environment text not null default 'test' check (environment in ('test', 'live')),
  vendor_id uuid references public.vendors(id) on delete set null,
  razorpay_order_id text,
  razorpay_payment_id text,
  processing_status text not null default 'received',
  processing_error text,
  processed_result jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_razorpay_webhook_events_payment
  on public.razorpay_webhook_events(razorpay_payment_id);

create index if not exists idx_razorpay_webhook_events_vendor_created
  on public.razorpay_webhook_events(vendor_id, created_at desc);

alter table public.razorpay_webhook_events enable row level security;

drop policy if exists "Admins read Razorpay webhook audit events" on public.razorpay_webhook_events;
drop policy if exists "Admins read Razorpay webhook audit events" on public.razorpay_webhook_events;
create policy "Admins read Razorpay webhook audit events"
  on public.razorpay_webhook_events
  for select
  to authenticated
  using (public.is_company_admin());

comment on table public.razorpay_webhook_events is
  'Immutable Razorpay webhook receipt and processing audit log. event_id uniqueness prevents duplicate webhook replay from creating duplicate wallet credits.';

alter table public.vendor_security_wallet_transactions
  add column if not exists payment_environment text not null default 'live'
  check (payment_environment in ('test', 'live'));

create index if not exists idx_vendor_wallet_tx_payment_environment
  on public.vendor_security_wallet_transactions(payment_environment, created_at desc);


-- ============================================================================
-- 202607310003_pwa_web_push_subscriptions.sql
-- ============================================================================
-- SabSewa Local PWA install/update and web push subscription support.
-- This stores only consented browser push subscriptions. Do not store OTPs,
-- passwords, payment data, private addresses or auth tokens here.

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  user_agent text,
  consent_status text not null default 'granted' check (consent_status in ('granted', 'revoked')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists idx_web_push_subscriptions_user
  on public.web_push_subscriptions(user_id, consent_status);

alter table public.web_push_subscriptions enable row level security;

drop policy if exists "Users read own web push subscriptions" on public.web_push_subscriptions;
drop policy if exists "Users read own web push subscriptions" on public.web_push_subscriptions;
create policy "Users read own web push subscriptions"
  on public.web_push_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Company admins read web push subscriptions" on public.web_push_subscriptions;
drop policy if exists "Company admins read web push subscriptions" on public.web_push_subscriptions;
create policy "Company admins read web push subscriptions"
  on public.web_push_subscriptions
  for select
  to authenticated
  using (public.is_company_admin());

comment on table public.web_push_subscriptions is
  'Consent-based PWA push subscription registry. Browser subscriptions only; no OTPs, passwords, payment data, private addresses or auth tokens.';


-- ============================================================================
-- 202607310004_vendor_catalogue_setup_workflow.sql
-- ============================================================================
-- Vendor catalogue setup workflow for SabSewa Local.
-- Supports mobile-friendly multi-select catalogue setup, vendor-created products,
-- duplicate review and master-catalogue moderation without mixing vendor prices
-- or stock into master records.

create extension if not exists "pgcrypto";

alter table public.vendor_items
  add column if not exists max_order_quantity numeric(10,2),
  add column if not exists master_catalogue_status text not null default 'vendor_only'
    check (master_catalogue_status in ('master_approved', 'vendor_only', 'pending_review', 'linked_to_existing', 'rejected', 'disabled')),
  add column if not exists master_submission_id uuid,
  add column if not exists vendor_image_reuse_consent boolean not null default false,
  add column if not exists vendor_image_reuse_consented_at timestamptz,
  add column if not exists source_type text not null default 'vendor_catalogue'
    check (source_type in ('master_catalogue', 'vendor_catalogue', 'vendor_submission', 'gemini_inventory_capture')),
  add column if not exists inactive_at timestamptz,
  add column if not exists inactive_reason text;

create table if not exists public.vendor_product_submissions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  terminal_id uuid references public.vendor_terminals(id) on delete set null,
  vendor_item_id uuid references public.vendor_items(id) on delete restrict,
  submitted_by_user_id uuid,
  product_name text not null,
  local_name text,
  category text not null,
  brand_name text,
  manufacturer text,
  variant_name text,
  pack_size text,
  pack_unit text,
  barcode text,
  sku text,
  ean text,
  description text,
  price numeric(10,2),
  price_display_mode text not null default 'hide_price'
    check (price_display_mode in ('show_price', 'hide_price', 'market_price')),
  availability_status text not null default 'available'
    check (availability_status in ('available', 'limited_stock', 'temporarily_unavailable', 'out_of_stock', 'available_on_request')),
  image_url text,
  s3_object_key text,
  thumbnail_object_key text,
  vendor_image_reuse_consent boolean not null default false,
  consent_terms_version text,
  consented_at timestamptz,
  original_filename text,
  content_checksum text,
  perceptual_hash text,
  duplicate_candidates jsonb not null default '[]'::jsonb,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'correction_requested', 'linked_to_existing', 'promoted_to_master', 'disabled')),
  linked_master_product_id uuid references public.master_product_catalog(id) on delete set null,
  linked_master_image_id uuid references public.master_product_images(id) on delete set null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  rejection_reason text,
  correction_requested_reason text,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.vendor_product_submission_audit (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.vendor_product_submissions(id) on delete restrict,
  action text not null,
  actor_user_id uuid,
  actor_role text,
  reason text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vendor_product_submissions_vendor_status
  on public.vendor_product_submissions(vendor_id, status, created_at desc);

create index if not exists idx_vendor_product_submissions_search
  on public.vendor_product_submissions(
    lower(product_name),
    lower(coalesce(brand_name, '')),
    lower(coalesce(variant_name, '')),
    lower(coalesce(pack_size, '')),
    lower(coalesce(barcode, ''))
  );

create index if not exists idx_vendor_items_master_catalogue_status
  on public.vendor_items(vendor_id, terminal_id, master_catalogue_status, listing_review_status);

alter table public.vendor_product_submissions enable row level security;
alter table public.vendor_product_submission_audit enable row level security;

drop policy if exists "Vendors read own product submissions" on public.vendor_product_submissions;
drop policy if exists "Vendors read own product submissions" on public.vendor_product_submissions;
create policy "Vendors read own product submissions"
  on public.vendor_product_submissions for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors v
      where v.id = vendor_product_submissions.vendor_id
        and v.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.role in ('admin', 'terminal_admin')
    )
  );

drop policy if exists "Vendors insert own product submissions" on public.vendor_product_submissions;
drop policy if exists "Vendors insert own product submissions" on public.vendor_product_submissions;
create policy "Vendors insert own product submissions"
  on public.vendor_product_submissions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.vendors v
      where v.id = vendor_product_submissions.vendor_id
        and v.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Company staff update product submissions" on public.vendor_product_submissions;
drop policy if exists "Company staff update product submissions" on public.vendor_product_submissions;
create policy "Company staff update product submissions"
  on public.vendor_product_submissions for update
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.role in ('admin', 'terminal_admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.role in ('admin', 'terminal_admin')
    )
  );

drop policy if exists "Vendors and company staff read submission audit" on public.vendor_product_submission_audit;
drop policy if exists "Vendors and company staff read submission audit" on public.vendor_product_submission_audit;
create policy "Vendors and company staff read submission audit"
  on public.vendor_product_submission_audit for select
  to authenticated
  using (
    exists (
      select 1
      from public.vendor_product_submissions s
      join public.vendors v on v.id = s.vendor_id
      where s.id = vendor_product_submission_audit.submission_id
        and v.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.role in ('admin', 'terminal_admin')
    )
  );

-- Financial, catalogue and moderation changes should be inserted through backend
-- service-role routes with request validation. Clients must not receive service-role keys.


-- ============================================================================
-- 202608050001_vendor_qr_settlement_storage_management.sql
-- ============================================================================
-- Vendor QR payment profiles, direct settlement, credit privacy and storage plans.
-- Customers pay vendors directly; SabSewa Local keeps only minimal accounting
-- records after successful settlement.

alter table public.vendor_storage_files
  drop constraint if exists vendor_storage_files_purpose_check;

alter table public.vendor_storage_files
  add constraint vendor_storage_files_purpose_check
  check (purpose in (
    'product_image',
    'product_thumbnail',
    'kyc_document',
    'business_document',
    'payment_qr',
    'store_banner',
    'store_asset'
  ));

alter table public.vendor_storage_usage
  add column if not exists purchased_quota_bytes bigint not null default 0,
  add column if not exists default_quota_bytes bigint not null default 104857600,
  add column if not exists storage_breakdown jsonb not null default '{}'::jsonb;

alter table public.hyperlocal_orders
  drop constraint if exists hyperlocal_orders_payment_method_check,
  drop constraint if exists hyperlocal_orders_payment_status_check;

alter table public.hyperlocal_orders
  add constraint hyperlocal_orders_payment_method_check
  check (payment_method in ('prepaid', 'cash', 'vendor_qr', 'bank_transfer', 'other_digital', 'credit')),
  add constraint hyperlocal_orders_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'credit_due', 'pending_payment', 'refunded', 'failed'));

alter table public.hyperlocal_orders
  add column if not exists settlement_status text not null default 'pending'
    check (settlement_status in ('pending', 'complete', 'credit_pending', 'failed', 'refunded')),
  add column if not exists settlement_completed_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_confirmed_by text,
  add column if not exists payment_reference text,
  add column if not exists receipt_number text,
  add column if not exists customer_name text,
  add column if not exists customer_delivery_snapshot jsonb,
  add column if not exists privacy_redacted_at timestamptz,
  add column if not exists privacy_redaction_reason text;

create table if not exists public.vendor_payment_profiles (
  vendor_id uuid primary key references public.vendors(id) on delete cascade,
  upi_id text,
  bank_account_last4 text,
  bank_account_encrypted text,
  bank_ifsc_encrypted text,
  bank_account_holder text,
  preferred_methods text[] not null default array['cash', 'vendor_qr']::text[],
  other_payment_instructions text,
  is_active boolean not null default true,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_payment_profiles_methods_check check (
    preferred_methods <@ array['cash', 'vendor_qr', 'bank_transfer', 'other_digital']::text[]
  )
);

create table if not exists public.vendor_qr_codes (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  storage_file_id uuid references public.vendor_storage_files(id) on delete set null,
  label text not null default 'UPI QR',
  upi_id text,
  public_url text not null,
  object_key text not null,
  content_type text not null,
  byte_size bigint not null default 0,
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active', 'replaced', 'archived', 'deleted')),
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  replaced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists uq_vendor_qr_primary_active
  on public.vendor_qr_codes(vendor_id)
  where is_primary = true and status = 'active';

create table if not exists public.order_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.hyperlocal_orders(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  payment_method text not null check (payment_method in ('cash', 'vendor_qr', 'bank_transfer', 'other_digital', 'credit')),
  amount numeric(12,2) not null check (amount >= 0),
  payment_status text not null default 'confirmed' check (payment_status in ('pending', 'confirmed', 'failed', 'refunded')),
  settlement_status text not null default 'complete' check (settlement_status in ('pending', 'complete', 'credit_pending', 'failed', 'refunded')),
  payment_reference text,
  confirmed_by text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.order_settlement_records (
  order_id uuid primary key references public.hyperlocal_orders(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  order_date timestamptz not null,
  total_amount numeric(12,2) not null,
  payment_method text not null,
  settlement_status text not null default 'complete',
  receipt_number text not null,
  settled_at timestamptz not null default now(),
  retained_accounting_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.vendor_storage_plans (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null unique,
  title text not null,
  quota_bytes bigint not null check (quota_bytes > 0),
  price_inr numeric(12,2) not null check (price_inr >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_storage_purchases (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  plan_id uuid references public.vendor_storage_plans(id) on delete set null,
  quota_bytes bigint not null check (quota_bytes > 0),
  amount_inr numeric(12,2) not null check (amount_inr >= 0),
  payment_gateway text not null default 'razorpay',
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  payment_reference text,
  activated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.vendor_storage_plans (plan_code, title, quota_bytes, price_inr, sort_order)
values
  ('plus_1gb', '+1 GB', 1073741824, 199, 10),
  ('plus_5gb', '+5 GB', 5368709120, 799, 20),
  ('plus_10gb', '+10 GB', 10737418240, 1399, 30),
  ('plus_25gb', '+25 GB', 26843545600, 2999, 40)
on conflict (plan_code) do update
set title = excluded.title,
    quota_bytes = excluded.quota_bytes,
    price_inr = excluded.price_inr,
    sort_order = excluded.sort_order,
    is_active = true;

alter table public.vendor_credit_accounts
  add column if not exists customer_name text,
  add column if not exists customer_mobile text,
  add column if not exists customer_address text,
  add column if not exists credit_date date,
  add column if not exists credit_notes text,
  add column if not exists payment_history jsonb not null default '[]'::jsonb,
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text,
  add column if not exists settled_at timestamptz,
  add column if not exists privacy_redacted_at timestamptz;

create index if not exists idx_order_payment_tx_order_created
  on public.order_payment_transactions(order_id, created_at desc);
create index if not exists idx_settlement_vendor_settled
  on public.order_settlement_records(vendor_id, settled_at desc);
create index if not exists idx_vendor_qr_vendor_status
  on public.vendor_qr_codes(vendor_id, status, created_at desc);
create index if not exists idx_vendor_storage_purchases_vendor_created
  on public.vendor_storage_purchases(vendor_id, created_at desc);

alter table public.vendor_payment_profiles enable row level security;
alter table public.vendor_qr_codes enable row level security;
alter table public.order_payment_transactions enable row level security;
alter table public.order_settlement_records enable row level security;
alter table public.vendor_storage_plans enable row level security;
alter table public.vendor_storage_purchases enable row level security;

drop policy if exists "Vendor owners read own payment profile" on public.vendor_payment_profiles;
drop policy if exists "Vendor owners read own payment profile" on public.vendor_payment_profiles;
create policy "Vendor owners read own payment profile"
  on public.vendor_payment_profiles for select to authenticated
  using (exists (
    select 1 from public.vendors
    where vendors.id = vendor_payment_profiles.vendor_id
    and vendors.owner_user_id = auth.uid()
  ));

drop policy if exists "Vendor owners read own QR codes" on public.vendor_qr_codes;
drop policy if exists "Vendor owners read own QR codes" on public.vendor_qr_codes;
create policy "Vendor owners read own QR codes"
  on public.vendor_qr_codes for select to authenticated
  using (exists (
    select 1 from public.vendors
    where vendors.id = vendor_qr_codes.vendor_id
    and vendors.owner_user_id = auth.uid()
  ));

drop policy if exists "Vendor owners read own settlements" on public.order_settlement_records;
drop policy if exists "Vendor owners read own settlements" on public.order_settlement_records;
create policy "Vendor owners read own settlements"
  on public.order_settlement_records for select to authenticated
  using (exists (
    select 1 from public.vendors
    where vendors.id = order_settlement_records.vendor_id
    and vendors.owner_user_id = auth.uid()
  ));

drop policy if exists "Anyone authenticated can read active storage plans" on public.vendor_storage_plans;
drop policy if exists "Anyone authenticated can read active storage plans" on public.vendor_storage_plans;
create policy "Anyone authenticated can read active storage plans"
  on public.vendor_storage_plans for select to authenticated
  using (is_active = true);

drop policy if exists "Vendor owners read own storage purchases" on public.vendor_storage_purchases;
drop policy if exists "Vendor owners read own storage purchases" on public.vendor_storage_purchases;
create policy "Vendor owners read own storage purchases"
  on public.vendor_storage_purchases for select to authenticated
  using (exists (
    select 1 from public.vendors
    where vendors.id = vendor_storage_purchases.vendor_id
    and vendors.owner_user_id = auth.uid()
  ));

comment on table public.order_settlement_records is
  'Minimal accounting history retained after paid order settlement. Customer delivery PII is removed from operational order storage.';

create table if not exists public.vendor_credit_repayment_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  customer_id uuid not null,
  account_id uuid references public.vendor_credit_accounts(id) on delete set null,
  order_id uuid references public.hyperlocal_orders(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null default 'vendor_qr' check (payment_method in ('vendor_qr', 'bank_transfer', 'other_digital', 'cash')),
  payment_reference text,
  customer_note text,
  status text not null default 'submitted' check (status in ('submitted', 'vendor_confirmed', 'rejected')),
  submitted_at timestamptz not null default now(),
  verified_by uuid,
  verified_at timestamptz,
  vendor_note text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_credit_repayment_vendor_status
  on public.vendor_credit_repayment_requests(vendor_id, status, submitted_at desc);
create index if not exists idx_credit_repayment_customer
  on public.vendor_credit_repayment_requests(customer_id, submitted_at desc);

alter table public.vendor_credit_repayment_requests enable row level security;

drop policy if exists "Vendor owners read own repayment requests" on public.vendor_credit_repayment_requests;
drop policy if exists "Vendor owners read own repayment requests" on public.vendor_credit_repayment_requests;
create policy "Vendor owners read own repayment requests"
  on public.vendor_credit_repayment_requests for select to authenticated
  using (exists (
    select 1 from public.vendors
    where vendors.id = vendor_credit_repayment_requests.vendor_id
    and vendors.owner_user_id = auth.uid()
  ));

comment on table public.vendor_credit_repayment_requests is
  'Customer-submitted credit repayment references. Vendor confirmation is required before the credit balance is reduced.';

create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  vendor_id uuid references public.vendors(id) on delete set null,
  order_id uuid references public.hyperlocal_orders(id) on delete set null,
  notification_type text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  delivery_channel text not null default 'in_app' check (delivery_channel in ('in_app', 'push', 'sms', 'whatsapp')),
  delivery_status text not null default 'queued' check (delivery_status in ('queued', 'sent', 'failed', 'skipped')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz
);

create index if not exists idx_customer_notifications_customer_created
  on public.customer_notifications(customer_id, created_at desc);
create index if not exists idx_customer_notifications_order
  on public.customer_notifications(order_id, notification_type);

alter table public.customer_notifications enable row level security;

drop policy if exists "Customers read own notifications" on public.customer_notifications;
drop policy if exists "Customers read own notifications" on public.customer_notifications;
create policy "Customers read own notifications"
  on public.customer_notifications for select to authenticated
  using (auth.uid() = customer_id);

comment on table public.customer_notifications is
  'Customer-facing order and repayment notifications. Payloads should contain order/payment summaries, not secrets or sensitive payment credentials.';

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text not null default 'fcm' check (provider in ('fcm')),
  token text not null unique,
  platform text check (platform in ('web', 'android', 'ios')),
  app_role text check (app_role in ('customer', 'vendor', 'rider', 'company')),
  consent_status text not null default 'granted' check (consent_status in ('granted', 'revoked')),
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_device_push_tokens_user_provider
  on public.device_push_tokens(user_id, provider, consent_status);

alter table public.device_push_tokens enable row level security;

drop policy if exists "Users read own device push tokens" on public.device_push_tokens;
drop policy if exists "Users read own device push tokens" on public.device_push_tokens;
create policy "Users read own device push tokens"
  on public.device_push_tokens for select to authenticated
  using (auth.uid() = user_id);

comment on table public.device_push_tokens is
  'Low-cost FCM push token registry. Used for customer/vendor notifications before any SMS fallback is considered.';


-- ============================================================================
-- 202608050002_platform_webhook_events.sql
-- ============================================================================
-- Generic platform webhook audit log for provider callbacks.
-- Stores metadata and payloads from verified providers only.

create table if not exists public.platform_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text not null,
  table_name text,
  external_event_id text,
  processing_status text not null default 'received',
  processing_error text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_platform_webhook_events_provider_received
  on public.platform_webhook_events(provider, received_at desc);

create index if not exists idx_platform_webhook_events_external
  on public.platform_webhook_events(provider, external_event_id)
  where external_event_id is not null;

alter table public.platform_webhook_events enable row level security;

drop policy if exists "Company admins read platform webhook events" on public.platform_webhook_events;

comment on table public.platform_webhook_events is
  'Verified provider webhook audit log for Supabase callbacks and future integrations. RLS is enabled with no public read policy; backend service role writes/reads for operations. Secrets are never stored here.';


-- ============================================================================
-- 202608050003_master_product_catalogue_onboarding_expansion.sql
-- ============================================================================
-- Master Product Catalogue expansion for faster vendor onboarding.
-- Broadens category support and seeds commonly sold local products.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'master_product_catalog'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%category%'
  loop
    execute format('alter table public.master_product_catalog drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table public.master_product_catalog
  drop constraint if exists master_product_catalog_category_check;

alter table public.master_product_catalog
  add constraint master_product_catalog_category_check
  check (category in (
    'kirana',
    'vegetables',
    'fruits',
    'dairy',
    'bakery',
    'beverages',
    'household',
    'household-essentials',
    'personal-care',
    'packaged-food',
    'pharmacy',
    'medical',
    'stationery',
    'hardware',
    'tiffin',
    'restaurant',
    'other'
  ));

insert into public.master_product_catalog
  (standard_title, category, subcategory, local_names, common_units, brand_name, pack_size, search_keywords, alternative_spellings, image_status)
values
  ('Paracetamol Tablets', 'pharmacy', 'common-medicines', '{"hi":["bukhar ki goli","paracetamol"],"kn":["paracetamol"]}', array['strip','tablet'], null, null, array['paracetamol','fever tablet','pain relief','crocin','dolo'], array['parasitamol','paracetmol'], 'image_pending'),
  ('ORS Sachet', 'pharmacy', 'first-aid', '{"hi":["ors","rehydration"],"kn":["ors"]}', array['sachet','packet'], null, null, array['ors','oral rehydration salt','dehydration'], array['o r s'], 'image_pending'),
  ('Bandage Roll', 'pharmacy', 'first-aid', '{"hi":["patti","bandage"],"kn":["bandage"]}', array['roll','piece'], null, null, array['bandage','first aid','dressing'], array['band aid roll'], 'image_pending'),
  ('Antiseptic Liquid', 'pharmacy', 'first-aid', '{"hi":["antiseptic","dawai liquid"],"kn":["antiseptic"]}', array['bottle','ml'], null, null, array['antiseptic liquid','wound cleaning','first aid'], array['antispetic'], 'image_pending'),
  ('Cotton Roll', 'pharmacy', 'first-aid', '{"hi":["rui","cotton"],"kn":["cotton"]}', array['roll','packet'], null, null, array['cotton','medical cotton','first aid'], array['cotten'], 'image_pending'),
  ('Notebook', 'stationery', 'writing-supplies', '{"hi":["copy","notebook"],"kn":["notebook"]}', array['piece','pack'], null, null, array['notebook','copy','exercise book','school copy'], array['note book'], 'image_pending'),
  ('Ball Pen', 'stationery', 'writing-supplies', '{"hi":["pen"],"kn":["pen"]}', array['piece','pack'], null, null, array['pen','ball pen','writing pen'], array['bal pen'], 'image_pending'),
  ('Pencil', 'stationery', 'writing-supplies', '{"hi":["pencil"],"kn":["pencil"]}', array['piece','pack'], null, null, array['pencil','school pencil','writing pencil'], array['pensil'], 'image_pending'),
  ('Eraser', 'stationery', 'writing-supplies', '{"hi":["rubber","eraser"],"kn":["eraser"]}', array['piece','pack'], null, null, array['eraser','rubber','pencil eraser'], array['rabar'], 'image_pending'),
  ('Fevicol Glue', 'stationery', 'adhesives', '{"hi":["gond","glue"],"kn":["glue"]}', array['bottle','tube'], null, null, array['glue','adhesive','fevicol','craft glue'], array['glue bottle'], 'image_pending'),
  ('LED Bulb', 'hardware', 'electrical', '{"hi":["led bulb","bijli bulb"],"kn":["led bulb"]}', array['piece','box'], null, null, array['led bulb','bulb','light bulb','electric bulb'], array['lite bulb'], 'image_pending'),
  ('AA Battery', 'hardware', 'electrical', '{"hi":["battery","cell"],"kn":["battery"]}', array['piece','pack'], null, null, array['aa battery','cell','battery'], array['battry'], 'image_pending'),
  ('Insulation Tape', 'hardware', 'electrical', '{"hi":["electric tape","insulation tape"],"kn":["insulation tape"]}', array['roll','piece'], null, null, array['insulation tape','electrical tape','electric tape'], array['insulation tap'], 'image_pending'),
  ('Nails', 'hardware', 'fasteners', '{"hi":["keel","nail"],"kn":["nails"]}', array['packet','kg','gram'], null, null, array['nails','iron nails','fasteners'], array['keel'], 'image_pending'),
  ('Screwdriver', 'hardware', 'tools', '{"hi":["pechkas","screwdriver"],"kn":["screwdriver"]}', array['piece'], null, null, array['screwdriver','tool','pechkas'], array['screw driver'], 'image_pending'),
  ('Floor Cleaner', 'household-essentials', 'cleaning', '{"hi":["floor cleaner","pochha liquid"],"kn":["floor cleaner"]}', array['bottle','litre','ml'], null, null, array['floor cleaner','cleaning liquid','phenyl'], array['floor clener'], 'image_pending'),
  ('Toilet Cleaner', 'household-essentials', 'cleaning', '{"hi":["toilet cleaner"],"kn":["toilet cleaner"]}', array['bottle','ml'], null, null, array['toilet cleaner','bathroom cleaner'], array['toilet clener'], 'image_pending'),
  ('Garbage Bags', 'household-essentials', 'cleaning', '{"hi":["kachra bag","garbage bag"],"kn":["garbage bag"]}', array['roll','pack'], null, null, array['garbage bags','dustbin bag','trash bag'], array['garbage bag'], 'image_pending'),
  ('Aluminium Foil', 'household-essentials', 'kitchen', '{"hi":["foil paper","aluminium foil"],"kn":["aluminium foil"]}', array['roll','box'], null, null, array['aluminium foil','foil paper','kitchen foil'], array['aluminum foil'], 'image_pending'),
  ('Paper Plates', 'household-essentials', 'disposables', '{"hi":["paper plate"],"kn":["paper plate"]}', array['pack','piece'], null, null, array['paper plates','disposable plates'], array['paper plat'], 'image_pending'),
  ('Cake Rusk', 'bakery', 'rusk-toast', '{"hi":["rusk"],"kn":["rusk"]}', array['packet'], null, null, array['rusk','cake rusk','toast'], array['rusks'], 'image_pending'),
  ('Bun', 'bakery', 'bread', '{"hi":["bun"],"kn":["bun"]}', array['piece','pack'], null, null, array['bun','bakery bun','bread bun'], array['buns'], 'image_pending'),
  ('Samosa', 'tiffin', 'snacks', '{"hi":["samosa"],"kn":["samosa"]}', array['piece'], null, null, array['samosa','snack','evening snack'], array['samosa'], 'image_pending'),
  ('Idli', 'tiffin', 'breakfast', '{"hi":["idli"],"kn":["idli"]}', array['piece','plate'], null, null, array['idli','breakfast','south indian'], array['idly'], 'image_pending'),
  ('Chapati', 'tiffin', 'meals', '{"hi":["roti","chapati"],"kn":["chapati"]}', array['piece','plate'], null, null, array['chapati','roti','phulka'], array['chappati'], 'image_pending')
on conflict do nothing;

insert into public.catalog_items
  (name, standard_title, category, subcategory, image_url, default_unit, local_names, common_units, brand_name, pack_size, search_keywords, alternative_spellings, image_status, rights_notes)
select
  standard_title,
  standard_title,
  category,
  subcategory,
  null,
  coalesce(common_units[1], 'piece'),
  local_names,
  common_units,
  brand_name,
  pack_size,
  search_keywords,
  alternative_spellings,
  image_status,
  image_policy_note
from public.master_product_catalog mpc
where not exists (
  select 1
  from public.catalog_items ci
  where coalesce(ci.standard_title, ci.name) = mpc.standard_title
    and ci.category = mpc.category
    and coalesce(ci.subcategory, '') = mpc.subcategory
    and coalesce(ci.brand_name, '') = coalesce(mpc.brand_name, '')
    and coalesce(ci.pack_size, '') = coalesce(mpc.pack_size, '')
);


-- ============================================================================
-- 202608050004_mrp_pricing_policy_for_bulk_catalogue.sql
-- ============================================================================
-- MRP-based pricing policy for branded master catalogue items.
-- Keep this file in sync with RUN_ONLY_MRP_PRICING_POLICY_FOR_BULK_CATALOGUE.sql.

alter table public.master_product_catalog
  add column if not exists mrp numeric(10,2),
  add column if not exists product_description text,
  add column if not exists generic_image_url text,
  add column if not exists is_branded boolean not null default false;

alter table public.vendor_items
  add column if not exists mrp_pricing_policy text not null default 'manual'
    check (mrp_pricing_policy in ('manual', 'mrp', 'mrp_discount')),
  add column if not exists mrp_discount_percent numeric(5,2) not null default 0
    check (mrp_discount_percent >= 0 and mrp_discount_percent <= 95),
  add column if not exists master_mrp_snapshot numeric(10,2),
  add column if not exists auto_price_updated_at timestamptz;

create or replace function public.calculate_mrp_policy_price(source_mrp numeric, pricing_policy text, discount_percent numeric)
returns numeric
language sql
immutable
as $$
  select case
    when source_mrp is null or source_mrp <= 0 then 0::numeric
    when pricing_policy = 'mrp' then round(source_mrp, 2)
    when pricing_policy = 'mrp_discount' then round(source_mrp * (1 - least(greatest(coalesce(discount_percent, 0), 0), 95) / 100), 2)
    else 0::numeric
  end;
$$;

create or replace function public.apply_vendor_item_mrp_policy()
returns trigger
language plpgsql
as $$
declare
  source_mrp numeric;
begin
  if new.mrp_pricing_policy in ('mrp', 'mrp_discount') then
    source_mrp := coalesce(new.mrp, new.master_mrp_snapshot);
    if source_mrp is not null and source_mrp > 0 then
      new.price := public.calculate_mrp_policy_price(source_mrp, new.mrp_pricing_policy, new.mrp_discount_percent);
      new.price_display_mode := 'show_price';
      new.master_mrp_snapshot := source_mrp;
      new.auto_price_updated_at := now();
      new.discount_label := case
        when new.mrp_pricing_policy = 'mrp' then 'Selling at MRP'
        when new.mrp_discount_percent > 0 then concat(new.mrp_discount_percent::text, '% off MRP')
        else null
      end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_apply_vendor_item_mrp_policy on public.vendor_items;
create trigger trg_apply_vendor_item_mrp_policy
before insert or update of mrp_pricing_policy, mrp_discount_percent, mrp, master_mrp_snapshot
on public.vendor_items
for each row
execute function public.apply_vendor_item_mrp_policy();

create or replace function public.refresh_vendor_item_prices_for_master_mrp()
returns trigger
language plpgsql
as $$
begin
  if new.mrp is distinct from old.mrp then
    update public.vendor_items
    set mrp = new.mrp,
        master_mrp_snapshot = new.mrp,
        price = public.calculate_mrp_policy_price(new.mrp, mrp_pricing_policy, mrp_discount_percent),
        price_display_mode = 'show_price',
        auto_price_updated_at = now(),
        price_updated_at = now(),
        discount_label = case
          when mrp_pricing_policy = 'mrp' then 'Selling at MRP'
          when mrp_pricing_policy = 'mrp_discount' and mrp_discount_percent > 0 then concat(mrp_discount_percent::text, '% off MRP')
          else discount_label
        end
    where master_product_id = new.id
      and mrp_pricing_policy in ('mrp', 'mrp_discount')
      and new.mrp is not null
      and new.mrp > 0;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_refresh_vendor_item_prices_for_master_mrp on public.master_product_catalog;
drop trigger if exists trg_refresh_vendor_item_prices_for_master_mrp on public.master_product_catalog;
create trigger trg_refresh_vendor_item_prices_for_master_mrp
after update of mrp on public.master_product_catalog
for each row
execute function public.refresh_vendor_item_prices_for_master_mrp();

create or replace function public.refresh_vendor_item_prices_for_variant_mrp()
returns trigger
language plpgsql
as $$
begin
  if new.mrp is distinct from old.mrp then
    update public.vendor_items
    set mrp = new.mrp,
        master_mrp_snapshot = new.mrp,
        price = public.calculate_mrp_policy_price(new.mrp, mrp_pricing_policy, mrp_discount_percent),
        price_display_mode = 'show_price',
        auto_price_updated_at = now(),
        price_updated_at = now(),
        discount_label = case
          when mrp_pricing_policy = 'mrp' then 'Selling at MRP'
          when mrp_pricing_policy = 'mrp_discount' and mrp_discount_percent > 0 then concat(mrp_discount_percent::text, '% off MRP')
          else discount_label
        end
    where product_variant_id = new.id
      and mrp_pricing_policy in ('mrp', 'mrp_discount')
      and new.mrp is not null
      and new.mrp > 0;
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.product_variants') is not null then
    drop trigger if exists trg_refresh_vendor_item_prices_for_variant_mrp on public.product_variants;
drop trigger if exists trg_refresh_vendor_item_prices_for_variant_mrp on public.product_variants;
    create trigger trg_refresh_vendor_item_prices_for_variant_mrp
    after update of mrp on public.product_variants
    for each row
    execute function public.refresh_vendor_item_prices_for_variant_mrp();
  end if;
end $$;

update public.master_product_catalog
set is_branded = true
where brand_name is not null and trim(brand_name) <> '';

comment on column public.vendor_items.mrp_pricing_policy is
  'manual keeps vendor-entered price. mrp sells at latest MRP. mrp_discount recalculates from latest MRP and mrp_discount_percent.';


-- ============================================================================
-- 202608050005_vendor_delivery_policy_and_order_override.sql
-- ============================================================================
-- Vendor-specific delivery policy expansion.
-- Adds optional minimum delivery order value and per-order delivery charge override metadata.

alter table public.vendor_terminals
  add column if not exists minimum_delivery_order_value numeric(10,2) not null default 0
    check (minimum_delivery_order_value >= 0);

alter table public.hyperlocal_orders
  add column if not exists delivery_charge_original numeric(10,2),
  add column if not exists delivery_charge_override_amount numeric(10,2),
  add column if not exists delivery_charge_override_reason text,
  add column if not exists delivery_charge_overridden_by uuid,
  add column if not exists delivery_charge_overridden_at timestamptz,
  add column if not exists minimum_delivery_order_value numeric(10,2) not null default 0
    check (minimum_delivery_order_value >= 0);

comment on column public.vendor_terminals.minimum_delivery_order_value is
  'Optional vendor/terminal-specific minimum cart value required for delivery acceptance. Zero means no minimum.';

comment on column public.hyperlocal_orders.delivery_charge_override_amount is
  'Vendor override amount for delivery charge on an individual order. Allows waive/reduce/increase at vendor discretion.';


-- ============================================================================
-- 202608050006_legacy_route_compatibility_tables.sql
-- ============================================================================
-- Compatibility tables for older mounted routes that are still present in the backend.
-- These keep legacy delivery, inventory, credit-SMS, and wallet-ledger endpoints from failing
-- while the newer normalized tables remain the primary production path.

create extension if not exists "pgcrypto";

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.gemini_agent_logs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%agent_type%';

  if constraint_name is not null then
    execute format('alter table public.gemini_agent_logs drop constraint if exists %I', constraint_name);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.gemini_agent_logs'::regclass
      and conname = 'gemini_agent_logs_agent_type_current_check'
  ) then
    alter table public.gemini_agent_logs
      add constraint gemini_agent_logs_agent_type_current_check
      check (agent_type in (
        'inventory_capture',
        'conversational_order',
        'smart_rejection',
        'dynamic_translation',
        'catalogue_product_suggestion'
      ));
  end if;
end $$;

create table if not exists public.delivery_boys (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.vendors(id) on delete cascade,
  terminal_id uuid references public.vendor_terminals(id) on delete set null,
  name text not null,
  phone text,
  status text not null default 'available'
    check (status in ('available', 'busy', 'offline', 'inactive')),
  rider_token text unique default encode(gen_random_bytes(16), 'hex'),
  access_token text unique default encode(gen_random_bytes(16), 'hex'),
  is_active boolean not null default true,
  current_lat double precision,
  current_lng double precision,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.hyperlocal_orders(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete cascade,
  terminal_id uuid references public.vendor_terminals(id) on delete set null,
  delivery_boy_id uuid references public.delivery_boys(id) on delete set null,
  status text not null default 'assigned'
    check (status in ('assigned', 'picked', 'picked_up', 'delivered', 'cancelled')),
  rider_lat double precision,
  rider_lng double precision,
  assigned_at timestamptz not null default now(),
  picked_at timestamptz,
  delivered_at timestamptz,
  location_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id)
);

create table if not exists public.global_catalog (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  category text,
  subcategory text,
  photo_url text,
  default_unit text,
  approx_allowed boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_inventory (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.vendors(id) on delete cascade,
  terminal_id uuid references public.vendor_terminals(id) on delete set null,
  catalog_id uuid references public.global_catalog(id) on delete set null,
  item_name text not null,
  item_photo text,
  unit text,
  approx_allowed boolean not null default false,
  price numeric(10,2) not null default 0 check (price >= 0),
  stock_available numeric(10,2) not null default 0,
  auto_carry_forward boolean not null default true,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  vendor_id uuid references public.vendors(id) on delete cascade,
  terminal_shop_name text,
  txn_type text not null default 'credit_issue',
  amount numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_credit_terms (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.vendors(id) on delete cascade,
  customer_id uuid not null,
  terminal_shop_name text,
  payment_due_days integer not null default 7 check (payment_due_days between 0 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(vendor_id, customer_id, terminal_shop_name)
);

create table if not exists public.sms_notifications_log (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,
  vendor_id uuid references public.vendors(id) on delete set null,
  terminal_shop_name text,
  type text not null,
  phone text,
  message text,
  provider_msg_id text,
  status text not null default 'queued',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,
  vendor_id uuid references public.vendors(id) on delete cascade,
  shop_name text,
  amount numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  bill_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_boys_vendor_status
  on public.delivery_boys(vendor_id, status);
create index if not exists idx_delivery_assignments_boy_status
  on public.delivery_assignments(delivery_boy_id, status);
create index if not exists idx_vendor_inventory_terminal
  on public.vendor_inventory(terminal_id, item_name);
create index if not exists idx_vendor_ledger_vendor_customer
  on public.vendor_ledger(vendor_id, customer_id, created_at desc);
create index if not exists idx_sms_notifications_log_vendor_created
  on public.sms_notifications_log(vendor_id, created_at desc);
create index if not exists idx_vendor_wallet_ledger_vendor_customer
  on public.vendor_wallet_ledger(vendor_id, customer_id, created_at desc);

alter table public.delivery_boys enable row level security;
alter table public.delivery_assignments enable row level security;
alter table public.global_catalog enable row level security;
alter table public.vendor_inventory enable row level security;
alter table public.vendor_ledger enable row level security;
alter table public.vendor_credit_terms enable row level security;
alter table public.sms_notifications_log enable row level security;
alter table public.vendor_wallet_ledger enable row level security;

drop policy if exists "Vendors read own delivery boys" on public.delivery_boys;
drop policy if exists "Vendors read own delivery boys" on public.delivery_boys;
create policy "Vendors read own delivery boys"
  on public.delivery_boys
  for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Vendors read own delivery assignments" on public.delivery_assignments;
drop policy if exists "Vendors read own delivery assignments" on public.delivery_assignments;
create policy "Vendors read own delivery assignments"
  on public.delivery_assignments
  for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Authenticated users read active legacy catalog" on public.global_catalog;
drop policy if exists "Authenticated users read active legacy catalog" on public.global_catalog;
create policy "Authenticated users read active legacy catalog"
  on public.global_catalog
  for select
  to authenticated
  using (is_active = true);

drop policy if exists "Authenticated users read available legacy inventory" on public.vendor_inventory;
drop policy if exists "Authenticated users read available legacy inventory" on public.vendor_inventory;
create policy "Authenticated users read available legacy inventory"
  on public.vendor_inventory
  for select
  to authenticated
  using (is_available = true or public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Vendors read own legacy vendor ledger" on public.vendor_ledger;
drop policy if exists "Vendors read own legacy vendor ledger" on public.vendor_ledger;
create policy "Vendors read own legacy vendor ledger"
  on public.vendor_ledger
  for select
  to authenticated
  using (public.owns_vendor(vendor_id) or customer_id = auth.uid() or public.is_company_admin());

drop policy if exists "Vendors read own legacy credit terms" on public.vendor_credit_terms;
drop policy if exists "Vendors read own legacy credit terms" on public.vendor_credit_terms;
create policy "Vendors read own legacy credit terms"
  on public.vendor_credit_terms
  for select
  to authenticated
  using (public.owns_vendor(vendor_id) or customer_id = auth.uid() or public.is_company_admin());

drop policy if exists "Admins read SMS notification log" on public.sms_notifications_log;
drop policy if exists "Admins read SMS notification log" on public.sms_notifications_log;
create policy "Admins read SMS notification log"
  on public.sms_notifications_log
  for select
  to authenticated
  using (public.is_company_admin());

drop policy if exists "Vendors read own legacy wallet ledger" on public.vendor_wallet_ledger;
drop policy if exists "Vendors read own legacy wallet ledger" on public.vendor_wallet_ledger;
create policy "Vendors read own legacy wallet ledger"
  on public.vendor_wallet_ledger
  for select
  to authenticated
  using (public.owns_vendor(vendor_id) or customer_id = auth.uid() or public.is_company_admin());

comment on table public.delivery_boys is
  'Compatibility table for mounted legacy delivery-boy routes. New delivery features should prefer the normalized rider flow where possible.';

comment on table public.vendor_inventory is
  'Compatibility table for legacy /api/inventory routes. New vendor catalog setup should prefer vendor_items and master_product_catalog.';

