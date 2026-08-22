-- SabSewa Local - strict vendor acceptance wallet guard
-- Blocks final vendor acceptance if the full base-fee-plus-GST deduction was not covered.
-- This keeps customer contact/address details locked when wallet deduction fails or is partial.

create or replace function public.enforce_order_acceptance_full_wallet_charge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx record;
  v_has_monthly_covered boolean := false;
  v_deducted_paise integer := 0;
  v_unpaid_liability_paise integer := 0;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(old.status, '') = 'accepted' or coalesce(new.status, '') <> 'accepted' then
    return new;
  end if;

  select exists (
    select 1
      from public.vendor_order_plan_usage_events e
     where e.order_id = new.id
       and e.event_type = 'accepted_order_covered'
  )
    into v_has_monthly_covered;

  if v_has_monthly_covered then
    return new;
  end if;

  select
    id,
    gross_platform_fee_paise,
    amount,
    metadata
    into v_tx
    from public.vendor_security_wallet_transactions
   where order_id = new.id
     and vendor_id = new.vendor_id
     and transaction_type = 'order_fee'
   order by created_at desc
   limit 1;

  if not found then
    raise exception 'Final order acceptance requires completed platform fee plus GST deduction or active monthly-plan coverage.';
  end if;

  v_deducted_paise := abs(round(coalesce(v_tx.amount, 0) * 100)::integer);
  v_unpaid_liability_paise := coalesce((v_tx.metadata->>'unpaid_liability_paise')::integer, 0);

  if coalesce(v_tx.gross_platform_fee_paise, 0) <= 0 then
    raise exception 'Final order acceptance requires a valid base platform fee plus GST ledger snapshot.';
  end if;

  if v_unpaid_liability_paise > 0 or v_deducted_paise < v_tx.gross_platform_fee_paise then
    raise exception 'Insufficient vendor wallet balance. Please top up before accepting this order. Required total platform fee plus GST: Rs %. Available deduction: Rs %.',
      to_char(v_tx.gross_platform_fee_paise::numeric / 100, 'FM999999990.00'),
      to_char(v_deducted_paise::numeric / 100, 'FM999999990.00');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_order_acceptance_full_wallet_charge on public.hyperlocal_orders;
create trigger trg_enforce_order_acceptance_full_wallet_charge
before update of status on public.hyperlocal_orders
for each row
execute function public.enforce_order_acceptance_full_wallet_charge();

comment on function public.enforce_order_acceptance_full_wallet_charge() is
  'Prevents customer-detail unlock/final acceptance unless the complete GST-inclusive platform deduction succeeded or a monthly plan covers the order.';
