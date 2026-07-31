-- Razorpay Test/Live environment safeguards for SabSewa Local.
-- Test-mode payment attempts are recorded separately and must not credit
-- production vendor wallets or activate commercial orders.

create table if not exists public.vendor_payment_test_events (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.vendors(id) on delete set null,
  razorpay_order_id text,
  razorpay_payment_id text,
  purpose text not null,
  amount numeric(12,2) not null default 0,
  environment text not null default 'test' check (environment in ('test')),
  payment_status text,
  payment_method text,
  wallet_credit_applied boolean not null default false,
  vendor_activation_applied boolean not null default false,
  readiness_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_vendor_payment_test_event_payment
  on public.vendor_payment_test_events(razorpay_payment_id)
  where razorpay_payment_id is not null;

alter table public.vendor_payment_test_events enable row level security;

drop policy if exists "Admins read Razorpay test payment events" on public.vendor_payment_test_events;
create policy "Admins read Razorpay test payment events"
  on public.vendor_payment_test_events
  for select
  to authenticated
  using (public.is_company_admin());

comment on table public.vendor_payment_test_events is
  'Separated Razorpay Test Mode payment attempts. These records must never activate production wallet balance or commercial order eligibility.';

create table if not exists public.razorpay_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  environment text not null default 'test' check (environment in ('test', 'live')),
  vendor_id uuid references public.vendors(id) on delete set null,
  razorpay_order_id text,
  razorpay_payment_id text,
  processing_status text not null default 'received',
  processing_error text,
  processed_result jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_razorpay_webhook_events_payment
  on public.razorpay_webhook_events(razorpay_payment_id);

create index if not exists idx_razorpay_webhook_events_vendor_created
  on public.razorpay_webhook_events(vendor_id, created_at desc);

alter table public.razorpay_webhook_events enable row level security;

drop policy if exists "Admins read Razorpay webhook audit events" on public.razorpay_webhook_events;
create policy "Admins read Razorpay webhook audit events"
  on public.razorpay_webhook_events
  for select
  to authenticated
  using (public.is_company_admin());

comment on table public.razorpay_webhook_events is
  'Immutable Razorpay webhook receipt and processing audit log. event_id uniqueness prevents duplicate webhook replay from creating duplicate wallet credits.';

alter table public.vendor_security_wallet_transactions
  add column if not exists payment_environment text not null default 'live'
  check (payment_environment in ('test', 'live'));

create index if not exists idx_vendor_wallet_tx_payment_environment
  on public.vendor_security_wallet_transactions(payment_environment, created_at desc);
