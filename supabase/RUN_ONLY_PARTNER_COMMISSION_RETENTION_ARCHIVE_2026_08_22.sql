-- SabSewa Local - Partner commission statutory retention and protected archive
-- Safe/idempotent production migration. This does not delete commission or payment evidence.

alter table public.partner_monthly_commission_statements
  add column if not exists review_period_starts_at timestamptz,
  add column if not exists review_period_ends_at timestamptz,
  add column if not exists review_status text not null default 'not_started',
  add column if not exists archive_status text not null default 'active',
  add column if not exists archive_eligible_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists archive_verified_at timestamptz,
  add column if not exists archive_job_id text,
  add column if not exists legal_hold boolean not null default false,
  add column if not exists legal_hold_reason text,
  add column if not exists legal_hold_until timestamptz,
  add column if not exists retention_period_months integer not null default 96,
  add column if not exists statutory_retention_until date,
  add column if not exists protected_archive_id uuid,
  add column if not exists summary_statement_path text,
  add column if not exists partner_archive_message text,
  add column if not exists dispute_status text not null default 'none',
  add column if not exists dispute_opened_at timestamptz,
  add column if not exists dispute_closed_at timestamptz,
  add column if not exists approval_history jsonb not null default '[]'::jsonb,
  add column if not exists dispute_history jsonb not null default '[]'::jsonb;

do $$
begin
  alter table public.partner_monthly_commission_statements
    drop constraint if exists partner_monthly_commission_statements_review_status_check;
  alter table public.partner_monthly_commission_statements
    add constraint partner_monthly_commission_statements_review_status_check
    check (review_status in ('not_started','open','reminder_due','closed','disputed','legal_hold'));

  alter table public.partner_monthly_commission_statements
    drop constraint if exists partner_monthly_commission_statements_archive_status_check;
  alter table public.partner_monthly_commission_statements
    add constraint partner_monthly_commission_statements_archive_status_check
    check (archive_status in ('active','eligible_for_archive','archive_in_progress','verified_archived','archive_failed','legal_hold'));

  alter table public.partner_monthly_commission_statements
    drop constraint if exists partner_monthly_commission_statements_dispute_status_check;
  alter table public.partner_monthly_commission_statements
    add constraint partner_monthly_commission_statements_dispute_status_check
    check (dispute_status in ('none','open','under_review','resolved','rejected','withdrawn','legal_hold'));
end $$;

update public.partner_monthly_commission_statements
   set review_period_starts_at = coalesce(review_period_starts_at, payment_date),
       review_period_ends_at = coalesce(review_period_ends_at, payment_date + interval '15 days'),
       archive_eligible_at = coalesce(archive_eligible_at, payment_date + interval '15 days'),
       statutory_retention_until = coalesce(statutory_retention_until, (period_month + interval '96 months')::date),
       partner_archive_message = coalesce(
         partner_archive_message,
         'This commission settlement has been completed and archived. The summary and payment evidence remain available according to the company statutory record-retention policy.'
       ),
       review_status = case
         when legal_hold then 'legal_hold'
         when dispute_status in ('open','under_review') then 'disputed'
         when payment_status = 'paid' and payment_date is not null and now() >= payment_date + interval '15 days' then 'closed'
         when payment_status = 'paid' and payment_date is not null then 'open'
         else review_status
       end
 where payment_status = 'paid';

