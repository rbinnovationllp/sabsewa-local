-- Vendor-contributed shared product catalogue images.
-- SabSewa Local facilitates moderated reuse; uploaders remain responsible for image rights.

alter table public.catalog_items
  add column if not exists shared_image_id uuid,
  add column if not exists image_source text not null default 'company_or_vendor'
    check (image_source in ('company_or_vendor', 'vendor_contributed_shared', 'vendor_private'));

create table if not exists public.shared_product_images (
  id uuid primary key default gen_random_uuid(),
  uploader_vendor_id uuid not null references public.vendors(id) on delete restrict,
  storage_file_id uuid references public.vendor_storage_files(id) on delete set null,
  catalog_item_id uuid references public.catalog_items(id) on delete set null,
  product_name text not null,
  brand text,
  barcode text,
  public_url text not null,
  object_key text not null unique,
  content_type text not null,
  byte_size bigint not null,
  original_byte_size bigint,
  image_width integer,
  image_height integer,
  rights_confirmation text not null,
  rights_confirmed_at timestamptz not null default now(),
  reuse_authorised boolean not null default true,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected', 'removed')),
  moderation_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.vendor_items
  add column if not exists shared_image_id uuid references public.shared_product_images(id) on delete set null;

create index if not exists idx_shared_product_images_status_name
  on public.shared_product_images(moderation_status, product_name);

create index if not exists idx_shared_product_images_vendor_created
  on public.shared_product_images(uploader_vendor_id, created_at desc);

alter table public.shared_product_images enable row level security;

drop policy if exists "Vendors read approved shared product images" on public.shared_product_images;
drop policy if exists "Uploader vendors read own shared image submissions" on public.shared_product_images;
drop policy if exists "Admins read all shared product images" on public.shared_product_images;

create policy "Vendors read approved shared product images"
  on public.shared_product_images for select
  to authenticated
  using (moderation_status = 'approved' and reuse_authorised = true);

create policy "Uploader vendors read own shared image submissions"
  on public.shared_product_images for select
  to authenticated
  using (public.owns_vendor(uploader_vendor_id) or public.is_company_admin());

create policy "Admins read all shared product images"
  on public.shared_product_images for select
  to authenticated
  using (public.is_company_admin());

-- Inserts, moderation, rejection/removal and usage-count updates must go
-- through backend service-role routes or secure admin tooling.
