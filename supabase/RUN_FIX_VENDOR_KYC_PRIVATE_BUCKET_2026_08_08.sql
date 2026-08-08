-- KYC uploads must use the same private bucket referenced by vendor_kyc_documents.
-- Run this once in the production Supabase SQL editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vendor-kyc-private',
  'vendor-kyc-private',
  false,
  8388608,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

update public.vendor_kyc_documents
set metadata = coalesce(metadata, '{}'::jsonb)
where metadata is null;