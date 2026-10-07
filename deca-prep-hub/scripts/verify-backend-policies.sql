-- Run as the project database owner. Every test write is rolled back.
begin;
do $$
declare r uuid; u uuid; mail text;
begin
  select id,email into u,mail from public.profiles where role='student' limit 1;
  if u is null then raise exception 'A student profile is required for the RLS test'; end if;
  perform set_config('test.student_uid',u::text,true);
  perform set_config('test.student_email',mail,true);
  select id,email into u,mail from public.profiles where role='advisor' limit 1;
  if u is null then raise exception 'An advisor profile is required for the RLS test'; end if;
  perform set_config('test.advisor_uid',u::text,true);
  perform set_config('test.advisor_email',mail,true);
  select id,email into u,mail from public.profiles where role='admin' limit 1;
  perform set_config('test.admin_uid',u::text,true);
  perform set_config('test.admin_email',mail,true);
  insert into public.resources(title,resource_type,approval_status)
    values ('Backend check pending','reference','pending') returning id into r;
  perform set_config('test.pending_id',r::text,true);
  insert into public.resources(title,resource_type,approval_status)
    values ('Backend check exam','exam','approved') returning id into r;
  perform set_config('test.exam_id',r::text,true);
  insert into public.exam_answer_keys(resource_id,question_number,correct_answer) values(r,1,'A');
  insert into public.exam_attempts(user_id,resource_id,score,total_questions,percentage)
    values(current_setting('test.student_uid')::uuid,r,1,1,100) returning id into r;
  perform set_config('test.attempt_id',r::text,true);
  insert into public.exam_attempt_answers(attempt_id,question_number,selected_answer,correct_answer,is_correct)
    values(r,1,'A','A',true);
  insert into public.exam_attempts(user_id,resource_id,score,total_questions,percentage)
    values(current_setting('test.advisor_uid')::uuid,current_setting('test.exam_id')::uuid,0,1,0) returning id into r;
  perform set_config('test.other_attempt_id',r::text,true);
  insert into public.roleplay_attempts(user_id,resource_id,response_notes)
    values(current_setting('test.student_uid')::uuid,current_setting('test.exam_id')::uuid,'Policy test') returning id into r;
  perform set_config('test.roleplay_attempt_id',r::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('test.student_uid'),'email',current_setting('test.student_email'),'role','authenticated')::text,true);
end $$;

set local role authenticated;
do $$
declare n integer;
begin
  perform public.ensure_current_profile();
  if public.current_user_is_admin() then raise exception 'Student identified as admin'; end if;
  if exists(select 1 from public.resources where id=current_setting('test.pending_id')::uuid) then raise exception 'Pending resource exposed'; end if;
  if not exists(select 1 from public.resources where id=current_setting('test.exam_id')::uuid) then raise exception 'Approved resource unavailable'; end if;
  if exists(select 1 from public.exam_answer_keys where resource_id=current_setting('test.exam_id')::uuid) then raise exception 'Answer key exposed'; end if;
  if not exists(select 1 from public.exam_attempts where id=current_setting('test.attempt_id')::uuid) then raise exception 'Own attempt unavailable'; end if;
  if exists(select 1 from public.exam_attempts where id=current_setting('test.other_attempt_id')::uuid) then raise exception 'Other user attempt exposed'; end if;
  if not exists(select 1 from public.exam_attempt_answers where attempt_id=current_setting('test.attempt_id')::uuid) then raise exception 'Own answers unavailable'; end if;
  if not exists(select 1 from public.roleplay_attempts where id=current_setting('test.roleplay_attempt_id')::uuid) then raise exception 'Own roleplay unavailable'; end if;
  update public.profiles set selected_cluster='marketing' where id=(select auth.uid());
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Own preference update failed'; end if;
  begin
    update public.profiles set role='admin' where id=(select auth.uid());
    raise exception 'Role self-promotion was allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.exam_attempts(user_id,resource_id,score) values(auth.uid(),current_setting('test.exam_id')::uuid,999);
    raise exception 'Fabricated score insert allowed';
  exception when insufficient_privilege then null; end;
  update public.resources set approval_status='approved' where id=current_setting('test.pending_id')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Student approved a resource'; end if;
end $$;
reset role;
do $$ begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('test.advisor_uid'),'email',current_setting('test.advisor_email'),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare n integer;
begin
  perform public.ensure_current_profile();
  if not public.current_user_is_admin() then raise exception 'Advisor management access unavailable'; end if;
  update public.resources set approval_status='approved',resource_type='reference' where id=current_setting('test.pending_id')::uuid;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Advisor approval failed'; end if;
  insert into public.exam_answer_keys(resource_id,question_number,correct_answer) values(current_setting('test.exam_id')::uuid,2,'B');
  update public.exam_answer_keys set correct_answer='C' where resource_id=current_setting('test.exam_id')::uuid and question_number=2;
  delete from public.exam_answer_keys where resource_id=current_setting('test.exam_id')::uuid and question_number=2;
end $$;
reset role;
do $$ begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('test.admin_uid'),'email',current_setting('test.admin_email'),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ begin
  perform public.ensure_current_profile();
  if not public.current_user_is_admin() then raise exception 'Admin management access unavailable'; end if;
end $$;
reset role;
do $$ begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('test.student_uid'),'email','outside@example.com','role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ begin
  if exists(select 1 from public.resources where id=current_setting('test.exam_id')::uuid) then raise exception 'Non-school access allowed'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform id from public.resources limit 1;
    raise exception 'Anonymous resource access allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: login profile, student/advisor/admin RLS, approval, answer-key CRUD, ownership, role escalation and forged-score protection; test writes rolled back' as result;
