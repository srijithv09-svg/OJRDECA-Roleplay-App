create table if not exists public.event_aliases (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  alias text not null,
  alias_type text,
  created_at timestamptz not null default now(),
  constraint event_aliases_alias_not_blank_check check (length(trim(alias)) > 0),
  constraint event_aliases_alias_type_check
    check (
      alias_type is null or alias_type in (
        'code',
        'name',
        'filename_pattern',
        'common_abbreviation',
        'legacy'
      )
    )
);

create index if not exists event_aliases_event_id_idx on public.event_aliases(event_id);
create index if not exists event_aliases_lower_alias_idx on public.event_aliases(lower(alias));
create unique index if not exists event_aliases_event_id_lower_alias_unique_idx
on public.event_aliases(event_id, lower(alias));

alter table public.event_aliases enable row level security;

grant select on table public.event_aliases to authenticated;
grant select, insert, update, delete on table public.event_aliases to service_role;
grant select, insert, update, delete on table public.event_aliases to authenticated;

drop policy if exists "Authenticated users can read event aliases" on public.event_aliases;
create policy "Authenticated users can read event aliases"
on public.event_aliases
for select
to authenticated
using (true);

drop policy if exists "Admins and advisors can manage event aliases" on public.event_aliases;
create policy "Admins and advisors can manage event aliases"
on public.event_aliases
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

