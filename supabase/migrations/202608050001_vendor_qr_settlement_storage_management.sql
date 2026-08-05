-- Vendor QR payment profiles, direct settlement, credit privacy and storage plans.
-- Customers pay vendors directly; SabSewa Local keeps only minimal accounting
-- records after successful settlement.

alter table public.vendor_storage_files
  drop constraint if exists vendor_storage_files_purpose_check;

alter table public.vendor_storage_files
  add constraint vendor_storage_files_purpose_check
  check (purpose in (
    'product_image',
    'product_thumbnail',
    'kyc_document',
    'business_document',
    'payment_qr',
    'store_banner',
    'store_asset'
  ));

alter table public.vendor_storage_usage
  add column if not exists purchased_quota_bytes bigint not null default 0,
  add column if not exists default_quota_bytes bigint not null default 104857600,
  add column if not exists storage_breakdown jsonb not null default '{}'::jsonb;

alter table public.hyperlocal_orders
  drop constraint if exists hyperlocal_orders_payment_method_check,
  drop constraint if exists hyperlocal_orders_payment_status_check;

alter table public.hyperlocal_orders
  add constraint hyperlocal_orders_payment_method_check
  check (payment_method in ('prepaid', 'cash', 'vendor_qr', 'bank_transfer', 'other_digital', 'credit')),
  add constraint hyperlocal_orders_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'credit_due', 'pending_payment', 'refunded', 'failed'));

alter table public.hyperlocal_orders
  add column if not exists settlement_status text not null default 'pending'
    check (settlement_status in ('pending', 'complete', 'credit_pending', 'failed', 'refunded')),
  add column if not exists settlement_completed_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_confirmed_by text,
  add column if not exists payment_reference text,
  add column if not exists receipt_number text,
  add column if not exists customer_name text,
  add column if not exists customer_delivery_snapshot jsonb,
  add column if not exists privacy_redacted_at timestamptz,
  add column if not exists privacy_redaction_reason text;

create table if not exists public.vendor_payment_profiles (
  vendor_id uuid primary key references public.vendors(id) on delete cascade,
  upi_id text,
  bank_account_last4 text,
  bank_account_encrypted text,
  bank_ifsc_encrypted text,
  bank_account_holder text,
  preferred_methods text[] not null default array['cash', 'vendor_qr']::text[],
  other_payment_instructions text,
  is_active boolean not null default true,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_payment_profiles_methods_check check (
    preferred_methods <@ array['cash', 'vendor_qr', 'bank_transfer', 'other_digital']::text[]
  )
);

