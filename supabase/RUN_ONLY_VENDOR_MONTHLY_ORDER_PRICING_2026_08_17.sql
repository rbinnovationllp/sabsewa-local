-- SabSewa Local - GST-inclusive category pricing plus optional monthly vendor accepted-order pricing
-- Safe to run more than once.
-- Run this revised file instead of any earlier monthly-only pricing SQL.

create extension if not exists pgcrypto;

create table if not exists public.vendor_order_fee_pricing_rules (
  rule_code text primary key,
  category_group text not null,
  category_slugs text[] not null,
  gross_fee_paise integer not null check (gross_fee_paise > 0),
  gst_rate_bps integer not null default 1800 check (gst_rate_bps >= 0),
  taxable_value_paise integer not null check (taxable_value_paise >= 0),
  gst_amount_paise integer not null check (gst_amount_paise >= 0),
  pricing_model text not null default 'pay_per_order',
  pricing_version text not null default 'vendor-gst-inclusive-pricing-local-2026-08-17',
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  is_active boolean not null default true,
  rounding_policy text not null default 'paise_integer_gross_reconciliation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (taxable_value_paise + gst_amount_paise = gross_fee_paise)
);

alter table public.vendor_order_fee_pricing_rules enable row level security;

drop policy if exists "Authenticated users read active vendor order pricing rules" on public.vendor_order_fee_pricing_rules;
create policy "Authenticated users read active vendor order pricing rules"
  on public.vendor_order_fee_pricing_rules for select
  to authenticated
  using (is_active = true);

drop policy if exists "Admins manage vendor order pricing rules" on public.vendor_order_fee_pricing_rules;
create policy "Admins manage vendor order pricing rules"
  on public.vendor_order_fee_pricing_rules for all
  to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('master_admin', 'super_admin', 'admin', 'company_admin', 'finance_admin'))
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('master_admin', 'super_admin', 'admin', 'company_admin', 'finance_admin'));

insert into public.vendor_order_fee_pricing_rules
  (rule_code, category_group, category_slugs, gross_fee_paise, taxable_value_paise, gst_amount_paise)
values
  ('vegetables_fruits_15', 'Vegetables and fruits', array['vegetables','vegetable','fruits','fruit','fruit_vegetable','fruit_and_vegetable'], 1500, 1271, 229),
  ('kirana_general_20', 'Kirana and general stores', array['kirana','grocery','general_store','general_stores','general'], 2000, 1695, 305),
  ('restaurants_pharmacies_25', 'Restaurants and pharmacies', array['restaurant','restaurants','tiffin','restaurant_tiffin','pharmacy','pharmacies','medical','medical_store'], 2500, 2119, 381)
on conflict (rule_code) do update set
  category_group = excluded.category_group,
  category_slugs = excluded.category_slugs,
  gross_fee_paise = excluded.gross_fee_paise,
  taxable_value_paise = excluded.taxable_value_paise,
  gst_amount_paise = excluded.gst_amount_paise,
  gst_rate_bps = excluded.gst_rate_bps,
  pricing_version = excluded.pricing_version,
  is_active = true,
  updated_at = now();

create or replace function public.normalise_vendor_category_for_pricing(p_value text)
returns text
language sql
immutable
as $$
  select trim(both '_' from regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '_', 'g'));
$$;

create or replace function public.resolve_vendor_order_fee_rule(p_vendor_id uuid)
returns public.vendor_order_fee_pricing_rules
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text;
  v_normalized text;
  v_rule public.vendor_order_fee_pricing_rules%rowtype;
begin
  select category
    into v_category
    from public.vendors
   where id = p_vendor_id;

  v_normalized := public.normalise_vendor_category_for_pricing(v_category);

  select *
    into v_rule
    from public.vendor_order_fee_pricing_rules
   where is_active
     and v_normalized = any(category_slugs)
   order by effective_from desc
   limit 1;

  if not found then
    select *
      into v_rule
      from public.vendor_order_fee_pricing_rules
     where is_active
       and (
         (v_normalized like '%vegetable%' or v_normalized like '%fruit%') and rule_code = 'vegetables_fruits_15'
         or (v_normalized like '%kirana%' or v_normalized like '%grocery%' or v_normalized like '%general%') and rule_code = 'kirana_general_20'
         or (v_normalized like '%restaurant%' or v_normalized like '%tiffin%' or v_normalized like '%pharmacy%' or v_normalized like '%medical%') and rule_code = 'restaurants_pharmacies_25'
       )
     order by effective_from desc
     limit 1;
  end if;

  if not found then
    select *
      into v_rule
      from public.vendor_order_fee_pricing_rules
     where rule_code = 'vegetables_fruits_15';
  end if;

  return v_rule;
