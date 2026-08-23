-- SabSewa Local - Vendor profile editing, change-request audit and trusted-device security
-- Safe to run more than once. Does not delete existing vendor/customer/KYC data.

alter table if exists public.vendors
  add column if not exists shop_description text,
  add column if not exists business_hours text,
  add column if not exists delivery_radius_meters integer,
  add column if not exists price_display_preference text,
  add column if not exists shop_support_contact_preference text,
  add column if not exists preferred_language text,
  add column if not exists notification_settings jsonb not null default '{}'::jsonb;

create table if not exists public.vendor_profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  entity_id uuid,
  branch_id uuid,
  actor_user_id uuid not null,
  change_category text not null check (
    change_category in (
      'sensitive_contact',
      'legal_identity',
      'business_address',
      'bank_details',
      'kyc_documents',
      'account_recovery'
    )
  ),
  field_changes jsonb not null default '{}'::jsonb,
  supporting_document_ids jsonb not null default '[]'::jsonb,
  verification_status text not null default 'manual_review_required',
  review_status text not null default 'pending' check (
    review_status in ('pending', 'approved', 'rejected', 'more_information_required', 'cancelled')
  ),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid,
  reviewer_reason text,
  effective_at timestamptz,
  device_or_session_reference text,
  notification_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_profile_change_audit (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  entity_id uuid,
  branch_id uuid,
  actor_user_id uuid,
  field_changed text,
  previous_value_masked text,
  proposed_value_masked text,
  final_value_masked text,
  change_category text not null,
  field_changes jsonb not null default '{}'::jsonb,
  verification_status text,
  review_status text,
  reviewer_id uuid,
  reviewer_reason text,
  device_or_session_reference text,
  authentication_method text,
  notification_status jsonb not null default '{}'::jsonb,
  request_timestamp timestamptz not null default now(),
  effective_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_vendor_profile_change_requests_vendor_status
  on public.vendor_profile_change_requests(vendor_id, review_status, submitted_at desc);

create index if not exists idx_vendor_profile_change_requests_status
  on public.vendor_profile_change_requests(review_status, submitted_at desc);

create index if not exists idx_vendor_profile_change_audit_vendor_time
  on public.vendor_profile_change_audit(vendor_id, created_at desc);

alter table public.vendor_profile_change_requests enable row level security;
alter table public.vendor_profile_change_audit enable row level security;

drop policy if exists "Vendors read own profile change requests" on public.vendor_profile_change_requests;
create policy "Vendors read own profile change requests"
  on public.vendor_profile_change_requests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.vendors v
      where v.id = vendor_profile_change_requests.vendor_id
        and v.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Vendors create own profile change requests" on public.vendor_profile_change_requests;
create policy "Vendors create own profile change requests"
  on public.vendor_profile_change_requests
  for insert
  to authenticated
  with check (
    actor_user_id = auth.uid()
    and exists (
      select 1
      from public.vendors v
      where v.id = vendor_profile_change_requests.vendor_id
        and v.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Vendors read own profile change audit" on public.vendor_profile_change_audit;
create policy "Vendors read own profile change audit"
  on public.vendor_profile_change_audit
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.vendors v
      where v.id = vendor_profile_change_audit.vendor_id
        and v.owner_user_id = auth.uid()
    )
  );

comment on table public.vendor_profile_change_requests is
  'Vendor-submitted sensitive/legal/bank/KYC/contact profile change requests. Approved values must not silently overwrite previous KYC/financial records without review.';

comment on table public.vendor_profile_change_audit is
  'Immutable-style audit log for ordinary vendor profile changes, trusted-device security actions and admin profile-change decisions.';

comment on column public.vendors.notification_settings is
  'Vendor operational notification preference metadata. Do not store OTPs, passwords or secret tokens here.';
