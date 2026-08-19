update public.derived_formula_registry
set engine_version = 'watchdog-derived-v11-subject-index', updated_at = now()
where marker_id in (
  'property.square_feet',
  'watchdog.comparable_evidence_reliability',
  'watchdog.assessment_defensibility_score',
  'watchdog.appeal_evidence_strength',
  'watchdog.appeal_opportunity_index'
);

update public.data_center_provider_coverage
set bulk_capable = true,
    calculation_key = 'watchdog-derived-v11-subject-index',
    last_verified_at = now(),
    notes = case marker_id
      when 'property.square_feet' then 'Living space from the compact statewide SR-1A subject evidence index keyed by district/block/lot/qualifier. The provider fails closed on ambiguous qualifier matches and returns missing when no indexed usable sale publishes living space.'
      when 'watchdog.comparable_evidence_reliability' then 'Governed comparable-evidence reliability backed by the compact statewide SR-1A subject index plus municipal SR-1A reference statistics; certified for 500-subject bulk lookup.'
      when 'watchdog.assessment_defensibility_score' then 'Governed assessment-defensibility screen using the compact statewide SR-1A subject index, official Chapter 123, and uniformity evidence; certified for bulk lookup.'
      when 'watchdog.appeal_evidence_strength' then 'Governed appeal-evidence strength using compact statewide subject evidence and attributable public inputs; certified for bulk lookup.'
      when 'watchdog.appeal_opportunity_index' then 'Governed appeal-opportunity triage using compact statewide subject evidence; available-input normalization and evidence coverage metadata preserved in bulk mode.'
      else notes end,
    provider_key = case when marker_id = 'property.square_feet' then 'sr1a-subject-provider' else provider_key end
where marker_id in (
  'property.square_feet',
  'watchdog.comparable_evidence_reliability',
  'watchdog.assessment_defensibility_score',
  'watchdog.appeal_evidence_strength',
  'watchdog.appeal_opportunity_index'
);

create or replace function public.dispatch_sr1a_subject_index_refresh()
returns integer
language plpgsql
security invoker
set search_path = public, net
as $$
declare
  cc text;
  dispatched integer := 0;
begin
  foreach cc in array array['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21'] loop
    perform net.http_post(
      url := 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/sr1a-subject-indexer',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object('county_code', cc)
    );
    dispatched := dispatched + 1;
  end loop;
  return dispatched;
end;
$$;

revoke all on function public.dispatch_sr1a_subject_index_refresh() from public, anon, authenticated;
grant execute on function public.dispatch_sr1a_subject_index_refresh() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'sr1a-subject-index-refresh';

select cron.schedule(
  'sr1a-subject-index-refresh',
  '20 10 * * *',
  $$select public.dispatch_sr1a_subject_index_refresh();$$
);