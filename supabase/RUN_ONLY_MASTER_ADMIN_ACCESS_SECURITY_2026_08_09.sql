-- SabSewa Local - Master Admin access security support
-- This SQL does not contain the Master Admin secret code.

alter table if exists public.user_profiles
  add column if not exists role text;

create index if not exists idx_user_profiles_role on public.user_profiles(role);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_role text,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_action_created_at on public.audit_logs(action, created_at desc);
create index if not exists idx_audit_logs_actor_created_at on public.audit_logs(actor_user_id, created_at desc);