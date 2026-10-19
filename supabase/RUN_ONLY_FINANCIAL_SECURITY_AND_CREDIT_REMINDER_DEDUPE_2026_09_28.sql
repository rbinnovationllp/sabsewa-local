-- Run after RUN_ONLY_VENDOR_CUSTOMER_CREDIT_ADVANCE_ATOMIC_2026_09_28.sql.
alter table public.vendor_credit_reminders
  add column if not exists idempotency_key text;

create unique index if not exists uq_vendor_credit_reminder_idempotency
  on public.vendor_credit_reminders(idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_vendor_credit_reminders_account_status_created
  on public.vendor_credit_reminders(account_id, status, created_at desc);

-- Verification result should show both functions, both advance/idempotency columns and two indexes.
select 'function' as object_type, p.proname as object_name
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('record_vendor_credit_payment_atomic', 'record_vendor_credit_purchase_atomic')
union all
select 'column', column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'vendor_credit_accounts' and column_name = 'advance_balance'
union all
select 'column', column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'vendor_credit_transactions' and column_name = 'idempotency_key'
union all
select 'column', column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'vendor_credit_reminders' and column_name = 'idempotency_key'
union all
select 'index', indexname
from pg_indexes
where schemaname = 'public'
  and indexname in ('uq_vendor_credit_transaction_idempotency', 'uq_vendor_credit_reminder_idempotency');