end;
$$;

alter table if exists public.vendor_security_wallet_transactions
  add column if not exists gross_platform_fee_paise integer,
  add column if not exists taxable_value_paise integer,
  add column if not exists gst_rate_bps integer,
  add column if not exists gst_amount_paise integer,
  add column if not exists cgst_amount_paise integer,
  add column if not exists sgst_amount_paise integer,
  add column if not exists igst_amount_paise integer,
  add column if not exists pricing_model text,
  add column if not exists pricing_version text,
  add column if not exists vendor_business_category text,
  add column if not exists place_of_supply jsonb,
  add column if not exists transaction_reason text;

create table if not exists public.vendor_monthly_order_plans (
  plan_code text primary key,
  plan_name text not null,
  min_order_number integer not null default 0,
  max_order_allowance integer not null check (max_order_allowance > 0),
  service_fee_before_gst_paise integer not null check (service_fee_before_gst_paise >= 0),
  gst_rate_percent numeric(5,2) not null default 18.00,
  gst_amount_paise integer not null check (gst_amount_paise >= 0),
  total_payable_paise integer not null check (total_payable_paise >= 0),
  required_security_balance_paise integer not null check (required_security_balance_paise >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.vendor_monthly_order_plans
  (plan_code, plan_name, min_order_number, max_order_allowance, service_fee_before_gst_paise, gst_rate_percent, gst_amount_paise, total_payable_paise, required_security_balance_paise, sort_order)
values
  ('local_starter_500', 'Local Starter', 0, 500, 200000, 18.00, 36000, 236000, 500000, 10),
  ('local_growth_1000', 'Local Growth', 501, 1000, 380000, 18.00, 68400, 448400, 500000, 20),
  ('local_pro_2000', 'Local Pro', 1001, 2000, 750000, 18.00, 135000, 885000, 1000000, 30),
  ('local_enterprise_5000', 'Local Enterprise', 2001, 5000, 1700000, 18.00, 306000, 2006000, 2500000, 40)
on conflict (plan_code) do update set
  plan_name = excluded.plan_name,
  min_order_number = excluded.min_order_number,
  max_order_allowance = excluded.max_order_allowance,
  service_fee_before_gst_paise = excluded.service_fee_before_gst_paise,
  gst_rate_percent = excluded.gst_rate_percent,
  gst_amount_paise = excluded.gst_amount_paise,
  total_payable_paise = excluded.total_payable_paise,
  required_security_balance_paise = excluded.required_security_balance_paise,
  is_active = true,
  sort_order = excluded.sort_order,
  updated_at = now();

create table if not exists public.vendor_pricing_preferences (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  pricing_model text not null default 'pay_per_order'
    check (pricing_model in ('pay_per_order', 'monthly_order_plan')),
  current_plan_code text references public.vendor_monthly_order_plans(plan_code),
  current_period_id uuid,
  next_pricing_model text check (next_pricing_model is null or next_pricing_model in ('pay_per_order', 'monthly_order_plan')),
  next_plan_code text references public.vendor_monthly_order_plans(plan_code),
  next_effective_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'scheduled', 'suspended', 'inactive_due_to_non_payment')),
  terms_version text,
  terms_language text default 'en',
  terms_accepted_at timestamptz,
  device_or_session_reference text,
  document_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id)
);

create table if not exists public.vendor_order_plan_periods (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  plan_code text not null references public.vendor_monthly_order_plans(plan_code),
  period_start timestamptz not null,
  period_end timestamptz not null,
  accepted_orders_used integer not null default 0 check (accepted_orders_used >= 0),
  payment_attempt_id uuid references public.vendor_payment_attempts(id) on delete set null,
  payment_reference text,
  status text not null default 'active'
    check (status in ('active', 'expired', 'payment_due', 'suspended', 'cancelled')),
  renewal_due_at timestamptz,
  non_payment_deadline_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start)
);

