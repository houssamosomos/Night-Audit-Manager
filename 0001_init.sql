-- =============================================================================
-- Night Audit Manager Pro - PostgreSQL / Supabase schema
-- Migration 0001: core schema, indexes, constraints, RLS
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- ENUM types
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum
    ('super_admin','hotel_admin','manager','receptionist','night_auditor','accountant');
exception when duplicate_object then null; end $$;

do $$ begin
  create type room_status as enum
    ('available','occupied','reserved','dirty','clean','out_of_order','maintenance');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reservation_status as enum
    ('pending','confirmed','checked_in','checked_out','cancelled','no_show');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum
    ('cash','credit_card','bank_transfer','online','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_kind as enum ('payment','deposit','refund','charge','discount');
exception when duplicate_object then null; end $$;

do $$ begin
  create type audit_status as enum ('open','in_progress','closed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- hotels (tenant root)
-- ---------------------------------------------------------------------------
create table if not exists hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  address text,
  phone text,
  email text,
  currency text not null default 'MAD',
  tax_rate numeric(5,2) not null default 10.00,
  checkin_time time not null default '14:00',
  checkout_time time not null default '12:00',
  business_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- users (mirrors auth.users; profile + tenant binding)
-- ---------------------------------------------------------------------------
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  hotel_id uuid references hotels(id) on delete cascade,
  email text not null,
  full_name text,
  role user_role not null default 'receptionist',
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_users_hotel on users(hotel_id);

create table if not exists permissions (
  id uuid primary key default gen_random_uuid(),
  role user_role not null,
  resource text not null,
  can_read boolean not null default true,
  can_write boolean not null default false,
  can_delete boolean not null default false,
  unique(role, resource)
);

-- ---------------------------------------------------------------------------
-- room_types & rooms
-- ---------------------------------------------------------------------------
create table if not exists room_types (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  name text not null,
  base_price numeric(12,2) not null default 0 check (base_price >= 0),
  capacity int not null default 2 check (capacity > 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_room_types_hotel on room_types(hotel_id);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  room_type_id uuid references room_types(id) on delete set null,
  number text not null,
  floor int not null default 0,
  capacity int not null default 2 check (capacity > 0),
  base_price numeric(12,2) not null default 0 check (base_price >= 0),
  status room_status not null default 'available',
  housekeeping_clean boolean not null default true,
  out_of_order boolean not null default false,
  created_at timestamptz not null default now(),
  unique(hotel_id, number)
);
create index if not exists idx_rooms_hotel on rooms(hotel_id);
create index if not exists idx_rooms_status on rooms(hotel_id, status);

-- ---------------------------------------------------------------------------
-- guests
-- ---------------------------------------------------------------------------
create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  nationality text,
  id_number text,
  date_of_birth date,
  address text,
  preferences text,
  created_at timestamptz not null default now()
);
create index if not exists idx_guests_hotel on guests(hotel_id);
create index if not exists idx_guests_name on guests(hotel_id, full_name);

-- ---------------------------------------------------------------------------
-- reservations
-- ---------------------------------------------------------------------------
create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  code text not null,
  guest_id uuid references guests(id) on delete set null,
  room_id uuid references rooms(id) on delete set null,
  status reservation_status not null default 'confirmed',
  arrival_date date not null,
  departure_date date not null,
  guests_count int not null default 1 check (guests_count > 0),
  room_rate numeric(12,2) not null default 0 check (room_rate >= 0),
  tax_rate numeric(5,2) not null default 10.00,
  extra_charges numeric(12,2) not null default 0,
  source text default 'direct',
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(hotel_id, code),
  check (departure_date >= arrival_date)
);
create index if not exists idx_res_hotel on reservations(hotel_id);
create index if not exists idx_res_dates on reservations(hotel_id, arrival_date, departure_date);
create index if not exists idx_res_status on reservations(hotel_id, status);

create table if not exists reservation_guests (
  reservation_id uuid not null references reservations(id) on delete cascade,
  guest_id uuid not null references guests(id) on delete cascade,
  is_primary boolean not null default false,
  primary key (reservation_id, guest_id)
);

create table if not exists check_ins (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references users(id) on delete set null
);

create table if not exists check_outs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  checked_out_at timestamptz not null default now(),
  checked_out_by uuid references users(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- cashier sessions & transactions / payments / expenses
-- ---------------------------------------------------------------------------
create table if not exists cashier_sessions (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  business_date date not null,
  opened_by uuid references users(id) on delete set null,
  opened_at timestamptz not null default now(),
  opening_balance numeric(12,2) not null default 0,
  closed_by uuid references users(id) on delete set null,
  closed_at timestamptz,
  closing_balance numeric(12,2),
  expected_balance numeric(12,2),
  is_closed boolean not null default false
);
create index if not exists idx_cash_sessions_hotel on cashier_sessions(hotel_id, business_date);

create table if not exists cashier_transactions (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  session_id uuid references cashier_sessions(id) on delete set null,
  reservation_id uuid references reservations(id) on delete set null,
  kind payment_kind not null,
  method payment_method not null default 'cash',
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'MAD',
  note text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_cash_tx_hotel on cashier_transactions(hotel_id, created_at);
create index if not exists idx_cash_tx_session on cashier_transactions(session_id);

-- Convenience view of guest-facing payments
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  reservation_id uuid references reservations(id) on delete set null,
  method payment_method not null default 'cash',
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'MAD',
  received_at timestamptz not null default now(),
  received_by uuid references users(id) on delete set null
);
create index if not exists idx_payments_hotel on payments(hotel_id, received_at);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  category text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'MAD',
  note text,
  spent_at timestamptz not null default now(),
  created_by uuid references users(id) on delete set null
);
create index if not exists idx_expenses_hotel on expenses(hotel_id, spent_at);

-- ---------------------------------------------------------------------------
-- night_audits (immutable financial closure)
-- ---------------------------------------------------------------------------
create table if not exists night_audits (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  business_date date not null,
  status audit_status not null default 'open',
  room_revenue numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  extra_charges numeric(12,2) not null default 0,
  payments_total numeric(12,2) not null default 0,
  arrivals_count int not null default 0,
  departures_count int not null default 0,
  occupancy_rate numeric(5,2) not null default 0,
  cash_variance numeric(12,2) not null default 0,
  snapshot jsonb,
  closed_by uuid references users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(hotel_id, business_date)  -- prevents duplicate closure of same date
);
create index if not exists idx_audits_hotel on night_audits(hotel_id, business_date);

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_logs_hotel on audit_logs(hotel_id, created_at);

create table if not exists hotel_settings (
  hotel_id uuid primary key references hotels(id) on delete cascade,
  payment_methods jsonb not null default '["cash","credit_card","bank_transfer"]'::jsonb,
  room_categories jsonb not null default '[]'::jsonb,
  default_language text not null default 'en',
  default_theme text not null default 'dark',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions for RLS
-- ---------------------------------------------------------------------------
create or replace function current_hotel_id() returns uuid
language sql stable security definer set search_path = public as $$
  select hotel_id from users where id = auth.uid();
$$;

create or replace function current_user_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from users where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security: hotel-level isolation on every tenant table
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'rooms','room_types','guests','reservations','cashier_sessions',
    'cashier_transactions','payments','expenses','night_audits',
    'audit_logs','hotel_settings'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format($p$
      drop policy if exists tenant_isolation on %1$I;
      create policy tenant_isolation on %1$I
        using (hotel_id = current_hotel_id())
        with check (hotel_id = current_hotel_id());
    $p$, t);
  end loop;
end $$;

-- users: a user can read peers in the same hotel; only admins can write
alter table users enable row level security;
drop policy if exists users_read on users;
create policy users_read on users
  for select using (hotel_id = current_hotel_id() or id = auth.uid());
drop policy if exists users_admin_write on users;
create policy users_admin_write on users
  for all using (
    hotel_id = current_hotel_id()
    and current_user_role() in ('super_admin','hotel_admin')
  ) with check (hotel_id = current_hotel_id());

-- hotels: members can read their own hotel; admins update it
alter table hotels enable row level security;
drop policy if exists hotels_read on hotels;
create policy hotels_read on hotels
  for select using (id = current_hotel_id());
drop policy if exists hotels_admin on hotels;
create policy hotels_admin on hotels
  for update using (
    id = current_hotel_id()
    and current_user_role() in ('super_admin','hotel_admin')
  );

-- night_audits: no UPDATE/DELETE once closed (immutable financial record)
drop policy if exists audits_no_mutate_closed on night_audits;
create policy audits_no_mutate_closed on night_audits
  for update using (
    hotel_id = current_hotel_id() and status <> 'closed'
  );
revoke delete on night_audits from authenticated;

-- ---------------------------------------------------------------------------
-- Trigger: keep reservations.updated_at fresh
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_res_touch on reservations;
create trigger trg_res_touch before update on reservations
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Default permission matrix (seed)
-- ---------------------------------------------------------------------------
insert into permissions (role, resource, can_read, can_write, can_delete) values
  ('super_admin','*', true, true, true),
  ('hotel_admin','*', true, true, true),
  ('manager','reservations', true, true, false),
  ('manager','reports', true, false, false),
  ('receptionist','reservations', true, true, false),
  ('receptionist','guests', true, true, false),
  ('night_auditor','night_audits', true, true, false),
  ('accountant','payments', true, true, false),
  ('accountant','reports', true, false, false)
on conflict (role, resource) do nothing;
