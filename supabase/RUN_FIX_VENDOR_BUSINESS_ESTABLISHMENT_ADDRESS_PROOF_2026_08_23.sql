-- SabSewa Local - Vendor Business Establishment Address Proof KYC document type support
-- Safe to run more than once. This preserves the KYC document type CHECK constraint
-- and adds the new establishment/occupancy proof document types required for vendor
-- and additional-branch KYC review.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.vendor_kyc_documents'::regclass
      and conname = 'vendor_kyc_documents_document_type_check'
  ) then
    alter table public.vendor_kyc_documents
      drop constraint vendor_kyc_documents_document_type_check;
  end if;
end $$;

alter table public.vendor_kyc_documents
  add constraint vendor_kyc_documents_document_type_check
  check (
    document_type in (
      -- Identity proof
      'aadhaar',
      'pan_card',
      'passport',
      'voter_id',
      'driving_licence',
      'other_identity_proof',

      -- Existing shop/business address proof
      'shop_establishment',
      'rent_agreement',
      'utility_bill',
      'municipal_document',
      'business_registration_address',
      'gst_certificate',
      'other_business_proof',

      -- Mandatory business-establishment/occupancy address proof
      'establishment_rent_agreement',
      'registered_lease_deed',
      'leave_license_agreement',
      'establishment_shop_registration',
      'establishment_recent_utility_bill',
      'owner_consent_noc',
      'property_tax_receipt',
      'municipal_ownership_record',
      'registered_sale_deed',
      'family_ownership_consent',
      'relationship_authority_proof',
      'shared_premises_license',
      'other_occupancy_proof',

      -- Owner/shop photograph
      'owner_shop_photo',

      -- Regulated business licence
      'drug_license',
      'fssai_license',
      'liquor_license',
      'restricted_goods_license',
      'other_regulatory_license',

      -- Legacy values retained for existing records
      'authorisation',
      'trade_license',
      'shop_photo'
    )
  );

create index if not exists idx_vendor_kyc_documents_establishment_address
  on public.vendor_kyc_documents(vendor_id, created_at desc)
  where metadata->>'document_section' = 'business_establishment_address_proof';

comment on constraint vendor_kyc_documents_document_type_check on public.vendor_kyc_documents
  is 'Restricts vendor KYC document_type to approved categories, including mandatory business-establishment/occupancy address proof values added on 2026-08-23.';

select
  con.conname as constraint_name,
  pg_get_constraintdef(con.oid) as constraint_definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'vendor_kyc_documents'
  and con.conname = 'vendor_kyc_documents_document_type_check';
