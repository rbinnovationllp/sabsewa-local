-- Location-based public Vendor IDs and Terminal IDs.
-- UUID remains the immutable internal primary key.

create sequence if not exists public.sabsewa_local_vendor_public_number_seq
  as integer
  start with 1
  increment by 1
  minvalue 1;

create table if not exists public.company_location_codes (
  id uuid primary key default gen_random_uuid(),
  city_code text not null check (city_code ~ '^[A-Z0-9]{2,5}$'),
  city_name text not null,
  locality_code text not null check (locality_code ~ '^[A-Z0-9]{2,6}$'),
  locality_name text not null,
  state text,
  country text not null default 'IN',
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_code, locality_code)
);

insert into public.company_location_codes (city_code, city_name, locality_code, locality_name, state)
values
  ('BLR', 'Bengaluru', 'WFD', 'Whitefield', 'Karnataka'),
  ('BLR', 'Bengaluru', 'INR', 'Indiranagar', 'Karnataka'),
  ('GGM', 'Gurugram', 'S48', 'Sector 48', 'Haryana'),
  ('UNK', 'Unknown', 'GEN', 'General', null)
on conflict (city_code, locality_code) do nothing;

alter table public.vendors
  add column if not exists public_vendor_id text,
  add column if not exists city_code text,
  add column if not exists locality_code text,
  add column if not exists locality_name text,
  add column if not exists public_vendor_number integer,
  add column if not exists public_id_assigned_at timestamptz,
  add column if not exists public_id_assigned_by uuid;

alter table public.vendor_terminals
  add column if not exists public_terminal_id text,
  add column if not exists terminal_number integer,
  add column if not exists locality_code text,
  add column if not exists locality_name text,
  add column if not exists public_id_assigned_at timestamptz;

alter table public.vendor_security_wallet_transactions
  add column if not exists public_vendor_id text,
  add column if not exists public_terminal_id text;

alter table public.vendor_credit_accounts
  add column if not exists public_vendor_id text;

alter table public.wallet_transaction_disputes
  add column if not exists public_vendor_id text;

create unique index if not exists uniq_vendors_public_vendor_id
  on public.vendors(public_vendor_id)
  where public_vendor_id is not null;

create unique index if not exists uniq_vendor_terminals_public_terminal_id
  on public.vendor_terminals(public_terminal_id)
  where public_terminal_id is not null;

create index if not exists idx_vendors_public_search
  on public.vendors(public_vendor_id, shop_name, owner_name, phone, city_code, locality_code);

create table if not exists public.vendor_location_history (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  public_vendor_id text,
  old_city_code text,
  old_locality_code text,
  old_address text,
  old_lat double precision,
  old_lng double precision,
  new_city_code text,
  new_locality_code text,
  new_address text,
  new_lat double precision,
  new_lng double precision,
  changed_by uuid,
  change_reason text not null default 'Location updated',
  created_at timestamptz not null default now()
);

create index if not exists idx_vendor_location_history_vendor
  on public.vendor_location_history(vendor_id, created_at desc);

create or replace function public.assign_sabsewa_local_vendor_id()
returns trigger
language plpgsql
as $$
declare
  v_number integer;
  v_city text;
  v_locality text;
begin
  if new.public_vendor_id is not null then
    new.public_vendor_id := upper(new.public_vendor_id);
    return new;
  end if;

  v_city := upper(coalesce(nullif(new.city_code, ''), 'UNK'));
  v_locality := upper(coalesce(nullif(new.locality_code, ''), 'GEN'));
  v_number := nextval('public.sabsewa_local_vendor_public_number_seq');

  new.city_code := v_city;
  new.locality_code := v_locality;
  new.public_vendor_number := v_number;
  new.public_vendor_id := format('SL-%s-%s-%s', v_city, v_locality, lpad(v_number::text, 6, '0'));
  new.public_id_assigned_at := coalesce(new.public_id_assigned_at, now());
  return new;
end;
$$;

drop trigger if exists trg_assign_sabsewa_local_vendor_id on public.vendors;
create trigger trg_assign_sabsewa_local_vendor_id
before insert on public.vendors
for each row execute function public.assign_sabsewa_local_vendor_id();

