-- Generic platform webhook audit log for provider callbacks.
-- Stores metadata and payloads from verified providers only.

create table if not exists public.platform_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text not null,
  table_name text,
  external_event_id text,
  processing_status text not null default 'received',
  processing_error text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_platform_webhook_events_provider_received
  on public.platform_webhook_events(provider, received_at desc);

create index if not exists idx_platform_webhook_events_external
  on public.platform_webhook_events(provider, external_event_id)
  where external_event_id is not null;

alter table public.platform_webhook_events enable row level security;

drop policy if exists "Company admins read platform webhook events" on public.platform_webhook_events;

comment on table public.platform_webhook_events is
  'Verified provider webhook audit log for Supabase callbacks and future integrations. RLS is enabled with no public read policy; backend service role writes/reads for operations. Secrets are never stored here.';
