-- SabSewa Local complete migration bundle
-- Use this only on a fresh/blank Supabase project.
-- Target project: https://xodmazgfibftorrlbotk.supabase.co


-- ============================================================
-- 001_hlm_core_schema.sql
-- ============================================================

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
create policy "Approved vendors are public readable"
  on public.vendors for select
  using (status = 'approved' or owner_user_id = auth.uid());

create policy "Vendor owners manage own vendor rows"
  on public.vendors for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "Catalog is readable"
  on public.catalog_items for select
  using (true);

create policy "Vendor items readable when available"
  on public.vendor_items for select
  using (is_available = true);

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


-- ============================================================
-- 202607240001_create_sabsewa_local_security_wallet.sql
-- ============================================================

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

-- ============================================================
-- 202607240002_create_gemini_agent_logs.sql
-- ============================================================

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

-- ============================================================
-- 202607250001_create_order_audit_and_acceptance_privacy.sql
-- ============================================================

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

-- ============================================================
-- 202607250002_create_vendor_owned_credit_controls.sql
-- ============================================================

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

-- ============================================================
-- 202607260001_update_vendor_advance_balance_rules.sql
-- ============================================================

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

-- ============================================================
-- 202607260002_create_vendor_exit_requests.sql
-- ============================================================

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

-- ============================================================
-- 202607260003_create_vendor_storage_quota.sql
-- ============================================================

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

-- ============================================================
-- 202607260004_harden_production_rls_policies.sql
-- ============================================================

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

create policy "Users can read own profile"
  on public.user_profiles for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

create policy "Users can insert own profile"
  on public.user_profiles for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own non-admin profile"
  on public.user_profiles for update
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin())
  with check (
    public.is_company_admin()
    or (user_id = auth.uid() and role in ('customer', 'vendor', 'rider', 'terminal_admin'))
  );

create policy "Admins can read all vendors"
  on public.vendors for select
  to authenticated
  using (public.is_company_admin());

create policy "Vendor owners can read own terminals"
  on public.vendor_terminals for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

create policy "Vendor owners manage own terminals"
  on public.vendor_terminals for all
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin())
  with check (public.owns_vendor(vendor_id) or public.is_company_admin());

create policy "Admins manage catalog"
  on public.catalog_items for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "Admins read all vendor items"
  on public.vendor_items for select
  to authenticated
  using (public.is_company_admin());

create policy "Customers read own orders"
  on public.hyperlocal_orders for select
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin());

create policy "Vendors read own order rows"
  on public.hyperlocal_orders for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

create policy "Riders read assigned order rows"
  on public.hyperlocal_orders for select
  to authenticated
  using (public.is_rider_for_order(id) or public.is_company_admin());

create policy "Customers can create own orders"
  on public.hyperlocal_orders for insert
  to authenticated
  with check (customer_id = auth.uid());

create policy "Riders can read own rider profile"
  on public.riders for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

create policy "Riders can update own location availability"
  on public.riders for update
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin())
  with check (user_id = auth.uid() or public.is_company_admin());

create policy "Riders read own assignments"
  on public.rider_assignments for select
  to authenticated
  using (public.is_rider_for_assignment(id) or public.is_company_admin());

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

create policy "Vendors read own legacy credit ledger"
  on public.vendor_credit_ledger for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

create policy "Customers read own legacy credit ledger"
  on public.vendor_credit_ledger for select
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin());

create policy "Customers read own vendor credit accounts"
  on public.vendor_credit_accounts for select
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin());

create policy "Customers read own vendor credit transactions"
  on public.vendor_credit_transactions for select
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin());

create policy "Vendors read own credit reminders"
  on public.vendor_credit_reminders for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

create policy "Customers read own credit reminders"
  on public.vendor_credit_reminders for select
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin());

create policy "Admins read all Gemini logs"
  on public.gemini_agent_logs for select
  to authenticated
  using (public.is_company_admin());

create policy "Customers read own Gemini logs"
  on public.gemini_agent_logs for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

create policy "Admins read all wallet rows"
  on public.vendor_security_wallets for select
  to authenticated
  using (public.is_company_admin());

create policy "Admins read all wallet transactions"
  on public.vendor_security_wallet_transactions for select
  to authenticated
  using (public.is_company_admin());

create policy "Admins read all wallet warnings"
  on public.vendor_security_wallet_warnings for select
  to authenticated
  using (public.is_company_admin());

create policy "Admins read all order audit logs"
  on public.order_audit_logs for select
  to authenticated
  using (public.is_company_admin());

create policy "Vendor owners read own order audit logs"
  on public.order_audit_logs for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

create policy "Admins read all exit requests"
  on public.vendor_exit_requests for select
  to authenticated
  using (public.is_company_admin());

create policy "Admins read all storage usage"
  on public.vendor_storage_usage for select
  to authenticated
  using (public.is_company_admin());

create policy "Admins read all storage files"
  on public.vendor_storage_files for select
  to authenticated
  using (public.is_company_admin());

