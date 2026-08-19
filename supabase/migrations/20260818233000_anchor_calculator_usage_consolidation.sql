create table if not exists public.anchor_calculator_uses (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

alter table public.anchor_calculator_uses enable row level security;
revoke all on table public.anchor_calculator_uses from public, anon, authenticated;
grant all on table public.anchor_calculator_uses to service_role;

create index if not exists anchor_calculator_uses_created_at_idx
  on public.anchor_calculator_uses (created_at desc);

create or replace function public.record_anchor_calculator_use()
returns void
language sql
security definer
set search_path = ''
as $function$
  insert into public.anchor_calculator_uses default values;
$function$;

create or replace function public.anchor_calculator_weekly_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $function$
  select count(*)::bigint
  from public.anchor_calculator_uses
  where created_at >= now() - interval '7 days';
$function$;

revoke all on function public.record_anchor_calculator_use() from public;
revoke all on function public.anchor_calculator_weekly_count() from public;
grant execute on function public.record_anchor_calculator_use() to anon, authenticated;
grant execute on function public.anchor_calculator_weekly_count() to anon, authenticated;
