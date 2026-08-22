-- SabSewa Local - Vendor owner/entity/branch onboarding foundation
-- Safe to run multiple times. It preserves existing vendors, KYC, payments and wallet data.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.vendor_owner_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  verified_phone text,
  verified_email text,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'closed', 'under_review')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_vendor_owner_accounts_updated_at on public.vendor_owner_accounts;
create trigger trg_vendor_owner_accounts_updated_at
before update on public.vendor_owner_accounts
for each row execute function public.set_updated_at();

create table if not exists public.vendor_legal_entities (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid references public.vendor_owner_accounts(id) on delete restrict,
  auth_user_id uuid,
  legal_entity_name text not null,
  entity_type text not null default 'individual'
    check (entity_type in ('individual', 'proprietorship', 'partnership', 'llp', 'company', 'trust_society', 'other')),
  pan_number text,
  gstin text,
  ownership_verification_status text not null default 'pending'
    check (ownership_verification_status in ('pending', 'under_review', 'verified', 'rejected', 'additional_information_required')),
  kyc_status text not null default 'kyc_not_started'
    check (kyc_status in ('kyc_not_started', 'kyc_submitted', 'kyc_under_review', 'additional_information_required', 'kyc_verified', 'kyc_rejected')),
  status text not null default 'pending'
    check (status in ('pending', 'under_review', 'approved', 'active', 'suspended', 'terminated', 'rejected')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_vendor_legal_entities_updated_at on public.vendor_legal_entities;
create trigger trg_vendor_legal_entities_updated_at
before update on public.vendor_legal_entities
for each row execute function public.set_updated_at();

create unique index if not exists uq_vendor_legal_entities_owner_pan
  on public.vendor_legal_entities(owner_account_id, upper(pan_number))
  where pan_number is not null and btrim(pan_number) <> '';

create unique index if not exists uq_vendor_legal_entities_owner_gstin
  on public.vendor_legal_entities(owner_account_id, upper(gstin))
  where gstin is not null and btrim(gstin) <> '';

create table if not exists public.vendor_branches (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid references public.vendor_legal_entities(id) on delete restrict,
  vendor_id uuid references public.vendors(id) on delete set null,
  branch_name text not null,
  shop_category text,
  manager_name text,
  phone text,
  address text,
  pin_code text,
  locality text,
  city text,
  state text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  kyc_status text not null default 'kyc_not_started'
    check (kyc_status in ('kyc_not_started', 'kyc_submitted', 'kyc_under_review', 'additional_information_required', 'kyc_verified', 'kyc_rejected')),
  licence_status text not null default 'not_submitted'
    check (licence_status in ('not_required', 'not_submitted', 'submitted', 'verified', 'rejected', 'additional_information_required')),
  activation_status text not null default 'pending'
    check (activation_status in ('pending', 'kyc_pending', 'payment_pending', 'approval_pending', 'active', 'suspended', 'terminated', 'rejected')),
  applicable_plan_id text,
  pricing_model text not null default 'per_branch'
    check (pricing_model in ('per_owner', 'per_legal_entity', 'per_branch', 'per_terminal', 'manual_company_approval')),
  payment_status text not null default 'payment_locked'
    check (payment_status in ('payment_locked', 'payment_pending', 'payment_completed', 'payment_failed', 'waived', 'refunded')),
  security_deposit_paise integer not null default 0,
  onboarding_fee_paise integer not null default 0,
  gst_paise integer not null default 0,
  total_payable_paise integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_vendor_branches_updated_at on public.vendor_branches;
create trigger trg_vendor_branches_updated_at
before update on public.vendor_branches
for each row execute function public.set_updated_at();

create unique index if not exists uq_vendor_branches_vendor_id
  on public.vendor_branches(vendor_id)
  where vendor_id is not null;

create table if not exists public.vendor_onboarding_plans (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null unique,
  plan_name text not null,
  applicability_basis text not null default 'per_branch'
    check (applicability_basis in ('per_owner', 'per_legal_entity', 'per_branch', 'per_terminal', 'manual_company_approval')),
  category_codes jsonb not null default '[]'::jsonb,
  security_deposit_paise integer not null check (security_deposit_paise >= 0),
  onboarding_fee_paise integer not null check (onboarding_fee_paise >= 0),
  gst_rate_bps integer not null default 1800 check (gst_rate_bps >= 0),
  gst_paise integer not null check (gst_paise >= 0),
  total_payable_paise integer not null check (total_payable_paise >= 0),
  currency text not null default 'INR',
  refund_policy text not null default 'security_deposit_refundable_subject_to_dues_fee_and_gst_non_refundable',
  is_active boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_vendor_onboarding_plans_updated_at on public.vendor_onboarding_plans;
create trigger trg_vendor_onboarding_plans_updated_at
before update on public.vendor_onboarding_plans
for each row execute function public.set_updated_at();

insert into public.vendor_onboarding_plans
  (plan_id, plan_name, category_codes, security_deposit_paise, onboarding_fee_paise, gst_rate_bps, gst_paise, total_payable_paise, sort_order, metadata)
values
  ('onboarding_plan_1', 'Plan 1 - Low onboarding fee', '["FRUIT_VEGETABLE","HOME_BUSINESS"]'::jsonb, 500000,  50000, 1800,  9000, 559000, 10, '{"display_total":"Rs 5,590","gst_basis":"GST only on Rs 500 onboarding/platform fee"}'::jsonb),
  ('onboarding_plan_2', 'Plan 2 - Standard onboarding fee', '["KIRANA_GENERAL","BAKERY_DAIRY","CLOTHING_TAILORING"]'::jsonb, 500000, 100000, 1800, 18000, 618000, 20, '{"display_total":"Rs 6,180","gst_basis":"GST only on Rs 1,000 onboarding/platform fee"}'::jsonb),
  ('onboarding_plan_3', 'Plan 3 - Regulated/high-support onboarding fee', '["PHARMACY_MEDICAL","RESTAURANT_FOOD","HARDWARE_REPAIR","OTHER"]'::jsonb, 500000, 200000, 1800, 36000, 736000, 30, '{"display_total":"Rs 7,360","gst_basis":"GST only on Rs 2,000 onboarding/platform fee"}'::jsonb)
on conflict (plan_id) do update
set plan_name = excluded.plan_name,
    category_codes = excluded.category_codes,
    security_deposit_paise = excluded.security_deposit_paise,
    onboarding_fee_paise = excluded.onboarding_fee_paise,
    gst_rate_bps = excluded.gst_rate_bps,
    gst_paise = excluded.gst_paise,
    total_payable_paise = excluded.total_payable_paise,
    refund_policy = excluded.refund_policy,
    is_active = true,
    sort_order = excluded.sort_order,
    metadata = excluded.metadata,
    updated_at = now();

alter table public.vendors
  add column if not exists owner_account_id uuid references public.vendor_owner_accounts(id) on delete set null,
  add column if not exists legal_entity_id uuid references public.vendor_legal_entities(id) on delete set null,
  add column if not exists branch_id uuid references public.vendor_branches(id) on delete set null,
  add column if not exists onboarding_plan_id text,
  add column if not exists onboarding_fee_paise integer,
  add column if not exists onboarding_gst_paise integer,
  add column if not exists security_deposit_paise integer,
  add column if not exists total_onboarding_payment_paise integer,
  add column if not exists onboarding_charge_basis text,
  add column if not exists duplicate_review_status text not null default 'not_required',
  add column if not exists existing_vendor_detection jsonb not null default '{}'::jsonb;

create table if not exists public.vendor_onboarding_decisions (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  vendor_id uuid references public.vendors(id) on delete set null,
  legal_entity_id uuid references public.vendor_legal_entities(id) on delete set null,
  branch_id uuid references public.vendor_branches(id) on delete set null,
  action text not null check (action in (
    'open_existing_vendor_dashboard',
    'continue_pending_kyc',
    'continue_pending_onboarding_payment',
    'register_additional_branch',
    'register_additional_legal_entity',
    'add_authorized_terminal',
    'contact_support_wrong_registration'
  )),
  decision_status text not null default 'recorded'
    check (decision_status in ('recorded', 'company_review_required', 'approved', 'rejected', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_vendor_onboarding_decisions_updated_at on public.vendor_onboarding_decisions;
create trigger trg_vendor_onboarding_decisions_updated_at
before update on public.vendor_onboarding_decisions
for each row execute function public.set_updated_at();

create table if not exists public.vendor_onboarding_payment_ledger (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  payment_attempt_id uuid references public.vendor_payment_attempts(id) on delete set null,
  line_type text not null check (line_type in (
    'SECURITY_DEPOSIT_CREDIT',
    'ONBOARDING_PLATFORM_FEE',
    'OUTPUT_GST',
    'RAZORPAY_PROCESSING_CHARGE',
    'PAYMENT_RECONCILIATION',
    'REFUND_SECURITY_DEPOSIT',
    'ADJUSTMENT'
  )),
  amount_paise integer not null,
  currency text not null default 'INR',
  refundable boolean not null default false,
  taxable boolean not null default false,
  ledger_status text not null default 'posted' check (ledger_status in ('pending', 'posted', 'reversed', 'void')),
  gateway_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_vendor_onboarding_payment_ledger_attempt_line
  on public.vendor_onboarding_payment_ledger(payment_attempt_id, line_type);

create or replace function public.sync_vendor_onboarding_payment_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation jsonb;
  v_security integer;
  v_fee integer;
  v_gst integer;
begin
  if new.charge_type <> 'onboarding_fee' then
    return new;
  end if;

  if coalesce(new.payment_status, '') not in ('captured', 'paid', 'completed', 'payment_completed') then
    return new;
  end if;

  v_allocation := coalesce(new.metadata -> 'allocation', '{}'::jsonb);
  v_security := coalesce((v_allocation ->> 'security_deposit_paise')::integer, 0);
  v_fee := coalesce((v_allocation ->> 'onboarding_fee_paise')::integer, greatest(coalesce(new.base_amount_paise, 0) - v_security, 0));
  v_gst := coalesce(new.tax_amount_paise, 0);

  if v_security > 0 then
    insert into public.vendor_onboarding_payment_ledger
      (vendor_id, payment_attempt_id, line_type, amount_paise, currency, refundable, taxable, gateway_reference, metadata)
    values
      (new.vendor_id, new.id, 'SECURITY_DEPOSIT_CREDIT', v_security, coalesce(new.currency, 'INR'), true, false, new.razorpay_payment_id, '{"wallet_visible":true}'::jsonb)
    on conflict (payment_attempt_id, line_type) do update
      set amount_paise = excluded.amount_paise, gateway_reference = excluded.gateway_reference, metadata = excluded.metadata;
  end if;

  if v_fee > 0 then
    insert into public.vendor_onboarding_payment_ledger
      (vendor_id, payment_attempt_id, line_type, amount_paise, currency, refundable, taxable, gateway_reference, metadata)
    values
      (new.vendor_id, new.id, 'ONBOARDING_PLATFORM_FEE', v_fee, coalesce(new.currency, 'INR'), false, true, new.razorpay_payment_id, '{"wallet_visible":false}'::jsonb)
    on conflict (payment_attempt_id, line_type) do update
      set amount_paise = excluded.amount_paise, gateway_reference = excluded.gateway_reference, metadata = excluded.metadata;
  end if;

  if v_gst > 0 then
    insert into public.vendor_onboarding_payment_ledger
      (vendor_id, payment_attempt_id, line_type, amount_paise, currency, refundable, taxable, gateway_reference, metadata)
    values
      (new.vendor_id, new.id, 'OUTPUT_GST', v_gst, coalesce(new.currency, 'INR'), false, false, new.razorpay_payment_id, '{"gst_on":"ONBOARDING_PLATFORM_FEE"}'::jsonb)
    on conflict (payment_attempt_id, line_type) do update
      set amount_paise = excluded.amount_paise, gateway_reference = excluded.gateway_reference, metadata = excluded.metadata;
  end if;

  insert into public.vendor_onboarding_payment_ledger
    (vendor_id, payment_attempt_id, line_type, amount_paise, currency, refundable, taxable, gateway_reference, metadata)
  values
    (new.vendor_id, new.id, 'PAYMENT_RECONCILIATION', coalesce(new.total_amount_paise, 0), coalesce(new.currency, 'INR'), false, false, new.razorpay_payment_id, '{"purpose":"gateway_total_reconciliation"}'::jsonb)
  on conflict (payment_attempt_id, line_type) do update
    set amount_paise = excluded.amount_paise, gateway_reference = excluded.gateway_reference, metadata = excluded.metadata;

  return new;
end;
$$;

drop trigger if exists trg_sync_vendor_onboarding_payment_ledger on public.vendor_payment_attempts;
create trigger trg_sync_vendor_onboarding_payment_ledger
after insert or update of payment_status, razorpay_payment_id, metadata, total_amount_paise, tax_amount_paise
on public.vendor_payment_attempts
for each row execute function public.sync_vendor_onboarding_payment_ledger();

alter table public.vendor_owner_accounts enable row level security;
alter table public.vendor_legal_entities enable row level security;
alter table public.vendor_branches enable row level security;
alter table public.vendor_onboarding_plans enable row level security;
alter table public.vendor_onboarding_decisions enable row level security;
alter table public.vendor_onboarding_payment_ledger enable row level security;

drop policy if exists "Owners read own vendor owner account" on public.vendor_owner_accounts;
create policy "Owners read own vendor owner account"
  on public.vendor_owner_accounts for select
  using (auth_user_id = auth.uid() or public.is_company_admin());

drop policy if exists "Owners read own vendor legal entities" on public.vendor_legal_entities;
create policy "Owners read own vendor legal entities"
  on public.vendor_legal_entities for select
  using (auth_user_id = auth.uid() or public.is_company_admin());

drop policy if exists "Owners read own vendor branches" on public.vendor_branches;
create policy "Owners read own vendor branches"
  on public.vendor_branches for select
  using (
    public.is_company_admin()
    or exists (
      select 1
      from public.vendor_legal_entities e
      where e.id = vendor_branches.legal_entity_id
        and e.auth_user_id = auth.uid()
    )
    or public.owns_vendor(vendor_id)
  );

drop policy if exists "Authenticated read active vendor onboarding plans" on public.vendor_onboarding_plans;
create policy "Authenticated read active vendor onboarding plans"
  on public.vendor_onboarding_plans for select
  using (is_active = true or public.is_company_admin());

drop policy if exists "Owners read own onboarding decisions" on public.vendor_onboarding_decisions;
create policy "Owners read own onboarding decisions"
  on public.vendor_onboarding_decisions for select
  using (actor_user_id = auth.uid() or public.is_company_admin());

drop policy if exists "Owners create own onboarding decisions" on public.vendor_onboarding_decisions;
create policy "Owners create own onboarding decisions"
  on public.vendor_onboarding_decisions for insert
  with check (actor_user_id = auth.uid() or public.is_company_admin());

drop policy if exists "Owners read own onboarding payment ledger" on public.vendor_onboarding_payment_ledger;
create policy "Owners read own onboarding payment ledger"
  on public.vendor_onboarding_payment_ledger for select
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

grant select on public.vendor_onboarding_plans to anon, authenticated;
grant select, insert on public.vendor_onboarding_decisions to authenticated;
grant select on public.vendor_owner_accounts, public.vendor_legal_entities, public.vendor_branches, public.vendor_onboarding_payment_ledger to authenticated;
grant all on public.vendor_owner_accounts, public.vendor_legal_entities, public.vendor_branches, public.vendor_onboarding_plans, public.vendor_onboarding_decisions, public.vendor_onboarding_payment_ledger to service_role;

comment on table public.vendor_owner_accounts is 'Authenticated person or owner account that may control one or more vendor legal entities.';
comment on table public.vendor_legal_entities is 'Legal business entity under a vendor owner account. Additional businesses are represented here rather than duplicating owner identity.';
comment on table public.vendor_branches is 'Individual shop/branch under a legal entity, optionally linked to the current vendors table for ordering and terminal operations.';
comment on table public.vendor_onboarding_plans is 'Authoritative onboarding price plans. GST is applied only on the non-refundable onboarding/platform fee; refundable security deposit is stored separately.';
comment on table public.vendor_onboarding_payment_ledger is 'Split ledger for onboarding payments: refundable security deposit, non-refundable fee, output GST and reconciliation lines.';
