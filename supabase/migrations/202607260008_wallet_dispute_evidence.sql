-- Wallet dispute and transaction evidence module.
-- Financial history is append-only: reversals are separate positive entries.

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
    'manual_adjustment',
    'dispute_reversal'
  ));

create table if not exists public.wallet_transaction_disputes (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  wallet_transaction_id uuid not null references public.vendor_security_wallet_transactions(id) on delete restrict,
  order_id uuid references public.hyperlocal_orders(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'under_review', 'approved_reversal', 'rejected', 'closed')),
  complaint_text text not null,
  supporting_documents jsonb not null default '[]'::jsonb,
  raised_by_user_id uuid,
  raised_by_role text not null default 'vendor'
    check (raised_by_role in ('vendor', 'admin')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  reversal_transaction_id uuid references public.vendor_security_wallet_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.vendor_security_wallet_transactions
  add column if not exists statement_month date,
  add column if not exists archive_after date,
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text,
  add column if not exists soft_deleted_at timestamptz,
  add column if not exists soft_deleted_by uuid,
  add column if not exists soft_delete_reason text,
  add column if not exists recoverable_until date,
  add column if not exists recovered_at timestamptz,
  add column if not exists recovered_by uuid,
  add column if not exists recovery_reason text;

update public.vendor_security_wallet_transactions
   set statement_month = date_trunc('month', created_at)::date
 where statement_month is null;

update public.vendor_security_wallet_transactions
   set archive_after = (date_trunc('month', created_at) + interval '1 month' + interval '14 days')::date
 where archive_after is null;

update public.vendor_security_wallet_transactions
   set archived_at = now(),
       archive_reason = 'Moved from active Vendor CRM view after the 15th day of the following month; retained centrally for audit and dispute retrieval.'
 where archived_at is null
   and archive_after < current_date;

update public.vendor_security_wallet_transactions
   set recoverable_until = (coalesce(soft_deleted_at, archived_at, created_at)::date + interval '6 months')::date
 where recoverable_until is null;

create index if not exists idx_wallet_disputes_vendor_created
  on public.wallet_transaction_disputes(vendor_id, created_at desc);

create index if not exists idx_wallet_disputes_tx
  on public.wallet_transaction_disputes(wallet_transaction_id);

create index if not exists idx_wallet_transactions_archive_lookup
  on public.vendor_security_wallet_transactions(vendor_id, statement_month, archived_at, order_id);

alter table public.vendor_credit_accounts
  add column if not exists settlement_status text not null default 'active'
    check (settlement_status in ('active', 'paid', 'settled', 'suspended')),
  add column if not exists settled_at timestamptz,
  add column if not exists settlement_amount numeric(12,2),
  add column if not exists settlement_acknowledgement text,
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text,
  add column if not exists soft_deleted_at timestamptz,
  add column if not exists soft_deleted_by uuid,
  add column if not exists soft_delete_reason text,
  add column if not exists recoverable_until date,
  add column if not exists recovered_at timestamptz,
  add column if not exists recovered_by uuid,
  add column if not exists recovery_reason text;

create index if not exists idx_vendor_credit_accounts_archive
  on public.vendor_credit_accounts(vendor_id, customer_id, settlement_status, archived_at);

alter table public.hyperlocal_orders
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text,
  add column if not exists soft_deleted_at timestamptz,
  add column if not exists soft_deleted_by uuid,
  add column if not exists soft_delete_reason text,
  add column if not exists recoverable_until date,
  add column if not exists recovered_at timestamptz,
  add column if not exists recovered_by uuid,
  add column if not exists recovery_reason text;

alter table public.wallet_transaction_disputes
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text,
  add column if not exists soft_deleted_at timestamptz,
  add column if not exists soft_deleted_by uuid,
  add column if not exists soft_delete_reason text,
  add column if not exists recoverable_until date,
  add column if not exists recovered_at timestamptz,
  add column if not exists recovered_by uuid,
  add column if not exists recovery_reason text;

create table if not exists public.company_data_recovery_audit (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null,
  target_table text not null,
  target_record_id uuid,
  vendor_id uuid,
  customer_id uuid,
  order_id uuid,
  transaction_id uuid,
  statement_month date,
  recovery_scope text not null default 'read_only_lookup'
    check (recovery_scope in ('read_only_lookup', 'restore_to_active_view', 'soft_delete_reversal')),
  reason text not null,
  result_count integer not null default 0,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_company_data_recovery_audit_lookup
  on public.company_data_recovery_audit(vendor_id, customer_id, order_id, transaction_id, statement_month, created_at desc);

alter table public.company_data_recovery_audit enable row level security;

drop policy if exists "Admins read recovery audit" on public.company_data_recovery_audit;

create policy "Admins read recovery audit"
  on public.company_data_recovery_audit for select
  to authenticated
  using (public.is_company_admin());

-- Recovery writes are restricted to protected backend service-role routes.

alter table public.wallet_transaction_disputes enable row level security;

drop policy if exists "Vendors read own wallet disputes" on public.wallet_transaction_disputes;
drop policy if exists "Admins read all wallet disputes" on public.wallet_transaction_disputes;

create policy "Vendors read own wallet disputes"
  on public.wallet_transaction_disputes for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

create policy "Admins read all wallet disputes"
  on public.wallet_transaction_disputes for select
  to authenticated
  using (public.is_company_admin());

-- Inserts, reviews, reversals and document evidence updates must be done through
-- protected backend routes using the Supabase service-role key.

create or replace function public.approve_wallet_dispute_reversal(
  p_dispute_id uuid,
  p_admin_user_id uuid,
  p_review_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute public.wallet_transaction_disputes%rowtype;
  v_original_tx public.vendor_security_wallet_transactions%rowtype;
  v_wallet public.vendor_security_wallets%rowtype;
  v_balance_before numeric;
  v_balance_after numeric;
  v_reversal_amount numeric;
  v_reversal_tx public.vendor_security_wallet_transactions%rowtype;
  v_next_status text;
begin
  if coalesce(trim(p_review_reason), '') = '' then
    raise exception 'Mandatory reversal reason is required.';
  end if;

  select *
    into v_dispute
    from public.wallet_transaction_disputes
   where id = p_dispute_id
   for update;

  if not found then
    raise exception 'Wallet dispute not found.';
  end if;

  if v_dispute.status = 'approved_reversal' then
    select *
      into v_reversal_tx
      from public.vendor_security_wallet_transactions
     where id = v_dispute.reversal_transaction_id;
    return jsonb_build_object('dispute', to_jsonb(v_dispute), 'reversal_transaction', to_jsonb(v_reversal_tx));
  end if;

  select *
    into v_original_tx
    from public.vendor_security_wallet_transactions
   where id = v_dispute.wallet_transaction_id
   for update;

  if not found then
    raise exception 'Original wallet transaction not found.';
  end if;

  if v_original_tx.amount >= 0 then
    raise exception 'Only debit transactions can be reversed through this dispute flow.';
  end if;

  select *
    into v_wallet
    from public.vendor_security_wallets
   where vendor_id = v_dispute.vendor_id
   for update;

  if not found then
    raise exception 'Vendor wallet not found.';
  end if;

  v_reversal_amount := abs(v_original_tx.amount);
  v_balance_before := v_wallet.current_balance;
  v_balance_after := v_balance_before + v_reversal_amount;
  v_next_status :=
    case
      when v_wallet.opening_balance < 5000 then 'security_deposit_required'
      when v_balance_after < 515 then 'orders_stopped'
      when v_balance_after < 500 then 'final_warning'
      when v_balance_after <= 1000 then 'low_balance'
      else 'eligible'
    end;

  update public.vendor_security_wallets
     set current_balance = v_balance_after,
         eligibility_status = v_next_status,
         updated_at = now()
   where id = v_wallet.id
   returning * into v_wallet;

  insert into public.vendor_security_wallet_transactions (
    wallet_id,
    vendor_id,
    order_id,
    terminal_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    payment_reference,
    admin_user_id,
    admin_reason,
    idempotency_key,
    reversal_of_transaction_id,
    metadata
  ) values (
    v_wallet.id,
    v_dispute.vendor_id,
    v_original_tx.order_id,
    v_original_tx.terminal_id,
    'dispute_reversal',
    v_reversal_amount,
    v_balance_before,
    v_balance_after,
    'DISPUTE_REVERSAL_' || p_dispute_id::text,
    p_admin_user_id,
    p_review_reason,
    'wallet_dispute_reversal:' || p_dispute_id::text,
    v_original_tx.id,
    jsonb_build_object(
      'dispute_id', p_dispute_id,
      'original_transaction_id', v_original_tx.id,
      'review_reason', p_review_reason
    )
  )
  returning * into v_reversal_tx;

  update public.wallet_transaction_disputes
     set status = 'approved_reversal',
         reviewed_by = p_admin_user_id,
         reviewed_at = now(),
         review_reason = p_review_reason,
         reversal_transaction_id = v_reversal_tx.id,
         updated_at = now()
   where id = p_dispute_id
   returning * into v_dispute;

  return jsonb_build_object(
    'dispute', to_jsonb(v_dispute),
    'wallet', to_jsonb(v_wallet),
    'original_transaction', to_jsonb(v_original_tx),
    'reversal_transaction', to_jsonb(v_reversal_tx)
  );
end;
$$;

revoke all on function public.approve_wallet_dispute_reversal(uuid, uuid, text) from public;
grant execute on function public.approve_wallet_dispute_reversal(uuid, uuid, text) to service_role;
