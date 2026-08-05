-- MRP-based pricing policy for branded master catalogue items.
-- Keep this file in sync with RUN_ONLY_MRP_PRICING_POLICY_FOR_BULK_CATALOGUE.sql.

alter table public.master_product_catalog
  add column if not exists mrp numeric(10,2),
  add column if not exists product_description text,
  add column if not exists generic_image_url text,
  add column if not exists is_branded boolean not null default false;

alter table public.vendor_items
  add column if not exists mrp_pricing_policy text not null default 'manual'
    check (mrp_pricing_policy in ('manual', 'mrp', 'mrp_discount')),
  add column if not exists mrp_discount_percent numeric(5,2) not null default 0
    check (mrp_discount_percent >= 0 and mrp_discount_percent <= 95),
  add column if not exists master_mrp_snapshot numeric(10,2),
  add column if not exists auto_price_updated_at timestamptz;

create or replace function public.calculate_mrp_policy_price(source_mrp numeric, pricing_policy text, discount_percent numeric)
returns numeric
language sql
immutable
as $$
  select case
    when source_mrp is null or source_mrp <= 0 then 0::numeric
    when pricing_policy = 'mrp' then round(source_mrp, 2)
    when pricing_policy = 'mrp_discount' then round(source_mrp * (1 - least(greatest(coalesce(discount_percent, 0), 0), 95) / 100), 2)
    else 0::numeric
  end;
$$;

create or replace function public.apply_vendor_item_mrp_policy()
returns trigger
language plpgsql
as $$
declare
  source_mrp numeric;
begin
  if new.mrp_pricing_policy in ('mrp', 'mrp_discount') then
    source_mrp := coalesce(new.mrp, new.master_mrp_snapshot);
    if source_mrp is not null and source_mrp > 0 then
      new.price := public.calculate_mrp_policy_price(source_mrp, new.mrp_pricing_policy, new.mrp_discount_percent);
      new.price_display_mode := 'show_price';
      new.master_mrp_snapshot := source_mrp;
      new.auto_price_updated_at := now();
      new.discount_label := case
        when new.mrp_pricing_policy = 'mrp' then 'Selling at MRP'
        when new.mrp_discount_percent > 0 then concat(new.mrp_discount_percent::text, '% off MRP')
        else null
      end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_apply_vendor_item_mrp_policy on public.vendor_items;
create trigger trg_apply_vendor_item_mrp_policy
before insert or update of mrp_pricing_policy, mrp_discount_percent, mrp, master_mrp_snapshot
on public.vendor_items
for each row
execute function public.apply_vendor_item_mrp_policy();

create or replace function public.refresh_vendor_item_prices_for_master_mrp()
returns trigger
language plpgsql
as $$
begin
  if new.mrp is distinct from old.mrp then
    update public.vendor_items
    set mrp = new.mrp,
        master_mrp_snapshot = new.mrp,
        price = public.calculate_mrp_policy_price(new.mrp, mrp_pricing_policy, mrp_discount_percent),
        price_display_mode = 'show_price',
        auto_price_updated_at = now(),
        price_updated_at = now(),
        discount_label = case
          when mrp_pricing_policy = 'mrp' then 'Selling at MRP'
          when mrp_pricing_policy = 'mrp_discount' and mrp_discount_percent > 0 then concat(mrp_discount_percent::text, '% off MRP')
          else discount_label
        end
    where master_product_id = new.id
      and mrp_pricing_policy in ('mrp', 'mrp_discount')
      and new.mrp is not null
      and new.mrp > 0;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_refresh_vendor_item_prices_for_master_mrp on public.master_product_catalog;
create trigger trg_refresh_vendor_item_prices_for_master_mrp
after update of mrp on public.master_product_catalog
for each row
execute function public.refresh_vendor_item_prices_for_master_mrp();

create or replace function public.refresh_vendor_item_prices_for_variant_mrp()
returns trigger
language plpgsql
as $$
begin
  if new.mrp is distinct from old.mrp then
    update public.vendor_items
    set mrp = new.mrp,
        master_mrp_snapshot = new.mrp,
        price = public.calculate_mrp_policy_price(new.mrp, mrp_pricing_policy, mrp_discount_percent),
        price_display_mode = 'show_price',
        auto_price_updated_at = now(),
        price_updated_at = now(),
        discount_label = case
          when mrp_pricing_policy = 'mrp' then 'Selling at MRP'
          when mrp_pricing_policy = 'mrp_discount' and mrp_discount_percent > 0 then concat(mrp_discount_percent::text, '% off MRP')
          else discount_label
        end
    where product_variant_id = new.id
      and mrp_pricing_policy in ('mrp', 'mrp_discount')
      and new.mrp is not null
      and new.mrp > 0;
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.product_variants') is not null then
    drop trigger if exists trg_refresh_vendor_item_prices_for_variant_mrp on public.product_variants;
    create trigger trg_refresh_vendor_item_prices_for_variant_mrp
    after update of mrp on public.product_variants
    for each row
    execute function public.refresh_vendor_item_prices_for_variant_mrp();
  end if;
end $$;

update public.master_product_catalog
set is_branded = true
where brand_name is not null and trim(brand_name) <> '';

comment on column public.vendor_items.mrp_pricing_policy is
  'manual keeps vendor-entered price. mrp sells at latest MRP. mrp_discount recalculates from latest MRP and mrp_discount_percent.';
