-- SabSewa Local - Partner commission automation support
-- Safe to run multiple times. It preserves existing partner/vendor/payment data.

alter table public.partner_commission_events
  add column if not exists referral_code text,
  add column if not exists payment_reference text,
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists paid_at timestamptz;

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.partner_commission_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%commission_percent%'
  loop
    execute format('alter table public.partner_commission_events drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.partner_commission_events
  add constraint partner_commission_events_commission_percent_range_check
  check (commission_percent >= 0 and commission_percent <= 100);

create unique index if not exists uq_partner_commission_events_payment_reference
  on public.partner_commission_events(partner_application_id, vendor_id, payment_reference)
  where payment_reference is not null;

create unique index if not exists uq_partner_commission_events_source
  on public.partner_commission_events(partner_application_id, vendor_id, source_type, source_id)
  where source_type is not null and source_id is not null;

create index if not exists idx_partner_commission_events_vendor_source
  on public.partner_commission_events(vendor_id, source_type, status, created_at desc);

comment on column public.partner_commission_events.gross_revenue is
  'Eligible SabSewa company revenue for partner benefit calculation, excluding GST, refundable deposits, customer-vendor pass-through payments, refunds, and payment gateway charges where separately recorded.';
