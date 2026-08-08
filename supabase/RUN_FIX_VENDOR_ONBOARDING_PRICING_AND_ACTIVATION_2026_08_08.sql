-- SabSewa Local vendor onboarding pricing + activation repair
-- Run this once in Supabase SQL editor before accepting real vendor onboarding payments.

begin;

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
    is_active = true,
    updated_at = now();

insert into public.vendor_fee_rules
  (category_slug, onboarding_fee_amount, security_deposit_amount, per_completed_order_charge, tax_rate_percent, currency, is_active, effective_from, effective_to)
select seed.category_slug, seed.onboarding_fee_amount, seed.security_deposit_amount, seed.per_completed_order_charge, seed.tax_rate_percent, 'INR', true, now(), null
from (
  values
    ('vegetables', 500::numeric, 5000::numeric, 15::numeric, 18::numeric),
    ('fruits', 500::numeric, 5000::numeric, 15::numeric, 18::numeric),
    ('kirana', 1000::numeric, 5000::numeric, 15::numeric, 18::numeric),
    ('grocery', 1000::numeric, 5000::numeric, 15::numeric, 18::numeric),
    ('pharmacy', 2000::numeric, 5000::numeric, 25::numeric, 18::numeric),
    ('medical', 2000::numeric, 5000::numeric, 25::numeric, 18::numeric),
    ('restaurant', 2000::numeric, 5000::numeric, 25::numeric, 18::numeric),
    ('tiffin', 2000::numeric, 5000::numeric, 25::numeric, 18::numeric),
    ('other', 2000::numeric, 5000::numeric, 25::numeric, 18::numeric)
) as seed(category_slug, onboarding_fee_amount, security_deposit_amount, per_completed_order_charge, tax_rate_percent)
where not exists (
  select 1
  from public.vendor_fee_rules existing
  where existing.category_slug = seed.category_slug
    and existing.is_active = true
    and existing.effective_to is null
);

update public.vendor_fee_rules
set onboarding_fee_amount = case
      when category_slug in ('vegetables', 'fruits') then 500
      when category_slug in ('kirana', 'grocery') then 1000
      else 2000
    end,
    security_deposit_amount = 5000,
    per_completed_order_charge = case
      when category_slug in ('vegetables', 'fruits', 'kirana', 'grocery') then 15
      else 25
    end,
    tax_rate_percent = 18,
    currency = 'INR',
    is_active = true,
    effective_to = null,
    updated_at = now()
where category_slug in ('vegetables', 'fruits', 'kirana', 'grocery', 'pharmacy', 'medical', 'restaurant', 'tiffin', 'other')
  and is_active = true
  and effective_to is null;

create or replace function public.canonical_vendor_category_slug(p_category text)
returns text
language sql
immutable
as $$
  select case
    when nullif(trim(coalesce(p_category, '')), '') is null then 'other'
    when lower(p_category) in ('vegetables', 'fruits', 'kirana', 'grocery', 'pharmacy', 'medical', 'restaurant', 'tiffin', 'other')
      then lower(p_category)
    when lower(p_category) like '%veg%' or lower(p_category) like '%sabji%' or lower(p_category) like '%sabzi%' then 'vegetables'
    when lower(p_category) like '%fruit%' then 'fruits'
    when lower(p_category) like '%kirana%' or lower(p_category) like '%grocery%' or lower(p_category) like '%general%' then 'kirana'
    when lower(p_category) like '%pharma%' or lower(p_category) like '%medical%' or lower(p_category) like '%chemist%' then 'medical'
    when lower(p_category) like '%restaurant%' or lower(p_category) like '%food%' then 'restaurant'
    when lower(p_category) like '%tiffin%' then 'tiffin'
    else 'other'
  end
$$;

create or replace function public.current_vendor_fee_rule(p_category text)
returns public.vendor_fee_rules
language sql
stable
as $$
  select *
  from public.vendor_fee_rules
  where is_active = true
    and effective_to is null
    and category_slug = public.canonical_vendor_category_slug(p_category)
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
  v_slug text;
  v_tax numeric(12,2);
  v_total numeric(12,2);
  v_kyc text;
  v_payment text;
  v_status text;
