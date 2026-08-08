-- SabSewa Local Vendor KYC flexible document types
-- Run in Supabase SQL editor before testing the updated Vendor KYC page.

begin;

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
    'shop_photo'
  ));

create index if not exists idx_vendor_kyc_documents_metadata_section
  on public.vendor_kyc_documents(vendor_id, ((metadata->>'document_section')), status);

commit;
