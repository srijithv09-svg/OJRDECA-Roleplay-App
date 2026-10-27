-- Allow authenticated Google accounts from any email domain.
-- Keep ownership, student defaults, and role-based management permissions.
create or replace function public.current_user_is_admin()
returns boolean language sql stable security invoker set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('admin', 'advisor')
  );
$$;
revoke all on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_is_admin() to authenticated, service_role;

drop policy "School users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select to authenticated
using (id = (select auth.uid()));

drop policy "School users create student profile" on public.profiles;
create policy "Users create student profile" on public.profiles for insert to authenticated
with check (id = (select auth.uid()) and role = 'student'
  and lower(email) = lower((select auth.jwt()) ->> 'email'));

drop policy "School users update own preferences" on public.profiles;
create policy "Users update own preferences" on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid())
  and lower(email) = lower((select auth.jwt()) ->> 'email'));

drop policy "School users read approved resources" on public.resources;
create policy "Users read approved resources" on public.resources for select to authenticated
using ((select auth.uid()) is not null
  and (approval_status = 'approved' or (select public.current_user_is_admin())));

drop policy "School users read own exam attempts" on public.exam_attempts;
create policy "Users read own exam attempts" on public.exam_attempts for select to authenticated
using (user_id = (select auth.uid()));

alter policy "School users read own exam answers" on public.exam_attempt_answers
rename to "Users read own exam answers";

drop policy "School users read own roleplay attempts" on public.roleplay_attempts;
create policy "Users read own roleplay attempts" on public.roleplay_attempts for select to authenticated
using (user_id = (select auth.uid()));

notify pgrst, 'reload schema';
