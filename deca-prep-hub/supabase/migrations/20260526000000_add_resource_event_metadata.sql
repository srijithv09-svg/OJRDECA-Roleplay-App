alter table public.resources
  add column if not exists event_code text,
  add column if not exists event_category text;