create unique index if not exists uq_vendor_order_plan_one_active_period
  on public.vendor_order_plan_periods(vendor_id)
  where status = 'active';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vendor_pricing_preferences_current_period_id_fkey'
      and conrelid = 'public.vendor_pricing_preferences'::regclass
  ) then
    alter table public.vendor_pricing_preferences
      add constraint vendor_pricing_preferences_current_period_id_fkey
      foreign key (current_period_id)
      references public.vendor_order_plan_periods(id)
      on delete set null;
  end if;
end $$;

create table if not exists public.vendor_order_plan_usage_events (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  period_id uuid not null references public.vendor_order_plan_periods(id) on delete cascade,
  order_id uuid not null,
  event_type text not null default 'accepted_order_covered'
    check (event_type in ('accepted_order_covered', 'manual_adjustment')),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_vendor_order_plan_usage_one_order
  on public.vendor_order_plan_usage_events(order_id);

create index if not exists idx_vendor_order_plan_usage_vendor_period
  on public.vendor_order_plan_usage_events(vendor_id, period_id);

create table if not exists public.vendor_pricing_change_audit (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  previous_pricing_model text,
  previous_plan_code text,
  new_pricing_model text not null,
  new_plan_code text,
  requested_at timestamptz not null default now(),
  effective_at timestamptz,
  actor_user_id uuid,
  payment_reference text,
  terms_version text,
  terms_language text,
  admin_adjustment boolean not null default false,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_pricing_notifications (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  period_id uuid references public.vendor_order_plan_periods(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'usage_80_percent',
    'usage_90_percent',
    'allowance_exhausted',
    'renewal_7_days',
    'renewal_3_days',
    'renewal_1_day',
    'renewal_due_today',
    'security_topup_required',
    'inactive_due_to_non_payment'
  )),
  message text not null,
  channel text not null default 'in_app',
  sent_at timestamptz,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vendor_pricing_preferences_vendor
  on public.vendor_pricing_preferences(vendor_id);

create index if not exists idx_vendor_order_plan_periods_vendor_status
  on public.vendor_order_plan_periods(vendor_id, status, period_end);

create index if not exists idx_vendor_pricing_audit_vendor
  on public.vendor_pricing_change_audit(vendor_id, created_at desc);

create index if not exists idx_vendor_pricing_notifications_vendor
  on public.vendor_pricing_notifications(vendor_id, created_at desc);

alter table public.vendor_monthly_order_plans enable row level security;
alter table public.vendor_pricing_preferences enable row level security;
alter table public.vendor_order_plan_periods enable row level security;
alter table public.vendor_order_plan_usage_events enable row level security;
alter table public.vendor_pricing_change_audit enable row level security;
alter table public.vendor_pricing_notifications enable row level security;

drop policy if exists "Vendors read active monthly order plans" on public.vendor_monthly_order_plans;
create policy "Vendors read active monthly order plans"
  on public.vendor_monthly_order_plans for select
  to authenticated
  using (is_active = true);

drop policy if exists "Vendor owners read own pricing preferences" on public.vendor_pricing_preferences;
create policy "Vendor owners read own pricing preferences"
  on public.vendor_pricing_preferences for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors v
      where v.id = vendor_pricing_preferences.vendor_id
        and v.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Vendor owners read own order plan periods" on public.vendor_order_plan_periods;
create policy "Vendor owners read own order plan periods"
  on public.vendor_order_plan_periods for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors v
      where v.id = vendor_order_plan_periods.vendor_id
        and v.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Vendor owners read own order plan usage" on public.vendor_order_plan_usage_events;
create policy "Vendor owners read own order plan usage"
  on public.vendor_order_plan_usage_events for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors v
      where v.id = vendor_order_plan_usage_events.vendor_id
        and v.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Vendor owners read own pricing notifications" on public.vendor_pricing_notifications;
create policy "Vendor owners read own pricing notifications"
  on public.vendor_pricing_notifications for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors v
      where v.id = vendor_pricing_notifications.vendor_id
        and v.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Admins manage monthly order plans" on public.vendor_monthly_order_plans;
create policy "Admins manage monthly order plans"
  on public.vendor_monthly_order_plans for all
  to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('master_admin', 'super_admin', 'admin', 'company_admin', 'finance_admin'))
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('master_admin', 'super_admin', 'admin', 'company_admin', 'finance_admin'));