create table if not exists public.partner_commission_statement_archives (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null unique references public.partner_monthly_commission_statements(id) on delete restrict,
  partner_application_id uuid not null references public.partner_applications(id) on delete restrict,
  partner_id text,
  partner_legal_name text,
  statement_number text,
  settlement_month date not null,
  review_period_starts_at timestamptz,
  review_period_ends_at timestamptz,
  qualifying_vendor_ids jsonb not null default '[]'::jsonb,
  referral_attribution_evidence jsonb not null default '{}'::jsonb,
  commission_policy jsonb not null default '{}'::jsonb,
  commission_rate numeric(5,2),
  taxable_commission_amount numeric(12,2) not null default 0,
  gst_treatment jsonb not null default '{}'::jsonb,
  tds_treatment jsonb not null default '{}'::jsonb,
  adjustments jsonb not null default '[]'::jsonb,
  gross_commission numeric(12,2) not null default 0,
  net_commission numeric(12,2) not null default 0,
  payment_status text not null,
  payment_method text,
  payment_reference text,
  payment_date timestamptz,
  invoice_reference text,
  credit_note_reference text,
  self_invoice_reference text,
  approval_history jsonb not null default '[]'::jsonb,
  dispute_history jsonb not null default '[]'::jsonb,
  source_statement_snapshot jsonb not null default '{}'::jsonb,
  legal_hold boolean not null default false,
  retention_until date not null,
  archive_status text not null default 'verified_archived'
    check (archive_status in ('verified_archived','legal_hold','exceptional_deletion_requested')),
  created_by_job_id text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.partner_commission_archive_jobs (
  id uuid primary key default gen_random_uuid(),
  job_id text not null unique,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  eligible_count integer not null default 0,
  archived_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  status text not null default 'running'
    check (status in ('running','completed','completed_with_errors','failed')),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_partner_commission_archive_statement
  on public.partner_commission_statement_archives(statement_id);
create index if not exists idx_partner_commission_archive_partner_month
  on public.partner_commission_statement_archives(partner_application_id, settlement_month desc);
create index if not exists idx_partner_statement_archive_eligibility
  on public.partner_monthly_commission_statements(payment_status, archive_status, archive_eligible_at)
  where legal_hold = false;

alter table public.partner_commission_statement_archives enable row level security;
alter table public.partner_commission_archive_jobs enable row level security;

grant select, insert, update on public.partner_commission_statement_archives to service_role;
grant select, insert, update on public.partner_commission_archive_jobs to service_role;
grant select on public.partner_commission_statement_archives to authenticated;
grant select on public.partner_commission_archive_jobs to authenticated;

drop policy if exists "Company admins read partner commission archives" on public.partner_commission_statement_archives;
create policy "Company admins read partner commission archives"
  on public.partner_commission_statement_archives
  for select
  to authenticated
  using (public.is_company_admin());

drop policy if exists "Company admins read partner archive jobs" on public.partner_commission_archive_jobs;
create policy "Company admins read partner archive jobs"
  on public.partner_commission_archive_jobs
  for select
  to authenticated
  using (public.is_company_admin());

create or replace function public.archive_partner_commission_statement(
  p_statement_id uuid,
  p_job_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statement public.partner_monthly_commission_statements%rowtype;
  v_partner public.partner_applications%rowtype;
  v_archive_id uuid;
  v_vendor_ids jsonb := '[]'::jsonb;
  v_job_id text := coalesce(nullif(p_job_id, ''), 'manual-' || replace(gen_random_uuid()::text, '-', ''));
begin
  select *
    into v_statement
    from public.partner_monthly_commission_statements
   where id = p_statement_id
   for update;

  if not found then
    return jsonb_build_object('archived', false, 'reason', 'statement_not_found');
  end if;

  if v_statement.legal_hold then
    update public.partner_monthly_commission_statements
       set archive_status = 'legal_hold',
           review_status = 'legal_hold',
           updated_at = now()
     where id = p_statement_id;
    return jsonb_build_object('archived', false, 'reason', 'legal_hold');
  end if;

  if v_statement.payment_status <> 'paid' or v_statement.payment_date is null then
    return jsonb_build_object('archived', false, 'reason', 'not_paid_or_unreconciled');
  end if;

  if coalesce(v_statement.dispute_status, 'none') in ('open','under_review','legal_hold') then
    return jsonb_build_object('archived', false, 'reason', 'dispute_or_review_pending');
  end if;

  if now() < coalesce(v_statement.review_period_ends_at, v_statement.payment_date + interval '15 days') then
    return jsonb_build_object('archived', false, 'reason', 'review_period_open');
  end if;

  if v_statement.archive_status = 'verified_archived' and v_statement.protected_archive_id is not null then
    return jsonb_build_object('archived', true, 'idempotent', true, 'archive_id', v_statement.protected_archive_id);
  end if;

  select *
    into v_partner
    from public.partner_applications
   where id = v_statement.partner_application_id;

  select coalesce(jsonb_agg(distinct vendor_id), '[]'::jsonb)
    into v_vendor_ids
    from public.partner_commission_events
   where partner_application_id = v_statement.partner_application_id
     and date_trunc('month', period_start)::date = date_trunc('month', v_statement.period_month)::date;

  insert into public.partner_commission_statement_archives (
    statement_id,
    partner_application_id,
    partner_id,
    partner_legal_name,
    statement_number,
    settlement_month,
    review_period_starts_at,
    review_period_ends_at,
    qualifying_vendor_ids,
    referral_attribution_evidence,
    commission_policy,
    commission_rate,
    taxable_commission_amount,
    gst_treatment,
    tds_treatment,
    adjustments,
    gross_commission,
    net_commission,
    payment_status,
    payment_reference,
    payment_date,
    approval_history,
    dispute_history,
    source_statement_snapshot,
    legal_hold,
    retention_until,
    created_by_job_id,
    verified_at,
    metadata
  ) values (
    v_statement.id,
    v_statement.partner_application_id,
    v_partner.partner_id,
    v_partner.applicant_name,
    coalesce(v_statement.reference_number, 'PCS-' || to_char(v_statement.period_month, 'YYYYMM') || '-' || left(v_statement.id::text, 8)),
    v_statement.period_month,
    coalesce(v_statement.review_period_starts_at, v_statement.payment_date),
    coalesce(v_statement.review_period_ends_at, v_statement.payment_date + interval '15 days'),
    v_vendor_ids,
    jsonb_build_object('source', 'partner_commission_events', 'qualifying_vendor_ids', v_vendor_ids),
    jsonb_build_object('version', 'partner-benefit-local-2026-08-22', 'eligible_revenue_rule', 'company revenue only; excludes GST, refundable deposits, pass-through charges, refunds and chargebacks'),
    v_statement.commission_rate,
    v_statement.eligible_revenue,
    jsonb_build_object('gst_note', 'Partner benefit GST treatment requires CA review before tax filing. SabSewa preserves the configured treatment snapshot.'),
    jsonb_build_object('tds_amount', v_statement.tds_tax, 'tds_review_required', true),
    jsonb_build_array(jsonb_build_object('adjustments', v_statement.adjustments, 'deductions', v_statement.deductions)),
    v_statement.gross_commission,
    v_statement.net_payable,
    v_statement.payment_status,
    v_statement.reference_number,
    v_statement.payment_date,
    coalesce(v_statement.approval_history, '[]'::jsonb),
    coalesce(v_statement.dispute_history, '[]'::jsonb),
    to_jsonb(v_statement),
    false,
    coalesce(v_statement.statutory_retention_until, (v_statement.period_month + interval '96 months')::date),
    v_job_id,
    now(),
    jsonb_build_object('archive_policy', '15-day partner review closure; protected financial archive retained for statutory period; no permanent evidence deletion')
  )
  on conflict (statement_id) do update
     set source_statement_snapshot = excluded.source_statement_snapshot,
         verified_at = coalesce(public.partner_commission_statement_archives.verified_at, now()),
         archive_status = 'verified_archived'
  returning id into v_archive_id;

  update public.partner_monthly_commission_statements
     set review_status = 'closed',
         archive_status = 'verified_archived',
         archive_eligible_at = coalesce(archive_eligible_at, payment_date + interval '15 days'),
         archived_at = coalesce(archived_at, now()),
         archive_verified_at = now(),
         archive_job_id = v_job_id,
         protected_archive_id = v_archive_id,
         partner_archive_message = 'This commission settlement has been completed and archived. The summary and payment evidence remain available according to the company statutory record-retention policy.',
         updated_at = now()
   where id = p_statement_id;

  return jsonb_build_object('archived', true, 'archive_id', v_archive_id, 'job_id', v_job_id);
end;
$$;

create or replace function public.run_partner_commission_archive_job(
  p_job_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id text := coalesce(nullif(p_job_id, ''), 'partner-commission-archive-' || to_char(now(), 'YYYYMMDDHH24MISS'));
  v_row record;
  v_result jsonb;
  v_archived integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_eligible integer := 0;
begin
  insert into public.partner_commission_archive_jobs(job_id, status)
  values (v_job_id, 'running')
  on conflict (job_id) do update set started_at = now(), status = 'running';

  for v_row in
    select id
      from public.partner_monthly_commission_statements
     where payment_status = 'paid'
       and payment_date is not null
       and legal_hold = false
       and coalesce(dispute_status, 'none') not in ('open','under_review','legal_hold')
       and coalesce(archive_status, 'active') <> 'verified_archived'
       and now() >= coalesce(review_period_ends_at, payment_date + interval '15 days')
     order by payment_date asc
     limit 200
  loop
    v_eligible := v_eligible + 1;
    begin
      v_result := public.archive_partner_commission_statement(v_row.id, v_job_id);
      if coalesce((v_result->>'archived')::boolean, false) then
        v_archived := v_archived + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
    end;
  end loop;

  update public.partner_commission_archive_jobs
     set finished_at = now(),
         eligible_count = v_eligible,
         archived_count = v_archived,
         skipped_count = v_skipped,
         failed_count = v_failed,
         status = case when v_failed > 0 then 'completed_with_errors' else 'completed' end
   where job_id = v_job_id;

  return jsonb_build_object(
    'job_id', v_job_id,
    'eligible_count', v_eligible,
    'archived_count', v_archived,
    'skipped_count', v_skipped,
    'failed_count', v_failed
  );
end;
$$;

comment on table public.partner_commission_statement_archives is
  'Protected read-only financial archive for paid Partner commission settlements. Do not delete payment/accounting/GST/TDS/audit evidence after the 15-day review period.';
comment on column public.partner_monthly_commission_statements.legal_hold is
  'When true, automatic archival/minimization and exceptional deletion are blocked until legal/tax/dispute hold is cleared.';
comment on function public.run_partner_commission_archive_job(text) is
  'Moves eligible paid Partner statements after the 15-day review window into protected archive metadata. It does not permanently delete legal or payment evidence.';
