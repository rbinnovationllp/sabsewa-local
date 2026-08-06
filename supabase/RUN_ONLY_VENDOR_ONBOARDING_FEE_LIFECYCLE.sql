-- Vendor onboarding, KYC lifecycle, category fee rules and completed-order platform charges.
-- Run after 202608050007_partner_program_applications.sql.

create extension if not exists "pgcrypto";

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
      and rel.relname = 'vendors'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.vendors drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table public.vendors
  add column if not exists lifecycle_status text,
  add column if not exists kyc_status text not null default 'kyc_not_started',
  add column if not exists onboarding_payment_status text not null default 'payment_pending',
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by uuid,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text,
  add column if not exists shop_photo_url text,
  add column if not exists establishment_year integer,
  add column if not exists public_verified_representative_name text,
  add column if not exists public_verification_badge boolean not null default false,
  add column if not exists public_license_summary jsonb not null default '[]'::jsonb;

update public.vendors
set lifecycle_status = case
  when status = 'approved' then 'active'
  when status = 'suspended' then 'suspended'
  else 'registered'
end
where lifecycle_status is null;

update public.vendors
set status = lifecycle_status
where status in ('pending', 'approved', 'suspended')
  and lifecycle_status in ('registered', 'active', 'suspended');

alter table public.vendors
  alter column lifecycle_status set default 'registered',
  alter column lifecycle_status set not null;

alter table public.vendors
  add constraint vendors_status_lifecycle_check
  check (status in (
    'registered',
    'kyc_pending',
    'kyc_rejected',
    'payment_pending',
    'payment_failed',
    'payment_completed',
    'approval_pending',
    'active',
    'suspended',
    'deactivated'
  ));

alter table public.vendors
  add constraint vendors_lifecycle_status_check
  check (lifecycle_status in (
    'registered',
    'kyc_pending',
    'kyc_rejected',
    'payment_pending',
    'payment_failed',
    'payment_completed',
    'approval_pending',
    'active',
    'suspended',
    'deactivated'
  ));

alter table public.vendors
  add constraint vendors_kyc_status_check
  check (kyc_status in (
    'kyc_not_started',
    'kyc_submitted',
    'kyc_under_review',
    'additional_information_required',
    'kyc_verified',
    'kyc_rejected'
  ));

alter table public.vendors
  add constraint vendors_onboarding_payment_status_check
  check (onboarding_payment_status in (
    'payment_pending',
    'payment_failed',
    'payment_completed',
    'refunded',
    'adjusted'
  ));

update public.vendors
set kyc_status = 'kyc_verified',
    onboarding_payment_status = 'payment_completed',
    public_verification_badge = true,
    onboarding_completed_at = coalesce(onboarding_completed_at, now()),
    activated_at = coalesce(activated_at, now())
where status = 'active';

create table if not exists public.vendor_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  description text,
  requires_fssai boolean not null default false,
  requires_drug_license boolean not null default false,
  requires_gstin boolean not null default false,
  requires_trade_license boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.vendor_categories
  (slug, display_name, requires_fssai, requires_drug_license, requires_trade_license, sort_order)
values
  ('vegetables', 'Vegetable or Fruit Vendor', false, false, false, 10),
  ('fruits', 'Vegetable or Fruit Vendor', false, false, false, 11),
  ('kirana', 'Kirana or General Store', false, false, false, 20),
  ('grocery', 'Kirana or General Store', false, false, false, 21),
  ('pharmacy', 'Medical or Pharmacy Shop', false, true, true, 30),
  ('medical', 'Medical or Pharmacy Shop', false, true, true, 31),
  ('restaurant', 'Restaurant or Food Outlet', true, false, true, 40),
  ('tiffin', 'Restaurant or Food Outlet', true, false, false, 41),
  ('other', 'Other Vendor Category', false, false, false, 999)
on conflict (slug) do update
set display_name = excluded.display_name,
    requires_fssai = excluded.requires_fssai,
    requires_drug_license = excluded.requires_drug_license,
    requires_trade_license = excluded.requires_trade_license,
    updated_at = now();

