-- Retire removed Learn/AI features. Content was backed up before this migration.
-- Do not use CASCADE: an unexpected active dependency must stop the migration.
drop table if exists
  public.events, public.key_sets, public.concepts, public.key_set_concepts,
  public.questions, public.question_attempts, public.concept_mastery,
  public.roleplay_scenarios, public.ai_extraction_jobs, public.resource_classifications,
  public.ai_extracted_answer_keys, public.rubrics, public.rubric_criteria,
  public.roleplay_performance_indicators, public.event_aliases,
  public.concept_feedback_attempts, public.study_resources, public.curriculum_draft_jobs;

alter table public.roleplay_attempts
  drop column if exists ai_feedback_status,
  drop column if exists ai_overall_score,
  drop column if exists ai_feedback_json,
  drop column if exists strengths,
  drop column if exists growth_areas;

-- Retain the two inert resources PI columns while older deployed clients still
-- select them. Current app code neither reads nor writes them.
create or replace function public.current_user_is_admin()
returns boolean language sql stable security invoker set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) like '%@ojrsd.net'
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role in ('admin', 'advisor')
    );
$$;
alter function public.set_updated_at() security invoker;
revoke all on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_is_admin() to authenticated, service_role;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.ensure_current_profile() from public, anon;
grant execute on function public.ensure_current_profile() to authenticated, service_role;

-- Replace overlapping permissive policies as one explicit access model.
do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in
      ('profiles','resources','exam_answer_keys','exam_attempts','exam_attempt_answers','roleplay_attempts')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$$;

revoke all on public.profiles, public.resources, public.exam_answer_keys,
  public.exam_attempts, public.exam_attempt_answers, public.roleplay_attempts
  from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id,email,role,created_at,updated_at) on public.profiles to authenticated;
grant update (email,updated_at,selected_cluster) on public.profiles to authenticated;
grant select, update on public.resources to authenticated;
grant select, insert, update, delete on public.exam_answer_keys to authenticated;
grant select on public.exam_attempts, public.exam_attempt_answers, public.roleplay_attempts to authenticated;

create policy "School users read own profile" on public.profiles for select to authenticated
using (id = (select auth.uid()) and lower(coalesce((select auth.jwt()) ->> 'email','')) like '%@ojrsd.net');
create policy "School users create student profile" on public.profiles for insert to authenticated
with check (id = (select auth.uid()) and role = 'student'
  and lower(email) = lower((select auth.jwt()) ->> 'email')
  and lower(email) like '%@ojrsd.net');
create policy "School users update own preferences" on public.profiles for update to authenticated
using (id = (select auth.uid()) and lower(coalesce((select auth.jwt()) ->> 'email','')) like '%@ojrsd.net')
with check (id = (select auth.uid()) and lower(email) = lower((select auth.jwt()) ->> 'email')
  and lower(email) like '%@ojrsd.net');

create policy "School users read approved resources" on public.resources for select to authenticated
using (lower(coalesce((select auth.jwt()) ->> 'email','')) like '%@ojrsd.net'
  and (approval_status = 'approved' or (select public.current_user_is_admin())));
create policy "Admins and advisors update resources" on public.resources for update to authenticated
using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy "Admins and advisors manage answer keys" on public.exam_answer_keys for all to authenticated
using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

-- Attempts and graded answers are written only by authenticated server routes,
-- preventing direct client writes of fabricated scores.
create policy "School users read own exam attempts" on public.exam_attempts for select to authenticated
using (user_id = (select auth.uid()) and lower(coalesce((select auth.jwt()) ->> 'email','')) like '%@ojrsd.net');
create policy "School users read own exam answers" on public.exam_attempt_answers for select to authenticated
using (exists (select 1 from public.exam_attempts a
  where a.id = attempt_id and a.user_id = (select auth.uid())));
create policy "School users read own roleplay attempts" on public.roleplay_attempts for select to authenticated
using (user_id = (select auth.uid()) and lower(coalesce((select auth.jwt()) ->> 'email','')) like '%@ojrsd.net');

-- The app serves private files through server-authorized signed URLs.
insert into storage.buckets (id,name,public,allowed_mime_types)
values ('resources','resources',false,array['application/pdf'])
on conflict (id) do update set public = false, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('roleplay-audio','roleplay-audio',false,26214400,
  array['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
