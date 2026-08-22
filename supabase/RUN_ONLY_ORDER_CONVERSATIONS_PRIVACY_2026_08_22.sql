-- SabSewa Local - secure order-specific customer/vendor conversation foundation
-- Pre-acceptance messaging must not reveal customer contact/address details or trigger platform fees.

create table if not exists public.order_conversations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.hyperlocal_orders(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  terminal_id uuid references public.vendor_terminals(id) on delete set null,
  customer_id uuid not null,
  status text not null default 'open'
    check (status in ('open','accepted_order_coordination','expired','closed','disputed')),
  pre_acceptance_privacy_locked boolean not null default true,
  expires_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.order_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.order_conversations(id) on delete cascade,
  order_id uuid not null references public.hyperlocal_orders(id) on delete cascade,
  sender_user_id uuid,
  sender_role text not null check (sender_role in ('customer','vendor','system')),
  message_type text not null default 'TEXT'
    check (message_type in ('TEXT','CLARIFICATION_REQUEST','AVAILABILITY_RESPONSE','ALTERNATIVE_PROPOSAL','PARTIAL_AVAILABILITY','PRICE_CHANGE_NOTICE','CUSTOMER_DECISION','SYSTEM_MESSAGE','ORDER_EXPIRED')),
  template_code text,
  body text not null,
  body_sanitized text not null,
  blocked_content_detected boolean not null default false,
  status text not null default 'delivered'
    check (status in ('queued','delivered','read','blocked','expired')),
  immutable_hash text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.message_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.order_conversations(id) on delete cascade,
  user_id uuid,
  role text not null check (role in ('customer','vendor','admin')),
  display_name text not null,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(conversation_id, role, user_id)
);

create table if not exists public.alternative_proposals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.order_conversations(id) on delete cascade,
  order_id uuid not null references public.hyperlocal_orders(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  proposed_by_user_id uuid,
  proposal_status text not null default 'pending_customer_decision'
    check (proposal_status in ('pending_customer_decision','accepted_by_customer','rejected_by_customer','cancelled','expired','vendor_finally_accepted')),
  customer_decision_at timestamptz,
  vendor_final_acceptance_at timestamptz,
  medical_disclaimer_acknowledged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.alternative_proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.alternative_proposals(id) on delete cascade,
  original_item text not null,
  suggested_item text not null,
  brand_or_variety text,
  pack_size text,
  available_quantity numeric,
  price_amount numeric(12,2),
  product_image_path text,
  substitution_reason text,
  medicine_composition text,
  requires_review boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.message_delivery_status (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.order_messages(id) on delete cascade,
  recipient_user_id uuid,
  recipient_role text not null check (recipient_role in ('customer','vendor','admin')),
  delivery_status text not null default 'queued'
    check (delivery_status in ('queued','sent','delivered','read','failed','suppressed_sensitive_preview')),
  delivered_at timestamptz,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.blocked_contact_sharing_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.order_conversations(id) on delete cascade,
  order_id uuid references public.hyperlocal_orders(id) on delete cascade,
  actor_user_id uuid,
  actor_role text,
  detection_type text not null,
  original_preview text,
  sanitized_preview text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.conversation_audit_log (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.order_conversations(id) on delete cascade,
  order_id uuid references public.hyperlocal_orders(id) on delete cascade,
  actor_user_id uuid,
  actor_role text,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_conversations_order on public.order_conversations(order_id);
create index if not exists idx_order_messages_conversation_created on public.order_messages(conversation_id, created_at);
create index if not exists idx_alternative_proposals_order on public.alternative_proposals(order_id, proposal_status);
create index if not exists idx_blocked_contact_sharing_events_order on public.blocked_contact_sharing_events(order_id, created_at desc);

alter table public.order_conversations enable row level security;
alter table public.order_messages enable row level security;
alter table public.message_participants enable row level security;
alter table public.alternative_proposals enable row level security;
alter table public.alternative_proposal_items enable row level security;
alter table public.message_delivery_status enable row level security;
alter table public.blocked_contact_sharing_events enable row level security;
alter table public.conversation_audit_log enable row level security;

grant select, insert, update on public.order_conversations to service_role;
grant select, insert, update on public.order_messages to service_role;
grant select, insert, update on public.message_participants to service_role;
grant select, insert, update on public.alternative_proposals to service_role;
grant select, insert, update on public.alternative_proposal_items to service_role;
grant select, insert, update on public.message_delivery_status to service_role;
grant select, insert on public.blocked_contact_sharing_events to service_role;
grant select, insert on public.conversation_audit_log to service_role;

grant select on public.order_conversations, public.order_messages, public.message_participants, public.alternative_proposals, public.alternative_proposal_items, public.message_delivery_status to authenticated;

drop policy if exists "Order participants read own conversations" on public.order_conversations;
create policy "Order participants read own conversations"
  on public.order_conversations for select to authenticated
  using (customer_id = auth.uid() or public.owns_vendor(vendor_id) or public.is_company_admin());

drop policy if exists "Order participants read own messages" on public.order_messages;
create policy "Order participants read own messages"
  on public.order_messages for select to authenticated
  using (
    exists (
      select 1 from public.order_conversations c
       where c.id = order_messages.conversation_id
         and (c.customer_id = auth.uid() or public.owns_vendor(c.vendor_id) or public.is_company_admin())
    )
  );

drop policy if exists "Order participants read own proposals" on public.alternative_proposals;
create policy "Order participants read own proposals"
  on public.alternative_proposals for select to authenticated
  using (
    exists (
      select 1 from public.order_conversations c
       where c.id = alternative_proposals.conversation_id
         and (c.customer_id = auth.uid() or public.owns_vendor(c.vendor_id) or public.is_company_admin())
    )
  );

drop policy if exists "Order participants read own proposal items" on public.alternative_proposal_items;
create policy "Order participants read own proposal items"
  on public.alternative_proposal_items for select to authenticated
  using (
    exists (
      select 1
        from public.alternative_proposals p
        join public.order_conversations c on c.id = p.conversation_id
       where p.id = alternative_proposal_items.proposal_id
         and (c.customer_id = auth.uid() or public.owns_vendor(c.vendor_id) or public.is_company_admin())
    )
  );

drop policy if exists "Company admins read blocked contact sharing events" on public.blocked_contact_sharing_events;
create policy "Company admins read blocked contact sharing events"
  on public.blocked_contact_sharing_events for select to authenticated
  using (public.is_company_admin());

drop policy if exists "Company admins read conversation audit log" on public.conversation_audit_log;
create policy "Company admins read conversation audit log"
  on public.conversation_audit_log for select to authenticated
  using (public.is_company_admin());

comment on table public.order_conversations is
  'Order-specific customer/vendor communication. Pre-acceptance conversations keep customer contact/address details hidden and never trigger platform fees.';
comment on table public.blocked_contact_sharing_events is
  'Audit log of backend-blocked phone, email, WhatsApp, UPI, external payment/link or other direct-contact sharing attempts.';
