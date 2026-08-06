-- Public discovery read access for active, verified, onboarding-paid vendors only.
-- This supports customer discovery while keeping private KYC/payment/admin fields out of backend responses.

alter table public.vendors
  add column if not exists kyc_status text not null default 'kyc_not_started',
  add column if not exists onboarding_payment_status text not null default 'payment_pending',
  add column if not exists public_verification_badge boolean not null default false,
  add column if not exists delivery_available boolean not null default true,
  add column if not exists pickup_available boolean not null default true,
  add column if not exists delivery_terms text,
  add column if not exists rating numeric(3,2) not null default 0,
  add column if not exists rating_count integer not null default 0,
  add column if not exists estimated_fulfilment_minutes integer not null default 45,
  add column if not exists max_service_radius_m integer not null default 1000,
  add column if not exists city_code text,
  add column if not exists locality_code text;

alter table public.vendor_terminals
  add column if not exists public_terminal_id text,
  add column if not exists is_open_today boolean not null default true,
  add column if not exists operating_hours jsonb not null default '{}'::jsonb,
  add column if not exists delivery_available boolean not null default true,
  add column if not exists pickup_available boolean not null default true,
  add column if not exists estimated_fulfilment_minutes integer;

alter table public.vendor_items
  add column if not exists price_display_mode text not null default 'show_price',
  add column if not exists price_unit_label text,
  add column if not exists stock_status text not null default 'in_stock',
  add column if not exists daily_availability_status text not null default 'available',
  add column if not exists expected_restock_at timestamptz,
  add column if not exists generic_product_name text,
  add column if not exists brand_name text,
  add column if not exists manufacturer text,
  add column if not exists variant_name text,
  add column if not exists pack_size numeric(10,2),
  add column if not exists pack_unit text,
  add column if not exists mrp numeric(10,2),
  add column if not exists mrp_pricing_policy text not null default 'manual',
  add column if not exists mrp_discount_percent numeric(5,2) not null default 0,
  add column if not exists barcode text,
  add column if not exists sku text,
  add column if not exists ean text;

alter table public.vendors enable row level security;
alter table public.vendor_terminals enable row level security;
alter table public.vendor_items enable row level security;

do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(column_name), ', ' order by array_position(array[
    'id',
    'public_vendor_id',
    'shop_name',
    'category',
    'status',
    'kyc_status',
    'onboarding_payment_status',
    'public_verification_badge',
    'delivery_available',
    'pickup_available',
    'delivery_terms',
    'rating',
    'rating_count',
    'estimated_fulfilment_minutes',
    'max_service_radius_m',
    'city_code',
    'locality_code',
    'address'
  ], column_name))
  into v_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'vendors'
    and column_name = any(array[
      'id',
      'public_vendor_id',
      'shop_name',
      'category',
      'status',
      'kyc_status',
      'onboarding_payment_status',
      'public_verification_badge',
      'delivery_available',
      'pickup_available',
      'delivery_terms',
      'rating',
      'rating_count',
      'estimated_fulfilment_minutes',
      'max_service_radius_m',
      'city_code',
      'locality_code',
      'address'
    ]);

  if v_columns is not null then
    execute format('grant select (%s) on public.vendors to anon, authenticated', v_columns);
  end if;

  select string_agg(quote_ident(column_name), ', ' order by array_position(array[
    'id',
    'vendor_id',
    'public_terminal_id',
    'terminal_name',
    'status',
    'is_open_today',
    'operating_hours',
    'delivery_available',
    'pickup_available',
    'estimated_fulfilment_minutes',
    'lat',
    'lng',
    'city',
    'phone'
  ], column_name))
  into v_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'vendor_terminals'
    and column_name = any(array[
      'id',
      'vendor_id',
      'public_terminal_id',
      'terminal_name',
      'status',
      'is_open_today',
      'operating_hours',
      'delivery_available',
      'pickup_available',
      'estimated_fulfilment_minutes',
      'lat',
      'lng',
      'city',
      'phone'
    ]);

  if v_columns is not null then
    execute format('grant select (%s) on public.vendor_terminals to anon, authenticated', v_columns);
  end if;

  select string_agg(quote_ident(column_name), ', ' order by array_position(array[
    'id',
    'vendor_id',
    'terminal_id',
    'item_name',
    'item_pic',
    'price',
    'price_display_mode',
    'price_unit_label',
    'unit',
    'is_available',
    'available_today',
    'stock_status',
    'daily_availability_status',
    'expected_restock_at',
    'generic_product_name',
    'brand_name',
    'manufacturer',
    'variant_name',
    'pack_size',
    'pack_unit',
    'mrp',
    'mrp_pricing_policy',
    'mrp_discount_percent',
    'barcode',
    'sku',
    'ean'
  ], column_name))
  into v_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'vendor_items'
    and column_name = any(array[
      'id',
      'vendor_id',
      'terminal_id',
      'item_name',
      'item_pic',
      'price',
      'price_display_mode',
      'price_unit_label',
      'unit',
      'is_available',
      'available_today',
      'stock_status',
      'daily_availability_status',
      'expected_restock_at',
      'generic_product_name',
      'brand_name',
      'manufacturer',
      'variant_name',
      'pack_size',
      'pack_unit',
      'mrp',
      'mrp_pricing_policy',
      'mrp_discount_percent',
      'barcode',
      'sku',
      'ean'
    ]);

  if v_columns is not null then
    execute format('grant select (%s) on public.vendor_items to anon, authenticated', v_columns);
  end if;
end $$;

drop policy if exists "Public read active verified paid vendors" on public.vendors;
create policy "Public read active verified paid vendors"
  on public.vendors
  for select
  to anon, authenticated
  using (
    status = 'active'
    and kyc_status = 'kyc_verified'
    and onboarding_payment_status = 'payment_completed'
  );

drop policy if exists "Public read active terminals for active vendors" on public.vendor_terminals;
create policy "Public read active terminals for active vendors"
  on public.vendor_terminals
  for select
  to anon, authenticated
  using (
    status = 'active'
    and exists (
      select 1
      from public.vendors v
      where v.id = vendor_terminals.vendor_id
        and v.status = 'active'
        and v.kyc_status = 'kyc_verified'
        and v.onboarding_payment_status = 'payment_completed'
    )
  );

drop policy if exists "Public read available items for active vendors" on public.vendor_items;
create policy "Public read available items for active vendors"
  on public.vendor_items
  for select
  to anon, authenticated
  using (
    is_available = true
    and available_today = true
    and coalesce(stock_status, 'in_stock') <> 'out_of_stock'
    and coalesce(daily_availability_status, 'available') not in ('temporarily_unavailable', 'out_of_stock')
    and exists (
      select 1
      from public.vendors v
      where v.id = vendor_items.vendor_id
        and v.status = 'active'
        and v.kyc_status = 'kyc_verified'
        and v.onboarding_payment_status = 'payment_completed'
    )
  );
