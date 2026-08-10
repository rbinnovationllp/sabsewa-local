-- SabSewa Local - Master Admin KYC monitoring, admin profiles, audit identity, and vendor notification support.
-- Safe/idempotent runner for Supabase SQL Editor.

create extension if not exists pgcrypto;

alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (
    role = any (
      array[
        'customer',
        'vendor',
        'rider',
        'terminal_admin',
        'admin',
        'company_admin',
        'super_admin',
        'master_admin',
        'national_admin',
        'state_admin',
        'district_admin',
        'city_admin',
        'kyc_reviewer',
        'support_admin',
        'finance_admin'
      ]::text[]
    )
  );

create table if not exists public.admin_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  admin_id text unique not null,
  admin_name text not null,
  phone text not null,
  email text,
  role text not null,
  permissions jsonb not null default '{}'::jsonb,
  jurisdiction jsonb not null default '{}'::jsonb,
  account_status text not null default 'active',
  created_by uuid references auth.users(id),
  authorized_by uuid references auth.users(id),
  last_login_at timestamptz,
  revoked_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_profiles_status_check check (account_status in ('active', 'suspended', 'revoked')),
  constraint admin_profiles_role_check check (
    role in (
      'master_admin',
      'national_admin',
      'state_admin',
      'district_admin',
      'city_admin',
      'kyc_reviewer',
      'support_admin',
      'finance_admin',
      'admin',
      'company_admin',
      'super_admin'
    )
  )
);

create sequence if not exists public.admin_id_sequence start 1;

create or replace function public.next_admin_id()
returns text
language plpgsql
as $$
declare
  next_value bigint;
begin
  next_value := nextval('public.admin_id_sequence');
  return 'ADM-' || to_char(now(), 'YYYY') || '-' || lpad(next_value::text, 6, '0');
end;
$$;

alter table public.admin_profiles
  alter column admin_id set default public.next_admin_id();

create table if not exists public.admin_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  permissions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role)
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_admin_id text,
  actor_admin_name text,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_access_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  success boolean not null default false,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.vendors
  add column if not exists kyc_submitted_at timestamptz,
  add column if not exists kyc_review_deadline_at timestamptz,
  add column if not exists kyc_provisional_clearance_at timestamptz,
  add column if not exists kyc_final_decision_at timestamptz,
  add column if not exists kyc_last_reviewed_by uuid references auth.users(id),
  add column if not exists kyc_last_reviewed_by_admin_id text,
  add column if not exists kyc_last_reviewed_by_admin_name text,
  add column if not exists updated_at timestamptz default now();

create table if not exists public.vendor_notifications (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  order_id uuid,
  notification_type text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  delivery_channel text not null default 'in_app',
  delivery_status text not null default 'queued',
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_vendor_notifications_vendor_unread
  on public.vendor_notifications(vendor_id, read_at, created_at desc);

create index if not exists idx_vendors_kyc_review_queue
  on public.vendors(kyc_status, kyc_submitted_at, kyc_review_deadline_at);

-- Ensure the current Master Admin auth user has a proper admin profile if already promoted.
insert into public.admin_profiles (user_id, admin_name, phone, email, role, permissions, account_status, created_by, authorized_by)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', 'Master Admin'),
  coalesce(nullif(u.phone, ''), nullif(u.raw_user_meta_data->>'phone', ''), 'pending'),
  u.email,
  'master_admin',
  '{"all": true}'::jsonb,
  'active',
  u.id,
  u.id
from auth.users u
where (u.raw_user_meta_data->>'role') = 'master_admin'
on conflict (user_id) do update
set role = 'master_admin',
    permissions = '{"all": true}'::jsonb,
    account_status = 'active',
    updated_at = now();

insert into public.admin_role_assignments (user_id, role, permissions, is_active, assigned_by)
select user_id, role, permissions, true, coalesce(authorized_by, user_id)
from public.admin_profiles
where role = 'master_admin'
on conflict (user_id, role) do update
set permissions = excluded.permissions,
    is_active = true,
    revoked_at = null,
    updated_at = now();