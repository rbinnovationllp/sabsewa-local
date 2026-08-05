-- Vendor-specific delivery policy expansion.
-- Adds optional minimum delivery order value and per-order delivery charge override metadata.

alter table public.vendor_terminals
  add column if not exists minimum_delivery_order_value numeric(10,2) not null default 0
    check (minimum_delivery_order_value >= 0);

alter table public.hyperlocal_orders
  add column if not exists delivery_charge_original numeric(10,2),
  add column if not exists delivery_charge_override_amount numeric(10,2),
  add column if not exists delivery_charge_override_reason text,
  add column if not exists delivery_charge_overridden_by uuid,
  add column if not exists delivery_charge_overridden_at timestamptz,
  add column if not exists minimum_delivery_order_value numeric(10,2) not null default 0
    check (minimum_delivery_order_value >= 0);

comment on column public.vendor_terminals.minimum_delivery_order_value is
  'Optional vendor/terminal-specific minimum cart value required for delivery acceptance. Zero means no minimum.';

comment on column public.hyperlocal_orders.delivery_charge_override_amount is
  'Vendor override amount for delivery charge on an individual order. Allows waive/reduce/increase at vendor discretion.';
