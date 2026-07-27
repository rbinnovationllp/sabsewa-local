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
