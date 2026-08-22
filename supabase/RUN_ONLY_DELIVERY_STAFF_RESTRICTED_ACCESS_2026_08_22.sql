-- SabSewa Local - Delivery Staff restricted terminal access
-- Safe to run more than once. Run in Supabase SQL Editor before deploying the updated rider/vendor delivery code.

begin;

alter table public.delivery_boys
  add column if not exists role text not null default 'DELIVERY_STAFF',
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_reason text,
  add column if not exists compensation_rate_per_delivery numeric(10,2) not null default 0,
  add column if not exists cash_reconciliation_status text not null default 'none';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_boys_role_check'
      and conrelid = 'public.delivery_boys'::regclass
  ) then
    alter table public.delivery_boys
      add constraint delivery_boys_role_check check (role in ('DELIVERY_STAFF'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_boys_compensation_rate_nonnegative'
      and conrelid = 'public.delivery_boys'::regclass
  ) then
    alter table public.delivery_boys
      add constraint delivery_boys_compensation_rate_nonnegative check (compensation_rate_per_delivery >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_boys_cash_reconciliation_status_check'
      and conrelid = 'public.delivery_boys'::regclass
  ) then
    alter table public.delivery_boys
      add constraint delivery_boys_cash_reconciliation_status_check
      check (cash_reconciliation_status in ('none', 'pending', 'partially_reconciled', 'reconciled'));
  end if;
end $$;

alter table public.delivery_assignments
  add column if not exists assigned_by uuid,
  add column if not exists reassigned_from uuid,
  add column if not exists cash_collected_amount numeric(12,2) not null default 0,
  add column if not exists cash_collected_at timestamptz,
  add column if not exists cash_handover_status text not null default 'not_applicable',
  add column if not exists cash_handover_confirmed_at timestamptz,
  add column if not exists payment_collection_status text not null default 'not_collected',
  add column if not exists staff_credit_request_note text,
  add column if not exists staff_credit_request_at timestamptz,
  add column if not exists delivery_completion_key text,
  add column if not exists delivery_completed_by uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'delivery_assignments_status_check'
      and conrelid = 'public.delivery_assignments'::regclass
  ) then
    alter table public.delivery_assignments drop constraint delivery_assignments_status_check;
  end if;

  alter table public.delivery_assignments
    add constraint delivery_assignments_status_check
    check (status in ('assigned', 'picked', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled', 'reassigned'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_assignments_cash_nonnegative'
      and conrelid = 'public.delivery_assignments'::regclass
  ) then
    alter table public.delivery_assignments
      add constraint delivery_assignments_cash_nonnegative check (cash_collected_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_assignments_cash_handover_status_check'
      and conrelid = 'public.delivery_assignments'::regclass
  ) then
    alter table public.delivery_assignments
      add constraint delivery_assignments_cash_handover_status_check
      check (cash_handover_status in ('not_applicable', 'pending_vendor_reconciliation', 'reconciled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_assignments_payment_collection_status_check'
      and conrelid = 'public.delivery_assignments'::regclass
  ) then
    alter table public.delivery_assignments
      add constraint delivery_assignments_payment_collection_status_check
      check (payment_collection_status in ('not_collected', 'cash_collected', 'upi_confirmed', 'already_paid', 'vendor_credit_required', 'pending_vendor_review'));
  end if;
end $$;

create table if not exists public.delivery_staff_audit_logs (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid,
  terminal_id uuid,
  delivery_boy_id uuid,
  assignment_id uuid,
  order_id uuid,
  actor_role text not null default 'DELIVERY_STAFF',
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_boys_vendor_terminal_status
  on public.delivery_boys(vendor_id, terminal_id, status, is_active);

create index if not exists idx_delivery_assignments_staff_status
  on public.delivery_assignments(delivery_boy_id, status);

create index if not exists idx_delivery_assignments_vendor_status
  on public.delivery_assignments(vendor_id, terminal_id, status);

create index if not exists idx_delivery_staff_audit_vendor_created
  on public.delivery_staff_audit_logs(vendor_id, created_at desc);

alter table public.delivery_staff_audit_logs enable row level security;

comment on table public.delivery_staff_audit_logs is
  'Audit trail for restricted delivery staff terminal actions, vendor assignment/reassignment, cash collection reporting and reconciliation.';

commit;
