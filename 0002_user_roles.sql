-- =============================================================================
-- Night Audit Manager Pro - Migration 0002
-- Role catalog table (`user_roles`) + per-hotel role assignment support.
-- Additive only; does not alter existing financial data.
-- =============================================================================

-- Catalog of roles available in the system (human-readable labels + rank).
create table if not exists user_roles (
  role          user_role primary key,
  label_en      text not null,
  label_fr      text not null,
  label_ar      text not null,
  rank          int  not null default 0,  -- higher = more privileged
  description   text,
  created_at    timestamptz not null default now()
);

insert into user_roles (role, label_en, label_fr, label_ar, rank, description) values
  ('super_admin',  'Super Admin',  'Super administrateur', 'مشرف عام',       100, 'Full platform access across all hotels'),
  ('hotel_admin',  'Hotel Admin',  'Administrateur',       'مدير الفندق',     90,  'Full access within a single hotel'),
  ('manager',      'Manager',      'Responsable',          'مدير',            70,  'Operations oversight and reporting'),
  ('accountant',   'Accountant',   'Comptable',            'محاسب',           60,  'Cashier, payments and financial reports'),
  ('night_auditor','Night Auditor','Auditeur de nuit',     'مدقق ليلي',      50,  'Night audit workflow and daily close'),
  ('receptionist', 'Receptionist', 'Réceptionniste',       'موظف استقبال',   40,  'Front-desk reservations and check-in/out')
on conflict (role) do nothing;

-- Optional explicit assignment table (a user may hold a role in several hotels).
create table if not exists user_role_assignments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  hotel_id    uuid not null references hotels(id) on delete cascade,
  role        user_role not null references user_roles(role),
  assigned_by uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (user_id, hotel_id, role)
);
create index if not exists idx_role_assign_hotel on user_role_assignments(hotel_id);
create index if not exists idx_role_assign_user  on user_role_assignments(user_id);

-- The role catalog is global reference data: readable by any authenticated
-- user, never writable from the client.
alter table user_roles enable row level security;
drop policy if exists user_roles_read on user_roles;
create policy user_roles_read on user_roles for select using (auth.role() = 'authenticated');

-- Assignments follow the same hotel-isolation rule as every tenant table.
alter table user_role_assignments enable row level security;
drop policy if exists role_assign_tenant on user_role_assignments;
create policy role_assign_tenant on user_role_assignments
  using (hotel_id = current_hotel_id())
  with check (
    hotel_id = current_hotel_id()
    and current_user_role() in ('super_admin','hotel_admin')
  );
