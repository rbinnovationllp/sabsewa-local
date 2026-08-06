-- Partner Program applications and revenue-sharing workflow.

create extension if not exists "pgcrypto";

create table if not exists public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_name text not null,
  partner_type text not null check (partner_type in (
    'Individual',
    'Consultant',
    'Organization',
    'NGO',
    'Educational Institution',
    'Other Stakeholder'
  )),
  organization_name text,
  phone text not null,
  email text not null,
  city text not null,
  state text not null,
  coverage_area text not null,
  expected_vendor_reach integer check (expected_vendor_reach is null or expected_vendor_reach >= 0),
  experience_summary text not null,
  referral_source text,
  status text not null default 'pending' check (status in ('pending', 'under_review', 'approved', 'rejected', 'suspended')),
  revenue_share_percent numeric(5,2) not null default 10.00 check (revenue_share_percent = 10.00),
  net_revenue_definition text not null default 'Revenue after GST, statutory taxes, payment gateway charges, refunds, chargebacks, discounts and other legally applicable deductions.',
  terms_version text not null,
  terms_accepted boolean not null default false,
  terms_accepted_at timestamptz,
  acceptance_summary text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_referred_vendors (
  id uuid primary key default gen_random_uuid(),
  partner_application_id uuid not null references public.partner_applications(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  referral_status text not null default 'submitted' check (referral_status in ('submitted', 'verified', 'approved', 'rejected', 'commission_eligible')),
  verified_by uuid,
  verified_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.partner_commission_events (
  id uuid primary key default gen_random_uuid(),
  partner_application_id uuid not null references public.partner_applications(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  gross_revenue numeric(12,2) not null default 0,
  gst_amount numeric(12,2) not null default 0,
  statutory_deductions numeric(12,2) not null default 0,
  payment_gateway_charges numeric(12,2) not null default 0,
  refunds_and_chargebacks numeric(12,2) not null default 0,
  other_legal_deductions numeric(12,2) not null default 0,
  net_revenue numeric(12,2) generated always as (
    greatest(0, gross_revenue - gst_amount - statutory_deductions - payment_gateway_charges - refunds_and_chargebacks - other_legal_deductions)
  ) stored,
  commission_percent numeric(5,2) not null default 10.00 check (commission_percent = 10.00),
  commission_amount numeric(12,2) generated always as (
    round((greatest(0, gross_revenue - gst_amount - statutory_deductions - payment_gateway_charges - refunds_and_chargebacks - other_legal_deductions) * commission_percent / 100.0), 2)
  ) stored,
  status text not null default 'calculated' check (status in ('calculated', 'approved', 'paid', 'withheld', 'cancelled')),
  period_start date,
  period_end date,
  created_at timestamptz not null default now()
);

create index if not exists idx_partner_applications_status_created
  on public.partner_applications(status, created_at desc);
create index if not exists idx_partner_applications_email
  on public.partner_applications(lower(email));
create index if not exists idx_partner_referred_vendors_partner
  on public.partner_referred_vendors(partner_application_id, referral_status);
create index if not exists idx_partner_commission_events_partner
  on public.partner_commission_events(partner_application_id, status, created_at desc);

alter table public.partner_applications enable row level security;
alter table public.partner_referred_vendors enable row level security;
alter table public.partner_commission_events enable row level security;

grant insert on public.partner_applications to anon, authenticated;
grant select, update on public.partner_applications to authenticated;
grant select, insert, update on public.partner_referred_vendors to authenticated;
grant select, insert, update on public.partner_commission_events to authenticated;

drop policy if exists "Anyone can submit partner applications" on public.partner_applications;
create policy "Anyone can submit partner applications"
  on public.partner_applications
  for insert
  to anon, authenticated
  with check (
    terms_accepted = true
    and revenue_share_percent = 10.00
    and applicant_name is not null
    and phone is not null
    and email is not null
  );

drop policy if exists "Company admins manage partner applications" on public.partner_applications;
create policy "Company admins manage partner applications"
  on public.partner_applications
  for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

drop policy if exists "Company admins manage partner referred vendors" on public.partner_referred_vendors;
create policy "Company admins manage partner referred vendors"
  on public.partner_referred_vendors
  for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

drop policy if exists "Company admins manage partner commission events" on public.partner_commission_events;
create policy "Company admins manage partner commission events"
  on public.partner_commission_events
  for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

comment on table public.partner_applications is
  'Public partner applications for individuals, organizations, consultants, NGOs, educational institutions and stakeholders who help expand SabSewa Local across India.';

comment on column public.partner_applications.revenue_share_percent is
  'Fixed 10% share of eligible net revenue, subject to company verification, approval, audit and Partner Program Terms.';

comment on column public.partner_applications.net_revenue_definition is
  'Net revenue excludes GST, statutory taxes, payment gateway charges, refunds, chargebacks, discounts and legally applicable deductions.';
