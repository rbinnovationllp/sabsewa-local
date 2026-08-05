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
create policy "Vendors read own delivery boys"
  on public.delivery_boys
  for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Vendors read own delivery assignments" on public.delivery_assignments;
create policy "Vendors read own delivery assignments"
  on public.delivery_assignments
  for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Authenticated users read active legacy catalog" on public.global_catalog;
create policy "Authenticated users read active legacy catalog"
  on public.global_catalog
  for select
  to authenticated
  using (is_active = true);

drop policy if exists "Authenticated users read available legacy inventory" on public.vendor_inventory;
create policy "Authenticated users read available legacy inventory"
  on public.vendor_inventory
  for select
  to authenticated
  using (is_available = true or public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Vendors read own legacy vendor ledger" on public.vendor_ledger;
create policy "Vendors read own legacy vendor ledger"
  on public.vendor_ledger
  for select
  to authenticated
  using (public.owns_vendor(vendor_id) or customer_id = auth.uid() or public.is_company_admin());

drop policy if exists "Vendors read own legacy credit terms" on public.vendor_credit_terms;
create policy "Vendors read own legacy credit terms"
  on public.vendor_credit_terms
  for select
  to authenticated
  using (public.owns_vendor(vendor_id) or customer_id = auth.uid() or public.is_company_admin());

drop policy if exists "Admins read SMS notification log" on public.sms_notifications_log;
create policy "Admins read SMS notification log"
  on public.sms_notifications_log
  for select
  to authenticated
  using (public.is_company_admin());

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
