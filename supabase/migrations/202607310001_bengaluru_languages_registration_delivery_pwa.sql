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
create policy "Vendors read own delivery settings audit"
  on public.vendor_delivery_settings_audit
  for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

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
