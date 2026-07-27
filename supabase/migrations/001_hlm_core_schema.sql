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

