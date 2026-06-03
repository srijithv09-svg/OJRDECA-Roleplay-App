create table if not exists public.roleplay_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  response_notes text,
  performance_indicator_notes text,
  self_reflection text,
  judge_feedback text,
  audio_path text,
  transcript text,
  transcript_status text not null default 'none',
  ai_feedback_status text not null default 'none',
  ai_overall_score numeric,
  ai_feedback_json jsonb,
  strengths text[],
  growth_areas text[],
  confidence_rating integer,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint roleplay_attempts_transcript_status_check
    check (transcript_status in ('none', 'pending', 'complete', 'failed')),
  constraint roleplay_attempts_ai_feedback_status_check
    check (ai_feedback_status in ('none', 'pending', 'complete', 'failed')),
  constraint roleplay_attempts_confidence_rating_check
    check (confidence_rating is null or confidence_rating between 1 and 5)
);

create index if not exists roleplay_attempts_user_created_at_idx
  on public.roleplay_attempts (user_id, created_at desc);

create index if not exists roleplay_attempts_resource_user_created_at_idx
  on public.roleplay_attempts (resource_id, user_id, created_at desc);

drop trigger if exists set_roleplay_attempts_updated_at on public.roleplay_attempts;

create trigger set_roleplay_attempts_updated_at
before update on public.roleplay_attempts
for each row
execute function public.set_updated_at();

alter table public.roleplay_attempts enable row level security;

drop policy if exists "Students can insert own roleplay attempts" on public.roleplay_attempts;
drop policy if exists "Students can read own roleplay attempts" on public.roleplay_attempts;
drop policy if exists "Students can update own roleplay attempts" on public.roleplay_attempts;
drop policy if exists "Students can delete own roleplay attempts" on public.roleplay_attempts;

create policy "Students can insert own roleplay attempts"
on public.roleplay_attempts
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Students can read own roleplay attempts"
on public.roleplay_attempts
for select
to authenticated
using (auth.uid() = user_id);

create policy "Students can update own roleplay attempts"
on public.roleplay_attempts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Students can delete own roleplay attempts"
on public.roleplay_attempts
for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.roleplay_attempts to authenticated;
