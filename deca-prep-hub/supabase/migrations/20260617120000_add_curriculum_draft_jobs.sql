alter table public.key_sets
  add column if not exists source_performance_indicators jsonb not null default '[]'::jsonb,
  add column if not exists curriculum_draft_job_id uuid,
  add column if not exists ai_generated boolean not null default false,
  add column if not exists admin_reviewed boolean not null default false;

alter table public.concepts
  add column if not exists source_performance_indicators jsonb not null default '[]'::jsonb,
  add column if not exists curriculum_draft_job_id uuid,
  add column if not exists ai_generated boolean not null default false,
  add column if not exists admin_reviewed boolean not null default false;

alter table public.questions
  add column if not exists source_performance_indicators jsonb not null default '[]'::jsonb,
  add column if not exists curriculum_draft_job_id uuid;

create table if not exists public.curriculum_draft_jobs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  cluster text,
  source_type text not null,
  source_resource_id uuid references public.resources(id) on delete set null,
  source_metadata jsonb,
  selected_performance_indicators jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  generated_summary jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curriculum_draft_jobs_source_type_check
    check (source_type in ('extracted_pi', 'resource_pdf', 'manual_paste')),
  constraint curriculum_draft_jobs_status_check
    check (status in ('draft', 'generating', 'completed', 'failed', 'archived'))
);

create table if not exists public.curriculum_draft_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.curriculum_draft_jobs(id) on delete cascade,
  item_type text not null,
  proposed_key_set_id uuid,
  proposed_concept_id uuid,
  created_record_id uuid,
  title text,
  body jsonb,
  source_performance_indicators jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  constraint curriculum_draft_items_item_type_check
    check (item_type in ('key_set', 'concept', 'question', 'study_resource')),
  constraint curriculum_draft_items_status_check
    check (status in ('draft', 'needs_review', 'approved', 'rejected', 'archived'))
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'key_sets_curriculum_draft_job_id_fkey'
      and conrelid = 'public.key_sets'::regclass
  ) then
    alter table public.key_sets
      add constraint key_sets_curriculum_draft_job_id_fkey
      foreign key (curriculum_draft_job_id)
      references public.curriculum_draft_jobs(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'concepts_curriculum_draft_job_id_fkey'
      and conrelid = 'public.concepts'::regclass
  ) then
    alter table public.concepts
      add constraint concepts_curriculum_draft_job_id_fkey
      foreign key (curriculum_draft_job_id)
      references public.curriculum_draft_jobs(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_curriculum_draft_job_id_fkey'
      and conrelid = 'public.questions'::regclass
  ) then
    alter table public.questions
      add constraint questions_curriculum_draft_job_id_fkey
      foreign key (curriculum_draft_job_id)
      references public.curriculum_draft_jobs(id)
      on delete set null;
  end if;
end $$;

create index if not exists key_sets_curriculum_draft_job_id_idx
on public.key_sets(curriculum_draft_job_id);

create index if not exists concepts_curriculum_draft_job_id_idx
on public.concepts(curriculum_draft_job_id);

create index if not exists questions_curriculum_draft_job_id_idx
on public.questions(curriculum_draft_job_id);

create index if not exists curriculum_draft_jobs_created_by_idx
on public.curriculum_draft_jobs(created_by);

create index if not exists curriculum_draft_jobs_event_id_idx
on public.curriculum_draft_jobs(event_id);

create index if not exists curriculum_draft_jobs_status_idx
on public.curriculum_draft_jobs(status);

create index if not exists curriculum_draft_items_job_id_idx
on public.curriculum_draft_items(job_id);

create index if not exists curriculum_draft_items_created_record_id_idx
on public.curriculum_draft_items(created_record_id);

drop trigger if exists set_curriculum_draft_jobs_updated_at
on public.curriculum_draft_jobs;

create trigger set_curriculum_draft_jobs_updated_at
before update on public.curriculum_draft_jobs
for each row
execute function public.set_updated_at();

alter table public.curriculum_draft_jobs enable row level security;
alter table public.curriculum_draft_items enable row level security;

grant select, insert, update, delete on table public.curriculum_draft_jobs to authenticated;
grant select, insert, update, delete on table public.curriculum_draft_items to authenticated;
grant select, insert, update, delete on table public.curriculum_draft_jobs to service_role;
grant select, insert, update, delete on table public.curriculum_draft_items to service_role;

drop policy if exists "Admins and advisors can manage curriculum draft jobs"
on public.curriculum_draft_jobs;

create policy "Admins and advisors can manage curriculum draft jobs"
on public.curriculum_draft_jobs
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

drop policy if exists "Admins and advisors can manage curriculum draft items"
on public.curriculum_draft_items;

create policy "Admins and advisors can manage curriculum draft items"
on public.curriculum_draft_items
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
