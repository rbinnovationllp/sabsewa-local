-- Centralized vendor-to-SabSewa platform billing and subscription module.
-- Customer order payments remain direct customer-to-vendor and are intentionally not routed here.

create extension if not exists "pgcrypto";

create sequence if not exists public.vendor_invoice_number_seq start 1;

alter table public.vendor_payments
  add column if not exists reference_type text,
  add column if not exists reference_id uuid,
  add column if not exists base_amount_paise bigint,
  add column if not exists discount_amount_paise bigint not null default 0,
  add column if not exists tax_amount_paise bigint,
  add column if not exists total_amount_paise bigint,
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists signature_verified boolean not null default false,
  add column if not exists invoice_id uuid,
  add column if not exists paid_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.billing_products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique,
  charge_type text not null check (charge_type in (
    'onboarding_fee',
    'security_deposit',
    'subscription',
    'storage_addon',
    'featured_listing',
    'promotion',
    'premium_service',
    'future_platform_service'
  )),
  title text not null,
  description text,
  base_amount_paise bigint not null default 0 check (base_amount_paise >= 0),
  tax_rate_percent numeric(6,3) not null default 0,
  currency text not null default 'INR',
  validity_days integer,
  is_refundable boolean not null default false,
  is_active boolean not null default true,
  visibility text not null default 'vendor_visible' check (visibility in ('vendor_visible', 'admin_only', 'hidden')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null unique,
  plan_name text not null,
  description text,
  monthly_price_paise bigint not null default 0 check (monthly_price_paise >= 0),
  quarterly_price_paise bigint not null default 0 check (quarterly_price_paise >= 0),
  annual_price_paise bigint not null default 0 check (annual_price_paise >= 0),
  tax_rate_percent numeric(6,3) not null default 0,
  product_listing_limit integer,
  storage_allowance_bytes bigint,
  order_limit integer,
  analytics_access boolean not null default false,
  featured_listing_credits integer not null default 0,
  ai_tool_access boolean not null default false,
  support_level text not null default 'standard',
  multi_user_access boolean not null default false,
  grace_period_days integer not null default 7,
  trial_period_days integer not null default 0,
  is_active boolean not null default true,
  is_public boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_plan_features (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  feature_key text not null,
  feature_value jsonb not null default 'true'::jsonb,
  created_at timestamptz not null default now(),
  unique (plan_id, feature_key)
);

create table if not exists public.vendor_subscriptions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  subscription_status text not null default 'trial' check (subscription_status in (
    'trial',
    'active',
    'grace_period',
    'expired',
    'cancelled',
    'suspended'
  )),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'quarterly', 'annual')),
  starts_at timestamptz,
  expires_at timestamptz,
  grace_ends_at timestamptz,
  auto_renewal_enabled boolean not null default false,
  auto_renewal_consent_at timestamptz,
  previous_plan_id uuid references public.subscription_plans(id) on delete set null,
  pending_plan_id uuid references public.subscription_plans(id) on delete set null,
  last_payment_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_vendor_subscriptions_one_current
  on public.vendor_subscriptions(vendor_id)
  where subscription_status in ('trial', 'active', 'grace_period', 'suspended');

