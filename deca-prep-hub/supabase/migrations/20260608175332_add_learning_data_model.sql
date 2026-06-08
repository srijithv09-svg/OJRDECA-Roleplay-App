create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  cluster text,
  event_type text not null,
  participants integer,
  exam_cluster text,
  description text,
  is_pilot boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint events_code_not_blank_check check (length(trim(code)) > 0),
  constraint events_event_type_check
    check (
      event_type in (
        'individual_series',
        'team_decision_making',
        'principles',
        'project',
        'operations_research',
        'other'
      )
    ),
  constraint events_participants_check
    check (participants is null or participants > 0)
);

create table if not exists public.key_sets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  description text,
  sort_order integer not null default 0,
  status text not null default 'draft',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint key_sets_status_check check (status in ('draft', 'approved', 'archived')),
  constraint key_sets_title_not_blank_check check (length(trim(title)) > 0),
  constraint key_sets_event_title_unique unique (event_id, title)
);

create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  cluster text,
  instructional_area text,
  student_friendly_definition text,
  detailed_explanation text,
  example text,
  common_misconceptions text,
  status text not null default 'draft',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint concepts_name_not_blank_check check (length(trim(name)) > 0),
  constraint concepts_slug_not_blank_check check (length(trim(slug)) > 0),
  constraint concepts_status_check check (status in ('draft', 'approved', 'archived'))
);

create table if not exists public.key_set_concepts (
  key_set_id uuid not null references public.key_sets(id) on delete cascade,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (key_set_id, concept_id)
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  source_resource_id uuid references public.resources(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  concept_id uuid references public.concepts(id) on delete set null,
  question_type text not null,
  ladder_stage text,
  prompt text not null,
  choices jsonb,
  correct_answer jsonb,
  explanation text,
  difficulty text,
  status text not null default 'draft',
  ai_generated boolean not null default false,
  ai_extracted boolean not null default false,
  admin_reviewed boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint questions_prompt_not_blank_check check (length(trim(prompt)) > 0),
  constraint questions_ladder_stage_check
    check (
      ladder_stage is null or ladder_stage in (
        'recognize',
        'define',
        'connect',
        'apply',
        'explain',
        'improve'
      )
    ),
  constraint questions_status_check
    check (status in ('draft', 'needs_review', 'approved', 'archived', 'rejected'))
);

create table if not exists public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  answer jsonb,
  is_correct boolean,
  feedback text,
  attempt_number integer not null default 1,
  created_at timestamp with time zone not null default now(),
  constraint question_attempts_attempt_number_check check (attempt_number > 0)
);

create table if not exists public.concept_mastery (
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  status text not null default 'not_started',
  recognize_score numeric,
  define_score numeric,
  connect_score numeric,
  apply_score numeric,
  explain_score numeric,
  improve_score numeric,
  last_practiced_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (user_id, concept_id),
  constraint concept_mastery_status_check
    check (status in ('not_started', 'learning', 'practicing', 'almost_mastered', 'mastered'))
);

