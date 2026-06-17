alter table public.profiles
  add column if not exists selected_cluster text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_selected_cluster_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_selected_cluster_check
      check (
        selected_cluster is null
        or selected_cluster in (
          'entrepreneurship',
          'marketing',
          'business_management_administration',
          'hospitality_tourism',
          'finance'
        )
      );
  end if;
end $$;

create index if not exists profiles_selected_cluster_idx
  on public.profiles (selected_cluster);

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
