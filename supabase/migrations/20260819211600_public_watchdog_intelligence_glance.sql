create or replace function public.get_public_intelligence_glance()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with score_day as (
  select max(observed_on) as d
  from public.score_observations
  where marker_id = 'watchdog.score'
),
score_base as (
  select pams_pin, score, evidence_coverage, inputs
  from public.score_observations
  where marker_id = 'watchdog.score'
    and observed_on = (select d from score_day)
),
score_summary as (
  select
    count(distinct pams_pin)::int as properties,
    count(distinct nullif(inputs->>'town',''))::int as towns,
    count(distinct nullif(inputs->>'county',''))::int as counties,
    round(percentile_cont(0.5) within group (order by score)::numeric, 1) as median_score,
    round(avg(score)::numeric, 1) as average_score,
    round(avg(evidence_coverage)::numeric, 1) as evidence_coverage,
    round((100.0 * count(*) filter (where score >= 60) / nullif(count(*),0))::numeric, 1) as share_60_plus,
    round((100.0 * count(*) filter (where score >= 70) / nullif(count(*),0))::numeric, 1) as share_70_plus
  from score_base
),
marker_summary as (
  select marker_id,
         count(*)::int as observations,
         round(percentile_cont(0.5) within group (order by score)::numeric, 1) as median_score,
         round(avg(evidence_coverage)::numeric, 1) as evidence_coverage
  from public.score_observations
  where observed_on = (select d from score_day)
    and marker_id in ('watchdog.tax_pressure','watchdog.revaluation_risk','uniformity.score')
  group by marker_id
),
run_summary as (
  select
    count(*)::int as runs_24h,
    coalesce(sum(candidate_count),0)::int as candidates_24h,
    coalesce(sum(finding_count),0)::int as findings_24h,
    count(distinct model_key)::int as models_24h,
    max(completed_at) as latest_completed
  from public.intelligence_runs
  where status='complete'
    and completed_at >= now() - interval '24 hours'
),
watch_run as (
  select completed_at, eligible_properties, provider_records, unchanged_observations,
         changed_observations, candidates_created, metrics->>'version' as version
  from public.intelligence_source_fact_watch_runs
  where status='complete'
  order by completed_at desc
  limit 1
)
select jsonb_build_object(
  'as_of', (select d from score_day),
  'generated_at', now(),
  'cohort', jsonb_build_object(
    'properties', coalesce((select properties from score_summary),0),
    'towns', coalesce((select towns from score_summary),0),
    'counties', coalesce((select counties from score_summary),0),
    'median_score', (select median_score from score_summary),
    'average_score', (select average_score from score_summary),
    'evidence_coverage', (select evidence_coverage from score_summary),
    'share_60_plus', (select share_60_plus from score_summary),
    'share_70_plus', (select share_70_plus from score_summary)
  ),
  'signals', jsonb_build_object(
    'tax_pressure', coalesce((select jsonb_build_object('median_score',median_score,'observations',observations,'evidence_coverage',evidence_coverage) from marker_summary where marker_id='watchdog.tax_pressure'), '{}'::jsonb),
    'revaluation_risk', coalesce((select jsonb_build_object('median_score',median_score,'observations',observations,'evidence_coverage',evidence_coverage) from marker_summary where marker_id='watchdog.revaluation_risk'), '{}'::jsonb),
    'uniformity', coalesce((select jsonb_build_object('median_score',median_score,'observations',observations,'evidence_coverage',evidence_coverage) from marker_summary where marker_id='uniformity.score'), '{}'::jsonb)
  ),
  'engine', jsonb_build_object(
    'runs_24h', coalesce((select runs_24h from run_summary),0),
    'candidates_24h', coalesce((select candidates_24h from run_summary),0),
    'findings_24h', coalesce((select findings_24h from run_summary),0),
    'models_24h', coalesce((select models_24h from run_summary),0),
    'latest_completed', (select latest_completed from run_summary)
  ),
  'source_watch', coalesce((select jsonb_build_object(
    'completed_at', completed_at,
    'eligible_properties', eligible_properties,
    'provider_records', provider_records,
    'unchanged_observations', unchanged_observations,
    'changed_observations', changed_observations,
    'candidates_created', candidates_created,
    'version', version
  ) from watch_run), '{}'::jsonb),
  'methodology', jsonb_build_object(
    'score_model','workbench-score-v2.0.0-canonical',
    'watchdog_score_formula','Burden 30, Chapter 123 fairness 20, uniformity 15, revaluation stability 15, trajectory 10, appeal recourse 10; missing inputs are dropped and remaining weights are renormalized.',
    'tax_pressure_formula','Municipal tax pressure signal from published tax-rate direction.',
    'revaluation_formula','Published ratio level, verified SR-1A ratio decay and coefficient of deviation.',
    'uniformity_formula','Sourced assessment-uniformity score.',
    'scope_note','Live scored cohort, not a statewide housing-market estimate. Metrics summarize only properties with current defensible evidence.'
  )
);
$$;

revoke all on function public.get_public_intelligence_glance() from public;
grant execute on function public.get_public_intelligence_glance() to anon, authenticated;