create table if not exists public.vendor_fee_rules (
  id uuid primary key default gen_random_uuid(),
  category_slug text not null references public.vendor_categories(slug) on update cascade,
  onboarding_fee_amount numeric(12,2) not null check (onboarding_fee_amount >= 0),
  security_deposit_amount numeric(12,2) not null check (security_deposit_amount >= 0),
  per_completed_order_charge numeric(12,2) not null check (per_completed_order_charge >= 0),
  onboarding_fee_refundable boolean not null default false,
  security_deposit_refundable boolean not null default true,
  tax_rate_percent numeric(6,3) not null default 0,
  currency text not null default 'INR',
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

create unique index if not exists uq_vendor_fee_rules_one_active
  on public.vendor_fee_rules(category_slug)
  where is_active = true and effective_to is null;

insert into public.vendor_fee_rules
  (category_slug, onboarding_fee_amount, security_deposit_amount, per_completed_order_charge)
values
  ('vegetables', 500, 5000, 15),
  ('fruits', 500, 5000, 15),
  ('kirana', 1000, 5000, 15),
  ('grocery', 1000, 5000, 15),
  ('pharmacy', 2000, 5000, 25),
  ('medical', 2000, 5000, 25),
  ('restaurant', 2000, 5000, 25),
  ('tiffin', 2000, 5000, 25),
  ('other', 2000, 5000, 25)
on conflict do nothing;

create table if not exists public.vendor_onboarding (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null unique references public.vendors(id) on delete cascade,
  category_slug text not null references public.vendor_categories(slug) on update cascade,
  kyc_status text not null default 'kyc_not_started',
  payment_status text not null default 'payment_pending',
  approval_status text not null default 'approval_pending',
  onboarding_fee_amount numeric(12,2) not null default 0,
  security_deposit_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_payable_amount numeric(12,2) not null default 0,
  fee_rule_id uuid references public.vendor_fee_rules(id) on delete set null,
  payment_completed_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_kyc_documents (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  document_type text not null check (document_type in (
    'aadhaar',
    'authorisation',
    'shop_establishment',
    'trade_license',
    'gst_certificate',
    'fssai_license',
    'drug_license',
    'shop_photo',
    'utility_bill',
    'rent_agreement',
    'other_business_proof'
  )),
  storage_bucket text not null default 'vendor-kyc-private',
  storage_path text not null,
  file_name text,
  mime_type text,
  file_size_bytes bigint,
  aadhaar_last4 text,
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'verified', 'rejected', 'additional_information_required')),
  reviewer_user_id uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  public_display_allowed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendor_kyc_documents_vendor_status
  on public.vendor_kyc_documents(vendor_id, status, document_type);

create table if not exists public.vendor_kyc_access_audit (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  document_id uuid references public.vendor_kyc_documents(id) on delete set null,
  accessed_by uuid,
  access_reason text not null,
  action text not null default 'view_document',
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_payments (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  category_slug text,
  charge_type text not null check (charge_type in (
    'onboarding_fee',
    'security_deposit',
    'subscription_payment',
    'additional_storage_purchase',
    'featured_listing_payment',
    'per_order_platform_charge',
    'refund',
    'security_adjustment'
  )),
  base_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  currency text not null default 'INR',
  payment_gateway text,
  gateway_order_id text,
  gateway_payment_id text,
  gateway_signature text,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'created', 'paid', 'failed', 'refunded', 'cancelled', 'adjusted')),
  payment_date timestamptz,
  refundable boolean not null default false,
  receipt_number text,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_vendor_payments_idempotency
  on public.vendor_payments(idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_vendor_payments_vendor_type
  on public.vendor_payments(vendor_id, charge_type, payment_status, created_at desc);

create table if not exists public.vendor_status_history (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  previous_status text,
  next_status text not null,
  changed_by uuid,
  change_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_order_charges (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.hyperlocal_orders(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  category_slug text,
  fee_rule_id uuid references public.vendor_fee_rules(id) on delete set null,
  charge_amount numeric(12,2) not null check (charge_amount >= 0),
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  charge_status text not null default 'recorded' check (charge_status in ('recorded', 'waived', 'reversed')),
  charged_at timestamptz not null default now(),
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_platform_order_charges_order
  on public.platform_order_charges(order_id)
  where charge_status <> 'reversed';

create unique index if not exists uq_platform_order_charges_idempotency
  on public.platform_order_charges(idempotency_key);

create index if not exists idx_platform_order_charges_vendor_date
  on public.platform_order_charges(vendor_id, charged_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_role text,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.vendor_categories enable row level security;
alter table public.vendor_fee_rules enable row level security;
alter table public.vendor_onboarding enable row level security;
alter table public.vendor_kyc_documents enable row level security;
alter table public.vendor_kyc_access_audit enable row level security;
alter table public.vendor_payments enable row level security;
alter table public.vendor_status_history enable row level security;
alter table public.platform_order_charges enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "Public read active vendor categories" on public.vendor_categories;
create policy "Public read active vendor categories"
  on public.vendor_categories for select
  using (is_active = true);

drop policy if exists "Authenticated read active fee rules" on public.vendor_fee_rules;
create policy "Authenticated read active fee rules"
  on public.vendor_fee_rules for select
  to authenticated
  using (is_active = true);

drop policy if exists "Admins manage vendor fee rules" on public.vendor_fee_rules;
create policy "Admins manage vendor fee rules"
  on public.vendor_fee_rules for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

drop policy if exists "Vendor owners read own onboarding" on public.vendor_onboarding;
create policy "Vendor owners read own onboarding"
  on public.vendor_onboarding for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Vendor owners read own payments" on public.vendor_payments;
create policy "Vendor owners read own payments"
  on public.vendor_payments for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Vendor owners read own order charges" on public.platform_order_charges;
create policy "Vendor owners read own order charges"
  on public.platform_order_charges for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "KYC reviewers manage documents" on public.vendor_kyc_documents;
create policy "KYC reviewers manage documents"
  on public.vendor_kyc_documents for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

drop policy if exists "Vendor owners submit own KYC docs" on public.vendor_kyc_documents;
create policy "Vendor owners submit own KYC docs"
  on public.vendor_kyc_documents for insert
  to authenticated
  with check (public.owns_vendor(vendor_id));

drop policy if exists "Vendor owners read own KYC metadata" on public.vendor_kyc_documents;
create policy "Vendor owners read own KYC metadata"
  on public.vendor_kyc_documents for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Admins read audit logs" on public.audit_logs;
create policy "Admins read audit logs"
  on public.audit_logs for select
  to authenticated
  using (public.is_company_admin());

create or replace function public.current_vendor_fee_rule(p_category text)
returns public.vendor_fee_rules
language sql
stable
as $$
  select *
  from public.vendor_fee_rules
  where is_active = true
    and effective_to is null
    and category_slug = coalesce(nullif(lower(p_category), ''), 'other')
  order by effective_from desc
  limit 1
$$;

create or replace function public.vendor_onboarding_payment_summary(p_vendor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor public.vendors%rowtype;
  v_rule public.vendor_fee_rules%rowtype;
  v_tax numeric(12,2);
  v_total numeric(12,2);
begin
  select * into v_vendor from public.vendors where id = p_vendor_id;
  if not found then
    raise exception 'Vendor not found.';
  end if;

  select * into v_rule
  from public.current_vendor_fee_rule(coalesce(v_vendor.category, 'other'));

  if not found then
    select * into v_rule from public.current_vendor_fee_rule('other');
  end if;

  v_tax := round((v_rule.onboarding_fee_amount * coalesce(v_rule.tax_rate_percent, 0) / 100.0), 2);
  v_total := v_rule.onboarding_fee_amount + v_rule.security_deposit_amount + v_tax;

  insert into public.vendor_onboarding (
    vendor_id,
    category_slug,
    kyc_status,
    payment_status,
    approval_status,
    onboarding_fee_amount,
    security_deposit_amount,
    tax_amount,
    total_payable_amount,
    fee_rule_id
  )
  values (
    p_vendor_id,
    coalesce(v_rule.category_slug, 'other'),
    v_vendor.kyc_status,
    v_vendor.onboarding_payment_status,
    case when v_vendor.status = 'active' then 'approved' else 'approval_pending' end,
    v_rule.onboarding_fee_amount,
    v_rule.security_deposit_amount,
    v_tax,
    v_total,
    v_rule.id
  )
  on conflict (vendor_id) do update
  set category_slug = excluded.category_slug,
      kyc_status = excluded.kyc_status,
      payment_status = excluded.payment_status,
      onboarding_fee_amount = excluded.onboarding_fee_amount,
      security_deposit_amount = excluded.security_deposit_amount,
      tax_amount = excluded.tax_amount,
      total_payable_amount = excluded.total_payable_amount,
      fee_rule_id = excluded.fee_rule_id,
      updated_at = now();

  return jsonb_build_object(
    'vendor_id', p_vendor_id,
    'category', v_vendor.category,
    'category_slug', coalesce(v_rule.category_slug, 'other'),
    'onboarding_fee', v_rule.onboarding_fee_amount,
    'security_deposit', v_rule.security_deposit_amount,
    'tax_amount', v_tax,
    'total_payable', v_total,
    'currency', v_rule.currency,
    'onboarding_fee_refundable', v_rule.onboarding_fee_refundable,
    'security_deposit_refundable', v_rule.security_deposit_refundable,
    'kyc_status', v_vendor.kyc_status,
    'payment_status', v_vendor.onboarding_payment_status,
    'vendor_status', v_vendor.status,
    'can_publish_products', v_vendor.status = 'active'
      and v_vendor.kyc_status = 'kyc_verified'
      and v_vendor.onboarding_payment_status = 'payment_completed'
  );
end;
$$;

create or replace function public.record_vendor_onboarding_payment(
  p_vendor_id uuid,
  p_gateway_order_id text,
  p_gateway_payment_id text,
  p_gateway_signature text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_summary jsonb;
  v_category text;
  v_onboarding_fee numeric(12,2);
  v_security_deposit numeric(12,2);
  v_tax numeric(12,2);
  v_total numeric(12,2);
  v_now timestamptz := now();
begin
  v_summary := public.vendor_onboarding_payment_summary(p_vendor_id);
  v_category := v_summary->>'category_slug';
  v_onboarding_fee := (v_summary->>'onboarding_fee')::numeric;
  v_security_deposit := (v_summary->>'security_deposit')::numeric;
  v_tax := (v_summary->>'tax_amount')::numeric;
  v_total := (v_summary->>'total_payable')::numeric;

  insert into public.vendor_payments (
    vendor_id, category_slug, charge_type, base_amount, tax_amount, total_amount,
    payment_gateway, gateway_order_id, gateway_payment_id, gateway_signature,
    payment_status, payment_date, refundable, receipt_number, idempotency_key, metadata
  )
  values
    (p_vendor_id, v_category, 'onboarding_fee', v_onboarding_fee, v_tax, v_onboarding_fee + v_tax,
      'razorpay', p_gateway_order_id, p_gateway_payment_id, p_gateway_signature,
      'paid', v_now, false, 'SSL-ONB-' || upper(left(p_vendor_id::text, 8)), 'onboarding_fee:' || p_gateway_payment_id, p_metadata),
    (p_vendor_id, v_category, 'security_deposit', v_security_deposit, 0, v_security_deposit,
      'razorpay', p_gateway_order_id, p_gateway_payment_id, p_gateway_signature,
      'paid', v_now, true, 'SSL-SEC-' || upper(left(p_vendor_id::text, 8)), 'security_deposit:' || p_gateway_payment_id, p_metadata)
  on conflict (idempotency_key) do nothing;

  update public.vendor_onboarding
  set payment_status = 'payment_completed',
      payment_completed_at = v_now,
      updated_at = v_now
  where vendor_id = p_vendor_id;

  update public.vendors
  set onboarding_payment_status = 'payment_completed',
      lifecycle_status = case when kyc_status = 'kyc_verified' then 'approval_pending' else lifecycle_status end,
      status = case when kyc_status = 'kyc_verified' then 'approval_pending' else status end,
      onboarding_completed_at = v_now
  where id = p_vendor_id;

  return public.vendor_onboarding_payment_summary(p_vendor_id);
end;
$$;

create or replace function public.record_platform_order_charge(
  p_order_id uuid,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.hyperlocal_orders%rowtype;
  v_vendor public.vendors%rowtype;
  v_rule public.vendor_fee_rules%rowtype;
  v_existing public.platform_order_charges%rowtype;
  v_charge numeric(12,2);
  v_tax numeric(12,2);
begin
  select * into v_order
  from public.hyperlocal_orders
  where id = p_order_id
  for update;

  if not found then raise exception 'Order not found.'; end if;
  if v_order.status <> 'completed' then raise exception 'Platform charge applies only to completed orders.'; end if;

  select * into v_existing
  from public.platform_order_charges
  where order_id = p_order_id and charge_status <> 'reversed'
  limit 1;
  if found then return to_jsonb(v_existing); end if;

  select * into v_vendor from public.vendors where id = v_order.vendor_id;
  if not found then raise exception 'Vendor not found.'; end if;

  select * into v_rule from public.current_vendor_fee_rule(coalesce(v_vendor.category, 'other'));
  if not found then select * into v_rule from public.current_vendor_fee_rule('other'); end if;

  v_charge := greatest(coalesce(v_rule.per_completed_order_charge, 25), case when coalesce(v_rule.category_slug, 'other') = 'other' then 25 else 0 end);
  v_tax := round((v_charge * coalesce(v_rule.tax_rate_percent, 0) / 100.0), 2);

  insert into public.platform_order_charges (
    order_id, vendor_id, category_slug, fee_rule_id, charge_amount, tax_amount, total_amount, idempotency_key, metadata
  )
  values (
    p_order_id, v_order.vendor_id, coalesce(v_rule.category_slug, 'other'), v_rule.id,
    v_charge, v_tax, v_charge + v_tax, 'completed_order_platform_charge:' || p_order_id::text,
    jsonb_build_object('order_total', v_order.total_amount, 'actor_user_id', p_actor_user_id)
  )
  returning * into v_existing;

  insert into public.vendor_payments (
    vendor_id, category_slug, charge_type, base_amount, tax_amount, total_amount,
    payment_status, payment_date, refundable, receipt_number, idempotency_key, metadata
  )
  values (
    v_order.vendor_id, coalesce(v_rule.category_slug, 'other'), 'per_order_platform_charge',
    v_charge, v_tax, v_charge + v_tax, 'paid', now(), false,
    'SSL-ORD-' || upper(left(p_order_id::text, 8)),
    'per_order_platform_charge:' || p_order_id::text,
    jsonb_build_object('order_id', p_order_id, 'direct_customer_payment_to_vendor', true)
  )
  on conflict (idempotency_key) do nothing;

  return to_jsonb(v_existing);
end;
$$;

revoke all on function public.vendor_onboarding_payment_summary(uuid) from public;
revoke all on function public.record_vendor_onboarding_payment(uuid, text, text, text, jsonb) from public;
revoke all on function public.record_platform_order_charge(uuid, uuid) from public;
grant execute on function public.vendor_onboarding_payment_summary(uuid) to authenticated, service_role;
grant execute on function public.record_vendor_onboarding_payment(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.record_platform_order_charge(uuid, uuid) to service_role;

create or replace function public.mask_aadhaar_last4(p_value text)
returns text
language sql
immutable
as $$
  select case
    when p_value is null or length(regexp_replace(p_value, '\D', '', 'g')) < 4 then null
    else 'XXXX-XXXX-' || right(regexp_replace(p_value, '\D', '', 'g'), 4)
  end
$$;

comment on table public.vendor_kyc_documents is 'Private KYC metadata only. Store files in private bucket vendor-kyc-private; do not expose public URLs.';
comment on column public.vendor_kyc_documents.aadhaar_last4 is 'Store only last four digits for display; never store full Aadhaar here.';
