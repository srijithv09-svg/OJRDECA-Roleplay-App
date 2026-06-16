create table if not exists public.roleplay_performance_indicators (
  id uuid primary key default gen_random_uuid(),
  roleplay_scenario_id uuid not null references public.roleplay_scenarios(id) on delete cascade,
  resource_id uuid references public.resources(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  text text not null,
  instructional_area text,
  possible_concepts jsonb,
  confidence numeric,
  sort_order integer not null default 0,
  status text not null default 'needs_review',
  ai_extracted boolean not null default true,
  admin_reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roleplay_performance_indicators_status_check
    check (status in ('draft', 'needs_review', 'approved', 'rejected', 'archived'))
);

create index if not exists roleplay_performance_indicators_scenario_id_idx
on public.roleplay_performance_indicators(roleplay_scenario_id);

create index if not exists roleplay_performance_indicators_resource_id_idx
on public.roleplay_performance_indicators(resource_id);

create index if not exists roleplay_performance_indicators_event_id_idx
on public.roleplay_performance_indicators(event_id);

create index if not exists roleplay_performance_indicators_status_idx
on public.roleplay_performance_indicators(status);

create index if not exists roleplay_performance_indicators_ai_extracted_idx
on public.roleplay_performance_indicators(ai_extracted);

create index if not exists roleplay_performance_indicators_admin_reviewed_idx
on public.roleplay_performance_indicators(admin_reviewed);

drop trigger if exists set_roleplay_performance_indicators_updated_at
on public.roleplay_performance_indicators;

create trigger set_roleplay_performance_indicators_updated_at
before update on public.roleplay_performance_indicators
for each row
execute function public.set_updated_at();

alter table public.roleplay_performance_indicators enable row level security;

grant select, insert, update, delete on table public.roleplay_performance_indicators to authenticated;
grant select, insert, update, delete on table public.roleplay_performance_indicators to service_role;

drop policy if exists "Authenticated users can read approved roleplay performance indicators"
on public.roleplay_performance_indicators;

create policy "Authenticated users can read approved roleplay performance indicators"
on public.roleplay_performance_indicators
for select
to authenticated
using (status = 'approved');

drop policy if exists "Admins and advisors can manage roleplay performance indicators"
on public.roleplay_performance_indicators;

create policy "Admins and advisors can manage roleplay performance indicators"
on public.roleplay_performance_indicators
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

insert into public.roleplay_performance_indicators (
  roleplay_scenario_id,
  resource_id,
  event_id,
  text,
  instructional_area,
  possible_concepts,
  confidence,
  sort_order,
  status,
  ai_extracted,
  admin_reviewed
)
select
  scenario.id,
  scenario.resource_id,
  scenario.event_id,
  indicator.text,
  indicator.instructional_area,
  indicator.possible_concepts,
  indicator.confidence,
  indicator.sort_order,
  case
    when scenario.status in ('draft', 'needs_review', 'approved', 'rejected', 'archived')
      then scenario.status
    else 'needs_review'
  end,
  scenario.ai_extracted,
  scenario.admin_reviewed
from public.roleplay_scenarios scenario
cross join lateral (
  select
    nullif(
      case
        when jsonb_typeof(entry.value) = 'object'
          then coalesce(entry.value->>'text', entry.value->>'indicator_text')
        when jsonb_typeof(entry.value) = 'string'
          then trim(both '"' from entry.value::text)
        else null
      end,
      ''
    ) as text,
    case
      when jsonb_typeof(entry.value) = 'object'
        then coalesce(entry.value->>'instructionalArea', entry.value->>'instructional_area', scenario.instructional_area)
      else scenario.instructional_area
    end as instructional_area,
    case
      when jsonb_typeof(entry.value) = 'object' and jsonb_typeof(entry.value->'possibleConcepts') = 'array'
        then entry.value->'possibleConcepts'
      when jsonb_typeof(entry.value) = 'object' and jsonb_typeof(entry.value->'possible_concepts') = 'array'
        then entry.value->'possible_concepts'
      else '[]'::jsonb
    end as possible_concepts,
    case
      when jsonb_typeof(entry.value) = 'object'
        and (entry.value->>'confidence') ~ '^[0-9]+(\.[0-9]+)?$'
        then (entry.value->>'confidence')::numeric
      else null
    end as confidence,
    (entry.ordinality::integer - 1) as sort_order
  from jsonb_array_elements(scenario.performance_indicators) with ordinality as entry(value, ordinality)
) indicator
where jsonb_typeof(scenario.performance_indicators) = 'array'
  and indicator.text is not null
  and not exists (
    select 1
    from public.roleplay_performance_indicators existing
    where existing.roleplay_scenario_id = scenario.id
  );
