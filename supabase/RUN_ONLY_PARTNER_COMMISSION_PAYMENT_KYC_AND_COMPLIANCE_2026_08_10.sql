-- SabSewa Local - Partner Commission Payment Details, Partner KYC and Compliance Workflow
-- Safe to run multiple times. Keeps Partner KYC separate from Vendor KYC.

create extension if not exists pgcrypto;

alter table public.partner_applications
  add column if not exists kyc_status text not null default 'not_submitted',
  add column if not exists kyc_submitted_at timestamptz,
  add column if not exists kyc_reviewed_by uuid,
  add column if not exists kyc_reviewed_at timestamptz,
  add column if not exists kyc_review_notes text,
  add column if not exists payment_details_status text not null default 'pending_verification',
  add column if not exists payment_details_reviewed_by uuid,
  add column if not exists payment_details_reviewed_at timestamptz,
  add column if not exists payment_details_review_notes text,
  add column if not exists pan_number_masked text,
  add column if not exists pan_name text,
  add column if not exists tax_profile_type text,
  add column if not exists gstin_masked text,
  add column if not exists compliance_status text not null default 'clear',
  add column if not exists suspension_reason text,
  add column if not exists suspended_by uuid,
  add column if not exists suspended_at timestamptz,
  add column if not exists terminated_by uuid,
  add column if not exists terminated_at timestamptz;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.partner_applications'::regclass
      and conname in (
        'partner_applications_kyc_status_check',
        'partner_applications_payment_details_status_check',
        'partner_applications_tax_profile_type_check',
        'partner_applications_compliance_status_check'
      )
  loop
    execute format('alter table public.partner_applications drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.partner_applications
  add constraint partner_applications_kyc_status_check
    check (kyc_status in ('not_submitted','documents_submitted','under_review','additional_information_required','verified','rejected')),
  add constraint partner_applications_payment_details_status_check
    check (payment_details_status in ('pending_verification','verified','rejected_correction_required','reverification_required')),
  add constraint partner_applications_tax_profile_type_check
    check (tax_profile_type is null or tax_profile_type in ('individual','proprietorship','partnership','llp','company','other')),
  add constraint partner_applications_compliance_status_check
    check (compliance_status in ('clear','warning','corrective_action_required','suspended_investigation_pending','temporary_suspension','terminated'));

create table if not exists public.partner_payment_details (
  id uuid primary key default gen_random_uuid(),
  partner_application_id uuid not null references public.partner_applications(id) on delete cascade,
  payment_method text not null check (payment_method in ('bank_account','upi')),
  account_holder_name text,
  bank_name text,
  account_number_ciphertext text,
  account_number_last4 text,
  ifsc_code text,
  account_type text check (account_type is null or account_type in ('savings','current')),
  branch_name text,
  upi_id_ciphertext text,
  upi_id_masked text,
  upi_name text,
  status text not null default 'pending_verification'
    check (status in ('pending_verification','verified','rejected_correction_required','reverification_required')),
  is_current boolean not null default true,
  verification_notes text,
  verified_by uuid,
  verified_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_partner_payment_details_current
  on public.partner_payment_details(partner_application_id)
  where is_current = true;

create table if not exists public.partner_kyc_documents (
  id uuid primary key default gen_random_uuid(),
  partner_application_id uuid not null references public.partner_applications(id) on delete cascade,
  document_section text not null check (document_section in ('identity_proof','address_proof','partner_photo','organization_document')),
  document_type text not null,
  document_label text,
  storage_bucket text not null default 'partner-kyc-private',
  storage_path text not null,
  file_name text,
  mime_type text,
  file_size_bytes integer,
  status text not null default 'uploaded'
    check (status in ('uploaded','under_review','verified','rejected','additional_information_required','deleted')),
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_partner_kyc_documents_application_section
  on public.partner_kyc_documents(partner_application_id, document_section, status, created_at desc);

create table if not exists public.partner_monthly_commission_statements (
  id uuid primary key default gen_random_uuid(),
  partner_application_id uuid not null references public.partner_applications(id) on delete cascade,
  period_month date not null,
  eligible_vendor_count integer not null default 0,
  eligible_revenue numeric(12,2) not null default 0,
  commission_rate numeric(5,2) not null default 10,
  gross_commission numeric(12,2) not null default 0,
  adjustments numeric(12,2) not null default 0,
  deductions numeric(12,2) not null default 0,
  tds_tax numeric(12,2) not null default 0,
  net_payable numeric(12,2) not null default 0,
  payment_status text not null default 'pending'
    check (payment_status in ('pending','approved_for_payment','processing','paid','failed','held')),
  payment_date timestamptz,
  reference_number text,
  approved_by uuid,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(partner_application_id, period_month)
);

create table if not exists public.partner_compliance_cases (
  id uuid primary key default gen_random_uuid(),
  partner_application_id uuid not null references public.partner_applications(id) on delete cascade,
  case_status text not null default 'open'
    check (case_status in ('open','partner_response_requested','under_investigation','resolved_reinstated','resolved_warning','corrective_action_required','temporary_suspension','terminated')),
  allegation_reason text not null,
  evidence_summary text,
  partner_explanation text,
  investigation_notes text,
  final_decision text,
  opened_by uuid,
  opened_at timestamptz not null default now(),
  closed_by uuid,
  closed_at timestamptz
);

create table if not exists public.partner_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_admin_id text,
  actor_admin_name text,
  partner_application_id uuid references public.partner_applications(id) on delete set null,
  action text not null,
  previous_status text,
  new_status text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.partner_payment_details enable row level security;
alter table public.partner_kyc_documents enable row level security;
alter table public.partner_monthly_commission_statements enable row level security;
alter table public.partner_compliance_cases enable row level security;
alter table public.partner_admin_audit_logs enable row level security;

grant select, insert, update, delete on public.partner_payment_details to service_role;
grant select, insert, update, delete on public.partner_kyc_documents to service_role;
grant select, insert, update, delete on public.partner_monthly_commission_statements to service_role;
grant select, insert, update, delete on public.partner_compliance_cases to service_role;
grant select, insert on public.partner_admin_audit_logs to service_role;

drop policy if exists "Company admins manage partner payment details" on public.partner_payment_details;
create policy "Company admins manage partner payment details"
  on public.partner_payment_details
  for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

drop policy if exists "Company admins manage partner kyc documents" on public.partner_kyc_documents;
create policy "Company admins manage partner kyc documents"
  on public.partner_kyc_documents
  for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

drop policy if exists "Company admins manage partner statements" on public.partner_monthly_commission_statements;
create policy "Company admins manage partner statements"
  on public.partner_monthly_commission_statements
  for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

drop policy if exists "Company admins manage partner compliance cases" on public.partner_compliance_cases;
create policy "Company admins manage partner compliance cases"
  on public.partner_compliance_cases
  for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

drop policy if exists "Company admins read partner audit logs" on public.partner_admin_audit_logs;
create policy "Company admins read partner audit logs"
  on public.partner_admin_audit_logs
  for select
  to authenticated
  using (public.is_company_admin());

comment on table public.partner_payment_details is
  'Encrypted Partner commission payout destination. Frontend/API responses must expose masked values only.';
comment on table public.partner_kyc_documents is
  'Private Partner KYC document metadata, separate from Vendor KYC records.';
comment on table public.partner_monthly_commission_statements is
  'Monthly Partner commission accounting ledger; does not automatically transfer money.';
comment on table public.partner_compliance_cases is
  'Partner suspension, investigation, warning, reinstatement and termination case records.';

-- Create private Partner KYC bucket metadata when Storage schema is available.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'partner-kyc-private',
  'partner-kyc-private',
  false,
  8388608,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp']::text[];

-- Existing applications start as pending verification until Partner KYC/payment details are added.
update public.partner_applications
set kyc_status = coalesce(nullif(kyc_status, ''), 'not_submitted'),
    payment_details_status = coalesce(nullif(payment_details_status, ''), 'pending_verification')
where true;