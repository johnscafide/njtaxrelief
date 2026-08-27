-- NJW-270 corrective migration: preserve source geography inside higher-level scope rows.
-- The initial research-v1 canary correctly exposed that county/state scope rows had dropped
-- the underlying municipality/county labels, which made concentration diagnostics read 100%.
-- Preserve the failed canary lineage and regenerate with correct subgeography diagnostics.

update public.watchdog_index_distribution_runs r
set status='failed',
    notes = notes || jsonb_build_object(
      'superseded_reason','Initial canary dropped source municipality/county labels inside higher-level scope rows, invalidating subgeography concentration and distinct-geography diagnostics.',
      'superseded_at',now()
    )
where r.status='completed'
  and exists (
    select 1 from public.watchdog_index_distribution_snapshots s
    where s.run_id=r.id
      and s.scope_level='state'
      and s.scored_n > 0
      and s.distinct_counties = 0
  );

create or replace function public.refresh_watchdog_index_distribution_research_v1()
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run_id uuid;
  v_source_count integer := 0;
  v_joined_count integer := 0;
  v_unjoined_count integer := 0;
  v_cache_count integer := 0;
  v_fingerprint text;
begin
  with latest as (
    select distinct on (s.pams_pin)
      s.pams_pin, s.score, s.evidence_coverage, s.observed_at, s.observed_on, s.inputs
    from public.score_observations s
    where s.marker_id = 'watchdog.watchdog_score'
      and s.model_version = 'ROBUST-v1'
      and s.pams_pin is not null
    order by s.pams_pin, s.observed_at desc nulls last, s.observed_on desc
  )
  select count(*)::int,
         count(*) filter (where p.pams_pin is not null)::int,
         count(*) filter (where p.pams_pin is null)::int,
         md5(string_agg(
           l.pams_pin || ':' || coalesce(l.score::text,'') || ':' || coalesce(l.evidence_coverage::text,'') || ':' ||
           coalesce(l.observed_at::text,'') || ':' || coalesce(l.observed_on::text,'') || ':' || coalesce(l.inputs::text,''),
           '|' order by l.pams_pin
         ))
    into v_source_count, v_joined_count, v_unjoined_count, v_fingerprint
  from latest l
  left join public.property_lookups p using (pams_pin);

  select count(*)::int into v_cache_count
  from public.public_watchdog_score_cache_v1
  where model_version = 'ROBUST-v1';

  insert into public.watchdog_index_distribution_runs(
    model_version, source_observation_count, joined_observation_count, unjoined_observation_count,
    excluded_on_demand_cache_rows, source_observation_fingerprint, status, notes
  ) values (
    'ROBUST-v1', v_source_count, v_joined_count, v_unjoined_count,
    v_cache_count, v_fingerprint, 'running',
    jsonb_build_object(
      'brand','Watchdog',
      'product_family','Watchdog Index',
      'purpose','distribution_research_only',
      'on_demand_cache_excluded',true,
      'on_demand_exclusion_reason','Public score-on-demand traffic is demand-selected and must not be treated as a representative geographic sampling frame.',
      'warehouse_denominator','Observed property_lookups warehouse only; not New Jersey parcel-population coverage.'
    )
  ) returning id into v_run_id;

  with latest as (
    select distinct on (s.pams_pin)
      s.pams_pin,
      s.score::numeric as score,
      s.evidence_coverage::numeric as evidence_coverage,
      s.observed_at,
      s.observed_on,
      s.inputs->'components' as components
    from public.score_observations s
    where s.marker_id = 'watchdog.watchdog_score'
      and s.model_version = 'ROBUST-v1'
      and s.pams_pin is not null
    order by s.pams_pin, s.observed_at desc nulls last, s.observed_on desc
  ), base as (
    select l.*,
           nullif(btrim(p.town),'') as town,
           nullif(btrim(p.county),'') as county,
           coalesce(nullif(btrim(p.prop_class),''),'unknown') as prop_class
    from latest l
    join public.property_lookups p using (pams_pin)
  ), scope_rows as (
    select 'municipality'::text as scope_level,
           county || '|' || town as scope_key,
           town as municipality,
           county,
           town as source_municipality,
           county as source_county,
           pams_pin, prop_class, score, evidence_coverage, observed_at, components
    from base where town is not null and county is not null
    union all
    select 'county', county, null::text, county,
           town, county,
           pams_pin, prop_class, score, evidence_coverage, observed_at, components
    from base where county is not null
    union all
    select 'state', 'NJ', null::text, null::text,
           town, county,
           pams_pin, prop_class, score, evidence_coverage, observed_at, components
    from base
  ), grouped as (
    select scope_level, scope_key, municipality, county,
           count(*)::int as scored_n,
           count(distinct source_county)::int as distinct_counties,
           count(distinct case when source_county is not null and source_municipality is not null then source_county||'|'||source_municipality end)::int as distinct_municipalities,
           count(distinct prop_class)::int as distinct_property_classes,
           count(distinct score)::int as score_unique_values,
           round(percentile_cont(.10) within group(order by score)::numeric,1) as score_p10,
           round(percentile_cont(.25) within group(order by score)::numeric,1) as score_p25,
           round(percentile_cont(.50) within group(order by score)::numeric,1) as score_median,
           round(percentile_cont(.75) within group(order by score)::numeric,1) as score_p75,
           round(percentile_cont(.90) within group(order by score)::numeric,1) as score_p90,
           round(100.0 * count(*) filter(where score < 35) / nullif(count(*),0),1) as highly_pressured_tail_pct,
           round(100.0 * count(*) filter(where score < 50) / nullif(count(*),0),1) as pressured_or_lower_pct,
           round(100.0 * count(*) filter(where score >= 65) / nullif(count(*),0),1) as favorable_or_strong_pct,
           round(100.0 * count(*) filter(where score >= 80) / nullif(count(*),0),1) as strong_tail_pct,
           round(avg(evidence_coverage),1) as evidence_mean,
           round(percentile_cont(.10) within group(order by evidence_coverage)::numeric,1) as evidence_p10,
           round(percentile_cont(.25) within group(order by evidence_coverage)::numeric,1) as evidence_p25,
           round(percentile_cont(.50) within group(order by evidence_coverage)::numeric,1) as evidence_median,
           round(percentile_cont(.75) within group(order by evidence_coverage)::numeric,1) as evidence_p75,
           round(percentile_cont(.90) within group(order by evidence_coverage)::numeric,1) as evidence_p90,
           round(100.0 * count(*) filter(where evidence_coverage < 60) / nullif(count(*),0),1) as low_evidence_pct,
           round(100.0 * count(*) filter(where evidence_coverage >= 85) / nullif(count(*),0),1) as high_evidence_pct,
           min(observed_at) as oldest_observed_at,
           max(observed_at) as newest_observed_at
    from scope_rows
    group by scope_level, scope_key, municipality, county
  ), enriched as (
    select g.*,
      case g.scope_level
        when 'municipality' then (select count(*)::int from public.property_lookups p where nullif(btrim(p.town),'')=g.municipality and nullif(btrim(p.county),'')=g.county)
        when 'county' then (select count(*)::int from public.property_lookups p where nullif(btrim(p.county),'')=g.county)
        else (select count(*)::int from public.property_lookups)
      end as observed_warehouse_n,
      case g.scope_level
        when 'county' then (
          select round(max(100.0 * x.n / nullif(g.scored_n,0)),1)
          from (
            select coalesce(sr2.source_municipality,'__missing__') source_municipality, count(*)::numeric n
            from scope_rows sr2
            where sr2.scope_level=g.scope_level and sr2.scope_key=g.scope_key
            group by coalesce(sr2.source_municipality,'__missing__')
          ) x
        )
        when 'state' then (
          select round(max(100.0 * x.n / nullif(g.scored_n,0)),1)
          from (
            select coalesce(sr2.source_county,'__missing__') source_county, count(*)::numeric n
            from scope_rows sr2
            where sr2.scope_level=g.scope_level and sr2.scope_key=g.scope_key
            group by coalesce(sr2.source_county,'__missing__')
          ) x
        )
        else null::numeric
      end as max_subgeography_share_pct,
      (
        select round(max(100.0 * x.n / nullif(g.scored_n,0)),1)
        from (select sr2.prop_class, count(*)::numeric n from scope_rows sr2 where sr2.scope_level=g.scope_level and sr2.scope_key=g.scope_key group by sr2.prop_class) x
      ) as max_property_class_share_pct
    from grouped g
  )
  insert into public.watchdog_index_distribution_snapshots(
    run_id, scope_level, scope_key, municipality, county, model_version, promotion_status,
    scored_n, observed_warehouse_n, observed_warehouse_share_pct,
    distinct_counties, distinct_municipalities, distinct_property_classes, score_unique_values,
    score_p10, score_p25, score_median, score_p75, score_p90, score_iqr, score_p90_p10_span,
    highly_pressured_tail_pct, pressured_or_lower_pct, favorable_or_strong_pct, strong_tail_pct,
    evidence_mean, evidence_p10, evidence_p25, evidence_median, evidence_p75, evidence_p90,
    low_evidence_pct, high_evidence_pct, max_subgeography_share_pct, max_property_class_share_pct,
    score_band_counts, component_distributions, property_class_distribution,
    promotion_reasons, lineage, oldest_observed_at, newest_observed_at
  )
  select
    v_run_id, g.scope_level, g.scope_key, g.municipality, g.county, 'ROBUST-v1', 'research_only',
    g.scored_n, g.observed_warehouse_n,
    round(100.0 * g.scored_n / nullif(g.observed_warehouse_n,0),1),
    g.distinct_counties, g.distinct_municipalities, g.distinct_property_classes, g.score_unique_values,
    g.score_p10, g.score_p25, g.score_median, g.score_p75, g.score_p90,
    round(g.score_p75 - g.score_p25,1), round(g.score_p90 - g.score_p10,1),
    g.highly_pressured_tail_pct, g.pressured_or_lower_pct, g.favorable_or_strong_pct, g.strong_tail_pct,
    g.evidence_mean, g.evidence_p10, g.evidence_p25, g.evidence_median, g.evidence_p75, g.evidence_p90,
    g.low_evidence_pct, g.high_evidence_pct, g.max_subgeography_share_pct, g.max_property_class_share_pct,
    jsonb_build_object(
      'highly_pressured', count(*) filter(where sr.score < 35),
      'pressured', count(*) filter(where sr.score >= 35 and sr.score < 50),
      'typical_or_mixed', count(*) filter(where sr.score >= 50 and sr.score < 65),
      'favorable', count(*) filter(where sr.score >= 65 and sr.score < 80),
      'strong', count(*) filter(where sr.score >= 80)
    ),
    (
      select jsonb_object_agg(c.public_key, jsonb_build_object(
        'letter', c.letter,
        'available_n', m.available_n,
        'availability_pct', m.availability_pct,
        'p10',m.p10,'p25',m.p25,'median',m.median,'p75',m.p75,'p90',m.p90
      ))
      from (values
        ('recourse','recourse','R'),
        ('fairness','overassessment_position','O'),
        ('burden','burden','B'),
        ('uniformity','uniformity','U'),
        ('stability','stability','S'),
        ('trajectory','trajectory','T')
      ) c(input_key,public_key,letter)
      cross join lateral (
        select count(*) filter(where sr2.components->c.input_key->>'score' is not null)::int as available_n,
          round(100.0 * count(*) filter(where sr2.components->c.input_key->>'score' is not null) / nullif(count(*),0),1) as availability_pct,
          round(percentile_cont(.10) within group(order by (sr2.components->c.input_key->>'score')::numeric) filter(where sr2.components->c.input_key->>'score' is not null)::numeric,1) as p10,
          round(percentile_cont(.25) within group(order by (sr2.components->c.input_key->>'score')::numeric) filter(where sr2.components->c.input_key->>'score' is not null)::numeric,1) as p25,
          round(percentile_cont(.50) within group(order by (sr2.components->c.input_key->>'score')::numeric) filter(where sr2.components->c.input_key->>'score' is not null)::numeric,1) as median,
          round(percentile_cont(.75) within group(order by (sr2.components->c.input_key->>'score')::numeric) filter(where sr2.components->c.input_key->>'score' is not null)::numeric,1) as p75,
          round(percentile_cont(.90) within group(order by (sr2.components->c.input_key->>'score')::numeric) filter(where sr2.components->c.input_key->>'score' is not null)::numeric,1) as p90
        from scope_rows sr2
        where sr2.scope_level=g.scope_level and sr2.scope_key=g.scope_key
      ) m
    ),
    (
      select coalesce(jsonb_object_agg(x.prop_class, jsonb_build_object('n',x.n,'pct',x.pct)), '{}'::jsonb)
      from (
        select sr2.prop_class, count(*)::int n,
               round(100.0 * count(*) / nullif(g.scored_n,0),1) pct
        from scope_rows sr2
        where sr2.scope_level=g.scope_level and sr2.scope_key=g.scope_key
        group by sr2.prop_class
      ) x
    ),
    jsonb_build_array(
      'Research-only distribution snapshot: no geographic Watchdog Index score is calculated.',
      'Sampling representativeness has not been certified; persisted score observations are not a population frame.',
      'Public on-demand score cache is intentionally excluded because search traffic is demand-selected.',
      'A separate governed geographic model, minimum-data policy, sensitivity review and validation decision are required before promotion.'
    ),
    jsonb_build_object(
      'master_brand','Watchdog',
      'product_family','Watchdog Index',
      'model_version','ROBUST-v1',
      'source_relation','public.score_observations',
      'source_marker_id','watchdog.watchdog_score',
      'selection_policy','latest persisted canonical ROBUST-v1 observation per PAMS_PIN by observed_at then observed_on',
      'geography_relation','public.property_lookups',
      'observed_warehouse_denominator','property_lookups rows for this scope; not statewide parcel-population coverage',
      'on_demand_cache_relation','public.public_watchdog_score_cache_v1',
      'on_demand_cache_excluded',true,
      'on_demand_cache_rows_excluded',v_cache_count,
      'source_observation_fingerprint',v_fingerprint,
      'unjoined_source_observations',v_unjoined_count
    ),
    g.oldest_observed_at, g.newest_observed_at
  from enriched g
  join scope_rows sr on sr.scope_level=g.scope_level and sr.scope_key=g.scope_key
  group by g.scope_level,g.scope_key,g.municipality,g.county,g.scored_n,g.observed_warehouse_n,
    g.distinct_counties,g.distinct_municipalities,g.distinct_property_classes,g.score_unique_values,
    g.score_p10,g.score_p25,g.score_median,g.score_p75,g.score_p90,
    g.highly_pressured_tail_pct,g.pressured_or_lower_pct,g.favorable_or_strong_pct,g.strong_tail_pct,
    g.evidence_mean,g.evidence_p10,g.evidence_p25,g.evidence_median,g.evidence_p75,g.evidence_p90,
    g.low_evidence_pct,g.high_evidence_pct,g.max_subgeography_share_pct,g.max_property_class_share_pct,
    g.oldest_observed_at,g.newest_observed_at;

  update public.watchdog_index_distribution_runs
  set status='completed', completed_at=now(), notes=notes || jsonb_build_object('snapshot_rows',(select count(*) from public.watchdog_index_distribution_snapshots where run_id=v_run_id))
  where id=v_run_id;

  return v_run_id;
exception when others then
  if v_run_id is not null then
    update public.watchdog_index_distribution_runs
    set status='failed', completed_at=now(), notes=notes || jsonb_build_object('error',sqlerrm)
    where id=v_run_id;
  end if;
  raise;
end
$$;

revoke all on function public.refresh_watchdog_index_distribution_research_v1() from public, anon, authenticated;
grant execute on function public.refresh_watchdog_index_distribution_research_v1() to service_role;

select public.refresh_watchdog_index_distribution_research_v1();