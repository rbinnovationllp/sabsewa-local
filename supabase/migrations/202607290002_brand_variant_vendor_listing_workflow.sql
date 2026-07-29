-- Brand, variant and missing-item workflow for SabSewa Local.
-- Generic master products remain separate from brand/pack-size purchasable variants.

create extension if not exists "pgcrypto";

create table if not exists public.product_brands (
  id uuid primary key default gen_random_uuid(),
  master_product_id uuid not null references public.master_product_catalog(id) on delete restrict,
  brand_name text not null,
  manufacturer text,
  source_status text not null default 'approved'
    check (source_status in ('approved', 'pending_review', 'rejected', 'disabled')),
  submitted_by_vendor_id uuid references public.vendors(id) on delete set null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_product_brands_business_key
  on public.product_brands (
    master_product_id,
    lower(brand_name),
    coalesce(lower(manufacturer), '')
  );

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  master_product_id uuid not null references public.master_product_catalog(id) on delete restrict,
  product_brand_id uuid references public.product_brands(id) on delete restrict,
  variant_name text,
  pack_size numeric(10,2),
  pack_unit text,
  barcode text,
  sku text,
  ean text,
  mrp numeric(10,2),
  source_status text not null default 'approved'
    check (source_status in ('approved', 'pending_review', 'rejected', 'disabled')),
  submitted_by_vendor_id uuid references public.vendors(id) on delete set null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pack_size is null or pack_size > 0)
);

create unique index if not exists uniq_product_variants_business_key
  on public.product_variants (
    master_product_id,
    coalesce(product_brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(lower(variant_name), ''),
    coalesce(pack_size, 0),
    coalesce(lower(pack_unit), ''),
    coalesce(lower(barcode), ''),
    coalesce(lower(sku), ''),
    coalesce(lower(ean), '')
  );

alter table public.vendor_items
  add column if not exists product_brand_id uuid references public.product_brands(id) on delete set null,
  add column if not exists product_variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists generic_product_name text,
  add column if not exists brand_name text,
  add column if not exists manufacturer text,
  add column if not exists variant_name text,
  add column if not exists pack_size numeric(10,2),
  add column if not exists pack_unit text,
  add column if not exists mrp numeric(10,2),
  add column if not exists barcode text,
  add column if not exists sku text,
  add column if not exists ean text,
  add column if not exists expiry_date date,
  add column if not exists best_before_date date,
  add column if not exists substitution_policy text not null default 'customer_approval_required'
    check (substitution_policy in ('no_substitution', 'customer_approval_required', 'allow_same_brand_different_pack', 'allow_any_brand_with_customer_approval')),
  add column if not exists listing_review_status text not null default 'approved'
    check (listing_review_status in ('approved', 'pending_review', 'rejected', 'disabled')),
  add column if not exists listing_review_reason text;

create table if not exists public.customer_item_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  terminal_id uuid references public.vendor_terminals(id) on delete set null,
  item_name text not null,
  preferred_brand text,
  required_variant text,
  pack_size text,
  quantity text,
  optional_photo_key text,
  barcode text,
  voice_description text,
  allow_other_brand boolean not null default false,
  customer_notes text,
  status text not null default 'pending_vendor_response'
    check (status in ('pending_vendor_response', 'available_as_requested', 'alternative_available', 'partially_available', 'not_available', 'customer_approved_alternative', 'closed')),
  vendor_response jsonb not null default '{}'::jsonb,
  customer_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendor_items_variant_lookup
  on public.vendor_items(vendor_id, terminal_id, master_product_id, product_brand_id, product_variant_id, available_today, stock_status);

create index if not exists idx_vendor_items_brand_search
  on public.vendor_items(vendor_id, terminal_id, lower(coalesce(generic_product_name, item_name)), lower(coalesce(brand_name, '')), lower(coalesce(variant_name, '')));

create index if not exists idx_customer_item_requests_vendor_status
  on public.customer_item_requests(vendor_id, status, created_at desc);

alter table public.product_brands enable row level security;
alter table public.product_variants enable row level security;
alter table public.customer_item_requests enable row level security;

drop policy if exists "Users read approved product brands" on public.product_brands;
create policy "Users read approved product brands"
  on public.product_brands for select
  to authenticated
  using (source_status = 'approved' or public.is_company_admin() or public.owns_vendor(submitted_by_vendor_id));

drop policy if exists "Users read approved product variants" on public.product_variants;
create policy "Users read approved product variants"
  on public.product_variants for select
  to authenticated
  using (source_status = 'approved' or public.is_company_admin() or public.owns_vendor(submitted_by_vendor_id));

drop policy if exists "Customers read own item requests" on public.customer_item_requests;
create policy "Customers read own item requests"
  on public.customer_item_requests for select
  to authenticated
  using (customer_id = auth.uid() or public.owns_vendor(vendor_id) or public.is_company_admin());

-- Writes and vendor responses should use protected backend routes so
-- selected vendor/terminal/listing references are revalidated.