create table if not exists public.vendor_billing_accounts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null unique references public.vendors(id) on delete cascade,
  legal_name text,
  billing_address jsonb not null default '{}'::jsonb,
  gstin text,
  email text,
  phone text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_invoices (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  invoice_number text not null unique,
  invoice_type text not null default 'receipt' check (invoice_type in ('invoice', 'receipt', 'credit_note')),
  legal_entity_name text not null default 'Rashi Bhartiya Innovation LLP',
  brand_name text not null default 'SabSewa Local',
  vendor_name text,
  shop_name text,
  billing_address jsonb not null default '{}'::jsonb,
  charge_type text not null,
  reference_type text,
  reference_id uuid,
  base_amount_paise bigint not null default 0,
  discount_amount_paise bigint not null default 0,
  tax_amount_paise bigint not null default 0,
  total_amount_paise bigint not null default 0,
  currency text not null default 'INR',
  razorpay_payment_id text,
  payment_status text not null default 'captured',
  refundable_classification text not null default 'non_refundable',
  gst_note text not null default 'GST compliance depends on the company GST configuration in force on the invoice date.',
  invoice_payload jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  charge_type text not null,
  reference_type text,
  reference_id uuid,
  base_amount_paise bigint not null default 0,
  discount_amount_paise bigint not null default 0,
  tax_amount_paise bigint not null default 0,
  total_amount_paise bigint not null default 0,
  currency text not null default 'INR',
  payment_status text not null default 'created' check (payment_status in (
    'created',
    'pending',
    'authorized',
    'captured',
    'failed',
    'cancelled',
    'refund_pending',
    'partially_refunded',
    'refunded'
  )),
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  razorpay_signature text,
  signature_verified boolean not null default false,
  invoice_id uuid references public.vendor_invoices(id) on delete set null,
  idempotency_key text not null unique,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.razorpay_orders (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  attempt_id uuid references public.vendor_payment_attempts(id) on delete cascade,
  razorpay_order_id text not null unique,
  amount_paise bigint not null check (amount_paise >= 0),
  currency text not null default 'INR',
  receipt text not null,
  order_status text not null default 'created',
  notes jsonb not null default '{}'::jsonb,
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_security_deposits (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  deposit_amount_paise bigint not null default 0,
  amount_held_paise bigint not null default 0,
  amount_adjusted_paise bigint not null default 0,
  amount_refunded_paise bigint not null default 0,
  deposit_status text not null default 'pending' check (deposit_status in (
    'pending',
    'held',
    'partially_adjusted',
    'refund_requested',
    'under_review',
    'refunded',
    'forfeited'
  )),
  payment_id uuid references public.vendor_payment_attempts(id) on delete set null,
  razorpay_payment_id text,
  paid_at timestamptz,
  refund_requested_at timestamptz,
  refunded_at timestamptz,
  adjustment_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_vendor_security_deposits_active
  on public.vendor_security_deposits(vendor_id)
  where deposit_status in ('pending', 'held', 'partially_adjusted', 'refund_requested', 'under_review');

create table if not exists public.vendor_promotions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  promotion_type text not null,
  target_area text,
  target_category text,
  starts_at timestamptz,
  ends_at timestamptz,
  maximum_impressions integer,
  promotion_status text not null default 'payment_pending' check (promotion_status in (
    'payment_pending',
    'active',
    'completed',
    'cancelled',
    'suspended'
  )),
  price_paise bigint not null default 0,
  payment_attempt_id uuid references public.vendor_payment_attempts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_refunds (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  payment_attempt_id uuid references public.vendor_payment_attempts(id) on delete set null,
  razorpay_payment_id text,
  razorpay_refund_id text unique,
  amount_paise bigint not null check (amount_paise > 0),
  refund_status text not null default 'refund_pending' check (refund_status in (
    'refund_pending',
    'processed',
    'failed',
    'cancelled'
  )),
  reason text not null,
  approved_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_discounts (
  id uuid primary key default gen_random_uuid(),
  discount_code text not null unique,
  discount_type text not null check (discount_type in ('fixed', 'percentage')),
  discount_value_paise bigint,
  discount_percent numeric(6,3),
  min_amount_paise bigint not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer,
  usage_count integer not null default 0,
  applicable_charge_types text[] not null default '{}',
  applicable_plan_codes text[] not null default '{}',
  stackable boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_coupons (
  id uuid primary key default gen_random_uuid(),
  coupon_code text not null unique,
  discount_id uuid references public.billing_discounts(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete cascade,
  used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_role text,
  vendor_id uuid references public.vendors(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.razorpay_webhook_events
  add column if not exists payload_hash text,
  add column if not exists vendor_id uuid,
  add column if not exists processed_result jsonb,
  add column if not exists processing_error text,
  add column if not exists processed_at timestamptz;

insert into public.subscription_plans
  (plan_code, plan_name, description, monthly_price_paise, quarterly_price_paise, annual_price_paise, product_listing_limit, storage_allowance_bytes, order_limit, analytics_access, featured_listing_credits, ai_tool_access, support_level, sort_order)
values
  ('free', 'Free', 'Starter access after verified onboarding.', 0, 0, 0, 100, 104857600, 100, false, 0, false, 'standard', 10),
  ('basic', 'Basic', 'For small local shops starting with digital catalogue and orders.', 19900, 54900, 199900, 500, 268435456, 500, false, 0, false, 'standard', 20),
  ('growth', 'Growth', 'Higher listing limits, analytics and promotional credits.', 49900, 129900, 499900, 2000, 1073741824, 2000, true, 2, true, 'priority', 30),
  ('premium', 'Premium', 'Advanced AI tools, featured credits and priority support.', 99900, 269900, 999900, 10000, 5368709120, 10000, true, 8, true, 'priority', 40),
  ('enterprise', 'Enterprise', 'Custom plan for multi-location vendor operations.', 0, 0, 0, null, null, null, true, 20, true, 'dedicated', 50)
on conflict (plan_code) do update
set plan_name = excluded.plan_name,
    description = excluded.description,
    monthly_price_paise = excluded.monthly_price_paise,
    quarterly_price_paise = excluded.quarterly_price_paise,
    annual_price_paise = excluded.annual_price_paise,
    product_listing_limit = excluded.product_listing_limit,
    storage_allowance_bytes = excluded.storage_allowance_bytes,
    order_limit = excluded.order_limit,
    analytics_access = excluded.analytics_access,
    featured_listing_credits = excluded.featured_listing_credits,
    ai_tool_access = excluded.ai_tool_access,
    support_level = excluded.support_level,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into public.billing_products
  (product_code, charge_type, title, description, base_amount_paise, tax_rate_percent, validity_days, is_refundable, visibility)
values
  ('featured_store_7d', 'featured_listing', 'Featured Store - 7 days', 'Featured storefront placement for one week.', 29900, 0, 7, false, 'vendor_visible'),
  ('featured_product_7d', 'featured_listing', 'Featured Product - 7 days', 'Featured product placement for one week.', 14900, 0, 7, false, 'vendor_visible'),
  ('festival_campaign_local', 'promotion', 'Local Festival Campaign', 'Local-area promotional campaign placement.', 99900, 0, 14, false, 'vendor_visible'),
  ('premium_ai_monthly', 'premium_service', 'Premium AI Tools - Monthly', 'Premium AI tools for catalogue and order operations.', 49900, 0, 30, false, 'vendor_visible')
on conflict (product_code) do update
set title = excluded.title,
    description = excluded.description,
    base_amount_paise = excluded.base_amount_paise,
    tax_rate_percent = excluded.tax_rate_percent,
    validity_days = excluded.validity_days,
    is_refundable = excluded.is_refundable,
    visibility = excluded.visibility,
    updated_at = now();

alter table public.billing_products enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscription_plan_features enable row level security;
alter table public.vendor_subscriptions enable row level security;
alter table public.vendor_billing_accounts enable row level security;
alter table public.vendor_invoices enable row level security;
alter table public.vendor_payment_attempts enable row level security;
alter table public.razorpay_orders enable row level security;
alter table public.vendor_security_deposits enable row level security;
alter table public.vendor_promotions enable row level security;
alter table public.vendor_refunds enable row level security;
alter table public.billing_discounts enable row level security;
alter table public.billing_coupons enable row level security;
alter table public.billing_audit_logs enable row level security;

drop policy if exists "Vendors read public billing products" on public.billing_products;
create policy "Vendors read public billing products"
  on public.billing_products for select
  to authenticated
  using (is_active = true and visibility = 'vendor_visible');

drop policy if exists "Vendors read public subscription plans" on public.subscription_plans;
create policy "Vendors read public subscription plans"
  on public.subscription_plans for select
  to authenticated
  using (is_active = true and is_public = true);

drop policy if exists "Vendor owners read own subscriptions" on public.vendor_subscriptions;
create policy "Vendor owners read own subscriptions"
  on public.vendor_subscriptions for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Vendor owners read own billing accounts" on public.vendor_billing_accounts;
create policy "Vendor owners read own billing accounts"
  on public.vendor_billing_accounts for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Vendor owners read own invoices" on public.vendor_invoices;
create policy "Vendor owners read own invoices"
  on public.vendor_invoices for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Vendor owners read own payment attempts" on public.vendor_payment_attempts;
create policy "Vendor owners read own payment attempts"
  on public.vendor_payment_attempts for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Vendor owners read own security deposits" on public.vendor_security_deposits;
create policy "Vendor owners read own security deposits"
  on public.vendor_security_deposits for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Vendor owners read own promotions" on public.vendor_promotions;
create policy "Vendor owners read own promotions"
  on public.vendor_promotions for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Admins manage billing products" on public.billing_products;
create policy "Admins manage billing products"
  on public.billing_products for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

drop policy if exists "Admins manage subscription plans" on public.subscription_plans;
create policy "Admins manage subscription plans"
  on public.subscription_plans for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

drop policy if exists "Admins manage billing discounts" on public.billing_discounts;
create policy "Admins manage billing discounts"
  on public.billing_discounts for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

drop policy if exists "Admins read billing audit logs" on public.billing_audit_logs;
create policy "Admins read billing audit logs"
  on public.billing_audit_logs for select
  to authenticated
  using (public.is_company_admin());

grant select on public.billing_products, public.subscription_plans to authenticated;
grant select on public.vendor_subscriptions, public.vendor_billing_accounts, public.vendor_invoices, public.vendor_payment_attempts, public.vendor_security_deposits, public.vendor_promotions to authenticated;

comment on table public.vendor_payment_attempts is
  'Central Razorpay platform-payment attempt table for vendor-to-SabSewa charges only. Customer order payments must not be routed here.';

comment on table public.vendor_security_deposits is
  'Security deposits are balance-sheet liabilities, stored separately from onboarding revenue.';

create or replace function public.next_vendor_invoice_number()
returns text
language sql
security definer
set search_path = public
as $$
  select 'SSL-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.vendor_invoice_number_seq')::text, 6, '0')
$$;

grant execute on function public.next_vendor_invoice_number() to service_role;
