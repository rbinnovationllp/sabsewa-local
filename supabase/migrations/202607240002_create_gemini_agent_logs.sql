create table if not exists public.gemini_agent_logs (
  id uuid primary key default gen_random_uuid(),
  agent_type text not null check (agent_type in (
    'inventory_capture',
    'conversational_order',
    'smart_rejection'
  )),
  input_type text not null check (input_type in ('image', 'text', 'voice')),
  input_summary text not null,
  model text not null,
  response_json jsonb not null,
  confidence numeric,
  user_id uuid,
  vendor_id uuid references public.vendors(id) on delete set null,
  order_id uuid references public.hyperlocal_orders(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_gemini_agent_logs_type_created
  on public.gemini_agent_logs(agent_type, created_at desc);

create index if not exists idx_gemini_agent_logs_vendor_created
  on public.gemini_agent_logs(vendor_id, created_at desc);

create index if not exists idx_gemini_agent_logs_order_created
  on public.gemini_agent_logs(order_id, created_at desc);

alter table public.gemini_agent_logs enable row level security;

create policy "Vendor owners can read own Gemini logs"
  on public.gemini_agent_logs for select
  to authenticated
  using (
    vendor_id is not null
    and exists (
      select 1 from public.vendors
      where vendors.id = gemini_agent_logs.vendor_id
      and vendors.owner_user_id = auth.uid()
    )
  );

-- Writes must go through the backend service role so Gemini keys and audit integrity stay server-side.
