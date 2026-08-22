-- SabSewa Local - Vendor delivery operating model
-- Safe to run multiple times. This does not delete existing delivery staff or assignments.

alter table public.vendor_terminals
  add column if not exists delivery_model text not null default 'multiple_staff';

alter table public.vendor_terminals
  add column if not exists default_delivery_boy_id uuid references public.delivery_boys(id) on delete set null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'vendor_terminals_delivery_model_check'
       and conrelid = 'public.vendor_terminals'::regclass
  ) then
    alter table public.vendor_terminals
      add constraint vendor_terminals_delivery_model_check
      check (delivery_model in ('vendor_self', 'single_staff', 'multiple_staff'));
  end if;
end $$;

alter table public.delivery_assignments
  add column if not exists assigned_by uuid;

alter table public.delivery_assignments
  add column if not exists reassigned_from uuid references public.delivery_boys(id) on delete set null;

alter table public.delivery_assignments
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_vendor_terminals_delivery_model
  on public.vendor_terminals(vendor_id, delivery_model);

comment on column public.vendor_terminals.delivery_model is
  'Vendor-selected delivery workflow: vendor_self, single_staff, or multiple_staff.';

comment on column public.vendor_terminals.default_delivery_boy_id is
  'Optional default active delivery staff for one-staff shops.';

comment on column public.delivery_assignments.metadata is
  'Delivery assignment metadata, including vendor_self delivery where no delivery_boy_id is required.';
