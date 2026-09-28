begin;

alter table public.vendor_credit_accounts
  add column if not exists advance_balance numeric(12,2) not null default 0 check (advance_balance >= 0);

alter table public.vendor_credit_transactions
  add column if not exists idempotency_key text;

alter table public.vendor_credit_transactions
  drop constraint if exists vendor_credit_transactions_transaction_type_check;

alter table public.vendor_credit_transactions
  add constraint vendor_credit_transactions_transaction_type_check check (transaction_type in (
    'limit_approved', 'limit_changed', 'credit_purchase', 'payment_recorded',
    'advance_deposit', 'advance_adjustment', 'manual_adjustment',
    'credit_suspended', 'credit_reactivated'
  ));

create unique index if not exists uq_vendor_credit_transaction_idempotency
  on public.vendor_credit_transactions(vendor_id, customer_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.record_vendor_credit_payment_atomic(
  p_vendor_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_vendor_user_id uuid default null,
  p_notes text default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.vendor_credit_accounts%rowtype;
  v_applied numeric(12,2);
  v_advance_added numeric(12,2);
  v_outstanding_after numeric(12,2);
  v_advance_after numeric(12,2);
  v_existing jsonb;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero.'; end if;

  if p_idempotency_key is not null then
    select metadata into v_existing from public.vendor_credit_transactions
    where vendor_id = p_vendor_id and customer_id = p_customer_id and idempotency_key = p_idempotency_key limit 1;
    if v_existing is not null then return v_existing || jsonb_build_object('idempotent', true); end if;
  end if;

  select * into v_account from public.vendor_credit_accounts
  where vendor_id = p_vendor_id and customer_id = p_customer_id for update;
  if not found then raise exception 'Credit account not found.'; end if;

  v_applied := least(v_account.outstanding_balance, p_amount);
  v_advance_added := greatest(p_amount - v_applied, 0);
  v_outstanding_after := greatest(v_account.outstanding_balance - v_applied, 0);
  v_advance_after := v_account.advance_balance + v_advance_added;

  update public.vendor_credit_accounts set
    outstanding_balance = v_outstanding_after,
    advance_balance = v_advance_after,
    due_date = case when v_outstanding_after > 0 then due_date else null end,
    status = case when status = 'suspended' then 'suspended' when v_outstanding_after = 0 then 'closed' else 'active' end,
    settled_at = case when v_outstanding_after = 0 then now() else settled_at end,
    updated_at = now()
  where id = v_account.id;

  insert into public.vendor_credit_transactions(
    vendor_id, customer_id, account_id, transaction_type, amount,
    balance_before, balance_after, vendor_user_id, notes, idempotency_key, metadata
  ) values (
    p_vendor_id, p_customer_id, v_account.id, 'payment_recorded', -v_applied,
    v_account.outstanding_balance, v_outstanding_after, p_vendor_user_id, p_notes,
    p_idempotency_key,
    jsonb_build_object(
      'payment_received', p_amount, 'applied_to_outstanding', v_applied,
      'advance_added', v_advance_added, 'advance_before', v_account.advance_balance,
      'advance_after', v_advance_after, 'vendor_specific_advance', true
    )
  );

  if v_advance_added > 0 then
    insert into public.vendor_credit_transactions(
      vendor_id, customer_id, account_id, transaction_type, amount,
      balance_before, balance_after, vendor_user_id, notes, idempotency_key, metadata
    ) values (
      p_vendor_id, p_customer_id, v_account.id, 'advance_deposit', v_advance_added,
      v_account.advance_balance, v_advance_after, p_vendor_user_id,
      'Overpayment retained as advance with this vendor only.',
      case when p_idempotency_key is null then null else p_idempotency_key || ':advance' end,
      jsonb_build_object('vendor_specific_advance', true)
    );
  end if;

  return jsonb_build_object(
    'account_id', v_account.id, 'outstanding_before', v_account.outstanding_balance,
    'payment_received', p_amount, 'applied_to_outstanding', v_applied,
    'outstanding_after', v_outstanding_after, 'advance_before', v_account.advance_balance,
    'advance_added', v_advance_added, 'advance_after', v_advance_after,
    'idempotent', false
  );
end;
$$;

create or replace function public.record_vendor_credit_purchase_atomic(
  p_vendor_id uuid,
  p_customer_id uuid,
  p_order_id uuid,
  p_amount numeric,
  p_vendor_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.vendor_credit_accounts%rowtype;
  v_key text := 'credit_purchase:' || p_order_id::text;
  v_advance_applied numeric(12,2);
  v_credit_required numeric(12,2);
  v_outstanding_after numeric(12,2);
  v_advance_after numeric(12,2);
  v_existing jsonb;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Order amount must be greater than zero.'; end if;
  select metadata into v_existing from public.vendor_credit_transactions
  where vendor_id = p_vendor_id and customer_id = p_customer_id and idempotency_key = v_key limit 1;
  if v_existing is not null then return v_existing || jsonb_build_object('idempotent', true); end if;

  select * into v_account from public.vendor_credit_accounts
  where vendor_id = p_vendor_id and customer_id = p_customer_id for update;
  if not found then raise exception 'Credit account not found.'; end if;
  if v_account.status in ('suspended', 'overdue') then raise exception 'Credit is not available for this vendor account.'; end if;

  v_advance_applied := least(v_account.advance_balance, p_amount);
  v_credit_required := greatest(p_amount - v_advance_applied, 0);
  v_outstanding_after := v_account.outstanding_balance + v_credit_required;
  if v_outstanding_after > v_account.credit_limit then raise exception 'Available credit with this vendor is exhausted.'; end if;
  v_advance_after := v_account.advance_balance - v_advance_applied;

  update public.vendor_credit_accounts set
    outstanding_balance = v_outstanding_after,
    advance_balance = v_advance_after,
    due_date = case when v_credit_required > 0 then coalesce(due_date, current_date + payment_due_days) else due_date end,
    status = case when v_outstanding_after >= credit_limit then 'exhausted' else 'active' end,
    archived_at = null, settled_at = null, updated_at = now()
  where id = v_account.id;

  insert into public.vendor_credit_transactions(
    vendor_id, customer_id, account_id, order_id, transaction_type, amount,
    balance_before, balance_after, due_date, vendor_user_id, notes, idempotency_key, metadata
  ) values (
    p_vendor_id, p_customer_id, v_account.id, p_order_id, 'credit_purchase', v_credit_required,
    v_account.outstanding_balance, v_outstanding_after, v_account.due_date, p_vendor_user_id,
    'Vendor-specific advance applied first; remaining amount recorded as vendor credit.', v_key,
    jsonb_build_object(
      'order_amount', p_amount, 'advance_applied', v_advance_applied,
      'advance_before', v_account.advance_balance, 'advance_after', v_advance_after,
      'credit_required', v_credit_required, 'vendor_specific_advance', true
    )
  );

  if v_advance_applied > 0 then
    insert into public.vendor_credit_transactions(
      vendor_id, customer_id, account_id, order_id, transaction_type, amount,
      balance_before, balance_after, vendor_user_id, notes, idempotency_key, metadata
    ) values (
      p_vendor_id, p_customer_id, v_account.id, p_order_id, 'advance_adjustment', -v_advance_applied,
      v_account.advance_balance, v_advance_after, p_vendor_user_id,
      'Vendor-specific advance applied to this vendor order.', v_key || ':advance',
      jsonb_build_object('vendor_specific_advance', true)
    );
  end if;

  return jsonb_build_object(
    'account_id', v_account.id, 'order_amount', p_amount,
    'advance_applied', v_advance_applied, 'advance_after', v_advance_after,
    'credit_required', v_credit_required, 'outstanding_after', v_outstanding_after,
    'idempotent', false
  );
end;
$$;

revoke all on function public.record_vendor_credit_payment_atomic(uuid, uuid, numeric, uuid, text, text) from public;
revoke all on function public.record_vendor_credit_purchase_atomic(uuid, uuid, uuid, numeric, uuid) from public;
grant execute on function public.record_vendor_credit_payment_atomic(uuid, uuid, numeric, uuid, text, text) to service_role;
grant execute on function public.record_vendor_credit_purchase_atomic(uuid, uuid, uuid, numeric, uuid) to service_role;

commit;
