-- SabSewa Local vendor advance balance update.
-- Business rule: vendors deposit a minimum Rs 5,000 advance balance, and
-- SabSewa Local deducts Rs 15 only for successfully completed orders.

alter table if exists public.vendor_security_wallets
  alter column minimum_security_deposit set default 5000;

alter table if exists public.vendor_security_wallets
  alter column stop_orders_threshold set default 515;

alter table if exists public.vendor_security_wallets
  alter column operational_minimum_balance set default 515;

update public.vendor_security_wallets
set
  minimum_security_deposit = 5000,
  stop_orders_threshold = 515,
  operational_minimum_balance = 515,
  updated_at = now()
where minimum_security_deposit <> 5000
   or stop_orders_threshold <> 515
   or operational_minimum_balance <> 515;

update public.vendor_security_wallets
set eligibility_status =
  case
    when coalesce(opening_balance, 0) < 5000 then 'security_deposit_required'
    when coalesce(current_balance, 0) < coalesce(stop_orders_threshold, 515) then 'orders_stopped'
    when coalesce(current_balance, 0) < coalesce(final_warning_threshold, 500) then 'final_warning'
    when coalesce(current_balance, 0) <= coalesce(reminder_threshold, 1000) then 'low_balance'
    else 'eligible'
  end,
  updated_at = now();
