create or replace function private.watchdog_assessment_finding_date_sanity_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_model_key text;
  v_sale_year integer;
  v_tax_score numeric;
  v_tax_weight numeric := 0.3;
  v_source_conf numeric;
  v_conf numeric;
  v_tax_evidence jsonb;
  v_missing jsonb;
begin
  select r.model_key
    into v_model_key
  from public.intelligence_runs r
  where r.id = new.run_id;

  if v_model_key <> 'assessment_anomaly' then
    return new;
  end if;

  -- `watchdog.sale_recency_confidence.value` is years since sale, not a sale year.
  -- The trusted database boundary must validate the governed parcel source year
  -- instead of interpreting a normalized feature value as a calendar year.
  select p.last_sale_year
    into v_sale_year
  from public.property_lookups p
  where p.pams_pin = new.pams_pin
  limit 1;

  if v_sale_year is null
     or v_sale_year between 1800 and extract(year from current_date)::integer then
    return new;
  end if;

  select e
    into v_tax_evidence
  from jsonb_array_elements(coalesce(new.evidence, '[]'::jsonb)) e
  where e->>'signal_id' = 'watchdog.tax_to_assessment_rate'
    and e->>'role' = 'score'
  limit 1;

  select nullif(e->>'score', '')::numeric
    into v_source_conf
  from jsonb_array_elements(coalesce(new.evidence, '[]'::jsonb)) e
  where e->>'signal_id' = 'watchdog.source_authority_coverage'
  limit 1;

  new.evidence := coalesce((
    select jsonb_agg(e)
    from jsonb_array_elements(coalesce(new.evidence, '[]'::jsonb)) e
    where e->>'signal_id' not in (
      'watchdog.assessment_to_sale_ratio',
      'watchdog.sale_recency_confidence'
    )
  ), '[]'::jsonb);

  v_missing := coalesce(new.missing_evidence, '[]'::jsonb)
    || jsonb_build_array(
      jsonb_build_object(
        'signal_id', 'watchdog.assessment_to_sale_ratio',
        'role', 'score',
        'weight', 0.7,
        'reason', 'invalid_future_sale_year'
      ),
      jsonb_build_object(
        'signal_id', 'watchdog.sale_recency_confidence',
        'role', 'confidence',
        'reason', 'invalid_future_sale_year'
      )
    );
  new.missing_evidence := v_missing;

  -- With the sale-derived signal rejected, a finding may only survive if a
  -- separate governed score signal remains. Otherwise suppress the finding.
  if v_tax_evidence is null then
    return null;
  end if;

  v_tax_score := nullif(v_tax_evidence->>'score', '')::numeric;
  if v_tax_score is null then
    return null;
  end if;

  new.score := greatest(0, least(100, v_tax_score));
  new.evidence_coverage := 30;
  v_conf := 30 * 0.7 + coalesce(v_source_conf, 30) * 0.3;
  new.confidence := least(49, greatest(0, least(100, v_conf)));
  new.why_now := jsonb_build_array(jsonb_build_object(
    'signal_id', 'watchdog.tax_to_assessment_rate',
    'score', v_tax_score,
    'weight', v_tax_weight,
    'contribution', v_tax_score * v_tax_weight,
    'value', v_tax_evidence->'value',
    'explanation', v_tax_evidence->'explanation'
  ));
  new.potential_impact := coalesce(new.potential_impact, '{}'::jsonb)
    || jsonb_build_object(
      'date_sanity_guard', 'invalid_future_sale_year',
      'invalid_last_sale_year', v_sale_year
    );
  return new;
exception when others then
  -- Never silently delete a valid finding because the guard itself failed.
  -- Failing the write makes the run observable and fixable instead.
  raise;
end;
$function$;
