-- Vendor catalogue setup workflow for SabSewa Local.
-- Supports mobile-friendly multi-select catalogue setup, vendor-created products,
-- duplicate review and master-catalogue moderation without mixing vendor prices
-- or stock into master records.

create extension if not exists "pgcrypto";

alter table public.vendor_items
  add column if not exists max_order_quantity numeric(10,2),
  add column if not exists master_catalogue_status text not null default 'vendor_only'
    check (master_catalogue_status in ('master_approved', 'vendor_only', 'pending_review', 'linked_to_existing', 'rejected', 'disabled')),
  add column if not exists master_submission_id uuid,
  add column if not exists vendor_image_reuse_consent boolean not null default false,
  add column if not exists vendor_image_reuse_consented_at timestamptz,
  add column if not exists source_type text not null default 'vendor_catalogue'
    check (source_type in ('master_catalogue', 'vendor_catalogue', 'vendor_submission', 'gemini_inventory_capture')),
  add column if not exists inactive_at timestamptz,
  add column if not exists inactive_reason text;

create table if not exists public.vendor_product_submissions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  terminal_id uuid references public.vendor_terminals(id) on delete set null,
  vendor_item_id uuid references public.vendor_items(id) on delete restrict,
  submitted_by_user_id uuid,
  product_name text not null,
  local_name text,
  category text not null,
  brand_name text,
  manufacturer text,
  variant_name text,
  pack_size text,
  pack_unit text,
  barcode text,
  sku text,
  ean text,
  description text,
  price numeric(10,2),
  price_display_mode text not null default 'hide_price'
    check (price_display_mode in ('show_price', 'hide_price', 'market_price')),
  availability_status text not null default 'available'
    check (availability_status in ('available', 'limited_stock', 'temporarily_unavailable', 'out_of_stock', 'available_on_request')),
  image_url text,
  s3_object_key text,
  thumbnail_object_key text,
  vendor_image_reuse_consent boolean not null default false,
  consent_terms_version text,
  consented_at timestamptz,
  original_filename text,
  content_checksum text,
  perceptual_hash text,
  duplicate_candidates jsonb not null default '[]'::jsonb,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'correction_requested', 'linked_to_existing', 'promoted_to_master', 'disabled')),
  linked_master_product_id uuid references public.master_product_catalog(id) on delete set null,
  linked_master_image_id uuid references public.master_product_images(id) on delete set null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  rejection_reason text,
  correction_requested_reason text,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.vendor_product_submission_audit (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.vendor_product_submissions(id) on delete restrict,
  action text not null,
  actor_user_id uuid,
  actor_role text,
  reason text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vendor_product_submissions_vendor_status
  on public.vendor_product_submissions(vendor_id, status, created_at desc);

create index if not exists idx_vendor_product_submissions_search
  on public.vendor_product_submissions(
    lower(product_name),
    lower(coalesce(brand_name, '')),
    lower(coalesce(variant_name, '')),
    lower(coalesce(pack_size, '')),
    lower(coalesce(barcode, ''))
  );

create index if not exists idx_vendor_items_master_catalogue_status
  on public.vendor_items(vendor_id, terminal_id, master_catalogue_status, listing_review_status);

alter table public.vendor_product_submissions enable row level security;
alter table public.vendor_product_submission_audit enable row level security;

drop policy if exists "Vendors read own product submissions" on public.vendor_product_submissions;
create policy "Vendors read own product submissions"
  on public.vendor_product_submissions for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors v
      where v.id = vendor_product_submissions.vendor_id
        and v.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.role in ('admin', 'terminal_admin')
    )
  );

drop policy if exists "Vendors insert own product submissions" on public.vendor_product_submissions;
create policy "Vendors insert own product submissions"
  on public.vendor_product_submissions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.vendors v
      where v.id = vendor_product_submissions.vendor_id
        and v.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Company staff update product submissions" on public.vendor_product_submissions;
create policy "Company staff update product submissions"
  on public.vendor_product_submissions for update
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.role in ('admin', 'terminal_admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.role in ('admin', 'terminal_admin')
    )
  );

drop policy if exists "Vendors and company staff read submission audit" on public.vendor_product_submission_audit;
create policy "Vendors and company staff read submission audit"
  on public.vendor_product_submission_audit for select
  to authenticated
  using (
    exists (
      select 1
      from public.vendor_product_submissions s
      join public.vendors v on v.id = s.vendor_id
      where s.id = vendor_product_submission_audit.submission_id
        and v.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid()
        and up.role in ('admin', 'terminal_admin')
    )
  );

-- Financial, catalogue and moderation changes should be inserted through backend
-- service-role routes with request validation. Clients must not receive service-role keys.
