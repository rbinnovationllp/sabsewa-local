-- Revised vendor activation and wallet policy.
-- Initial payment: Rs 5,500 = Rs 500 non-refundable activation/service charge
-- plus Rs 5,000 refundable advance wallet credit.

alter table if exists public.vendor_security_wallets
  add column if not exists activation_fee_paid boolean not null default false,
  add column if not exists activation_fee_amount numeric(12,2) not null default 500,
  add column if not exists activation_fee_payment_id text,
  add column if not exists activation_fee_paid_at timestamptz,
  add column if not exists wallet_credit_amount numeric(12,2) not null default 5000,
  add column if not exists initial_payment_amount numeric(12,2) not null default 5500,
  add column if not exists activation_gst_config jsonb not null default '{"ca_confirmation_required": true}'::jsonb;

alter table if exists public.vendor_security_wallet_transactions
  add column if not exists is_refundable boolean not null default true,
  add column if not exists statement_month date generated always as (date_trunc('month', created_at)::date) stored;

alter table if exists public.vendor_security_wallet_transactions
  drop constraint if exists vendor_security_wallet_transactions_transaction_type_check;

alter table if exists public.vendor_security_wallet_transactions
  add constraint vendor_security_wallet_transactions_transaction_type_check
  check (transaction_type in (
    'payment_received',
    'activation_fee',
    'security_deposit',
    'top_up',
    'order_fee',
    'refund',
    'manual_adjustment',
    'reversal'
  ));

create unique index if not exists uq_vendor_single_activation_fee
  on public.vendor_security_wallet_transactions(vendor_id)
  where transaction_type = 'activation_fee';

drop index if exists public.uq_vendor_wallet_razorpay_payment_once;

create unique index if not exists uq_vendor_wallet_razorpay_payment_type_once
  on public.vendor_security_wallet_transactions(razorpay_payment_id, transaction_type)
  where razorpay_payment_id is not null;

alter table if exists public.vendor_exit_requests
  add column if not exists non_refundable_activation_fee_previously_collected numeric(12,2) not null default 500,
  add column if not exists activation_fee_deducted_again boolean not null default false,
  add column if not exists final_statement_url text;

alter table if exists public.vendors
  add column if not exists legal_entity_name text,
  add column if not exists public_trade_name text,
  add column if not exists business_address text,
  add column if not exists business_phone text,
  add column if not exists authorised_representative text,
  add column if not exists pan text,
  add column if not exists gstin text,
  add column if not exists fssai_license text,
  add column if not exists drug_license text,
  add column if not exists other_registrations jsonb not null default '[]'::jsonb,
  add column if not exists verification_status text not null default 'pending'
    check (verification_status in ('pending', 'under_review', 'verified', 'rejected', 'suspended', 'expired')),
  add column if not exists verification_reviewed_by uuid,
  add column if not exists verification_reviewed_at timestamptz,
  add column if not exists verification_expires_at date,
  add column if not exists verification_documents jsonb not null default '[]'::jsonb,
  add column if not exists verification_discrepancies jsonb not null default '[]'::jsonb,
  add column if not exists verification_declaration_accepted boolean not null default false,
  add column if not exists verification_declaration_accepted_at timestamptz,
  add column if not exists public_profile_consent boolean not null default false;

