-- SabSewa Local Vendor KYC Owner + Shop Photograph document type repair
-- Run this in Supabase SQL Editor for the production project.
--
-- This does NOT remove validation. It only adds the new valid KYC
-- document_type value: owner_shop_photo

begin;

-- Show the existing document_type CHECK constraint before replacement.
select
  con.conname as constraint_name,
  pg_get_constraintdef(con.oid) as constraint_definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'vendor_kyc_documents'
  and con.contype = 'c'
  and pg_get_constraintdef(con.oid) ilike '%document_type%';

-- Drop only the current document_type CHECK constraint.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'vendor_kyc_documents'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%document_type%'
  loop
    execute format('alter table public.vendor_kyc_documents drop constraint if exists %I', constraint_name);
  end loop;
end $$;

-- Recreate validation with all existing allowed values plus owner_shop_photo.
alter table public.vendor_kyc_documents
  add constraint vendor_kyc_documents_document_type_check
  check (document_type in (
    'aadhaar',
    'pan_card',
    'passport',
    'voter_id',
    'driving_licence',
    'other_identity_proof',
    'authorisation',
    'shop_establishment',
    'trade_license',
    'gst_certificate',
    'utility_bill',
    'rent_agreement',
    'municipal_document',
    'business_registration_address',
    'other_business_proof',
    'fssai_license',
    'drug_license',
    'liquor_license',
    'restricted_goods_license',
    'other_regulatory_license',
    'shop_photo',
    'owner_shop_photo'
  ));

create index if not exists idx_vendor_kyc_documents_metadata_section
  on public.vendor_kyc_documents(vendor_id, ((metadata->>'document_section')), status);

comment on constraint vendor_kyc_documents_document_type_check on public.vendor_kyc_documents
  is 'Allowed KYC document types. Includes owner_shop_photo for mandatory owner/authorized person photograph with shop view.';

-- Verify the repaired constraint contains owner_shop_photo.
select
  con.conname as constraint_name,
  pg_get_constraintdef(con.oid) as constraint_definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'vendor_kyc_documents'
  and con.conname = 'vendor_kyc_documents_document_type_check';

-- Optional: review possible orphaned files from failed old owner_photo attempts.
-- Review only; do not delete blindly.
select
  name,
  bucket_id,
  created_at,
  updated_at,
  metadata
from storage.objects
where bucket_id = 'vendor-kyc-private'
  and name like 'kyc/%/owner_photo_%'
order by created_at desc
limit 50;

commit;
