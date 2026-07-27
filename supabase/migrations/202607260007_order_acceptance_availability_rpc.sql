-- Daily availability, partial fulfilment, and atomic vendor acceptance.
-- Apply after 202607260004 so helper functions such as owns_vendor() exist.

alter table public.vendor_items
  add column if not exists available_today boolean not null default true,
  add column if not exists stock_status text not null default 'in_stock'
    check (stock_status in ('in_stock', 'low_stock', 'out_of_stock')),
  add column if not exists daily_stock_quantity numeric,
  add column if not exists daily_availability_updated_at timestamptz,
  add column if not exists daily_availability_note text;

alter table public.vendor_terminals
  add column if not exists is_open_today boolean not null default true,
  add column if not exists opening_status_updated_at timestamptz,
  add column if not exists opening_status_note text;

alter table public.hyperlocal_orders
  add column if not exists requested_delivery_time text,
  add column if not exists order_instructions text,
  add column if not exists safe_order_instructions text,
  add column if not exists general_delivery_area text,
  add column if not exists approx_distance_km numeric,
  add column if not exists partial_fulfillment_offer jsonb,
  add column if not exists partial_fulfillment_status text not null default 'none'
    check (partial_fulfillment_status in ('none', 'pending_customer_confirmation', 'customer_accepted', 'customer_rejected')),
  add column if not exists partial_fulfillment_offered_at timestamptz,
  add column if not exists partial_fulfillment_confirmed_at timestamptz,
  add column if not exists accepted_items jsonb;

alter table public.vendor_security_wallet_transactions
  add column if not exists idempotency_key text,
  add column if not exists terminal_id uuid references public.vendor_terminals(id) on delete set null,
  add column if not exists linked_audit_log_id uuid references public.order_audit_logs(id) on delete set null,
  add column if not exists reversal_of_transaction_id uuid references public.vendor_security_wallet_transactions(id) on delete restrict;

create unique index if not exists uniq_vendor_wallet_tx_idempotency_key
  on public.vendor_security_wallet_transactions(idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_vendor_items_daily_availability
  on public.vendor_items(vendor_id, terminal_id, available_today, is_available);

create index if not exists idx_vendor_terminals_open_today
  on public.vendor_terminals(vendor_id, is_open_today);

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
  v_balance_before numeric;
  v_balance_after numeric;
  v_next_status text;
  v_warning_level text;
  v_audit_log_id uuid;
  v_now timestamptz := now();
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

    return jsonb_build_object('order', to_jsonb(v_order), 'wallet', to_jsonb(v_wallet));
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

  if v_wallet.current_balance < 515 then
    raise exception 'Vendor advance balance is below Rs 515. Order cannot be accepted and customer details remain locked.';
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
    v_balance_after := v_balance_before - 15;
    v_next_status :=
      case
        when v_wallet.opening_balance < 5000 then 'security_deposit_required'
        when v_balance_after < 515 then 'orders_stopped'
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
      metadata
    ) values (
      v_wallet.id,
      p_vendor_id,
      p_order_id,
      'order_fee',
      -15,
      v_balance_before,
      v_balance_after,
      'PLATFORM_FACILITATION_CHARGE_' || p_order_id::text,
      'order_acceptance_fee:' || p_order_id::text,
      v_order.terminal_id,
      v_warning_level,
      jsonb_build_object(
        'platform_facilitation_charge', 15,
        'charge_trigger', 'vendor_order_acceptance',
        'charge_description', 'Rs 15 platform facilitation fee recorded when the vendor accepts a real-world SabSewa Local order'
      )
    );

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
          when v_warning_level = 'orders_stopped' then 'New SabSewa Local orders are stopped because your vendor advance balance is below Rs 515.'
          when v_warning_level = 'final_warning' then 'Final warning: your SabSewa Local vendor advance balance is below Rs 500.'
          else 'Your SabSewa Local vendor advance balance is Rs 1,000 or below. Please top up soon.'
        end,
        'in_app'
      );
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
      'fee_deducted', true,
      'fee_amount', 15,
      'wallet_threshold_checked', 515,
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
    )
  );
end;
$$;

revoke all on function public.accept_order_with_wallet_fee(uuid, uuid, uuid, text, jsonb) from public;
grant execute on function public.accept_order_with_wallet_fee(uuid, uuid, uuid, text, jsonb) to service_role;
