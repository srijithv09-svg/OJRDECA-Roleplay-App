create table if not exists public.ai_extracted_answer_keys (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  ai_extraction_job_id uuid references public.ai_extraction_jobs(id) on delete set null,
  possible_exam_resource_id uuid references public.resources(id) on delete set null,
  title text,
  detected_event_code text,
  detected_year integer,
  answers jsonb not null,
  status text not null default 'needs_review',
  admin_reviewed boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint ai_extracted_answer_keys_status_check check (
    status in ('draft', 'needs_review', 'approved', 'rejected', 'archived')
  )
);

create table if not exists public.rubrics (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid references public.resources(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  ai_extraction_job_id uuid references public.ai_extraction_jobs(id) on delete set null,
  title text,
  rubric_type text,
  status text not null default 'needs_review',
  ai_extracted boolean not null default true,
  admin_reviewed boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint rubrics_status_check check (
    status in ('draft', 'needs_review', 'approved', 'rejected', 'archived')
  )
);

create table if not exists public.rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references public.rubrics(id) on delete cascade,
  name text not null,
  description text,
  max_points numeric,
  performance_levels jsonb,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_ai_extracted_answer_keys_resource_id
on public.ai_extracted_answer_keys(resource_id);

create index if not exists idx_ai_extracted_answer_keys_ai_extraction_job_id
on public.ai_extracted_answer_keys(ai_extraction_job_id);

create index if not exists idx_ai_extracted_answer_keys_possible_exam_resource_id
on public.ai_extracted_answer_keys(possible_exam_resource_id);

create index if not exists idx_ai_extracted_answer_keys_status
on public.ai_extracted_answer_keys(status);

create index if not exists idx_ai_extracted_answer_keys_admin_reviewed
on public.ai_extracted_answer_keys(admin_reviewed);

create index if not exists idx_rubrics_resource_id
on public.rubrics(resource_id);

create index if not exists idx_rubrics_event_id
on public.rubrics(event_id);

create index if not exists idx_rubrics_ai_extraction_job_id
on public.rubrics(ai_extraction_job_id);

create index if not exists idx_rubrics_status
on public.rubrics(status);

create index if not exists idx_rubrics_admin_reviewed
on public.rubrics(admin_reviewed);

create index if not exists idx_rubric_criteria_rubric_id
on public.rubric_criteria(rubric_id);

drop trigger if exists set_ai_extracted_answer_keys_updated_at on public.ai_extracted_answer_keys;
create trigger set_ai_extracted_answer_keys_updated_at
before update on public.ai_extracted_answer_keys
for each row
execute function public.set_updated_at();

drop trigger if exists set_rubrics_updated_at on public.rubrics;
create trigger set_rubrics_updated_at
before update on public.rubrics
for each row
execute function public.set_updated_at();

drop trigger if exists set_rubric_criteria_updated_at on public.rubric_criteria;
create trigger set_rubric_criteria_updated_at
before update on public.rubric_criteria
for each row
execute function public.set_updated_at();

alter table public.ai_extracted_answer_keys enable row level security;
alter table public.rubrics enable row level security;
alter table public.rubric_criteria enable row level security;

grant select, insert, update, delete on table
  public.ai_extracted_answer_keys,
  public.rubrics,
  public.rubric_criteria
to service_role;

grant select, insert, update on table
  public.ai_extracted_answer_keys,
  public.rubrics,
  public.rubric_criteria
to authenticated;

create policy "Admins and advisors can read extracted answer keys"
on public.ai_extracted_answer_keys
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role in ('admin', 'advisor')
  )
);

create policy "Admins and advisors can insert extracted answer keys"
on public.ai_extracted_answer_keys
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role in ('admin', 'advisor')
  )
);

create policy "Admins and advisors can update extracted answer keys"
on public.ai_extracted_answer_keys
for update
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

create policy "Admins and advisors can read rubrics"
on public.rubrics
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role in ('admin', 'advisor')
  )
);

create policy "Admins and advisors can insert rubrics"
on public.rubrics
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role in ('admin', 'advisor')
  )
);

create policy "Admins and advisors can update rubrics"
on public.rubrics
for update
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

create policy "Admins and advisors can read rubric criteria"
on public.rubric_criteria
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role in ('admin', 'advisor')
  )
);

create policy "Admins and advisors can insert rubric criteria"
on public.rubric_criteria
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role in ('admin', 'advisor')
  )
);

create policy "Admins and advisors can update rubric criteria"
on public.rubric_criteria
for update
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
