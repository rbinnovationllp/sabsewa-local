-- SabSewa Local order privacy and audit log.
-- Vendors see limited summaries until formal acceptance unlocks full customer/order details.

alter table public.hyperlocal_orders
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by_vendor_id uuid,
  add column if not exists vendor_detail_unlocked_at timestamptz;

create table if not exists public.order_audit_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.hyperlocal_orders(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  actor_user_id uuid,
  actor_role text not null default 'vendor',
  action text not null,
  from_status text,
  to_status text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_audit_order_created
  on public.order_audit_logs(order_id, created_at desc);

create index if not exists idx_order_audit_vendor_created
  on public.order_audit_logs(vendor_id, created_at desc);

alter table public.order_audit_logs enable row level security;

-- Writes must go through the backend service role. Admin read policies should be added
-- when the production admin role model is finalized.
