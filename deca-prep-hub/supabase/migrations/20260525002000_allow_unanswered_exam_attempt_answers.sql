alter table public.exam_attempt_answers
drop constraint if exists exam_attempt_answers_selected_answer_check;

alter table public.exam_attempt_answers
add constraint exam_attempt_answers_selected_answer_check
check (selected_answer in ('A', 'B', 'C', 'D', 'E', 'UNANSWERED'));
