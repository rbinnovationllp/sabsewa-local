-- SabSewa Local Partner Program expansion.
-- Safe additive runner. Run after RUN_ONLY_PARTNER_PROGRAM_APPLICATIONS.sql.

create extension if not exists "pgcrypto";

create table if not exists public.partner_program_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.partner_program_settings(key, value, description)
values
  (
    'default_benefit_percent',
    '{"percent": 10.00}'::jsonb,
    'Default configurable partner benefit percentage for eligible company revenue attributable to vendors successfully onboarded through an approved partner.'
  ),
  (
    'eligible_revenue_definition',
    jsonb_build_object(
      'summary', 'Partner benefit is a revenue/referral benefit, not company equity.',
      'included', jsonb_build_array('Eligible SabSewa Local company revenue actually realized from vendors attributed to the partner, subject to final Partner Program Terms.'),
      'excluded', jsonb_build_array('GST and statutory taxes', 'Refundable security deposits', 'Refunds', 'Chargebacks', 'Discounts', 'Payment gateway charges', 'Legally required deductions', 'Amounts not actually received by SabSewa Local')
    ),
    'Defines what the partner benefit applies to and explicitly excludes equity ownership.'
  )
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

alter table public.partner_applications
  add column if not exists partner_id text,
  add column if not exists referral_code text,
  add column if not exists referral_link text,
  add column if not exists applicant_category text,
  add column if not exists district text,
  add column if not exists proposed_area_of_operation text,
  add column if not exists vendor_onboarding_plan text,
  add column if not exists customer_awareness_plan text,
  add column if not exists hyperlocal_promotion_area text,
  add column if not exists assigned_geography text,
  add column if not exists active_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists payable_benefit_amount numeric(12,2) not null default 0,
  add column if not exists paid_benefit_amount numeric(12,2) not null default 0;

alter table public.partner_applications alter column email drop not null;

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.partner_applications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%partner_type%'
  loop
    execute format('alter table public.partner_applications drop constraint if exists %I', c.conname);
  end loop;

  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.partner_applications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.partner_applications drop constraint if exists %I', c.conname);
  end loop;

  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.partner_applications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%revenue_share_percent%'
  loop
    execute format('alter table public.partner_applications drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.partner_applications
  add constraint partner_applications_partner_type_check
  check (partner_type in (
    'Existing Customer',
    'Non-Customer',
    'Existing Vendor',
    'Non-Vendor',
    'Individual',
    'Local Business Promoter',
    'Marketing or Business Development Professional',
    'Consultant',
    'Organization',
    'NGO',
    'Educational Institution',
    'Other Stakeholder'
  ));

alter table public.partner_applications
  add constraint partner_applications_status_check
  check (status in ('pending', 'under_review', 'approved', 'rejected', 'active', 'suspended', 'revoked'));

alter table public.partner_applications
  add constraint partner_applications_revenue_share_percent_range_check
  check (revenue_share_percent >= 0 and revenue_share_percent <= 100);

create unique index if not exists uq_partner_applications_partner_id
  on public.partner_applications(partner_id)
  where partner_id is not null;

create unique index if not exists uq_partner_applications_referral_code
  on public.partner_applications(referral_code)
  where referral_code is not null;

create or replace function public.generate_partner_identity()
returns trigger
language plpgsql
as $$
declare
  suffix text;
begin
  if new.partner_id is null then
    suffix := upper(substr(replace(new.id::text, '-', ''), 1, 10));
    new.partner_id := 'SLP-' || suffix;
  end if;

  if new.referral_code is null then
    new.referral_code := 'SLP' || upper(substr(replace(new.id::text, '-', ''), 1, 8));
  end if;

  if new.referral_link is null and new.referral_code is not null then
    new.referral_link := 'https://www.sabsewa.in/vendor-registration?partner=' || new.referral_code;
  end if;

  if new.revenue_share_percent is null then
    new.revenue_share_percent := coalesce(
      ((select value->>'percent' from public.partner_program_settings where key = 'default_benefit_percent')::numeric),
      10.00
    );
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_generate_partner_identity on public.partner_applications;
create trigger trg_generate_partner_identity
before insert or update on public.partner_applications
for each row execute function public.generate_partner_identity();

update public.partner_applications
set partner_id = coalesce(partner_id, 'SLP-' || upper(substr(replace(id::text, '-', ''), 1, 10))),
    referral_code = coalesce(referral_code, 'SLP' || upper(substr(replace(id::text, '-', ''), 1, 8))),
    referral_link = coalesce(referral_link, 'https://www.sabsewa.in/vendor-registration?partner=' || coalesce(referral_code, 'SLP' || upper(substr(replace(id::text, '-', ''), 1, 8)))),
    updated_at = now()
where partner_id is null or referral_code is null or referral_link is null;

alter table public.partner_referred_vendors
  add column if not exists partner_id text,
  add column if not exists referral_code text,
  add column if not exists vendor_onboarding_date timestamptz,
  add column if not exists eligible_revenue_amount numeric(12,2) not null default 0,
  add column if not exists benefit_percent numeric(5,2) not null default 10.00,
  add column if not exists benefit_earned_amount numeric(12,2) generated always as (round((greatest(0, eligible_revenue_amount) * benefit_percent / 100.0), 2)) stored;

create index if not exists idx_partner_referred_vendors_vendor_id
  on public.partner_referred_vendors(vendor_id);

create index if not exists idx_partner_referred_vendors_referral_code
  on public.partner_referred_vendors(referral_code);

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.partner_commission_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%commission_percent%'
  loop
    execute format('alter table public.partner_commission_events drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.partner_commission_events
  add constraint partner_commission_events_commission_percent_range_check
  check (commission_percent >= 0 and commission_percent <= 100);

alter table public.partner_commission_events
  add column if not exists partner_id text,
  add column if not exists referral_code text,
  add column if not exists payment_reference text,
  add column if not exists paid_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz;

grant select, insert, update on public.partner_program_settings to authenticated;

drop policy if exists "Company admins manage partner program settings" on public.partner_program_settings;
alter table public.partner_program_settings enable row level security;
create policy "Company admins manage partner program settings"
  on public.partner_program_settings
  for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

drop policy if exists "Anyone can submit partner applications" on public.partner_applications;
create policy "Anyone can submit partner applications"
  on public.partner_applications
  for insert
  to anon, authenticated
  with check (
    terms_accepted = true
    and revenue_share_percent >= 0
    and revenue_share_percent <= 100
    and applicant_name is not null
    and phone is not null
    and city is not null
    and state is not null
  );

comment on column public.partner_applications.revenue_share_percent is
  'Configurable partner benefit percentage. Initial default is 10%, but Master Admin may change according to Partner Program Terms. This is a revenue/referral benefit, not company equity.';

comment on column public.partner_applications.customer_awareness_plan is
  'Partner plan for creating customer awareness and usage around onboarded local vendors.';

comment on column public.partner_referred_vendors.benefit_earned_amount is
  'Calculated partner benefit on eligible company revenue attributable to the referred vendor.';