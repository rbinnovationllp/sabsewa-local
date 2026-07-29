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
create policy "Vendors and admins read availability audit"
  on public.vendor_item_availability_audit for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

-- Writes should use protected backend routes so vendor, terminal and item ownership are rechecked.
