create extension if not exists pgcrypto;

create table if not exists public.exam_answer_keys (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  question_number integer not null,
  correct_answer text not null,
  instructional_area text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint exam_answer_keys_correct_answer_check
    check (correct_answer in ('A', 'B', 'C', 'D', 'E')),
  constraint exam_answer_keys_question_number_check
    check (question_number > 0),
  constraint exam_answer_keys_resource_question_unique
    unique (resource_id, question_number)
);

create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  score integer default 0,
  total_questions integer default 0,
  percentage numeric default 0,
  completed_at timestamp with time zone default now()
);

create table if not exists public.exam_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  question_number integer not null,
  selected_answer text not null,
  correct_answer text not null,
  is_correct boolean not null,
  instructional_area text,
  constraint exam_attempt_answers_selected_answer_check
    check (selected_answer in ('A', 'B', 'C', 'D', 'E')),
  constraint exam_attempt_answers_correct_answer_check
    check (correct_answer in ('A', 'B', 'C', 'D', 'E')),
  constraint exam_attempt_answers_question_number_check
    check (question_number > 0)
);

create index if not exists exam_answer_keys_resource_id_idx
  on public.exam_answer_keys(resource_id);

create index if not exists exam_attempts_user_id_idx
  on public.exam_attempts(user_id);

create index if not exists exam_attempts_resource_id_idx
  on public.exam_attempts(resource_id);

create index if not exists exam_attempt_answers_attempt_id_idx
  on public.exam_attempt_answers(attempt_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_exam_answer_keys_updated_at on public.exam_answer_keys;
create trigger set_exam_answer_keys_updated_at
before update on public.exam_answer_keys
for each row
execute function public.set_updated_at();

alter table public.exam_answer_keys enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_attempt_answers enable row level security;

grant select, insert, update, delete on table public.exam_answer_keys to authenticated;
grant select, insert, update, delete on table public.exam_attempts to authenticated;
grant select, insert, update, delete on table public.exam_attempt_answers to authenticated;

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
      and profiles.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  )
);

drop policy if exists "Students can read their own exam attempts" on public.exam_attempts;
create policy "Students can read their own exam attempts"
on public.exam_attempts
for select
to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()));

drop policy if exists "Students can create their own exam attempts" on public.exam_attempts;
create policy "Students can create their own exam attempts"
on public.exam_attempts
for insert
to authenticated
with check ((select auth.uid()) is not null and user_id = (select auth.uid()));

drop policy if exists "Students can update their own exam attempts" on public.exam_attempts;
create policy "Students can update their own exam attempts"
on public.exam_attempts
for update
to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()))
with check ((select auth.uid()) is not null and user_id = (select auth.uid()));

drop policy if exists "Students can delete their own exam attempts" on public.exam_attempts;
create policy "Students can delete their own exam attempts"
on public.exam_attempts
for delete
to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()));

drop policy if exists "Students can read their own exam attempt answers" on public.exam_attempt_answers;
create policy "Students can read their own exam attempt answers"
on public.exam_attempt_answers
for select
to authenticated
using (
  exists (
    select 1
    from public.exam_attempts
    where exam_attempts.id = exam_attempt_answers.attempt_id
      and exam_attempts.user_id = (select auth.uid())
  )
);

drop policy if exists "Students can create their own exam attempt answers" on public.exam_attempt_answers;
create policy "Students can create their own exam attempt answers"
on public.exam_attempt_answers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.exam_attempts
    where exam_attempts.id = exam_attempt_answers.attempt_id
      and exam_attempts.user_id = (select auth.uid())
  )
);

drop policy if exists "Students can update their own exam attempt answers" on public.exam_attempt_answers;
create policy "Students can update their own exam attempt answers"
on public.exam_attempt_answers
for update
to authenticated
using (
  exists (
    select 1
    from public.exam_attempts
    where exam_attempts.id = exam_attempt_answers.attempt_id
      and exam_attempts.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.exam_attempts
    where exam_attempts.id = exam_attempt_answers.attempt_id
      and exam_attempts.user_id = (select auth.uid())
  )
);

drop policy if exists "Students can delete their own exam attempt answers" on public.exam_attempt_answers;
create policy "Students can delete their own exam attempt answers"
on public.exam_attempt_answers
for delete
to authenticated
using (
  exists (
    select 1
    from public.exam_attempts
    where exam_attempts.id = exam_attempt_answers.attempt_id
      and exam_attempts.user_id = (select auth.uid())
  )
);
