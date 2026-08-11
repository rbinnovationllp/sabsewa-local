-- SabSewa Local - onboarding readiness / partner referral repair
-- Safe to run more than once. It preserves existing data.

alter table public.vendors
  add column if not exists attributed_partner_id uuid,
  add column if not exists referred_by_partner_flag boolean not null default false,
  add column if not exists partner_referral_code_used text,
  add column if not exists partner_attribution_verified_at timestamptz,
  add column if not exists partner_attribution_locked boolean not null default false;

alter table public.partner_referred_vendors
  add column if not exists partner_id text,
  add column if not exists referral_code text,
  add column if not exists vendor_onboarding_date timestamptz,
  add column if not exists vendor_activation_date timestamptz,
  add column if not exists referred_shop_terminal_id uuid,
  add column if not exists referral_source text,
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

-- Ensure ON CONFLICT (vendor_id) has a matching full unique index.
-- PostgreSQL cannot infer a partial unique index for plain ON CONFLICT (vendor_id).
with duplicate_vendor_referrals as (
  select ctid,
         row_number() over (partition by vendor_id order by ctid desc) as rn
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

create index if not exists idx_partner_referred_vendors_partner_referral
  on public.partner_referred_vendors(partner_application_id, referral_code, referral_status);

create index if not exists idx_vendors_partner_attribution
  on public.vendors(attributed_partner_id, referred_by_partner_flag, partner_referral_code_used);

-- Keep referral activation date aligned when a referred vendor becomes active and paid.
update public.partner_referred_vendors prv
set
  vendor_activation_date = coalesce(prv.vendor_activation_date, v.updated_at, now()),
  referral_status = case when prv.referral_status in ('submitted', 'attributed', 'verified', 'approved') then 'commission_eligible' else prv.referral_status end
from public.vendors v
where prv.vendor_id = v.id
  and v.status = 'active'
  and v.onboarding_payment_status = 'payment_completed'
  and v.kyc_status in ('kyc_verified', 'kyc_provisionally_cleared', 'provisional_approved')
  and prv.vendor_activation_date is null;

-- Auto-sync and backfill Partner referral rows from vendor attribution fields.
-- This closes the gap where a vendor has referral metadata but no partner_referred_vendors row yet.
create or replace function public.sync_partner_referral_from_vendor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
  v_partner_code text;
  v_partner_referral text;
  v_percent numeric(5,2);
begin
  if coalesce(new.referred_by_partner_flag, false) is not true then
    return new;
  end if;

  if new.attributed_partner_id is not null then
    select id, coalesce(referral_code, partner_id), coalesce(referral_code, partner_id), coalesce(revenue_share_percent, 10.00)
      into v_partner_id, v_partner_code, v_partner_referral, v_percent
    from public.partner_applications
    where id = new.attributed_partner_id
    limit 1;
  end if;

  if v_partner_id is null and nullif(new.partner_referral_code_used, '') is not null then
    select id, coalesce(referral_code, partner_id), coalesce(referral_code, partner_id), coalesce(revenue_share_percent, 10.00)
      into v_partner_id, v_partner_code, v_partner_referral, v_percent
    from public.partner_applications
    where upper(coalesce(referral_code, '')) = upper(new.partner_referral_code_used)
       or upper(coalesce(partner_id, '')) = upper(new.partner_referral_code_used)
       or upper(coalesce(application_id, '')) = upper(new.partner_referral_code_used)
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
    benefit_percent,
    attributed_at,
    updated_at
  )
  values (
    v_partner_id,
    new.id,
    v_partner_code,
    coalesce(v_partner_referral, new.partner_referral_code_used),
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
    'vendor_registration_referral',
    coalesce(v_percent, 10.00),
    coalesce(new.partner_attribution_verified_at, now()),
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
    referral_source = coalesce(public.partner_referred_vendors.referral_source, excluded.referral_source),
    benefit_percent = excluded.benefit_percent,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_sync_partner_referral_from_vendor on public.vendors;
create trigger trg_sync_partner_referral_from_vendor
after insert or update of attributed_partner_id, partner_referral_code_used, referred_by_partner_flag, status, onboarding_payment_status, kyc_status
on public.vendors
for each row
execute function public.sync_partner_referral_from_vendor();

-- Backfill existing vendors that already have Partner attribution fields.
insert into public.partner_referred_vendors (
  partner_application_id,
  vendor_id,
  partner_id,
  referral_code,
  referral_status,
  vendor_onboarding_date,
  vendor_activation_date,
  referral_source,
  benefit_percent,
  attributed_at,
  updated_at
)
select
  p.id,
  v.id,
  coalesce(p.partner_id, p.referral_code),
  coalesce(p.referral_code, p.partner_id, v.partner_referral_code_used),
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
  'vendor_registration_referral_backfill',
  coalesce(p.revenue_share_percent, 10.00),
  coalesce(v.partner_attribution_verified_at, now()),
  now()
from public.vendors v
join public.partner_applications p
  on p.id = v.attributed_partner_id
  or upper(coalesce(p.referral_code, '')) = upper(coalesce(v.partner_referral_code_used, ''))
  or upper(coalesce(p.partner_id, '')) = upper(coalesce(v.partner_referral_code_used, ''))
where coalesce(v.referred_by_partner_flag, false) is true
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
  referral_source = coalesce(public.partner_referred_vendors.referral_source, excluded.referral_source),
  benefit_percent = excluded.benefit_percent,
  updated_at = now();



