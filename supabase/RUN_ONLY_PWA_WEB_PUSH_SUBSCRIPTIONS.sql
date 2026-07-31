-- Run this file in the SabSewa Local Supabase SQL Editor.
-- It creates the consent-based PWA web push subscription registry.

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  user_agent text,
  consent_status text not null default 'granted' check (consent_status in ('granted', 'revoked')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists idx_web_push_subscriptions_user
  on public.web_push_subscriptions(user_id, consent_status);

alter table public.web_push_subscriptions enable row level security;

drop policy if exists "Users read own web push subscriptions" on public.web_push_subscriptions;
create policy "Users read own web push subscriptions"
  on public.web_push_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Company admins read web push subscriptions" on public.web_push_subscriptions;
create policy "Company admins read web push subscriptions"
  on public.web_push_subscriptions
  for select
  to authenticated
  using (public.is_company_admin());

comment on table public.web_push_subscriptions is
  'Consent-based PWA push subscription registry. Browser subscriptions only; no OTPs, passwords, payment data, private addresses or auth tokens.';
