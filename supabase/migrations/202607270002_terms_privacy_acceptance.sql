-- Versioned Terms/Privacy acceptance evidence for SabSewa Local registration.
-- Registration must not complete unless the user actively accepts the current
-- Terms of Use and acknowledges the Privacy Notice.

alter table public.user_profiles
  add column if not exists preferred_language text default 'en',
  add column if not exists terms_version text,
  add column if not exists privacy_version text,
  add column if not exists policy_bundle_version text,
  add column if not exists accepted_document_versions jsonb not null default '{}'::jsonb,
  add column if not exists policies_accepted_at timestamptz,
  add column if not exists policies_accepted_language text,
  add column if not exists policy_acceptance_required boolean not null default true;

create table if not exists public.user_policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role text not null check (role in ('customer', 'vendor', 'rider', 'terminal_admin', 'admin')),
  terms_version text not null,
  privacy_version text not null,
  policy_bundle_version text not null,
  accepted_document_versions jsonb not null default '{}'::jsonb,
  accepted_statement text not null,
  accepted_at timestamptz not null default now(),
  displayed_language text not null default 'en',
  device_id text,
  device_name text,
  platform text,
  app_version text,
  session_id text,
  otp_verified boolean not null default true,
  marketing_consent boolean not null default false,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_policy_acceptances_user
  on public.user_policy_acceptances(user_id, accepted_at desc);

create index if not exists idx_user_policy_acceptances_versions
  on public.user_policy_acceptances(terms_version, privacy_version, accepted_at desc);

alter table public.user_policy_acceptances enable row level security;

drop policy if exists "Users read own policy acceptances" on public.user_policy_acceptances;
drop policy if exists "Users insert own policy acceptances" on public.user_policy_acceptances;
drop policy if exists "Admins read all policy acceptances" on public.user_policy_acceptances;

create policy "Users read own policy acceptances"
  on public.user_policy_acceptances for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

create policy "Users insert own policy acceptances"
  on public.user_policy_acceptances for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Admins read all policy acceptances"
  on public.user_policy_acceptances for select
  to authenticated
  using (public.is_company_admin());

-- If terms materially change, compare the latest accepted versions with the
-- current application constants and require fresh acceptance in the app.
