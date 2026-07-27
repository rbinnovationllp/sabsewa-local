-- Vendor-controlled product price display and quotation workflow.

alter table public.vendor_items
  add column if not exists price_display_mode text not null default 'show_price'
    check (price_display_mode in ('show_price', 'hide_price', 'market_price')),
  add column if not exists price_unit_label text,
  add column if not exists previous_price numeric(10,2),
  add column if not exists discount_label text,
  add column if not exists price_updated_at timestamptz,
  add column if not exists price_updated_by uuid;

alter table public.hyperlocal_orders
  add column if not exists price_quote_required boolean not null default false,
  add column if not exists price_quote_status text not null default 'not_required'
    check (price_quote_status in ('not_required', 'pending_vendor_quote', 'pending_customer_approval', 'customer_accepted', 'customer_rejected')),
  add column if not exists vendor_price_quote jsonb,
  add column if not exists vendor_price_quoted_at timestamptz,
  add column if not exists customer_price_quote_responded_at timestamptz,
  add column if not exists quoted_total_amount numeric(10,2);

create table if not exists public.vendor_item_price_history (
  id uuid primary key default gen_random_uuid(),
  vendor_item_id uuid not null references public.vendor_items(id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  terminal_id uuid references public.vendor_terminals(id) on delete set null,
  old_price numeric(10,2),
  new_price numeric(10,2),
  old_price_display_mode text,
  new_price_display_mode text,
  old_price_unit_label text,
  new_price_unit_label text,
  changed_by uuid,
  change_reason text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_vendor_item_price_history_item_created
  on public.vendor_item_price_history(vendor_item_id, created_at desc);

create index if not exists idx_vendor_item_price_history_vendor_created
  on public.vendor_item_price_history(vendor_id, created_at desc);

create or replace function public.record_vendor_item_price_change()
returns trigger
language plpgsql
as $$
begin
  if old.price is distinct from new.price
     or old.price_display_mode is distinct from new.price_display_mode
     or old.price_unit_label is distinct from new.price_unit_label then
    insert into public.vendor_item_price_history (
      vendor_item_id,
      vendor_id,
      terminal_id,
      old_price,
      new_price,
      old_price_display_mode,
      new_price_display_mode,
      old_price_unit_label,
      new_price_unit_label,
      changed_by,
      change_reason,
      metadata
    ) values (
      new.id,
      new.vendor_id,
      new.terminal_id,
      old.price,
      new.price,
      old.price_display_mode,
      new.price_display_mode,
      old.price_unit_label,
      new.price_unit_label,
      auth.uid(),
      'Vendor item price or display mode updated',
      jsonb_build_object(
        'previous_price', new.previous_price,
        'discount_label', new.discount_label
      )
    );

    new.price_updated_at := coalesce(new.price_updated_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_record_vendor_item_price_change on public.vendor_items;
create trigger trg_record_vendor_item_price_change
before update on public.vendor_items
for each row execute function public.record_vendor_item_price_change();

alter table public.vendor_item_price_history enable row level security;

drop policy if exists "Vendors read own item price history" on public.vendor_item_price_history;
drop policy if exists "Admins read all item price history" on public.vendor_item_price_history;

create policy "Vendors read own item price history"
  on public.vendor_item_price_history for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

create policy "Admins read all item price history"
  on public.vendor_item_price_history for select
  to authenticated
  using (public.is_company_admin());

create or replace function public.prevent_unapproved_price_quote_acceptance()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'accepted'
     and old.status is distinct from 'accepted'
     and new.price_quote_required = true
     and new.price_quote_status <> 'customer_accepted' then
    raise exception 'Customer must approve the vendor quoted price before the order can be accepted.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_unapproved_price_quote_acceptance on public.hyperlocal_orders;
create trigger trg_prevent_unapproved_price_quote_acceptance
before update of status on public.hyperlocal_orders
for each row execute function public.prevent_unapproved_price_quote_acceptance();

-- Price changes affect only future order snapshots. Existing order items retain
-- the price, display mode and quote state captured when the order was placed.