with canonical_events (
  code,
  name,
  cluster,
  event_type,
  participants,
  exam_cluster,
  description,
  is_pilot,
  sort_order
) as (
  values
    ('ACT', 'Accounting Applications Series', 'Finance', 'individual_series', 1, 'Finance', 'Canonical DECA event for resource matching.', false, 10),
    ('AAM', 'Apparel and Accessories Marketing Series', 'Marketing', 'individual_series', 1, 'Marketing', 'Canonical DECA event for resource matching.', false, 20),
    ('ASM', 'Automotive Services Marketing Series', 'Marketing', 'individual_series', 1, 'Marketing', 'Canonical DECA event for resource matching.', false, 30),
    ('BFS', 'Business Finance Series', 'Finance', 'individual_series', 1, 'Finance', 'Canonical DECA event for resource matching.', false, 40),
    ('BSM', 'Business Services Marketing Series', 'Marketing', 'individual_series', 1, 'Marketing', 'Canonical DECA event for resource matching.', false, 50),
    ('ENT', 'Entrepreneurship Series', 'Entrepreneurship', 'individual_series', 1, 'Entrepreneurship', 'Canonical DECA event for resource matching.', false, 60),
    ('FMS', 'Food Marketing Series', 'Marketing', 'individual_series', 1, 'Marketing', 'Canonical DECA event for resource matching.', false, 70),
    ('HLM', 'Hotel and Lodging Management Series', 'Hospitality and Tourism', 'individual_series', 1, 'Hospitality and Tourism', 'Canonical DECA event for resource matching.', false, 80),
    ('HRM', 'Human Resources Management Series', 'Business Management and Administration', 'individual_series', 1, 'Business Management and Administration', 'Canonical DECA event for resource matching.', false, 90),
    ('MCS', 'Marketing Communications Series', 'Marketing', 'individual_series', 1, 'Marketing', 'Primary pilot event for Marketing Cluster concept learning and roleplay preparation.', true, 100),
    ('QSRM', 'Quick Serve Restaurant Management Series', 'Hospitality and Tourism', 'individual_series', 1, 'Hospitality and Tourism', 'Canonical DECA event for resource matching.', false, 110),
    ('RFSM', 'Restaurant and Food Service Management Series', 'Hospitality and Tourism', 'individual_series', 1, 'Hospitality and Tourism', 'Canonical DECA event for resource matching.', false, 120),
    ('RMS', 'Retail Merchandising Series', 'Marketing', 'individual_series', 1, 'Marketing', 'Canonical DECA event for resource matching.', false, 130),
    ('SEM', 'Sports and Entertainment Marketing Series', 'Marketing', 'individual_series', 1, 'Marketing', 'Canonical DECA event for resource matching.', false, 140),
    ('PSE', 'Professional Selling', 'Marketing', 'individual_series', 1, 'Marketing', 'Canonical DECA event for resource matching.', false, 150),
    ('BLTDM', 'Business Law and Ethics Team Decision Making', 'Business Management and Administration', 'team_decision_making', 2, 'Business Management and Administration', 'Secondary pilot event for law, ethics, liability, and judgment-heavy team decision-making practice.', true, 160),
    ('BTDM', 'Buying and Merchandising Team Decision Making', 'Marketing', 'team_decision_making', 2, 'Marketing', 'Canonical DECA event for resource matching.', false, 170),
    ('ETDM', 'Entrepreneurship Team Decision Making', 'Entrepreneurship', 'team_decision_making', 2, 'Entrepreneurship', 'Canonical DECA event for resource matching.', false, 180),
    ('FTDM', 'Financial Services Team Decision Making', 'Finance', 'team_decision_making', 2, 'Finance', 'Canonical DECA event for resource matching.', false, 190),
    ('HTDM', 'Hospitality Services Team Decision Making', 'Hospitality and Tourism', 'team_decision_making', 2, 'Hospitality and Tourism', 'Canonical DECA event for resource matching.', false, 200),
    ('MTDM', 'Marketing Management Team Decision Making', 'Marketing', 'team_decision_making', 2, 'Marketing', 'Canonical DECA event for resource matching.', false, 210),
    ('STDM', 'Sports and Entertainment Marketing Team Decision Making', 'Marketing', 'team_decision_making', 2, 'Marketing', 'Canonical DECA event for resource matching.', false, 220),
    ('TTDM', 'Travel and Tourism Team Decision Making', 'Hospitality and Tourism', 'team_decision_making', 2, 'Hospitality and Tourism', 'Canonical DECA event for resource matching.', false, 230),
    ('PBM', 'Principles of Business Management and Administration', 'Business Management and Administration', 'principles', 1, null, 'Canonical DECA event for resource matching.', false, 240),
    ('PEN', 'Principles of Entrepreneurship', 'Entrepreneurship', 'principles', 1, null, 'Canonical DECA event for resource matching.', false, 250),
    ('PFN', 'Principles of Finance', 'Finance', 'principles', 1, null, 'Canonical DECA event for resource matching.', false, 260),
    ('PHT', 'Principles of Hospitality and Tourism', 'Hospitality and Tourism', 'principles', 1, null, 'Canonical DECA event for resource matching.', false, 270),
    ('PMK', 'Principles of Marketing', 'Marketing', 'principles', 1, null, 'Canonical DECA event for resource matching.', false, 280),
    ('PFL', 'Personal Financial Literacy', 'Personal Financial Literacy', 'other', 1, null, 'Canonical DECA event for resource matching.', false, 290),
    ('BMOR', 'Buying and Merchandising Operations Research', 'Marketing', 'operations_research', null, null, 'Canonical DECA event for resource matching.', false, 300),
    ('BOR', 'Business Services Operations Research', 'Business Management and Administration', 'operations_research', null, null, 'Canonical DECA event for resource matching.', false, 310),
    ('IMCE', 'Integrated Marketing Campaign-Event', 'Marketing', 'project', null, null, 'Canonical DECA event for resource matching.', false, 320),
    ('IMCP', 'Integrated Marketing Campaign-Product', 'Marketing', 'project', null, null, 'Canonical DECA event for resource matching.', false, 330),
    ('IMCS', 'Integrated Marketing Campaign-Service', 'Marketing', 'project', null, null, 'Canonical DECA event for resource matching.', false, 340),
    ('PMBS', 'Business Solutions Project', 'Business Management and Administration', 'project', null, null, 'Canonical DECA event for resource matching.', false, 350),
    ('PMCA', 'Community Awareness Project', 'Business Management and Administration', 'project', null, null, 'Canonical DECA event for resource matching.', false, 360),
    ('PMCD', 'Career Development Project', 'Business Management and Administration', 'project', null, null, 'Canonical DECA event for resource matching.', false, 370),
    ('PMCG', 'Community Giving Project', 'Business Management and Administration', 'project', null, null, 'Canonical DECA event for resource matching.', false, 380),
    ('PMFL', 'Financial Literacy Project', 'Business Management and Administration', 'project', null, null, 'Canonical DECA event for resource matching.', false, 390),
    ('PMSP', 'Sales Project', 'Business Management and Administration', 'project', null, null, 'Canonical DECA event for resource matching.', false, 400)
)
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
select
  code,
  name,
  cluster,
  event_type,
  participants,
  exam_cluster,
  description,
  is_pilot,
  sort_order
from canonical_events
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

with alias_source as (
  select
    events.id as event_id,
    aliases.alias,
    aliases.alias_type
  from public.events
  join lateral (
    values
      (events.code, 'code'),
      (events.name, 'name'),
      ('DECA_' || events.code, 'filename_pattern'),
      (replace(events.name, '-', ' '), 'legacy')
  ) as aliases(alias, alias_type) on true
  where events.code in (
    'ACT', 'AAM', 'ASM', 'BFS', 'BSM', 'ENT', 'FMS', 'HLM', 'HRM', 'MCS',
    'QSRM', 'RFSM', 'RMS', 'SEM', 'PSE', 'BLTDM', 'BTDM', 'ETDM', 'FTDM',
    'HTDM', 'MTDM', 'STDM', 'TTDM', 'PBM', 'PEN', 'PFN', 'PHT', 'PMK', 'PFL',
    'BMOR', 'BOR', 'IMCE', 'IMCP', 'IMCS', 'PMBS', 'PMCA', 'PMCD', 'PMCG',
    'PMFL', 'PMSP'
  )
)
insert into public.event_aliases (event_id, alias, alias_type)
select event_id, alias, alias_type
from alias_source
where alias is not null and length(trim(alias)) > 0
on conflict do nothing;