create or replace function public.record_vendor_location_change()
returns trigger
language plpgsql
as $$
begin
  if old.city_code is distinct from new.city_code
     or old.locality_code is distinct from new.locality_code
     or old.address is distinct from new.address
     or old.lat is distinct from new.lat
     or old.lng is distinct from new.lng then
    insert into public.vendor_location_history (
      vendor_id,
      public_vendor_id,
      old_city_code,
      old_locality_code,
      old_address,
      old_lat,
      old_lng,
      new_city_code,
      new_locality_code,
      new_address,
      new_lat,
      new_lng,
      changed_by,
      change_reason
    ) values (
      old.id,
      old.public_vendor_id,
      old.city_code,
      old.locality_code,
      old.address,
      old.lat,
      old.lng,
      new.city_code,
      new.locality_code,
      new.address,
      new.lat,
      new.lng,
      auth.uid(),
      'Location updated'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_record_vendor_location_change on public.vendors;
create trigger trg_record_vendor_location_change
after update on public.vendors
for each row execute function public.record_vendor_location_change();

create or replace function public.assign_sabsewa_local_terminal_id()
returns trigger
language plpgsql
as $$
declare
  v_vendor_public_id text;
  v_terminal_number integer;
begin
  if new.public_terminal_id is not null then
    new.public_terminal_id := upper(new.public_terminal_id);
    return new;
  end if;

  select public_vendor_id
    into v_vendor_public_id
    from public.vendors
   where id = new.vendor_id;

  if v_vendor_public_id is null then
    raise exception 'Vendor public ID must be assigned before terminal public ID.';
  end if;

  select coalesce(max(terminal_number), 0) + 1
    into v_terminal_number
    from public.vendor_terminals
   where vendor_id = new.vendor_id;

  new.terminal_number := v_terminal_number;
  new.public_terminal_id := format('%s-T%s', v_vendor_public_id, lpad(v_terminal_number::text, 2, '0'));
  new.public_id_assigned_at := coalesce(new.public_id_assigned_at, now());
  return new;
end;
$$;

drop trigger if exists trg_assign_sabsewa_local_terminal_id on public.vendor_terminals;
create trigger trg_assign_sabsewa_local_terminal_id
before insert on public.vendor_terminals
for each row execute function public.assign_sabsewa_local_terminal_id();

update public.vendors
   set city_code = upper(coalesce(nullif(city_code, ''), 'UNK')),
       locality_code = upper(coalesce(nullif(locality_code, ''), 'GEN'))
 where city_code is null or locality_code is null;

update public.vendors
   set public_vendor_number = nextval('public.sabsewa_local_vendor_public_number_seq'),
       public_id_assigned_at = now()
 where public_vendor_id is null;

update public.vendors
   set public_vendor_id = format('SL-%s-%s-%s', city_code, locality_code, lpad(public_vendor_number::text, 6, '0'))
 where public_vendor_id is null;

with numbered_terminals as (
  select id,
         vendor_id,
         row_number() over (partition by vendor_id order by created_at, id)::integer as rn
    from public.vendor_terminals
   where public_terminal_id is null
)
update public.vendor_terminals vt
   set terminal_number = nt.rn,
       public_terminal_id = format('%s-T%s', v.public_vendor_id, lpad(nt.rn::text, 2, '0')),
       public_id_assigned_at = now()
  from numbered_terminals nt
  join public.vendors v on v.id = nt.vendor_id
 where vt.id = nt.id;

update public.vendor_security_wallet_transactions tx
   set public_vendor_id = v.public_vendor_id,
       public_terminal_id = coalesce(
         (
           select t.public_terminal_id
             from public.vendor_terminals t
            where t.id = tx.terminal_id
            limit 1
         ),
         tx.public_terminal_id
       )
  from public.vendors v
 where tx.vendor_id = v.id
   and (tx.public_vendor_id is null or tx.public_terminal_id is null);

update public.vendor_credit_accounts ca
   set public_vendor_id = v.public_vendor_id
  from public.vendors v
 where ca.vendor_id = v.id
   and ca.public_vendor_id is null;

update public.wallet_transaction_disputes d
   set public_vendor_id = v.public_vendor_id
  from public.vendors v
 where d.vendor_id = v.id
   and d.public_vendor_id is null;

create or replace function public.fill_wallet_transaction_public_ids()
returns trigger
language plpgsql
as $$
begin
  if new.public_vendor_id is null then
    select public_vendor_id
      into new.public_vendor_id
      from public.vendors
     where id = new.vendor_id;
  end if;

  if new.public_terminal_id is null and new.terminal_id is not null then
    select public_terminal_id
      into new.public_terminal_id
      from public.vendor_terminals
     where id = new.terminal_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fill_wallet_transaction_public_ids on public.vendor_security_wallet_transactions;
create trigger trg_fill_wallet_transaction_public_ids
before insert or update of vendor_id, terminal_id, public_vendor_id, public_terminal_id
on public.vendor_security_wallet_transactions
for each row execute function public.fill_wallet_transaction_public_ids();

alter table public.company_location_codes enable row level security;
alter table public.vendor_location_history enable row level security;

drop policy if exists "Authenticated users read active location codes" on public.company_location_codes;
drop policy if exists "Admins manage location codes" on public.company_location_codes;
drop policy if exists "Admins read vendor location history" on public.vendor_location_history;
drop policy if exists "Vendor owners read own location history" on public.vendor_location_history;

create policy "Authenticated users read active location codes"
  on public.company_location_codes for select
  to authenticated
  using (is_active = true or public.is_company_admin());

create policy "Admins manage location codes"
  on public.company_location_codes for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "Admins read vendor location history"
  on public.vendor_location_history for select
  to authenticated
  using (public.is_company_admin());

create policy "Vendor owners read own location history"
  on public.vendor_location_history for select
  to authenticated
  using (public.owns_vendor(vendor_id) or public.is_company_admin());

-- Vendor IDs are public/business identifiers only. Vendors must not edit these fields.
