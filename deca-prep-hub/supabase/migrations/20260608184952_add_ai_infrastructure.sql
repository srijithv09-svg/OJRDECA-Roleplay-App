create table if not exists public.ai_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid references public.resources(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  job_type text not null,
  status text not null default 'pending',
  model text,
  input_storage_path text,
  input_metadata jsonb,
  raw_output_json jsonb,
  validated_output_json jsonb,
  confidence_score numeric,
  error_message text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint ai_extraction_jobs_job_type_check check (
    job_type in (
      'resource_classification',
      'exam_extraction',
      'answer_key_extraction',
      'roleplay_extraction',
      'rubric_extraction',
      'concept_feedback',
      'roleplay_transcript_grading'
    )
  ),
  constraint ai_extraction_jobs_status_check check (
    status in (
      'pending',
      'processing',
      'completed',
      'failed',
      'needs_review',
      'approved',
      'rejected'
    )
  )
);

create table if not exists public.resource_classifications (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  ai_extraction_job_id uuid references public.ai_extraction_jobs(id) on delete set null,
  classification text not null,
  confidence numeric,
  reasoning_summary text,
  detected_event_code text,
  detected_event_name text,
  detected_year integer,
  warnings jsonb,
  admin_confirmed boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint resource_classifications_classification_check check (
    classification in (
      'exam',
      'answer_key',
      'roleplay',
      'judge_rubric',
      'instructional_resource',
      'unknown'
    )
  )
);

create index if not exists idx_ai_extraction_jobs_resource_id
on public.ai_extraction_jobs(resource_id);

create index if not exists idx_ai_extraction_jobs_user_id
on public.ai_extraction_jobs(user_id);

create index if not exists idx_ai_extraction_jobs_job_type
on public.ai_extraction_jobs(job_type);

create index if not exists idx_ai_extraction_jobs_status
on public.ai_extraction_jobs(status);

create index if not exists idx_ai_extraction_jobs_created_at
on public.ai_extraction_jobs(created_at);

create index if not exists idx_resource_classifications_resource_id
on public.resource_classifications(resource_id);

create index if not exists idx_resource_classifications_ai_extraction_job_id
on public.resource_classifications(ai_extraction_job_id);

create index if not exists idx_resource_classifications_classification
on public.resource_classifications(classification);

create index if not exists idx_resource_classifications_admin_confirmed
on public.resource_classifications(admin_confirmed);

drop trigger if exists set_ai_extraction_jobs_updated_at on public.ai_extraction_jobs;
create trigger set_ai_extraction_jobs_updated_at
before update on public.ai_extraction_jobs
for each row
execute function public.set_updated_at();

drop trigger if exists set_resource_classifications_updated_at on public.resource_classifications;
create trigger set_resource_classifications_updated_at
before update on public.resource_classifications
for each row
execute function public.set_updated_at();

alter table public.ai_extraction_jobs enable row level security;
alter table public.resource_classifications enable row level security;

grant select, insert, update, delete on table
  public.ai_extraction_jobs,
  public.resource_classifications
to service_role;

grant select, insert, update on table
  public.ai_extraction_jobs,
  public.resource_classifications
to authenticated;

create policy "Admins and advisors can read AI extraction jobs"
on public.ai_extraction_jobs
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

create policy "Admins and advisors can insert AI extraction jobs"
on public.ai_extraction_jobs
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

create policy "Admins and advisors can update AI extraction jobs"
on public.ai_extraction_jobs
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

create policy "Admins and advisors can read resource classifications"
on public.resource_classifications
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

create policy "Admins and advisors can insert resource classifications"
on public.resource_classifications
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

create policy "Admins and advisors can update resource classifications"
on public.resource_classifications
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
