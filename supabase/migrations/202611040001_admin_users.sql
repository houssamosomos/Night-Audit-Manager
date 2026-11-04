-- Night Audit Manager: application roles and admin bootstrap
-- Run this migration in Supabase SQL Editor before deploying the frontend.

create table if not exists public.app_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

-- Backfill existing Auth users as ordinary users.
insert into public.app_profiles (user_id, full_name, role)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(u.email, ''), '@', 1)),
  'user'
from auth.users u
on conflict (user_id) do nothing;

-- Bootstrap the existing project owner account documented in SETUP_AR.txt.
-- If this UUID is not your Auth user, replace it with your own Auth user UUID.
update public.app_profiles
set role = 'admin'
where user_id = 'e2cc0a20-4534-45a5-9135-11c2382134fc'::uuid;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_profiles (user_id, full_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    'user'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  );
$$;

alter table public.app_profiles enable row level security;
revoke all on public.app_profiles from anon;
grant select on public.app_profiles to authenticated;
revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

drop policy if exists "Users can read own profile or admins can read all" on public.app_profiles;
create policy "Users can read own profile or admins can read all"
on public.app_profiles
for select
to authenticated
using (user_id = auth.uid() or public.is_app_admin());

-- Deliberately no client INSERT/UPDATE policy: users cannot promote themselves to admin.