create table if not exists public.roleplay_scenarios (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid references public.resources(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  title text,
  scenario_text text,
  participant_role text,
  judge_role text,
  business_context text,
  task text,
  instructional_area text,
  performance_indicators jsonb,
  status text not null default 'draft',
  ai_extracted boolean not null default false,
  admin_reviewed boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint roleplay_scenarios_status_check
    check (status in ('draft', 'needs_review', 'approved', 'archived', 'rejected'))
);

create index if not exists events_code_idx on public.events(code);
create index if not exists events_is_pilot_idx on public.events(is_pilot);
create index if not exists key_sets_event_id_idx on public.key_sets(event_id);
create index if not exists concepts_slug_idx on public.concepts(slug);
create index if not exists concepts_status_idx on public.concepts(status);
create index if not exists questions_source_resource_id_idx on public.questions(source_resource_id);
create index if not exists questions_event_id_idx on public.questions(event_id);
create index if not exists questions_concept_id_idx on public.questions(concept_id);
create index if not exists questions_question_type_idx on public.questions(question_type);
create index if not exists questions_status_idx on public.questions(status);
create index if not exists question_attempts_user_id_idx on public.question_attempts(user_id);
create index if not exists question_attempts_question_id_idx on public.question_attempts(question_id);
create index if not exists concept_mastery_user_id_idx on public.concept_mastery(user_id);
create index if not exists concept_mastery_concept_id_idx on public.concept_mastery(concept_id);
create index if not exists roleplay_scenarios_resource_id_idx on public.roleplay_scenarios(resource_id);
create index if not exists roleplay_scenarios_event_id_idx on public.roleplay_scenarios(event_id);
create index if not exists roleplay_scenarios_status_idx on public.roleplay_scenarios(status);

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
before update on public.events
for each row
execute function public.set_updated_at();

drop trigger if exists set_key_sets_updated_at on public.key_sets;
create trigger set_key_sets_updated_at
before update on public.key_sets
for each row
execute function public.set_updated_at();

drop trigger if exists set_concepts_updated_at on public.concepts;
create trigger set_concepts_updated_at
before update on public.concepts
for each row
execute function public.set_updated_at();

drop trigger if exists set_questions_updated_at on public.questions;
create trigger set_questions_updated_at
before update on public.questions
for each row
execute function public.set_updated_at();

drop trigger if exists set_concept_mastery_updated_at on public.concept_mastery;
create trigger set_concept_mastery_updated_at
before update on public.concept_mastery
for each row
execute function public.set_updated_at();

drop trigger if exists set_roleplay_scenarios_updated_at on public.roleplay_scenarios;
create trigger set_roleplay_scenarios_updated_at
before update on public.roleplay_scenarios
for each row
execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.key_sets enable row level security;
alter table public.concepts enable row level security;
alter table public.key_set_concepts enable row level security;
alter table public.questions enable row level security;
alter table public.question_attempts enable row level security;
alter table public.concept_mastery enable row level security;
alter table public.roleplay_scenarios enable row level security;

grant select, insert, update, delete on table
  public.events,
  public.key_sets,
  public.concepts,
  public.key_set_concepts,
  public.questions,
  public.roleplay_scenarios
to authenticated;

grant select, insert, update on table
  public.question_attempts,
  public.concept_mastery
to authenticated;

grant select, insert, update, delete on table
  public.events,
  public.key_sets,
  public.concepts,
  public.key_set_concepts,
  public.questions,
  public.question_attempts,
  public.concept_mastery,
  public.roleplay_scenarios
to service_role;

drop policy if exists "Authenticated users can read events" on public.events;
create policy "Authenticated users can read events"
on public.events
for select
to authenticated
using (true);

drop policy if exists "Admins and advisors can manage events" on public.events;
create policy "Admins and advisors can manage events"
on public.events
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

drop policy if exists "Authenticated users can read approved key sets" on public.key_sets;
create policy "Authenticated users can read approved key sets"
on public.key_sets
for select
to authenticated
using (status = 'approved');

drop policy if exists "Admins and advisors can manage key sets" on public.key_sets;
create policy "Admins and advisors can manage key sets"
on public.key_sets
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

drop policy if exists "Authenticated users can read approved concepts" on public.concepts;
create policy "Authenticated users can read approved concepts"
on public.concepts
for select
to authenticated
using (status = 'approved');

drop policy if exists "Admins and advisors can manage concepts" on public.concepts;
create policy "Admins and advisors can manage concepts"
on public.concepts
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

drop policy if exists "Authenticated users can read approved key set concepts" on public.key_set_concepts;
create policy "Authenticated users can read approved key set concepts"
on public.key_set_concepts
for select
to authenticated
using (
  exists (
    select 1
    from public.key_sets
    where key_sets.id = key_set_concepts.key_set_id
      and key_sets.status = 'approved'
  )
  and exists (
    select 1
    from public.concepts
    where concepts.id = key_set_concepts.concept_id
      and concepts.status = 'approved'
  )
);

drop policy if exists "Admins and advisors can manage key set concepts" on public.key_set_concepts;
create policy "Admins and advisors can manage key set concepts"
on public.key_set_concepts
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

drop policy if exists "Authenticated users can read approved questions" on public.questions;
create policy "Authenticated users can read approved questions"
on public.questions
for select
to authenticated
using (status = 'approved');

drop policy if exists "Admins and advisors can manage questions" on public.questions;
create policy "Admins and advisors can manage questions"
on public.questions
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

drop policy if exists "Students can read own question attempts" on public.question_attempts;
create policy "Students can read own question attempts"
on public.question_attempts
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Students can insert own question attempts" on public.question_attempts;
create policy "Students can insert own question attempts"
on public.question_attempts
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Students can update own question attempts" on public.question_attempts;
create policy "Students can update own question attempts"
on public.question_attempts
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Admins and advisors can read all question attempts" on public.question_attempts;
create policy "Admins and advisors can read all question attempts"
on public.question_attempts
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

drop policy if exists "Students can read own concept mastery" on public.concept_mastery;
create policy "Students can read own concept mastery"
on public.concept_mastery
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Students can insert own concept mastery" on public.concept_mastery;
create policy "Students can insert own concept mastery"
on public.concept_mastery
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Students can update own concept mastery" on public.concept_mastery;
create policy "Students can update own concept mastery"
on public.concept_mastery
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Admins and advisors can read all concept mastery" on public.concept_mastery;
create policy "Admins and advisors can read all concept mastery"
on public.concept_mastery
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

drop policy if exists "Authenticated users can read approved roleplay scenarios" on public.roleplay_scenarios;
create policy "Authenticated users can read approved roleplay scenarios"
on public.roleplay_scenarios
for select
to authenticated
using (status = 'approved');

drop policy if exists "Admins and advisors can manage roleplay scenarios" on public.roleplay_scenarios;
create policy "Admins and advisors can manage roleplay scenarios"
on public.roleplay_scenarios
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

insert into public.events (
  code,
  name,
  cluster,
  event_type,
  participants,
  exam_cluster,
  description,
  is_pilot,
  sort_order
)
values
  (
    'MCS',
    'Marketing Communications Series',
    'Marketing',
    'individual_series',
    1,
    'Marketing',
    'Primary pilot event for Marketing Cluster concept learning and roleplay preparation.',
    true,
    1
  ),
  (
    'BLTDM',
    'Business Law and Ethics Team Decision Making',
    'Business Management and Administration',
    'team_decision_making',
    2,
    'Business Management and Administration',
    'Secondary pilot event for law, ethics, liability, and judgment-heavy team decision-making practice.',
    true,
    2
  )
on conflict (code) do update
set
  name = excluded.name,
  cluster = excluded.cluster,
  event_type = excluded.event_type,
  participants = excluded.participants,
  exam_cluster = excluded.exam_cluster,
  description = excluded.description,
  is_pilot = excluded.is_pilot,
  sort_order = excluded.sort_order,
  updated_at = now();

with mcs_event as (
  select id from public.events where code = 'MCS'
)
insert into public.key_sets (event_id, title, description, sort_order, status)
select
  mcs_event.id,
  'Marketing Communication Basics',
  'Foundational marketing communication concepts for MCS and related Marketing Cluster events.',
  1,
  'approved'
from mcs_event
on conflict (event_id, title) do update
set
  description = excluded.description,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = now();

with bltdm_event as (
  select id from public.events where code = 'BLTDM'
)
insert into public.key_sets (event_id, title, description, sort_order, status)
select
  bltdm_event.id,
  'Business Law and Ethics Basics',
  'Foundational law, liability, ownership, and ethics concepts for BLTDM and related Business Management and Administration events.',
  1,
  'approved'
from bltdm_event
on conflict (event_id, title) do update
set
  description = excluded.description,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = now();

insert into public.concepts (
  name,
  slug,
  cluster,
  instructional_area,
  student_friendly_definition,
  example,
  status
)
values
  (
    'Promotion',
    'promotion',
    'Marketing',
    'Promotion',
    'Promotion is how a business communicates a product, service, or idea to a target audience.',
    'A store uses social media posts and coupons to encourage customers to visit during a sale.',
    'approved'
  ),
  (
    'Target Market',
    'target-market',
    'Marketing',
    'Marketing',
    'A target market is the specific group of customers a business most wants to reach.',
    'A sneaker brand targets high school athletes who want lightweight training shoes.',
    'approved'
  ),
  (
    'Brand Awareness',
    'brand-awareness',
    'Marketing',
    'Promotion',
    'Brand awareness is how well customers recognize or remember a business or product.',
    'A restaurant sponsors a school event so more families remember its name.',
    'approved'
  ),
  (
    'Positioning',
    'positioning',
    'Marketing',
    'Marketing',
    'Positioning is how a business wants customers to see its product compared with competitors.',
    'A clothing store positions itself as affordable, trendy, and student-friendly.',
    'approved'
  ),
  (
    'Message Strategy',
    'message-strategy',
    'Marketing',
    'Communication Skills',
    'Message strategy is the plan for what a communication should say and why it will persuade the audience.',
    'An ad highlights convenience and low price because those benefits matter most to busy families.',
    'approved'
  ),
  (
    'Contract',
    'contract',
    'Business Management and Administration',
    'Business Law',
    'A contract is an agreement between parties that creates responsibilities each side is expected to follow.',
    'A supplier agrees to deliver uniforms by a deadline in exchange for payment.',
    'approved'
  ),
  (
    'Liability',
    'liability',
    'Business Management and Administration',
    'Business Law',
    'Liability is legal responsibility for harm, loss, debt, or a broken obligation.',
    'A business may be liable if unsafe conditions cause a customer injury.',
    'approved'
  ),
  (
    'Product Liability',
    'product-liability',
    'Business Management and Administration',
    'Business Law',
    'Product liability is a business responsibility for harm caused by a defective or unsafe product.',
    'A company recalls a product after discovering it can overheat and injure users.',
    'approved'
  ),
  (
    'Negligence',
    'negligence',
    'Business Management and Administration',
    'Business Law',
    'Negligence is failing to use reasonable care, which can lead to harm or legal responsibility.',
    'A manager ignores a spill for hours and a customer slips.',
    'approved'
  ),
  (
    'Business Ownership',
    'business-ownership',
    'Business Management and Administration',
    'Business Law',
    'Business ownership describes the legal structure for who owns and is responsible for a business.',
    'A sole proprietor owns the business alone, while partners share ownership and responsibility.',
    'approved'
  )
on conflict (slug) do update
set
  name = excluded.name,
  cluster = excluded.cluster,
  instructional_area = excluded.instructional_area,
  student_friendly_definition = excluded.student_friendly_definition,
  example = excluded.example,
  status = excluded.status,
  updated_at = now();

with mcs_key_set as (
  select key_sets.id
  from public.key_sets
  join public.events on events.id = key_sets.event_id
  where events.code = 'MCS'
    and key_sets.title = 'Marketing Communication Basics'
),
mcs_concepts(slug, sort_order) as (
  values
    ('promotion', 1),
    ('target-market', 2),
    ('brand-awareness', 3),
    ('positioning', 4),
    ('message-strategy', 5)
)
insert into public.key_set_concepts (key_set_id, concept_id, sort_order)
select mcs_key_set.id, concepts.id, mcs_concepts.sort_order
from mcs_key_set
join mcs_concepts on true
join public.concepts on concepts.slug = mcs_concepts.slug
on conflict (key_set_id, concept_id) do update
set sort_order = excluded.sort_order;

with bltdm_key_set as (
  select key_sets.id
  from public.key_sets
  join public.events on events.id = key_sets.event_id
  where events.code = 'BLTDM'
    and key_sets.title = 'Business Law and Ethics Basics'
),
bltdm_concepts(slug, sort_order) as (
  values
    ('contract', 1),
    ('liability', 2),
    ('product-liability', 3),
    ('negligence', 4),
    ('business-ownership', 5)
)
insert into public.key_set_concepts (key_set_id, concept_id, sort_order)
select bltdm_key_set.id, concepts.id, bltdm_concepts.sort_order
from bltdm_key_set
join bltdm_concepts on true
join public.concepts on concepts.slug = bltdm_concepts.slug
on conflict (key_set_id, concept_id) do update
set sort_order = excluded.sort_order;
