-- Vendor voluntary exit and advance balance refund workflow.

alter table if exists public.vendor_security_wallets
  drop constraint if exists vendor_security_wallets_eligibility_status_check;

alter table if exists public.vendor_security_wallets
  add constraint vendor_security_wallets_eligibility_status_check
  check (eligibility_status in (
    'eligible',
    'low_balance',
    'final_warning',
    'orders_stopped',
    'security_deposit_required',
    'closure_requested',
    'refund_processing',
    'closed',
    'suspended'
  ));

alter table if exists public.vendor_security_wallet_transactions
  drop constraint if exists vendor_security_wallet_transactions_transaction_type_check;

alter table if exists public.vendor_security_wallet_transactions
  add constraint vendor_security_wallet_transactions_transaction_type_check
  check (transaction_type in (
    'security_deposit',
    'top_up',
    'order_fee',
    'activation_usage_charge',
    'refund',
    'refund_adjustment',
    'manual_adjustment'
  ));

create table if not exists public.vendor_exit_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  wallet_id uuid not null references public.vendor_security_wallets(id) on delete cascade,
  requested_by uuid,
  request_reason text,
  status text not null default 'closure_requested'
    check (status in ('closure_requested', 'under_review', 'approved', 'rejected', 'refund_processing', 'refunded', 'closed')),
  balance_at_request numeric(12,2) not null default 0,
  activation_usage_charge numeric(12,2) not null default 500,
  unpaid_order_fees numeric(12,2) not null default 0,
  legal_adjustments numeric(12,2) not null default 0,
  estimated_refund numeric(12,2) not null default 0,
  final_refund numeric(12,2),
  calculation jsonb not null default '{}'::jsonb,
  vendor_acknowledged boolean not null default false,
  vendor_acknowledged_at timestamptz,
  notice_sent_at timestamptz,
  response_deadline_at timestamptz,
  admin_user_id uuid,
  admin_reason text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendor_exit_requests_vendor_created
  on public.vendor_exit_requests(vendor_id, created_at desc);

alter table public.vendor_exit_requests enable row level security;

create policy "Vendor owners can read own exit requests"
  on public.vendor_exit_requests for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_exit_requests.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

-- Writes must go through backend service role or secured admin/vendor routes.