drop policy if exists "Admins read vendor pricing preferences" on public.vendor_pricing_preferences;
create policy "Admins read vendor pricing preferences"
  on public.vendor_pricing_preferences for select
  to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('master_admin', 'super_admin', 'admin', 'company_admin', 'finance_admin'));

drop policy if exists "Admins read order plan periods" on public.vendor_order_plan_periods;
create policy "Admins read order plan periods"
  on public.vendor_order_plan_periods for select
  to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('master_admin', 'super_admin', 'admin', 'company_admin', 'finance_admin'));

drop policy if exists "Admins read pricing audit" on public.vendor_pricing_change_audit;
create policy "Admins read pricing audit"
  on public.vendor_pricing_change_audit for select
  to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('master_admin', 'super_admin', 'admin', 'company_admin', 'finance_admin'));

grant select on public.vendor_monthly_order_plans to authenticated;
grant select on public.vendor_order_fee_pricing_rules to authenticated;
grant select on public.vendor_pricing_preferences, public.vendor_order_plan_periods, public.vendor_order_plan_usage_events, public.vendor_pricing_notifications to authenticated;
grant select on public.vendor_pricing_change_audit to authenticated;

comment on table public.vendor_monthly_order_plans is
  'Configurable optional monthly accepted-order plans. Category-based GST-inclusive pay-per-accepted-order pricing remains available.';

comment on table public.vendor_pricing_preferences is
  'Current and scheduled vendor pricing model. Monthly-plan orders covered by an active plan must not also receive the category-based accepted-order fee.';

comment on table public.vendor_order_plan_usage_events is
  'Idempotent record of accepted orders covered by a monthly order plan.';

