-- SabSewa Local production RLS hardening.
-- Apply after all earlier SabSewa Local migrations.
-- Sensitive writes remain backend-service-role only unless explicitly allowed here.

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_profiles where user_id = auth.uid() limit 1
$$;

create or replace function public.is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('admin'), false)
$$;

create or replace function public.owns_vendor(target_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.vendors
    where id = target_vendor_id
    and owner_user_id = auth.uid()
  )
$$;

create or replace function public.is_rider_for_assignment(target_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rider_assignments ra
    join public.riders r on r.id = ra.rider_id
    where ra.id = target_assignment_id
    and r.user_id = auth.uid()
  )
$$;

create or replace function public.is_rider_for_order(target_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rider_assignments ra
    join public.riders r on r.id = ra.rider_id
    where ra.order_id = target_order_id
    and r.user_id = auth.uid()
  )
$$;

drop policy if exists "Users can read own profile" on public.user_profiles;
drop policy if exists "Users can insert own profile" on public.user_profiles;
drop policy if exists "Users can update own non-admin profile" on public.user_profiles;
drop policy if exists "Admins can read all vendors" on public.vendors;
drop policy if exists "Vendor owners can read own terminals" on public.vendor_terminals;
drop policy if exists "Vendor owners manage own terminals" on public.vendor_terminals;
drop policy if exists "Admins manage catalog" on public.catalog_items;
drop policy if exists "Admins read all vendor items" on public.vendor_items;
drop policy if exists "Customers read own orders" on public.hyperlocal_orders;
drop policy if exists "Vendors read own order rows" on public.hyperlocal_orders;
drop policy if exists "Riders read assigned order rows" on public.hyperlocal_orders;
drop policy if exists "Customers can create own orders" on public.hyperlocal_orders;
drop policy if exists "Riders can read own rider profile" on public.riders;
drop policy if exists "Riders can update own location availability" on public.riders;
drop policy if exists "Riders read own assignments" on public.rider_assignments;
drop policy if exists "Vendors read assignments for own orders" on public.rider_assignments;
drop policy if exists "Vendors read own legacy credit ledger" on public.vendor_credit_ledger;
drop policy if exists "Customers read own legacy credit ledger" on public.vendor_credit_ledger;
drop policy if exists "Customers read own vendor credit accounts" on public.vendor_credit_accounts;
drop policy if exists "Customers read own vendor credit transactions" on public.vendor_credit_transactions;
drop policy if exists "Vendors read own credit reminders" on public.vendor_credit_reminders;
drop policy if exists "Customers read own credit reminders" on public.vendor_credit_reminders;
drop policy if exists "Admins read all Gemini logs" on public.gemini_agent_logs;
drop policy if exists "Customers read own Gemini logs" on public.gemini_agent_logs;
drop policy if exists "Admins read all wallet rows" on public.vendor_security_wallets;
drop policy if exists "Admins read all wallet transactions" on public.vendor_security_wallet_transactions;
drop policy if exists "Admins read all wallet warnings" on public.vendor_security_wallet_warnings;
drop policy if exists "Admins read all order audit logs" on public.order_audit_logs;
drop policy if exists "Vendor owners read own order audit logs" on public.order_audit_logs;
drop policy if exists "Admins read all exit requests" on public.vendor_exit_requests;
drop policy if exists "Admins read all storage usage" on public.vendor_storage_usage;
drop policy if exists "Admins read all storage files" on public.vendor_storage_files;

alter table public.user_profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.vendor_terminals enable row level security;
alter table public.catalog_items enable row level security;
alter table public.vendor_items enable row level security;
alter table public.hyperlocal_orders enable row level security;
alter table public.riders enable row level security;
alter table public.rider_assignments enable row level security;
alter table public.vendor_credit_ledger enable row level security;
alter table public.gemini_agent_logs enable row level security;
alter table public.vendor_security_wallets enable row level security;
alter table public.vendor_security_wallet_transactions enable row level security;
alter table public.vendor_security_wallet_warnings enable row level security;
alter table public.order_audit_logs enable row level security;
alter table public.vendor_credit_accounts enable row level security;
alter table public.vendor_credit_transactions enable row level security;
alter table public.vendor_credit_reminders enable row level security;
alter table public.vendor_exit_requests enable row level security;
alter table public.vendor_storage_usage enable row level security;
alter table public.vendor_storage_files enable row level security;

