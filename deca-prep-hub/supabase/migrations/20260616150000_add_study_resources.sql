create table if not exists public.study_resources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid null references public.events(id) on delete set null,
  key_set_id uuid null references public.key_sets(id) on delete set null,
  concept_id uuid null references public.concepts(id) on delete set null,
  title text not null,
  description text,
  resource_kind text not null,
  url text,
  storage_path text,
  content text,
  status text not null default 'draft',
  created_by uuid null references auth.users(id) on delete set null,
  approved_by uuid null references auth.users(id) on delete set null,
  approved_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint study_resources_title_not_blank_check check (length(trim(title)) > 0),
  constraint study_resources_kind_not_blank_check check (length(trim(resource_kind)) > 0),
  constraint study_resources_status_check check (status in ('draft', 'needs_review', 'approved', 'archived', 'rejected'))
);

create index if not exists study_resources_event_id_idx on public.study_resources(event_id);
create index if not exists study_resources_key_set_id_idx on public.study_resources(key_set_id);
create index if not exists study_resources_concept_id_idx on public.study_resources(concept_id);
create index if not exists study_resources_status_idx on public.study_resources(status);
create index if not exists study_resources_resource_kind_idx on public.study_resources(resource_kind);
create index if not exists study_resources_created_by_idx on public.study_resources(created_by);

drop trigger if exists set_study_resources_updated_at on public.study_resources;
create trigger set_study_resources_updated_at
before update on public.study_resources
for each row
execute function public.set_updated_at();

alter table public.study_resources enable row level security;

grant select on table public.study_resources to anon, authenticated, service_role;
grant insert, update, delete on table public.study_resources to authenticated, service_role;

drop policy if exists "Authenticated users can read approved study resources" on public.study_resources;
create policy "Authenticated users can read approved study resources"
on public.study_resources
for select
to authenticated
using (status = 'approved');

drop policy if exists "Admins and advisors can manage study resources" on public.study_resources;
create policy "Admins and advisors can manage study resources"
on public.study_resources
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'advisor')
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'advisor')
  )
);