create table if not exists public.vendor_qr_codes (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  storage_file_id uuid references public.vendor_storage_files(id) on delete set null,
  label text not null default 'UPI QR',
  upi_id text,
  public_url text not null,
  object_key text not null,
  content_type text not null,
  byte_size bigint not null default 0,
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active', 'replaced', 'archived', 'deleted')),
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  replaced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists uq_vendor_qr_primary_active
  on public.vendor_qr_codes(vendor_id)
  where is_primary = true and status = 'active';

create table if not exists public.order_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.hyperlocal_orders(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  payment_method text not null check (payment_method in ('cash', 'vendor_qr', 'bank_transfer', 'other_digital', 'credit')),
  amount numeric(12,2) not null check (amount >= 0),
  payment_status text not null default 'confirmed' check (payment_status in ('pending', 'confirmed', 'failed', 'refunded')),
  settlement_status text not null default 'complete' check (settlement_status in ('pending', 'complete', 'credit_pending', 'failed', 'refunded')),
  payment_reference text,
  confirmed_by text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.order_settlement_records (
  order_id uuid primary key references public.hyperlocal_orders(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  order_date timestamptz not null,
  total_amount numeric(12,2) not null,
  payment_method text not null,
  settlement_status text not null default 'complete',
  receipt_number text not null,
  settled_at timestamptz not null default now(),
  retained_accounting_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.vendor_storage_plans (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null unique,
  title text not null,
  quota_bytes bigint not null check (quota_bytes > 0),
  price_inr numeric(12,2) not null check (price_inr >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_storage_purchases (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  plan_id uuid references public.vendor_storage_plans(id) on delete set null,
  quota_bytes bigint not null check (quota_bytes > 0),
  amount_inr numeric(12,2) not null check (amount_inr >= 0),
  payment_gateway text not null default 'razorpay',
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  payment_reference text,
  activated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.vendor_storage_plans (plan_code, title, quota_bytes, price_inr, sort_order)
values
  ('plus_1gb', '+1 GB', 1073741824, 199, 10),
  ('plus_5gb', '+5 GB', 5368709120, 799, 20),
  ('plus_10gb', '+10 GB', 10737418240, 1399, 30),
  ('plus_25gb', '+25 GB', 26843545600, 2999, 40)
on conflict (plan_code) do update
set title = excluded.title,
    quota_bytes = excluded.quota_bytes,
    price_inr = excluded.price_inr,
    sort_order = excluded.sort_order,
    is_active = true;

alter table public.vendor_credit_accounts
  add column if not exists customer_name text,
  add column if not exists customer_mobile text,
  add column if not exists customer_address text,
  add column if not exists credit_date date,
  add column if not exists credit_notes text,
  add column if not exists payment_history jsonb not null default '[]'::jsonb,
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text,
  add column if not exists settled_at timestamptz,
  add column if not exists privacy_redacted_at timestamptz;

create index if not exists idx_order_payment_tx_order_created
  on public.order_payment_transactions(order_id, created_at desc);
create index if not exists idx_settlement_vendor_settled
  on public.order_settlement_records(vendor_id, settled_at desc);
create index if not exists idx_vendor_qr_vendor_status
  on public.vendor_qr_codes(vendor_id, status, created_at desc);
create index if not exists idx_vendor_storage_purchases_vendor_created
  on public.vendor_storage_purchases(vendor_id, created_at desc);

alter table public.vendor_payment_profiles enable row level security;
alter table public.vendor_qr_codes enable row level security;
alter table public.order_payment_transactions enable row level security;
alter table public.order_settlement_records enable row level security;
alter table public.vendor_storage_plans enable row level security;
alter table public.vendor_storage_purchases enable row level security;

drop policy if exists "Vendor owners read own payment profile" on public.vendor_payment_profiles;
create policy "Vendor owners read own payment profile"
  on public.vendor_payment_profiles for select to authenticated
  using (exists (
    select 1 from public.vendors
    where vendors.id = vendor_payment_profiles.vendor_id
    and vendors.owner_user_id = auth.uid()
  ));

drop policy if exists "Vendor owners read own QR codes" on public.vendor_qr_codes;
create policy "Vendor owners read own QR codes"
  on public.vendor_qr_codes for select to authenticated
  using (exists (
    select 1 from public.vendors
    where vendors.id = vendor_qr_codes.vendor_id
    and vendors.owner_user_id = auth.uid()
  ));

drop policy if exists "Vendor owners read own settlements" on public.order_settlement_records;
create policy "Vendor owners read own settlements"
  on public.order_settlement_records for select to authenticated
  using (exists (
    select 1 from public.vendors
    where vendors.id = order_settlement_records.vendor_id
    and vendors.owner_user_id = auth.uid()
  ));

drop policy if exists "Anyone authenticated can read active storage plans" on public.vendor_storage_plans;
create policy "Anyone authenticated can read active storage plans"
  on public.vendor_storage_plans for select to authenticated
  using (is_active = true);

drop policy if exists "Vendor owners read own storage purchases" on public.vendor_storage_purchases;
create policy "Vendor owners read own storage purchases"
  on public.vendor_storage_purchases for select to authenticated
  using (exists (
    select 1 from public.vendors
    where vendors.id = vendor_storage_purchases.vendor_id
    and vendors.owner_user_id = auth.uid()
  ));

comment on table public.order_settlement_records is
  'Minimal accounting history retained after paid order settlement. Customer delivery PII is removed from operational order storage.';

create table if not exists public.vendor_credit_repayment_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  customer_id uuid not null,
  account_id uuid references public.vendor_credit_accounts(id) on delete set null,
  order_id uuid references public.hyperlocal_orders(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null default 'vendor_qr' check (payment_method in ('vendor_qr', 'bank_transfer', 'other_digital', 'cash')),
  payment_reference text,
  customer_note text,
  status text not null default 'submitted' check (status in ('submitted', 'vendor_confirmed', 'rejected')),
  submitted_at timestamptz not null default now(),
  verified_by uuid,
  verified_at timestamptz,
  vendor_note text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_credit_repayment_vendor_status
  on public.vendor_credit_repayment_requests(vendor_id, status, submitted_at desc);
create index if not exists idx_credit_repayment_customer
  on public.vendor_credit_repayment_requests(customer_id, submitted_at desc);

alter table public.vendor_credit_repayment_requests enable row level security;

drop policy if exists "Vendor owners read own repayment requests" on public.vendor_credit_repayment_requests;
create policy "Vendor owners read own repayment requests"
  on public.vendor_credit_repayment_requests for select to authenticated
  using (exists (
    select 1 from public.vendors
    where vendors.id = vendor_credit_repayment_requests.vendor_id
    and vendors.owner_user_id = auth.uid()
  ));

comment on table public.vendor_credit_repayment_requests is
  'Customer-submitted credit repayment references. Vendor confirmation is required before the credit balance is reduced.';

create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  vendor_id uuid references public.vendors(id) on delete set null,
  order_id uuid references public.hyperlocal_orders(id) on delete set null,
  notification_type text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  delivery_channel text not null default 'in_app' check (delivery_channel in ('in_app', 'push', 'sms', 'whatsapp')),
  delivery_status text not null default 'queued' check (delivery_status in ('queued', 'sent', 'failed', 'skipped')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz
);

create index if not exists idx_customer_notifications_customer_created
  on public.customer_notifications(customer_id, created_at desc);
create index if not exists idx_customer_notifications_order
  on public.customer_notifications(order_id, notification_type);

alter table public.customer_notifications enable row level security;

drop policy if exists "Customers read own notifications" on public.customer_notifications;
create policy "Customers read own notifications"
  on public.customer_notifications for select to authenticated
  using (auth.uid() = customer_id);

comment on table public.customer_notifications is
  'Customer-facing order and repayment notifications. Payloads should contain order/payment summaries, not secrets or sensitive payment credentials.';

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text not null default 'fcm' check (provider in ('fcm')),
  token text not null unique,
  platform text check (platform in ('web', 'android', 'ios')),
  app_role text check (app_role in ('customer', 'vendor', 'rider', 'company')),
  consent_status text not null default 'granted' check (consent_status in ('granted', 'revoked')),
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_device_push_tokens_user_provider
  on public.device_push_tokens(user_id, provider, consent_status);

alter table public.device_push_tokens enable row level security;

drop policy if exists "Users read own device push tokens" on public.device_push_tokens;
create policy "Users read own device push tokens"
  on public.device_push_tokens for select to authenticated
  using (auth.uid() = user_id);

comment on table public.device_push_tokens is
  'Low-cost FCM push token registry. Used for customer/vendor notifications before any SMS fallback is considered.';