create policy "Users can read own profile"
  on public.user_profiles for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

create policy "Users can insert own profile"
  on public.user_profiles for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own non-admin profile"
  on public.user_profiles for update
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin())
  with check (
    public.is_company_admin()
    or (user_id = auth.uid() and role in ('customer', 'vendor', 'rider', 'terminal_admin'))
  );

create policy "Admins can read all vendors"
  on public.vendors for select
  to authenticated
  using (public.is_company_admin());

create policy "Vendor owners can read own terminals"
  on public.vendor_terminals for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

create policy "Vendor owners manage own terminals"
  on public.vendor_terminals for all
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin())
  with check (public.owns_vendor(vendor_id) or public.is_company_admin());

create policy "Admins manage catalog"
  on public.catalog_items for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "Admins read all vendor items"
  on public.vendor_items for select
  to authenticated
  using (public.is_company_admin());

create policy "Customers read own orders"
  on public.hyperlocal_orders for select
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin());

create policy "Vendors read own order rows"
  on public.hyperlocal_orders for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

create policy "Riders read assigned order rows"
  on public.hyperlocal_orders for select
  to authenticated
  using (public.is_rider_for_order(id) or public.is_company_admin());

create policy "Customers can create own orders"
  on public.hyperlocal_orders for insert
  to authenticated
  with check (customer_id = auth.uid());

create policy "Riders can read own rider profile"
  on public.riders for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

create policy "Riders can update own location availability"
  on public.riders for update
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin())
  with check (user_id = auth.uid() or public.is_company_admin());

create policy "Riders read own assignments"
  on public.rider_assignments for select
  to authenticated
  using (public.is_rider_for_assignment(id) or public.is_company_admin());

create policy "Vendors read assignments for own orders"
  on public.rider_assignments for select
  to authenticated
  using (
    exists (
      select 1 from public.hyperlocal_orders o
      where o.id = rider_assignments.order_id
      and public.owns_vendor(o.vendor_id)
    )
    or public.is_company_admin()
  );

create policy "Vendors read own legacy credit ledger"
  on public.vendor_credit_ledger for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

create policy "Customers read own legacy credit ledger"
  on public.vendor_credit_ledger for select
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin());

create policy "Customers read own vendor credit accounts"
  on public.vendor_credit_accounts for select
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin());

create policy "Customers read own vendor credit transactions"
  on public.vendor_credit_transactions for select
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin());

create policy "Vendors read own credit reminders"
  on public.vendor_credit_reminders for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

create policy "Customers read own credit reminders"
  on public.vendor_credit_reminders for select
  to authenticated
  using (customer_id = auth.uid() or public.is_company_admin());

create policy "Admins read all Gemini logs"
  on public.gemini_agent_logs for select
  to authenticated
  using (public.is_company_admin());

create policy "Customers read own Gemini logs"
  on public.gemini_agent_logs for select
  to authenticated
  using (user_id = auth.uid() or public.is_company_admin());

create policy "Admins read all wallet rows"
  on public.vendor_security_wallets for select
  to authenticated
  using (public.is_company_admin());

create policy "Admins read all wallet transactions"
  on public.vendor_security_wallet_transactions for select
  to authenticated
  using (public.is_company_admin());

create policy "Admins read all wallet warnings"
  on public.vendor_security_wallet_warnings for select
  to authenticated
  using (public.is_company_admin());

create policy "Admins read all order audit logs"
  on public.order_audit_logs for select
  to authenticated
  using (public.is_company_admin());

create policy "Vendor owners read own order audit logs"
  on public.order_audit_logs for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

create policy "Admins read all exit requests"
  on public.vendor_exit_requests for select
  to authenticated
  using (public.is_company_admin());

create policy "Admins read all storage usage"
  on public.vendor_storage_usage for select
  to authenticated
  using (public.is_company_admin());

create policy "Admins read all storage files"
  on public.vendor_storage_files for select
  to authenticated
  using (public.is_company_admin());

-- Deliberately no direct client write policies for:
-- wallet balances/transactions, order audit logs, credit transactions/reminders,
-- exit requests, storage file confirmations, and Gemini logs.
-- These must be written through protected backend service-role routes/functions.

