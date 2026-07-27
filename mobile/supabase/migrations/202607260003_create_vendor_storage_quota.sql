-- Vendor storage quota and upload-cost controls.
-- Store media metadata only. Orders, invoices, credit records and wallet entries remain database records.

create table if not exists public.vendor_storage_usage (
  vendor_id uuid primary key references public.vendors(id) on delete cascade,
  quota_bytes bigint not null default 104857600,
  used_bytes bigint not null default 0,
  successful_order_count integer not null default 0,
  warning_level text not null default 'none'
    check (warning_level in ('none', '80_percent', '90_percent', '100_percent')),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_storage_files (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  object_key text not null unique,
  public_url text,
  original_file_name text,
  content_type text not null,
  byte_size bigint not null,
  purpose text not null default 'product_image'
    check (purpose in ('product_image', 'product_thumbnail', 'kyc_document', 'business_document')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'archived', 'abandoned', 'deleted')),
  duplicate_key text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_vendor_storage_files_vendor_status
  on public.vendor_storage_files(vendor_id, status, created_at desc);

create index if not exists idx_vendor_storage_files_duplicate
  on public.vendor_storage_files(vendor_id, duplicate_key)
  where duplicate_key is not null and status in ('pending', 'active');

alter table public.vendor_storage_usage enable row level security;
alter table public.vendor_storage_files enable row level security;

create policy "Vendor owners can read own storage usage"
  on public.vendor_storage_usage for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_storage_usage.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

create policy "Vendor owners can read own storage files"
  on public.vendor_storage_files for select
  to authenticated
  using (
    exists (
      select 1 from public.vendors
      where vendors.id = vendor_storage_files.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

-- Writes must go through backend service role routes.
