-- SabSewa Local Gemini Flash dynamic translation cache and usage reporting.
-- Run this in the SabSewa Local Supabase project: https://xodmazgfibftorrlbotk.supabase.co

create table if not exists public.gemini_translation_cache (
  id uuid primary key default gen_random_uuid(),
  source_text_hash text not null,
  source_language text not null default 'auto',
  target_language text not null,
  content_type text not null,
  model_name text not null,
  translation_version text not null,
  translated_text text not null,
  is_approved boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_text_hash, source_language, target_language, content_type, model_name, translation_version)
);

create table if not exists public.gemini_translation_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  vendor_id uuid null,
  order_id uuid null,
  source_language text not null default 'auto',
  target_language text not null,
  content_type text not null,
  model_name text not null,
  cache_hit boolean not null default false,
  input_chars integer not null default 0,
  output_chars integer not null default 0,
  estimated_tokens integer not null default 0,
  estimated_cost_inr numeric(12, 6) not null default 0,
  latency_ms integer null,
  source_text_hash text null,
  privacy_redacted boolean not null default true,
  validation_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_gemini_translation_cache_lookup
  on public.gemini_translation_cache (source_text_hash, source_language, target_language, content_type, translation_version);

create index if not exists idx_gemini_translation_usage_created
  on public.gemini_translation_usage (created_at desc);

create index if not exists idx_gemini_translation_usage_vendor
  on public.gemini_translation_usage (vendor_id, created_at desc);

alter table public.gemini_translation_cache enable row level security;
alter table public.gemini_translation_usage enable row level security;

drop policy if exists "Translation cache server managed" on public.gemini_translation_cache;
create policy "Translation cache server managed"
  on public.gemini_translation_cache
  for all
  using (false)
  with check (false);

drop policy if exists "Translation usage server managed" on public.gemini_translation_usage;
create policy "Translation usage server managed"
  on public.gemini_translation_usage
  for all
  using (false)
  with check (false);

comment on table public.gemini_translation_cache is
  'Server-managed cache for privacy-redacted Gemini Flash dynamic translations. Clients must access through backend only.';

comment on table public.gemini_translation_usage is
  'Server-managed Gemini Flash translation usage ledger for cost controls, XPRIZE evidence, and Company CRM reporting.';
