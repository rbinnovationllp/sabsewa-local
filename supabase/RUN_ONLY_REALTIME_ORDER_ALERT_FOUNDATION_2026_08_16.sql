-- SabSewa Local - Real-time vendor order alert foundation
-- Date: 2026-08-16
-- Safe, additive migration. It does not delete or rewrite existing orders.

begin;

alter table if exists public.hyperlocal_orders
  add column if not exists vendor_response_deadline_at timestamptz,
  add column if not exists vendor_response_status text default 'awaiting_vendor_response',
  add column if not exists vendor_response_action_at timestamptz,
  add column if not exists vendor_response_actor_user_id uuid,
  add column if not exists vendor_notified_at timestamptz,
  add column if not exists last_vendor_notification_at timestamptz,
  add column if not exists notification_status text;

alter table if exists public.vendor_notifications
  add column if not exists expires_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists action_status text;

alter table if exists public.web_push_subscriptions
  add column if not exists vendor_id uuid,
  add column if not exists terminal_id uuid,
  add column if not exists app_role text,
  add column if not exists preferred_language text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table if exists public.device_push_tokens
  add column if not exists vendor_id uuid,
  add column if not exists terminal_id uuid,
  add column if not exists app_role text,
  add column if not exists preferred_language text;

create index if not exists idx_hyperlocal_orders_vendor_pending_deadline
  on public.hyperlocal_orders (vendor_id, vendor_response_deadline_at)
  where status = 'pending';

create index if not exists idx_vendor_notifications_vendor_unread
  on public.vendor_notifications (vendor_id, created_at desc)
  where read_at is null;

create index if not exists idx_web_push_subscriptions_user_role
  on public.web_push_subscriptions (user_id, app_role, consent_status);

create or replace function public.expire_vendor_non_response_orders(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  with expired as (
    update public.hyperlocal_orders
       set status = 'expired_vendor_no_response',
           vendor_response_status = 'expired',
           vendor_response_action_at = now(),
           updated_at = now()
     where id in (
       select id
         from public.hyperlocal_orders
        where status = 'pending'
          and vendor_response_deadline_at is not null
          and vendor_response_deadline_at <= now()
        order by vendor_response_deadline_at asc
        limit greatest(coalesce(p_limit, 200), 1)
     )
     returning id
  )
  select count(*) into v_count from expired;

  return coalesce(v_count, 0);
end;
$$;

comment on function public.expire_vendor_non_response_orders(integer)
  is 'Expires pending hyperlocal orders after the vendor response deadline. Can be called by backend cron or operational SQL.';

commit;
