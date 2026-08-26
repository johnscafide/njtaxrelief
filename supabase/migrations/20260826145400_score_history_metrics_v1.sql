create table if not exists public.score_history_metrics (
  pams_pin text not null,
  marker_id text not null,
  observation_count integer not null check (observation_count >= 2),
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  first_score numeric not null,
  last_score numeric not null,
  score_delta numeric not null,
  mean_score numeric not null,
  score_stddev numeric not null,
  min_score numeric not null,
  max_score numeric not null,
  observed_span_days numeric not null,
  trend_points_per_30d numeric,
  refreshed_at timestamptz not null default now(),
  primary key (pams_pin, marker_id)
);

alter table public.score_history_metrics enable row level security;
revoke all on public.score_history_metrics from anon, authenticated;
grant select, insert, update, delete on public.score_history_metrics to service_role;

create or replace function public.refresh_score_history_metrics()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare n integer;
begin
  with grouped as (
    select marker_id,pams_pin,
           count(*)::integer observation_count,
           min(observed_at) first_observed_at,
           max(observed_at) last_observed_at,
           avg(score)::numeric mean_score,
           coalesce(stddev_pop(score),0)::numeric score_stddev,
           min(score)::numeric min_score,
           max(score)::numeric max_score
    from public.score_observations
    where pams_pin is not null and marker_id is not null and score is not null
    group by marker_id,pams_pin
    having count(*) >= 2
  ), endpoints as (
    select g.*,
      (select s.score from public.score_observations s where s.marker_id=g.marker_id and s.pams_pin=g.pams_pin and s.score is not null order by s.observed_at asc, s.id asc limit 1)::numeric first_score,
      (select s.score from public.score_observations s where s.marker_id=g.marker_id and s.pams_pin=g.pams_pin and s.score is not null order by s.observed_at desc, s.id desc limit 1)::numeric last_score
    from grouped g
  ), up as (
    insert into public.score_history_metrics(
      pams_pin,marker_id,observation_count,first_observed_at,last_observed_at,first_score,last_score,score_delta,mean_score,score_stddev,min_score,max_score,observed_span_days,trend_points_per_30d,refreshed_at
    )
    select pams_pin,marker_id,observation_count,first_observed_at,last_observed_at,first_score,last_score,
           last_score-first_score,mean_score,score_stddev,min_score,max_score,
           greatest(extract(epoch from (last_observed_at-first_observed_at))/86400.0,0),
           case when last_observed_at>first_observed_at then (last_score-first_score) * 30.0 / (extract(epoch from (last_observed_at-first_observed_at))/86400.0) else null end,
           now()
    from endpoints
    on conflict (pams_pin,marker_id) do update set
      observation_count=excluded.observation_count,
      first_observed_at=excluded.first_observed_at,
      last_observed_at=excluded.last_observed_at,
      first_score=excluded.first_score,
      last_score=excluded.last_score,
      score_delta=excluded.score_delta,
      mean_score=excluded.mean_score,
      score_stddev=excluded.score_stddev,
      min_score=excluded.min_score,
      max_score=excluded.max_score,
      observed_span_days=excluded.observed_span_days,
      trend_points_per_30d=excluded.trend_points_per_30d,
      refreshed_at=now()
    returning 1
  ) select count(*) into n from up;

  delete from public.score_history_metrics h
  where not exists (
    select 1 from public.score_observations s
    where s.pams_pin=h.pams_pin and s.marker_id=h.marker_id and s.score is not null
    group by s.pams_pin,s.marker_id having count(*) >= 2
  );
  return n;
end;
$$;

revoke all on function public.refresh_score_history_metrics() from public, anon, authenticated;
grant execute on function public.refresh_score_history_metrics() to service_role;

select public.refresh_score_history_metrics();
