-- SabSewa Local - Vendor onboarding Partner Referral hardening
-- Safe to run more than once. Preserves existing vendor and partner records.

alter table public.vendors
  add column if not exists attributed_partner_id uuid,
  add column if not exists referred_by_partner_flag boolean not null default false,
  add column if not exists partner_referral_code_used text,
  add column if not exists partner_attribution_verified_at timestamptz,
  add column if not exists partner_attribution_locked boolean not null default false,
  add column if not exists referral_source_type text not null default 'direct_company',
  add column if not exists referrer_partner_id uuid,
  add column if not exists referral_code_entered text,
  add column if not exists referral_status text not null default 'direct_company',
  add column if not exists referred_at timestamptz,
  add column if not exists referral_confirmed_by_vendor boolean not null default false,
  add column if not exists attribution_method text,
  add column if not exists referral_validated_at timestamptz,
  add column if not exists referral_validated_by uuid,
  add column if not exists commission_eligibility_status text not null default 'not_partner_referred';

alter table public.partner_referred_vendors
  add column if not exists partner_id text,
  add column if not exists referral_code text,
  add column if not exists vendor_onboarding_date timestamptz,
  add column if not exists vendor_activation_date timestamptz,
  add column if not exists referred_shop_terminal_id uuid,
  add column if not exists referral_source text,
  add column if not exists referral_source_type text not null default 'approved_partner',
  add column if not exists referral_confirmed_by_vendor boolean not null default true,
  add column if not exists attribution_method text,
  add column if not exists validated_at timestamptz,
  add column if not exists validated_by uuid,
  add column if not exists commission_eligibility_status text not null default 'pending_eligible_revenue',
  add column if not exists eligible_revenue_amount numeric(12,2) not null default 0,
  add column if not exists benefit_percent numeric(5,2) not null default 10.00,
  add column if not exists attributed_at timestamptz,
  add column if not exists updated_at timestamptz;

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.partner_referred_vendors'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%referral_status%'
  loop
    execute format('alter table public.partner_referred_vendors drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.partner_referred_vendors
  add constraint partner_referred_vendors_referral_status_check
  check (referral_status in ('submitted', 'attributed', 'verified', 'approved', 'rejected', 'commission_eligible', 'commission_paused'));

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.vendors'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%referral_source_type%'
  loop
    execute format('alter table public.vendors drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.vendors
  add constraint vendors_referral_source_type_check
  check (referral_source_type in ('approved_partner', 'direct_company', 'company_campaign', 'admin_assisted', 'unknown_legacy'));

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.vendors'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%commission_eligibility_status%'
  loop
    execute format('alter table public.vendors drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.vendors
  add constraint vendors_commission_eligibility_status_check
  check (commission_eligibility_status in ('not_partner_referred', 'pending_partner_validation', 'pending_eligible_revenue', 'eligible', 'paused', 'rejected'));

with duplicate_vendor_referrals as (
  select ctid,
         row_number() over (partition by vendor_id order by coalesce(updated_at, attributed_at, created_at, now()) desc, ctid desc) as rn
  from public.partner_referred_vendors
  where vendor_id is not null
)
delete from public.partner_referred_vendors prv
using duplicate_vendor_referrals d
where prv.ctid = d.ctid
  and d.rn > 1;

drop index if exists public.uq_partner_referred_vendors_vendor_id;
create unique index if not exists uq_partner_referred_vendors_vendor_id
  on public.partner_referred_vendors(vendor_id);

create index if not exists idx_vendors_partner_referral_hardening
  on public.vendors(referral_source_type, referral_status, attributed_partner_id, partner_referral_code_used);

create index if not exists idx_partner_referred_vendors_referral_hardening
  on public.partner_referred_vendors(partner_application_id, referral_code, referral_status, commission_eligibility_status);

create table if not exists public.partner_referral_attribution_audit (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null,
  previous_partner_application_id uuid,
  new_partner_application_id uuid,
  previous_referral_code text,
  new_referral_code text,
  action text not null,
  reason text,
  actor_user_id uuid,
  actor_role text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.partner_referral_attribution_audit enable row level security;

drop policy if exists "Company admins manage partner referral attribution audit" on public.partner_referral_attribution_audit;
create policy "Company admins manage partner referral attribution audit"
  on public.partner_referral_attribution_audit
  for all
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('master_admin', 'super_admin', 'admin', 'company_admin', 'national_admin', 'state_admin', 'district_admin', 'city_admin', 'kyc_reviewer', 'finance_admin'))
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('master_admin', 'super_admin', 'admin', 'company_admin', 'national_admin', 'state_admin', 'district_admin', 'city_admin', 'kyc_reviewer', 'finance_admin'));

grant select, insert on public.partner_referral_attribution_audit to authenticated;
grant all on public.partner_referral_attribution_audit to service_role;

create or replace function public.sync_partner_referral_from_vendor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
  v_partner_code text;
  v_percent numeric(5,2);
begin
  if coalesce(new.referred_by_partner_flag, false) is not true then
    return new;
  end if;

  if new.attributed_partner_id is not null then
    select id, coalesce(referral_code, partner_id, application_id), coalesce(revenue_share_percent, 10.00)
      into v_partner_id, v_partner_code, v_percent
    from public.partner_applications
    where id = new.attributed_partner_id
      and status = 'active'
    limit 1;
  end if;

  if v_partner_id is null and nullif(new.partner_referral_code_used, '') is not null then
    select id, coalesce(referral_code, partner_id, application_id), coalesce(revenue_share_percent, 10.00)
      into v_partner_id, v_partner_code, v_percent
    from public.partner_applications
    where status = 'active'
      and (
        upper(coalesce(referral_code, '')) = upper(new.partner_referral_code_used)
        or upper(coalesce(partner_id, '')) = upper(new.partner_referral_code_used)
        or upper(coalesce(application_id, '')) = upper(new.partner_referral_code_used)
      )
    limit 1;
  end if;

  if v_partner_id is null then
    return new;
  end if;

  insert into public.partner_referred_vendors (
    partner_application_id,
    vendor_id,
    partner_id,
    referral_code,
    referral_status,
    vendor_onboarding_date,
    vendor_activation_date,
    referred_shop_terminal_id,
    referral_source,
    referral_source_type,
    referral_confirmed_by_vendor,
    attribution_method,
    validated_at,
    validated_by,
    commission_eligibility_status,
    benefit_percent,
    attributed_at,
    updated_at
  )
  values (
    v_partner_id,
    new.id,
    v_partner_code,
    coalesce(v_partner_code, new.partner_referral_code_used),
    case
      when new.status = 'active'
       and new.onboarding_payment_status = 'payment_completed'
       and new.kyc_status in ('kyc_verified', 'kyc_provisionally_cleared', 'provisional_approved')
      then 'commission_eligible'
      else 'attributed'
    end,
    coalesce(new.created_at, now()),
    case
      when new.status = 'active'
       and new.onboarding_payment_status = 'payment_completed'
       and new.kyc_status in ('kyc_verified', 'kyc_provisionally_cleared', 'provisional_approved')
      then now()
      else null
    end,
    null,
    coalesce(new.referral_source_type, 'approved_partner'),
    coalesce(new.referral_source_type, 'approved_partner'),
    coalesce(new.referral_confirmed_by_vendor, true),
    coalesce(new.attribution_method, 'vendor_registration_form'),
    coalesce(new.referral_validated_at, new.partner_attribution_verified_at, now()),
    new.referral_validated_by,
    case
      when new.status = 'active'
       and new.onboarding_payment_status = 'payment_completed'
       and new.kyc_status in ('kyc_verified', 'kyc_provisionally_cleared', 'provisional_approved')
      then 'eligible'
      else 'pending_eligible_revenue'
    end,
    coalesce(v_percent, 10.00),
    coalesce(new.partner_attribution_verified_at, new.referred_at, now()),
    now()
  )
  on conflict (vendor_id) do update
  set
    partner_application_id = excluded.partner_application_id,
    partner_id = excluded.partner_id,
    referral_code = excluded.referral_code,
    referral_status = case
      when public.partner_referred_vendors.referral_status in ('commission_eligible', 'commission_paused')
      then public.partner_referred_vendors.referral_status
      else excluded.referral_status
    end,
    vendor_onboarding_date = coalesce(public.partner_referred_vendors.vendor_onboarding_date, excluded.vendor_onboarding_date),
    vendor_activation_date = coalesce(public.partner_referred_vendors.vendor_activation_date, excluded.vendor_activation_date),
    referral_source = excluded.referral_source,
    referral_source_type = excluded.referral_source_type,
    referral_confirmed_by_vendor = excluded.referral_confirmed_by_vendor,
    attribution_method = excluded.attribution_method,
    validated_at = coalesce(public.partner_referred_vendors.validated_at, excluded.validated_at),
    validated_by = coalesce(public.partner_referred_vendors.validated_by, excluded.validated_by),
    commission_eligibility_status = excluded.commission_eligibility_status,
    benefit_percent = excluded.benefit_percent,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_sync_partner_referral_from_vendor on public.vendors;
create trigger trg_sync_partner_referral_from_vendor
after insert or update of attributed_partner_id, partner_referral_code_used, referred_by_partner_flag, status, onboarding_payment_status, kyc_status, referral_source_type, referral_status
on public.vendors
for each row
execute function public.sync_partner_referral_from_vendor();

update public.vendors
set
  referral_source_type = case when coalesce(referred_by_partner_flag, false) then 'approved_partner' else 'direct_company' end,
  referral_status = case when coalesce(referred_by_partner_flag, false) then coalesce(nullif(referral_status, 'direct_company'), 'attributed') else 'direct_company' end,
  commission_eligibility_status = case when coalesce(referred_by_partner_flag, false) then coalesce(nullif(commission_eligibility_status, 'not_partner_referred'), 'pending_eligible_revenue') else 'not_partner_referred' end
where referral_source_type is null
   or referral_status is null
   or commission_eligibility_status is null;

insert into public.partner_referred_vendors (
  partner_application_id,
  vendor_id,
  partner_id,
  referral_code,
  referral_status,
  vendor_onboarding_date,
  vendor_activation_date,
  referral_source,
  referral_source_type,
  referral_confirmed_by_vendor,
  attribution_method,
  validated_at,
  commission_eligibility_status,
  benefit_percent,
  attributed_at,
  updated_at
)
select
  p.id,
  v.id,
  coalesce(p.partner_id, p.referral_code, p.application_id),
  coalesce(p.referral_code, p.partner_id, p.application_id, v.partner_referral_code_used),
  case
    when v.status = 'active'
     and v.onboarding_payment_status = 'payment_completed'
     and v.kyc_status in ('kyc_verified', 'kyc_provisionally_cleared', 'provisional_approved')
    then 'commission_eligible'
    else 'attributed'
  end,
  coalesce(v.created_at, now()),
  case
    when v.status = 'active'
     and v.onboarding_payment_status = 'payment_completed'
     and v.kyc_status in ('kyc_verified', 'kyc_provisionally_cleared', 'provisional_approved')
    then now()
    else null
  end,
  'vendor_registration_partner_referral_backfill',
  'approved_partner',
  coalesce(v.referral_confirmed_by_vendor, true),
  coalesce(v.attribution_method, 'legacy_backfill'),
  coalesce(v.referral_validated_at, v.partner_attribution_verified_at, now()),
  case
    when v.status = 'active'
     and v.onboarding_payment_status = 'payment_completed'
     and v.kyc_status in ('kyc_verified', 'kyc_provisionally_cleared', 'provisional_approved')
    then 'eligible'
    else 'pending_eligible_revenue'
  end,
  coalesce(p.revenue_share_percent, 10.00),
  coalesce(v.partner_attribution_verified_at, v.referred_at, now()),
  now()
from public.vendors v
join public.partner_applications p
  on p.id = v.attributed_partner_id
  or upper(coalesce(p.referral_code, '')) = upper(coalesce(v.partner_referral_code_used, ''))
  or upper(coalesce(p.partner_id, '')) = upper(coalesce(v.partner_referral_code_used, ''))
  or upper(coalesce(p.application_id, '')) = upper(coalesce(v.partner_referral_code_used, ''))
where coalesce(v.referred_by_partner_flag, false) is true
  and p.status = 'active'
  and (v.attributed_partner_id is not null or nullif(v.partner_referral_code_used, '') is not null)
on conflict (vendor_id) do update
set
  partner_application_id = excluded.partner_application_id,
  partner_id = excluded.partner_id,
  referral_code = excluded.referral_code,
  referral_status = case
    when public.partner_referred_vendors.referral_status in ('commission_eligible', 'commission_paused')
    then public.partner_referred_vendors.referral_status
    else excluded.referral_status
  end,
  vendor_onboarding_date = coalesce(public.partner_referred_vendors.vendor_onboarding_date, excluded.vendor_onboarding_date),
  vendor_activation_date = coalesce(public.partner_referred_vendors.vendor_activation_date, excluded.vendor_activation_date),
  referral_source = excluded.referral_source,
  referral_source_type = excluded.referral_source_type,
  referral_confirmed_by_vendor = excluded.referral_confirmed_by_vendor,
  attribution_method = coalesce(public.partner_referred_vendors.attribution_method, excluded.attribution_method),
  validated_at = coalesce(public.partner_referred_vendors.validated_at, excluded.validated_at),
  commission_eligibility_status = excluded.commission_eligibility_status,
  benefit_percent = excluded.benefit_percent,
  updated_at = now();

comment on column public.vendors.referral_source_type is 'Vendor onboarding source: approved_partner, direct_company, company_campaign, admin_assisted or unknown_legacy.';
comment on column public.partner_referred_vendors.commission_eligibility_status is 'Commission remains pending until the Partner is active, vendor is approved/paid/active and eligible company revenue is generated.';