create table if not exists public.vendor_verification_audit (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  previous_status text,
  next_status text not null,
  reviewed_by uuid,
  reviewed_at timestamptz not null default now(),
  documents_reviewed jsonb not null default '[]'::jsonb,
  discrepancies jsonb not null default '[]'::jsonb,
  mandatory_reason text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_vendor_verification_audit_vendor
  on public.vendor_verification_audit(vendor_id, reviewed_at desc);

alter table public.vendor_verification_audit enable row level security;

drop policy if exists "Admins read vendor verification audit" on public.vendor_verification_audit;
drop policy if exists "Vendor owners read own verification audit" on public.vendor_verification_audit;

create policy "Admins read vendor verification audit"
  on public.vendor_verification_audit for select
  to authenticated
  using (public.is_company_admin());

create policy "Vendor owners read own verification audit"
  on public.vendor_verification_audit for select
  to authenticated
  using (public.owns_vendor(vendor_id));

-- Religion must not be collected, ranked, investigated or disclosed as part of
-- vendor verification. Verification is based on lawful business identity,
-- address, category-specific licences and objective platform rules only.

create or replace function public.record_vendor_initial_activation_payment(
  p_vendor_id uuid,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_razorpay_signature text,
  p_payment_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.vendor_security_wallets%rowtype;
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
  v_now timestamptz := now();
begin
  select *
    into v_wallet
  from public.vendor_security_wallets
  where vendor_id = p_vendor_id
  for update;

  if not found then
    insert into public.vendor_security_wallets (
      vendor_id,
      opening_balance,
      current_balance,
      minimum_security_deposit,
      wallet_credit_amount,
      activation_fee_paid,
      reminder_threshold,
      final_warning_threshold,
      stop_orders_threshold,
      operational_minimum_balance,
      eligibility_status
    )
    values (
      p_vendor_id,
      0,
      0,
      5000,
      5000,
      false,
      1000,
      500,
      515,
      515,
      'security_deposit_required'
    )
    returning * into v_wallet;
  end if;

  if v_wallet.activation_fee_paid then
    return to_jsonb(v_wallet);
  end if;

  if exists (
    select 1
    from public.vendor_security_wallet_transactions
    where vendor_id = p_vendor_id
      and transaction_type = 'activation_fee'
  ) then
    update public.vendor_security_wallets
    set activation_fee_paid = true,
        updated_at = v_now
    where id = v_wallet.id
    returning * into v_wallet;

    return to_jsonb(v_wallet);
  end if;

  v_balance_before := coalesce(v_wallet.current_balance, 0);
  v_balance_after := v_balance_before + 5000;

  update public.vendor_security_wallets
  set opening_balance = 5000,
      current_balance = v_balance_after,
      minimum_security_deposit = 5000,
      wallet_credit_amount = 5000,
      initial_payment_amount = 5500,
      activation_fee_paid = true,
      activation_fee_amount = 500,
      activation_fee_payment_id = p_razorpay_payment_id,
      activation_fee_paid_at = v_now,
      eligibility_status = 'eligible',
      updated_at = v_now
  where id = v_wallet.id
  returning * into v_wallet;

  insert into public.vendor_security_wallet_transactions (
    wallet_id,
    vendor_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    payment_reference,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    is_refundable,
    metadata
  )
  values
    (
      v_wallet.id,
      p_vendor_id,
      'payment_received',
      5500,
      v_balance_before,
      v_balance_before,
      p_razorpay_payment_id,
      p_razorpay_order_id,
      p_razorpay_payment_id,
      p_razorpay_signature,
      false,
      p_payment_metadata || jsonb_build_object('accounting_entry', 'PAYMENT_RECEIVED')
    ),
    (
      v_wallet.id,
      p_vendor_id,
      'activation_fee',
      -500,
      v_balance_before,
      v_balance_before,
      p_razorpay_payment_id,
      p_razorpay_order_id,
      p_razorpay_payment_id,
      p_razorpay_signature,
      false,
      p_payment_metadata || jsonb_build_object('accounting_entry', 'NON_REFUNDABLE_ACTIVATION_FEE')
    ),
    (
      v_wallet.id,
      p_vendor_id,
      'security_deposit',
      5000,
      v_balance_before,
      v_balance_after,
      p_razorpay_payment_id,
      p_razorpay_order_id,
      p_razorpay_payment_id,
      p_razorpay_signature,
      true,
      p_payment_metadata || jsonb_build_object('accounting_entry', 'REFUNDABLE_WALLET_CREDIT')
    );

  return to_jsonb(v_wallet);
end;
$$;

revoke all on function public.record_vendor_initial_activation_payment(uuid, text, text, text, jsonb) from public;
grant execute on function public.record_vendor_initial_activation_payment(uuid, text, text, text, jsonb) to service_role;
