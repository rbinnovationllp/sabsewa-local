-- SabSewa Local - Customer/vendor payment status synchronization
-- Run this once in Supabase SQL Editor before deploying the backend that writes
-- partially_paid / partial settlement states.

begin;

alter table public.hyperlocal_orders
  drop constraint if exists hyperlocal_orders_payment_status_check;

alter table public.hyperlocal_orders
  add constraint hyperlocal_orders_payment_status_check
  check (payment_status in (
    'unpaid',
    'paid',
    'partially_paid',
    'credit_due',
    'pending_payment',
    'payment_reported',
    'payment_disputed',
    'refunded',
    'failed'
  ));

alter table public.hyperlocal_orders
  drop constraint if exists hyperlocal_orders_settlement_status_check;

alter table public.hyperlocal_orders
  add constraint hyperlocal_orders_settlement_status_check
  check (settlement_status in (
    'pending',
    'partial',
    'complete',
    'credit_pending',
    'disputed',
    'failed',
    'refunded'
  ));

alter table public.order_payment_transactions
  drop constraint if exists order_payment_transactions_settlement_status_check;

alter table public.order_payment_transactions
  add constraint order_payment_transactions_settlement_status_check
  check (settlement_status in (
    'pending',
    'partial',
    'complete',
    'credit_pending',
    'disputed',
    'failed',
    'refunded'
  ));

comment on constraint hyperlocal_orders_payment_status_check on public.hyperlocal_orders
  is 'Allows vendor-authoritative cash/UPI/partial/credit payment states while preserving validation.';

commit;
