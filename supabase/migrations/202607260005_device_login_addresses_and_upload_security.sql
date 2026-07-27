-- Device recognition, customer addresses, auth security events, and upload metadata hardening.

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  label text not null default 'Home',
  full_address text not null,
  city text,
  lat double precision,
  lng double precision,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_fingerprint text not null,
  device_name text,
  platform text,
  app_version text,
  trusted boolean not null default true,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, device_fingerprint)
);

create table if not exists public.auth_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  event_type text not null check (event_type in (
    'login_otp_sent',
    'login_success',
    'login_failed',
    'device_registered',
    'device_revoked',
    'password_reset_requested',
    'password_reset_completed',
    'sensitive_reauth_required',
    'sensitive_reauth_success'
  )),
  device_fingerprint text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.auth_recovery_attempts (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  channel text not null check (channel in ('phone_otp', 'email_link', 'email_otp')),
  status text not null default 'requested' check (status in ('requested', 'verified', 'failed', 'blocked')),
  attempt_count integer not null default 1,
  blocked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vendor_storage_files
  add column if not exists original_byte_size bigint,
  add column if not exists image_width integer,
  add column if not exists image_height integer,
  add column if not exists optimized boolean not null default false,
  add column if not exists metadata_scan_status text not null default 'pending'
    check (metadata_scan_status in ('pending', 'passed', 'failed')),
  add column if not exists replaced_by_file_id uuid references public.vendor_storage_files(id) on delete set null;

create index if not exists idx_customer_addresses_customer
  on public.customer_addresses(customer_id, is_primary desc, created_at desc);

create index if not exists idx_user_device_sessions_user_seen
  on public.user_device_sessions(user_id, last_seen_at desc);

create index if not exists idx_auth_security_events_user_created
  on public.auth_security_events(user_id, created_at desc);

alter table public.customer_addresses enable row level security;
alter table public.user_device_sessions enable row level security;
alter table public.auth_security_events enable row level security;
alter table public.auth_recovery_attempts enable row level security;

drop policy if exists "Customers manage own addresses" on public.customer_addresses;
drop policy if exists "Users read own devices" on public.user_device_sessions;
drop policy if exists "Users revoke own devices" on public.user_device_sessions;
drop policy if exists "Users read own auth security events" on public.auth_security_events;
drop policy if exists "Admins read auth recovery attempts" on public.auth_recovery_attempts;

create policy "Customers manage own addresses"
  on public.customer_addresses for all
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin())
  with check (customer_id = auth.uid() or public.is_company_admin());

create policy "Users read own devices"
  on public.user_device_sessions for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

create policy "Users revoke own devices"
  on public.user_device_sessions for update
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin())
  with check (user_id = auth.uid() or public.is_company_admin());

create policy "Users read own auth security events"
  on public.auth_security_events for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

create policy "Admins read auth recovery attempts"
  on public.auth_recovery_attempts for select
  to authenticated
  using (public.is_company_admin());

-- Inserts for device registration, security events and recovery attempts should
-- go through protected backend service-role routes so rate limits and notices
-- cannot be bypassed by mobile or web clients.
