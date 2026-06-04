alter table public.profiles
  add column if not exists updated_at timestamp with time zone;

update public.profiles
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.profiles
  alter column updated_at set default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', constraint_record.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'admin', 'advisor'));

create or replace function public.ensure_current_profile()
returns public.profiles
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_profile public.profiles;
begin
  insert into public.profiles (id, email, role, created_at, updated_at)
  values (auth.uid(), auth.email(), 'student', now(), now())
  on conflict (id) do update
  set
    email = excluded.email,
    updated_at = now()
  returning * into next_profile;

  return next_profile;
end;
$$;

drop policy if exists "Admins can manage exam answer keys" on public.exam_answer_keys;
create policy "Admins can manage exam answer keys"
on public.exam_answer_keys
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role in ('admin', 'advisor')
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role in ('admin', 'advisor')
  )
);
