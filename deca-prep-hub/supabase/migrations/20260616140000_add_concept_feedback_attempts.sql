create table if not exists public.concept_feedback_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid null references public.questions(id) on delete set null,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  event_id uuid null references public.events(id) on delete set null,
  original_response text not null,
  ai_feedback_json jsonb,
  ai_feedback_summary text,
  revised_response text,
  revision_feedback_json jsonb,
  improvement_summary text,
  score numeric,
  revision_score numeric,
  status text not null default 'feedback_given',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concept_feedback_attempts_status_check
    check (status in ('feedback_given', 'revised', 'completed', 'failed'))
);

create index if not exists concept_feedback_attempts_user_id_idx
  on public.concept_feedback_attempts(user_id);
create index if not exists concept_feedback_attempts_question_id_idx
  on public.concept_feedback_attempts(question_id);
create index if not exists concept_feedback_attempts_concept_id_idx
  on public.concept_feedback_attempts(concept_id);
create index if not exists concept_feedback_attempts_event_id_idx
  on public.concept_feedback_attempts(event_id);
create index if not exists concept_feedback_attempts_status_idx
  on public.concept_feedback_attempts(status);

drop trigger if exists set_concept_feedback_attempts_updated_at on public.concept_feedback_attempts;
create trigger set_concept_feedback_attempts_updated_at
before update on public.concept_feedback_attempts
for each row
execute function public.set_updated_at();

alter table public.concept_feedback_attempts enable row level security;

grant select, insert, update on table public.concept_feedback_attempts to authenticated;
grant select, insert, update, delete on table public.concept_feedback_attempts to service_role;

drop policy if exists "Students can read own concept feedback attempts" on public.concept_feedback_attempts;
create policy "Students can read own concept feedback attempts"
on public.concept_feedback_attempts
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Students can insert own concept feedback attempts" on public.concept_feedback_attempts;
create policy "Students can insert own concept feedback attempts"
on public.concept_feedback_attempts
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Students can update own concept feedback attempts" on public.concept_feedback_attempts;
create policy "Students can update own concept feedback attempts"
on public.concept_feedback_attempts
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Admins and advisors can read all concept feedback attempts" on public.concept_feedback_attempts;
create policy "Admins and advisors can read all concept feedback attempts"
on public.concept_feedback_attempts
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