-- Deliberately no direct client write policies for:
-- wallet balances/transactions, order audit logs, credit transactions/reminders,
-- exit requests, storage file confirmations, and Gemini logs.
-- These must be written through protected backend service-role routes/functions.


-- ============================================================
-- 202607260005_device_login_addresses_and_upload_security.sql
-- ============================================================

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

create policy "Customers manage own addresses"
  on public.customer_addresses for all
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin())
  with check (customer_id = auth.uid() or public.is_company_admin());

create policy "Users read own devices"
  on public.user_device_sessions for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

create policy "Users revoke own devices"
  on public.user_device_sessions for update
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin())
  with check (user_id = auth.uid() or public.is_company_admin());

create policy "Users read own auth security events"
  on public.auth_security_events for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

create policy "Admins read auth recovery attempts"
  on public.auth_recovery_attempts for select
  to authenticated
  using (public.is_company_admin());

-- Inserts for device registration, security events and recovery attempts should
-- go through protected backend service-role routes so rate limits and notices
-- cannot be bypassed by mobile or web clients.

-- ============================================================
-- 202607260006_vendor_shared_product_catalogue.sql
-- ============================================================

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

create policy "Vendors read approved shared product images"
  on public.shared_product_images for select
  to authenticated
  using (moderation_status = 'approved' and reuse_authorised = true);

create policy "Uploader vendors read own shared image submissions"
  on public.shared_product_images for select
  to authenticated
  using (public.owns_vendor(uploader_vendor_id) or public.is_company_admin());

create policy "Admins read all shared product images"
  on public.shared_product_images for select
  to authenticated
  using (public.is_company_admin());

-- Inserts, moderation, rejection/removal and usage-count updates must go
-- through backend service-role routes or secure admin tooling.

-- ============================================================
-- 202607260007_order_acceptance_availability_rpc.sql
-- ============================================================

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

-- ============================================================
-- 202607260008_wallet_dispute_evidence.sql
-- ============================================================

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

create policy "Admins read recovery audit"
  on public.company_data_recovery_audit for select
  to authenticated
  using (public.is_company_admin());

-- Recovery writes are restricted to protected backend service-role routes.

alter table public.wallet_transaction_disputes enable row level security;

drop policy if exists "Vendors read own wallet disputes" on public.wallet_transaction_disputes;
drop policy if exists "Admins read all wallet disputes" on public.wallet_transaction_disputes;

create policy "Vendors read own wallet disputes"
  on public.wallet_transaction_disputes for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

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

-- ============================================================
-- 202607260009_location_based_vendor_ids.sql
-- ============================================================

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

create policy "Authenticated users read active location codes"
  on public.company_location_codes for select
  to authenticated
  using (is_active = true or public.is_company_admin());

create policy "Admins manage location codes"
  on public.company_location_codes for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "Admins read vendor location history"
  on public.vendor_location_history for select
  to authenticated
  using (public.is_company_admin());

create policy "Vendor owners read own location history"
  on public.vendor_location_history for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

-- Vendor IDs are public/business identifiers only. Vendors must not edit these fields.

-- ============================================================
-- 202607260010_customer_discovery_unserved_area_leads.sql
-- ============================================================

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

create policy "Customers read own unserved area leads"
  on public.unserved_area_leads for select
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin());

create policy "Admins read all unserved area leads"
  on public.unserved_area_leads for select
  to authenticated
  using (public.is_company_admin());

create policy "Admins manage unserved vendor contacts"
  on public.unserved_area_vendor_contacts for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

-- Inserts and updates for unserved leads are routed through the backend so exact
-- customer addresses are never stored for vendor recruitment.

-- ============================================================
-- 202607270001_vendor_controlled_product_pricing.sql
-- ============================================================

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
create trigger trg_record_vendor_item_price_change
before update on public.vendor_items
for each row execute function public.record_vendor_item_price_change();

alter table public.vendor_item_price_history enable row level security;

drop policy if exists "Vendors read own item price history" on public.vendor_item_price_history;
drop policy if exists "Admins read all item price history" on public.vendor_item_price_history;

create policy "Vendors read own item price history"
  on public.vendor_item_price_history for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

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
create trigger trg_prevent_unapproved_price_quote_acceptance
before update of status on public.hyperlocal_orders
for each row execute function public.prevent_unapproved_price_quote_acceptance();

-- Price changes affect only future order snapshots. Existing order items retain
-- the price, display mode and quote state captured when the order was placed.

-- Versioned Terms/Privacy acceptance evidence for SabSewa Local registration.
-- Registration must not complete unless the user actively accepts the current
-- legal bundle and acknowledges the Privacy Notice.

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

create policy "Users read own policy acceptances"
  on public.user_policy_acceptances for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

create policy "Users insert own policy acceptances"
  on public.user_policy_acceptances for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Admins read all policy acceptances"
  on public.user_policy_acceptances for select
  to authenticated
  using (public.is_company_admin());

-- ============================================================
-- 202607280001_revised_vendor_activation_wallet_policy.sql
-- ============================================================

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

create policy "Admins read vendor verification audit"
  on public.vendor_verification_audit for select
  to authenticated
  using (public.is_company_admin());

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

