-- SabSewa Local Partner Application confirmation workflow.
-- Safe additive runner. Run after RUN_ONLY_PARTNER_PROGRAM_APPLICATIONS.sql and RUN_ONLY_PARTNER_PROGRAM_EXPANSION_2026_08_10.sql.

create extension if not exists "pgcrypto";

create sequence if not exists public.partner_application_id_seq start 1 increment 1;

alter table public.partner_applications
  add column if not exists application_id text,
  add column if not exists submitted_at timestamptz not null default now();

create unique index if not exists uq_partner_applications_application_id
  on public.partner_applications(application_id)
  where application_id is not null;

create index if not exists idx_partner_applications_phone_status
  on public.partner_applications(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), status, created_at desc);

create or replace function public.generate_partner_application_id()
returns trigger
language plpgsql
as $$
begin
  if new.application_id is null then
    new.application_id := 'SSL-P-' || lpad(nextval('public.partner_application_id_seq')::text, 6, '0');
  end if;

  if new.submitted_at is null then
    new.submitted_at := now();
  end if;

  if new.status is null then
    new.status := 'pending';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_generate_partner_application_id on public.partner_applications;
create trigger trg_generate_partner_application_id
before insert or update on public.partner_applications
for each row execute function public.generate_partner_application_id();

update public.partner_applications
set application_id = coalesce(application_id, 'SSL-P-' || lpad(nextval('public.partner_application_id_seq')::text, 6, '0')),
    submitted_at = coalesce(submitted_at, created_at, now()),
    updated_at = now()
where application_id is null or submitted_at is null;

comment on column public.partner_applications.application_id is
  'Public tracking ID shown to partner applicants after successful database submission, e.g. SSL-P-000123.';

comment on column public.partner_applications.submitted_at is
  'Timestamp used for applicant confirmation and Master Admin pending-application review.';