begin
  select * into v_vendor from public.vendors where id = p_vendor_id;
  if not found then
    raise exception 'Vendor not found.';
  end if;

  v_slug := public.canonical_vendor_category_slug(coalesce(v_vendor.category, 'other'));

  select * into v_rule from public.current_vendor_fee_rule(v_slug);
  if not found then
    select * into v_rule from public.current_vendor_fee_rule('other');
  end if;

  if v_rule.id is null then
    raise exception 'Vendor onboarding fee rule is missing for category %. Seed vendor_fee_rules before accepting payments.', v_slug;
  end if;

  v_tax := round((v_rule.onboarding_fee_amount * coalesce(v_rule.tax_rate_percent, 0) / 100.0), 2);
  v_total := v_rule.onboarding_fee_amount + v_rule.security_deposit_amount + v_tax;
  v_kyc := coalesce(v_vendor.kyc_status, 'kyc_not_started');
  v_payment := coalesce(v_vendor.onboarding_payment_status, 'payment_pending');
  v_status := coalesce(v_vendor.lifecycle_status, v_vendor.status, 'registered');

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
    v_rule.category_slug,
    v_kyc,
    v_payment,
    case when v_status = 'active' then 'approved' else 'approval_pending' end,
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
    'category_slug', v_rule.category_slug,
    'canonical_category_slug', v_slug,
    'fee_rule_id', v_rule.id,
    'pricing_source', 'vendor_fee_rules',
    'pricing_configured', v_total > 0,
    'onboarding_fee', v_rule.onboarding_fee_amount,
    'security_deposit', v_rule.security_deposit_amount,
    'tax_amount', v_tax,
    'tax_rate_percent', v_rule.tax_rate_percent,
    'total_payable', v_total,
    'currency', v_rule.currency,
    'onboarding_fee_refundable', v_rule.onboarding_fee_refundable,
    'security_deposit_refundable', v_rule.security_deposit_refundable,
    'kyc_status', v_kyc,
    'payment_status', v_payment,
    'vendor_status', v_status,
    'lifecycle_status', v_status,
    'is_payment_unlocked', v_kyc = 'kyc_verified',
    'can_publish_products', v_status = 'active'
      and v_kyc = 'kyc_verified'
      and v_payment = 'payment_completed',
    'pricing', jsonb_build_object(
      'onboarding_fee', v_rule.onboarding_fee_amount,
      'security_deposit', v_rule.security_deposit_amount,
      'tax_amount', v_tax,
      'tax_rate_percent', v_rule.tax_rate_percent,
      'total_payable', v_total,
      'currency', v_rule.currency
    )
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
  v_vendor public.vendors%rowtype;
  v_summary jsonb;
  v_category text;
  v_onboarding_fee numeric(12,2);
  v_security_deposit numeric(12,2);
  v_tax numeric(12,2);
  v_total numeric(12,2);
  v_now timestamptz := now();
begin
  select * into v_vendor from public.vendors where id = p_vendor_id for update;
  if not found then
    raise exception 'Vendor not found.';
  end if;

  if coalesce(v_vendor.kyc_status, '') <> 'kyc_verified' then
    raise exception 'Complete KYC verification before recording onboarding payment.';
  end if;

  v_summary := public.vendor_onboarding_payment_summary(p_vendor_id);
  v_category := v_summary->>'category_slug';
  v_onboarding_fee := (v_summary->>'onboarding_fee')::numeric;
  v_security_deposit := (v_summary->>'security_deposit')::numeric;
  v_tax := (v_summary->>'tax_amount')::numeric;
  v_total := (v_summary->>'total_payable')::numeric;

  if coalesce(v_total, 0) <= 0 then
    raise exception 'Vendor onboarding payable amount is not configured.';
  end if;

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
      approval_status = 'approved',
      payment_completed_at = v_now,
      approved_at = coalesce(approved_at, v_now),
      updated_at = v_now
  where vendor_id = p_vendor_id;

  update public.vendors
  set onboarding_payment_status = 'payment_completed',
      lifecycle_status = 'active',
      status = 'active',
      public_verification_badge = true,
      activated_at = coalesce(activated_at, v_now),
      onboarding_completed_at = v_now,
      updated_at = v_now
  where id = p_vendor_id;

  insert into public.vendor_status_history (
    vendor_id,
    previous_status,
    next_status,
    changed_by,
    change_reason,
    metadata
  )
  values (
    p_vendor_id,
    coalesce(v_vendor.status, 'registered'),
    'active',
    null,
    'Activated automatically after verified KYC and verified onboarding payment',
    jsonb_build_object(
      'gateway_order_id', p_gateway_order_id,
      'gateway_payment_id', p_gateway_payment_id,
      'source', 'record_vendor_onboarding_payment'
    )
  )
  on conflict do nothing;

  return public.vendor_onboarding_payment_summary(p_vendor_id);
end;
$$;

revoke all on function public.canonical_vendor_category_slug(text) from public;
revoke all on function public.vendor_onboarding_payment_summary(uuid) from public;
revoke all on function public.record_vendor_onboarding_payment(uuid, text, text, text, jsonb) from public;
grant execute on function public.canonical_vendor_category_slug(text) to authenticated, service_role;
grant execute on function public.vendor_onboarding_payment_summary(uuid) to authenticated, service_role;
grant execute on function public.record_vendor_onboarding_payment(uuid, text, text, text, jsonb) to service_role;

commit;

select
  category_slug,
  onboarding_fee_amount,
  security_deposit_amount,
  tax_rate_percent,
  onboarding_fee_amount + security_deposit_amount + round((onboarding_fee_amount * tax_rate_percent / 100.0), 2) as total_payable,
  is_active,
  effective_to
from public.vendor_fee_rules
where category_slug in ('vegetables', 'fruits', 'kirana', 'grocery', 'pharmacy', 'medical', 'restaurant', 'tiffin', 'other')
  and is_active = true
  and effective_to is null
order by category_slug;
