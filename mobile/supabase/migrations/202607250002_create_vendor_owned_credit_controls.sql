-- SabSewa Local vendor-owned credit controls.
-- SabSewa Local and Rashi Bhartiya Innovation LLP only maintain records and do not
-- finance, guarantee, collect, or recover vendor-issued customer credit.

alter table public.hyperlocal_orders
  add column if not exists payment_method text not null default 'prepaid'
    check (payment_method in ('prepaid', 'credit')),
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'credit_due', 'refunded', 'failed'));

create table if not exists public.vendor_credit_accounts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  customer_id uuid not null,
  credit_limit numeric(12,2) not null default 0 check (credit_limit >= 0),
  outstanding_balance numeric(12,2) not null default 0,
  available_credit numeric(12,2) generated always as (greatest(credit_limit - outstanding_balance, 0)) stored,
  payment_due_days integer not null default 7 check (payment_due_days between 0 and 365),
  due_date date,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'exhausted', 'overdue', 'closed')),
  vendor_notes text,
  approved_by_vendor_user_id uuid,
  approved_at timestamptz not null default now(),
  suspended_at timestamptz,
  suspension_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, customer_id)
);

create table if not exists public.vendor_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  customer_id uuid not null,
  account_id uuid references public.vendor_credit_accounts(id) on delete set null,
  order_id uuid references public.hyperlocal_orders(id) on delete set null,
  transaction_type text not null check (transaction_type in (
    'limit_approved',
    'limit_changed',
    'credit_purchase',
    'payment_recorded',
    'manual_adjustment',
    'credit_suspended',
    'credit_reactivated'
  )),
  amount numeric(12,2) not null default 0,
  balance_before numeric(12,2) not null default 0,
  balance_after numeric(12,2) not null default 0,
  due_date date,
  notes text,
  vendor_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_credit_reminders (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  customer_id uuid not null,
  account_id uuid references public.vendor_credit_accounts(id) on delete set null,
  reminder_type text not null check (reminder_type in ('near_limit', 'due_soon', 'overdue', 'exhausted', 'suspended')),
  outstanding_balance numeric(12,2) not null default 0,
  credit_limit numeric(12,2) not null default 0,
  due_date date,
  channel text not null default 'in_app' check (channel in ('in_app', 'push', 'sms', 'whatsapp')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  message text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_vendor_credit_accounts_vendor_customer
  on public.vendor_credit_accounts(vendor_id, customer_id);

create index if not exists idx_vendor_credit_accounts_due_status
  on public.vendor_credit_accounts(vendor_id, status, due_date);

create index if not exists idx_vendor_credit_tx_vendor_customer_created
  on public.vendor_credit_transactions(vendor_id, customer_id, created_at desc);

create index if not exists idx_vendor_credit_reminders_vendor_created
  on public.vendor_credit_reminders(vendor_id, created_at desc);

alter table public.vendor_credit_accounts enable row level security;
alter table public.vendor_credit_transactions enable row level security;
alter table public.vendor_credit_reminders enable row level security;

create policy "Vendor owners can read own credit accounts"
  on public.vendor_credit_accounts for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_credit_accounts.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

create policy "Vendor owners can read own credit transactions"
  on public.vendor_credit_transactions for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_credit_transactions.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

-- All writes should go through the backend service role so vendor decisions,
-- limits, purchases, payments, reminders, and status changes remain auditable.
