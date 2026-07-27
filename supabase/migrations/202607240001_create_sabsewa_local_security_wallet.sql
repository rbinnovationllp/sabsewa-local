-- SabSewa Local Security Wallet
-- Backend-enforced vendor eligibility and Rs 15 completed-order deductions.

create extension if not exists "pgcrypto";

create table if not exists public.vendor_security_wallets (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null unique references public.vendors(id) on delete cascade,
  opening_balance numeric(12,2) not null default 0,
  current_balance numeric(12,2) not null default 0,
  minimum_security_deposit numeric(12,2) not null default 5000,
  reminder_threshold numeric(12,2) not null default 1000,
  final_warning_threshold numeric(12,2) not null default 500,
  stop_orders_threshold numeric(12,2) not null default 515,
  operational_minimum_balance numeric(12,2) not null default 515,
  eligibility_status text not null default 'security_deposit_required'
    check (eligibility_status in (
      'eligible',
      'low_balance',
      'final_warning',
      'orders_stopped',
      'security_deposit_required',
      'suspended'
    )),
  last_warning_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_security_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.vendor_security_wallets(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  order_id uuid references public.hyperlocal_orders(id) on delete set null,
  transaction_type text not null check (transaction_type in (
    'security_deposit',
    'top_up',
    'order_fee',
    'refund',
    'manual_adjustment'
  )),
  amount numeric(12,2) not null,
  balance_before numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  payment_reference text,
  admin_user_id uuid,
  admin_reason text,
  warning_level text check (warning_level in ('none', 'top_up_reminder', 'final_warning', 'orders_stopped')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_security_wallet_warnings (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  wallet_id uuid not null references public.vendor_security_wallets(id) on delete cascade,
  warning_level text not null check (warning_level in ('top_up_reminder', 'final_warning', 'orders_stopped', 'restored')),
  balance numeric(12,2) not null,
  message text not null,
  channel text not null default 'in_app' check (channel in ('in_app', 'push', 'sms', 'whatsapp')),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_security_wallet_vendor on public.vendor_security_wallets(vendor_id);
create index if not exists idx_security_wallet_tx_vendor_created
  on public.vendor_security_wallet_transactions(vendor_id, created_at desc);
create index if not exists idx_security_wallet_tx_order
  on public.vendor_security_wallet_transactions(order_id);
create index if not exists idx_security_wallet_warnings_vendor_created
  on public.vendor_security_wallet_warnings(vendor_id, created_at desc);

alter table public.vendor_security_wallets enable row level security;
alter table public.vendor_security_wallet_transactions enable row level security;
alter table public.vendor_security_wallet_warnings enable row level security;

create policy "Vendor owners can read own security wallet"
  on public.vendor_security_wallets for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_security_wallets.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

create policy "Vendor owners can read own security wallet transactions"
  on public.vendor_security_wallet_transactions for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_security_wallet_transactions.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

create policy "Vendor owners can read own security wallet warnings"
  on public.vendor_security_wallet_warnings for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_security_wallet_warnings.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

-- Writes must go through backend service role or secured RPC/admin routes.