create or replace function public.accept_order_with_wallet_fee(
  p_order_id uuid,
  p_vendor_id uuid,
  p_actor_user_id uuid default null,
  p_vendor_comment text default null,
  p_accepted_items jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.hyperlocal_orders%rowtype;
  v_wallet public.vendor_security_wallets%rowtype;
  v_existing_tx public.vendor_security_wallet_transactions%rowtype;
  v_rule public.vendor_order_fee_pricing_rules%rowtype;
  v_preference public.vendor_pricing_preferences%rowtype;
  v_period public.vendor_order_plan_periods%rowtype;
  v_balance_before numeric;
  v_balance_after numeric;
  v_next_status text;
  v_warning_level text;
  v_audit_log_id uuid;
  v_now timestamptz := now();
  v_fee_rupees numeric;
  v_cgst_paise integer;
  v_sgst_paise integer;
  v_igst_paise integer := 0;
  v_fee_deducted boolean := false;
  v_monthly_covered boolean := false;
begin
  select *
    into v_order
    from public.hyperlocal_orders
   where id = p_order_id
     and vendor_id = p_vendor_id
   for update;

  if not found then
    raise exception 'Order not found for this vendor.';
  end if;

  if v_order.status = 'accepted' then
    select *
      into v_wallet
      from public.vendor_security_wallets
     where vendor_id = p_vendor_id
     limit 1;

    return jsonb_build_object('order', to_jsonb(v_order), 'wallet', to_jsonb(v_wallet), 'idempotent', true);
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Only pending orders can be accepted.';
  end if;

  if v_order.partial_fulfillment_status = 'pending_customer_confirmation' then
    raise exception 'Customer must confirm the revised order before acceptance.';
  end if;

  if v_order.partial_fulfillment_status = 'customer_rejected' then
    raise exception 'Customer rejected the revised order.';
  end if;

  select *
    into v_wallet
    from public.vendor_security_wallets
   where vendor_id = p_vendor_id
   for update;

  if not found then
    raise exception 'Vendor advance wallet is not available.';
  end if;

  if v_wallet.opening_balance < 5000 then
    raise exception 'Vendor must deposit the minimum Rs 5,000 advance balance before accepting orders.';
  end if;

  select *
    into v_preference
    from public.vendor_pricing_preferences
   where vendor_id = p_vendor_id
   limit 1;

  if found and v_preference.pricing_model = 'monthly_order_plan' then
    select *
      into v_period
      from public.vendor_order_plan_periods
     where vendor_id = p_vendor_id
       and status = 'active'
       and period_start <= v_now
       and period_end >= v_now
     order by period_start desc
     limit 1
     for update;

    if not found then
      raise exception 'Monthly order plan is not active. Please renew, upgrade or switch to per-order pricing.';
    end if;

    if v_period.accepted_orders_used >= (
      select max_order_allowance from public.vendor_monthly_order_plans where plan_code = v_period.plan_code
    ) then
      raise exception 'Monthly accepted-order allowance is exhausted. Please upgrade, renew or switch pricing model.';
    end if;

    insert into public.vendor_order_plan_usage_events (
      vendor_id,
      period_id,
      order_id,
      event_type,
      metadata
    ) values (
      p_vendor_id,
      v_period.id,
      p_order_id,
      'accepted_order_covered',
      jsonb_build_object(
        'pricing_model', 'monthly_order_plan',
        'plan_code', v_period.plan_code,
        'covered_order_no_extra_per_order_fee', true
      )
    )
    on conflict (order_id) do nothing;

    update public.vendor_order_plan_periods
       set accepted_orders_used = (
             select count(*)::integer
               from public.vendor_order_plan_usage_events
              where period_id = v_period.id
           ),
           updated_at = v_now
     where id = v_period.id
     returning * into v_period;

    v_monthly_covered := true;
  else
    v_rule := public.resolve_vendor_order_fee_rule(p_vendor_id);
    v_fee_rupees := v_rule.gross_fee_paise::numeric / 100;
    v_cgst_paise := floor(v_rule.gst_amount_paise::numeric / 2)::integer;
    v_sgst_paise := v_rule.gst_amount_paise - v_cgst_paise;

    if v_wallet.current_balance < v_fee_rupees then
      raise exception 'Vendor advance balance is below the applicable category fee of Rs %. Order cannot be accepted and customer details remain locked.', to_char(v_fee_rupees, 'FM999999990.00');
    end if;

    select *
      into v_existing_tx
      from public.vendor_security_wallet_transactions
     where vendor_id = p_vendor_id
       and order_id = p_order_id
       and transaction_type = 'order_fee'
     limit 1
     for update;

    if not found then
      v_balance_before := v_wallet.current_balance;
      v_balance_after := v_balance_before - v_fee_rupees;
      v_next_status :=
        case
          when v_wallet.opening_balance < 5000 then 'security_deposit_required'
          when v_balance_after < v_fee_rupees then 'orders_stopped'
          when v_balance_after < 500 then 'final_warning'
          when v_balance_after <= 1000 then 'low_balance'
          else 'eligible'
        end;

      v_warning_level :=
        case
          when v_next_status = 'orders_stopped' then 'orders_stopped'
          when v_next_status = 'final_warning' then 'final_warning'
          when v_next_status = 'low_balance' then 'top_up_reminder'
          else 'none'
        end;

      update public.vendor_security_wallets
         set current_balance = v_balance_after,
             eligibility_status = v_next_status,
             updated_at = v_now,
             last_warning_sent_at = case
               when v_warning_level = 'none' then last_warning_sent_at
               else v_now
             end
       where id = v_wallet.id
       returning * into v_wallet;

      insert into public.vendor_security_wallet_transactions (
        wallet_id,
        vendor_id,
        order_id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        payment_reference,
        idempotency_key,
        terminal_id,
        warning_level,
        gross_platform_fee_paise,
        taxable_value_paise,
        gst_rate_bps,
        gst_amount_paise,
        cgst_amount_paise,
        sgst_amount_paise,
        igst_amount_paise,
        pricing_model,
        pricing_version,
        vendor_business_category,
        place_of_supply,
        transaction_reason,
        metadata
      ) values (
        v_wallet.id,
        p_vendor_id,
        p_order_id,
        'order_fee',
        -v_fee_rupees,
        v_balance_before,
        v_balance_after,
        'PLATFORM_FACILITATION_CHARGE_' || p_order_id::text,
        'order_acceptance_fee:' || p_order_id::text,
        v_order.terminal_id,
        v_warning_level,
        v_rule.gross_fee_paise,
        v_rule.taxable_value_paise,
        v_rule.gst_rate_bps,
        v_rule.gst_amount_paise,
        v_cgst_paise,
        v_sgst_paise,
        v_igst_paise,
        'pay_per_order',
        v_rule.pricing_version,
        (select category from public.vendors where id = p_vendor_id),
        jsonb_build_object('tax_treatment', 'intrastate_cgst_sgst', 'source', 'backend_pricing_rule_ca_review_required'),
        'ORDER_ACCEPTANCE_FEE',
        jsonb_build_object(
          'platform_fee_inclusive_of_gst', true,
          'category_group', v_rule.category_group,
          'rule_code', v_rule.rule_code,
          'gross_platform_fee_paise', v_rule.gross_fee_paise,
          'taxable_value_paise', v_rule.taxable_value_paise,
          'gst_amount_paise', v_rule.gst_amount_paise,
          'cgst_amount_paise', v_cgst_paise,
          'sgst_amount_paise', v_sgst_paise,
          'igst_amount_paise', v_igst_paise,
          'charge_trigger', 'vendor_order_acceptance'
        )
      );

      v_fee_deducted := true;

      if v_warning_level <> 'none' then
        insert into public.vendor_security_wallet_warnings (
          vendor_id,
          wallet_id,
          warning_level,
          balance,
          message,
          channel
        ) values (
          p_vendor_id,
          v_wallet.id,
          v_warning_level,
          v_balance_after,
          case
            when v_warning_level = 'orders_stopped' then 'New SabSewa Local orders are stopped because your vendor advance balance is below the next applicable category fee.'
            when v_warning_level = 'final_warning' then 'Final warning: your SabSewa Local vendor advance balance is below Rs 500.'
            else 'Your SabSewa Local vendor advance balance is Rs 1,000 or below. Please top up soon.'
          end,
          'in_app'
        );
      end if;
    end if;
  end if;

  update public.hyperlocal_orders
     set status = 'accepted',
         vendor_comment = p_vendor_comment,
         accepted_at = v_now,
         accepted_by_vendor_id = p_vendor_id,
         vendor_detail_unlocked_at = v_now,
         accepted_items = coalesce(p_accepted_items, accepted_items, partial_fulfillment_offer->'items', items),
         updated_at = v_now
   where id = p_order_id
   returning * into v_order;

  insert into public.order_audit_logs (
    order_id,
    vendor_id,
    actor_user_id,
    action,
    from_status,
    to_status,
    metadata
  ) values (
    p_order_id,
    p_vendor_id,
    p_actor_user_id,
    'vendor_accept_order_unlock_details',
    'pending',
    'accepted',
    jsonb_build_object(
      'customer_details_unlocked', true,
      'invoice_unlocked', true,
      'fee_deducted', v_fee_deducted,
      'monthly_plan_covered', v_monthly_covered,
      'fee_amount_paise', coalesce(v_rule.gross_fee_paise, 0),
      'fee_inclusive_of_gst', not v_monthly_covered,
      'vendor_comment', p_vendor_comment,
      'idempotency_key', 'order_acceptance_fee:' || p_order_id::text
    )
  )
  returning id into v_audit_log_id;

  update public.vendor_security_wallet_transactions
     set linked_audit_log_id = v_audit_log_id
   where vendor_id = p_vendor_id
     and order_id = p_order_id
     and transaction_type = 'order_fee'
     and linked_audit_log_id is null;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'wallet', jsonb_build_object(
      'id', v_wallet.id,
      'vendor_id', v_wallet.vendor_id,
      'current_balance', v_wallet.current_balance,
      'eligibility_status', v_wallet.eligibility_status
    ),
    'fee_deducted', v_fee_deducted,
    'monthly_plan_covered', v_monthly_covered
  );
end;
$$;

revoke all on function public.accept_order_with_wallet_fee(uuid, uuid, uuid, text, jsonb) from public;
grant execute on function public.accept_order_with_wallet_fee(uuid, uuid, uuid, text, jsonb) to service_role;

comment on table public.vendor_monthly_order_plans is
  'Configurable optional monthly accepted-order plans. Displayed plan totals are final prices inclusive of GST.';

comment on table public.vendor_pricing_preferences is
  'Current and scheduled vendor pricing model. A vendor must have only one active pricing model: category pay-per-order or monthly order plan.';
