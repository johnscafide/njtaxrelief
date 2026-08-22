-- ROBUST-v1 Watchdog Score calibration harness
-- NJW-273 / NJW-270
-- READ ONLY. This file must never mutate score_observations or production score state.
--
-- Purpose:
--   1. Verify that persisted ROBUST-v1 component evidence reproduces the stored score.
--   2. Quantify component availability and sample composition.
--   3. Test bounded +/-20% weight perturbations and leave-one-component-out sensitivity.
--   4. Compare current missing-evidence renormalization with explicit imputation stress cases.
--   5. Stress evidence loss by dropping one currently available component.
--
-- Sampling rule:
--   Use the latest canonical observation per pams_pin. This prevents duplicate user/observation
--   copies of the same property from distorting rank and migration statistics.
--
-- IMPORTANT:
--   This harness measures sensitivity of the observed cohort. It is not a statewide weight
--   optimizer and must not be used to change ROBUST-v1 weights without a representative cohort,
--   including defensible Trajectory and Overassessment Position evidence.

-- -----------------------------------------------------------------------------
-- 1. Latest-per-property canonical cohort + exact baseline reproduction
-- -----------------------------------------------------------------------------
with latest as (
  select distinct on (o.pams_pin)
    o.pams_pin,
    o.score::numeric as stored_score,
    o.evidence_coverage::numeric as evidence_coverage,
    o.inputs,
    o.observed_at
  from public.score_observations o
  where o.marker_id = 'watchdog.watchdog_score'
    and o.model_version = 'ROBUST-v1'
  order by o.pams_pin, o.observed_at desc
), components as (
  select
    l.*,
    nullif(l.inputs#>>'{components,recourse,score}','')::numeric as r,
    nullif(l.inputs#>>'{components,fairness,score}','')::numeric as o,
    nullif(l.inputs#>>'{components,burden,score}','')::numeric as b,
    nullif(l.inputs#>>'{components,uniformity,score}','')::numeric as u,
    nullif(l.inputs#>>'{components,stability,score}','')::numeric as s,
    nullif(l.inputs#>>'{components,trajectory,score}','')::numeric as t
  from latest l
), reproduced as (
  select *,
    round(
      (coalesce(r*10,0)+coalesce(o*20,0)+coalesce(b*30,0)+coalesce(u*15,0)+coalesce(s*15,0)+coalesce(t*10,0)) /
      nullif(
        (case when r is not null then 10 else 0 end)+
        (case when o is not null then 20 else 0 end)+
        (case when b is not null then 30 else 0 end)+
        (case when u is not null then 15 else 0 end)+
        (case when s is not null then 15 else 0 end)+
        (case when t is not null then 10 else 0 end), 0
      )
    ) as recomputed_score
  from components
)
select
  count(*) as unique_properties,
  count(*) filter (where recomputed_score = stored_score) as exact_reproductions,
  max(abs(recomputed_score-stored_score)) as max_abs_delta,
  round(avg(abs(recomputed_score-stored_score)),3) as mean_abs_delta,
  round(avg(evidence_coverage),1) as mean_coverage,
  min(evidence_coverage) as min_coverage,
  max(evidence_coverage) as max_coverage
from reproduced;

-- -----------------------------------------------------------------------------
-- 2. Component availability, bands and sample geography
-- -----------------------------------------------------------------------------
with latest as (
  select distinct on (o.pams_pin)
    o.pams_pin,o.score::numeric as score,o.evidence_coverage::numeric as coverage,o.inputs,o.observed_at
  from public.score_observations o
  where o.marker_id='watchdog.watchdog_score' and o.model_version='ROBUST-v1'
  order by o.pams_pin,o.observed_at desc
), enriched as (
  select
    l.*,
    coalesce(nullif(l.inputs->>'county',''),p.county,'UNKNOWN') as county,
    coalesce(nullif(l.inputs->>'town',''),p.town,'UNKNOWN') as town,
    coalesce(p.prop_class,'UNKNOWN') as prop_class,
    nullif(l.inputs#>>'{components,recourse,score}','')::numeric as r,
    nullif(l.inputs#>>'{components,fairness,score}','')::numeric as o,
    nullif(l.inputs#>>'{components,burden,score}','')::numeric as b,
    nullif(l.inputs#>>'{components,uniformity,score}','')::numeric as u,
    nullif(l.inputs#>>'{components,stability,score}','')::numeric as s,
    nullif(l.inputs#>>'{components,trajectory,score}','')::numeric as t
  from latest l
  left join public.property_lookups p on p.pams_pin=l.pams_pin
)
select jsonb_build_object(
  'unique_properties',count(*),
  'score',jsonb_build_object(
    'mean',round(avg(score),1),
    'median',percentile_cont(.5) within group(order by score),
    'min',min(score),
    'max',max(score)
  ),
  'bands',jsonb_build_object(
    'A',count(*) filter(where score>=80),
    'B',count(*) filter(where score>=65 and score<80),
    'C',count(*) filter(where score>=50 and score<65),
    'D',count(*) filter(where score>=35 and score<50),
    'E',count(*) filter(where score<35)
  ),
  'coverage',jsonb_build_object(
    'mean',round(avg(coverage),1),
    'min',min(coverage),
    'max',max(coverage),
    'ge60',count(*) filter(where coverage>=60),
    'ge70',count(*) filter(where coverage>=70),
    'ge75',count(*) filter(where coverage>=75),
    'ge80',count(*) filter(where coverage>=80),
    'ge85',count(*) filter(where coverage>=85),
    'ge90',count(*) filter(where coverage>=90)
  ),
  'available',jsonb_build_object(
    'R',count(r),'O',count(o),'B',count(b),'U',count(u),'S',count(s),'T',count(t)
  ),
  'geography',jsonb_build_object(
    'counties',count(distinct county),
    'towns',count(distinct town),
    'property_classes',count(distinct prop_class)
  )
) as cohort_summary
from enriched;

-- -----------------------------------------------------------------------------
-- 3. Weight perturbation and leave-one-out sensitivity
--    Target +/-20%; all other theoretical weights rescale proportionally to 100.
--    Missing dimensions remain omitted and the available scenario weights renormalize.
-- -----------------------------------------------------------------------------
with latest as (
  select distinct on (o.pams_pin)
    o.pams_pin,o.score::numeric as stored_score,o.inputs,o.observed_at
  from public.score_observations o
  where o.marker_id='watchdog.watchdog_score' and o.model_version='ROBUST-v1'
  order by o.pams_pin,o.observed_at desc
), comps as (
  select l.pams_pin,l.stored_score,x.component,x.score,x.base_weight
  from latest l
  cross join lateral (values
    ('R',nullif(l.inputs#>>'{components,recourse,score}','')::numeric,10::numeric),
    ('O',nullif(l.inputs#>>'{components,fairness,score}','')::numeric,20::numeric),
    ('B',nullif(l.inputs#>>'{components,burden,score}','')::numeric,30::numeric),
    ('U',nullif(l.inputs#>>'{components,uniformity,score}','')::numeric,15::numeric),
    ('S',nullif(l.inputs#>>'{components,stability,score}','')::numeric,15::numeric),
    ('T',nullif(l.inputs#>>'{components,trajectory,score}','')::numeric,10::numeric)
  ) x(component,score,base_weight)
), scenarios as (
  select * from (values
    ('baseline',null::text,1.0::numeric,'baseline'),
    ('R_up20','R',1.2::numeric,'perturb'),('R_down20','R',0.8::numeric,'perturb'),
    ('O_up20','O',1.2::numeric,'perturb'),('O_down20','O',0.8::numeric,'perturb'),
    ('B_up20','B',1.2::numeric,'perturb'),('B_down20','B',0.8::numeric,'perturb'),
    ('U_up20','U',1.2::numeric,'perturb'),('U_down20','U',0.8::numeric,'perturb'),
    ('S_up20','S',1.2::numeric,'perturb'),('S_down20','S',0.8::numeric,'perturb'),
    ('T_up20','T',1.2::numeric,'perturb'),('T_down20','T',0.8::numeric,'perturb'),
    ('R_leave_out','R',0::numeric,'leave_out'),('O_leave_out','O',0::numeric,'leave_out'),
    ('B_leave_out','B',0::numeric,'leave_out'),('U_leave_out','U',0::numeric,'leave_out'),
    ('S_leave_out','S',0::numeric,'leave_out'),('T_leave_out','T',0::numeric,'leave_out')
  ) v(name,target,factor,kind)
), scenario_target as (
  select s.*,
    case s.target when 'R' then 10 when 'O' then 20 when 'B' then 30
      when 'U' then 15 when 'S' then 15 when 'T' then 10 else null end::numeric as target_base
  from scenarios s
), weighted as (
  select c.pams_pin,c.stored_score,s.name,s.kind,s.target,c.component,c.score,
    case
      when s.target is null then c.base_weight
      when c.component=s.target then c.base_weight*s.factor
      else c.base_weight*((100-s.target_base*s.factor)/(100-s.target_base))
    end as scenario_weight
  from comps c cross join scenario_target s
), scored as (
  select pams_pin,stored_score,name,kind,target,
    sum(case when score is not null then score*scenario_weight else 0 end) /
      nullif(sum(case when score is not null then scenario_weight else 0 end),0) as raw_score
  from weighted
  group by pams_pin,stored_score,name,kind,target
), baseline as (
  select pams_pin,raw_score as baseline_raw,
    row_number() over(order by raw_score desc,pams_pin) as baseline_rank,
    count(*) over() as n
  from scored where name='baseline'
), scenario_ranked as (
  select s.*,row_number() over(partition by s.name order by s.raw_score desc,s.pams_pin) as scenario_rank
  from scored s
), joined as (
  select s.*,b.baseline_raw,b.baseline_rank,b.n,
    (b.baseline_rank<=ceil(b.n*.1)) as baseline_top10,
    (s.scenario_rank<=ceil(b.n*.1)) as scenario_top10
  from scenario_ranked s join baseline b using(pams_pin)
)
select
  name,kind,target,count(*) as n,
  round(avg(abs(raw_score-baseline_raw)),3) as mean_abs_delta,
  round(max(abs(raw_score-baseline_raw)),3) as max_abs_delta,
  round(100.0*avg(case when
    (case when round(raw_score)>=80 then 'A' when round(raw_score)>=65 then 'B' when round(raw_score)>=50 then 'C' when round(raw_score)>=35 then 'D' else 'E' end) <>
    (case when round(baseline_raw)>=80 then 'A' when round(baseline_raw)>=65 then 'B' when round(baseline_raw)>=50 then 'C' when round(baseline_raw)>=35 then 'D' else 'E' end)
    then 1 else 0 end),1) as band_migration_pct,
  round(corr(baseline_rank::numeric,scenario_rank::numeric)::numeric,5) as rank_corr,
  round(100.0*avg(case when baseline_top10<>scenario_top10 then 1 else 0 end),1) as top10_membership_churn_pct
from joined
group by name,kind,target
order by case kind when 'baseline' then 0 when 'perturb' then 1 else 2 end,name;

-- -----------------------------------------------------------------------------
-- 4. Missing-evidence imputation stress test
--    Baseline is current renormalization. The 0/50/100 cases are deliberately
--    artificial controls and MUST NOT be interpreted as proposed production rules.
-- -----------------------------------------------------------------------------
with latest as (
  select distinct on (o.pams_pin)
    o.pams_pin,o.score::numeric as stored_score,o.inputs,o.observed_at
  from public.score_observations o
  where o.marker_id='watchdog.watchdog_score' and o.model_version='ROBUST-v1'
  order by o.pams_pin,o.observed_at desc
), c as (
  select l.pams_pin,l.stored_score,
    nullif(l.inputs#>>'{components,recourse,score}','')::numeric r,
    nullif(l.inputs#>>'{components,fairness,score}','')::numeric o,
    nullif(l.inputs#>>'{components,burden,score}','')::numeric b,
    nullif(l.inputs#>>'{components,uniformity,score}','')::numeric u,
    nullif(l.inputs#>>'{components,stability,score}','')::numeric s,
    nullif(l.inputs#>>'{components,trajectory,score}','')::numeric t
  from latest l
), scenarios as (
  select pams_pin,stored_score,'renormalize' as scenario,stored_score as scenario_score from c
  union all
  select pams_pin,stored_score,'missing_50',round((coalesce(r,50)*10+coalesce(o,50)*20+coalesce(b,50)*30+coalesce(u,50)*15+coalesce(s,50)*15+coalesce(t,50)*10)/100.0) from c
  union all
  select pams_pin,stored_score,'missing_0',round((coalesce(r,0)*10+coalesce(o,0)*20+coalesce(b,0)*30+coalesce(u,0)*15+coalesce(s,0)*15+coalesce(t,0)*10)/100.0) from c
  union all
  select pams_pin,stored_score,'missing_100',round((coalesce(r,100)*10+coalesce(o,100)*20+coalesce(b,100)*30+coalesce(u,100)*15+coalesce(s,100)*15+coalesce(t,100)*10)/100.0) from c
)
select scenario,count(*) as n,
  round(avg(abs(scenario_score-stored_score)),2) as mean_abs_delta,
  max(abs(scenario_score-stored_score)) as max_abs_delta,
  round(100.0*avg(case when
    (case when scenario_score>=80 then 'A' when scenario_score>=65 then 'B' when scenario_score>=50 then 'C' when scenario_score>=35 then 'D' else 'E' end) <>
    (case when stored_score>=80 then 'A' when stored_score>=65 then 'B' when stored_score>=50 then 'C' when stored_score>=35 then 'D' else 'E' end)
    then 1 else 0 end),1) as band_migration_pct,
  round(avg(scenario_score-stored_score),2) as mean_signed_delta
from scenarios
group by scenario
order by scenario;

-- -----------------------------------------------------------------------------
-- 5. Evidence-loss stress test
--    Drop one currently present component from every property and group by the
--    resulting evidence coverage. This demonstrates why coverage alone is not
--    sufficient: composition of the retained evidence matters.
-- -----------------------------------------------------------------------------
with latest as (
  select distinct on (o.pams_pin)
    o.pams_pin,o.score::numeric as stored_score,o.evidence_coverage::numeric as coverage,o.inputs,o.observed_at
  from public.score_observations o
  where o.marker_id='watchdog.watchdog_score' and o.model_version='ROBUST-v1'
  order by o.pams_pin,o.observed_at desc
), comps as (
  select l.pams_pin,l.stored_score,l.coverage,x.component,x.score,x.weight
  from latest l cross join lateral (values
    ('R',nullif(l.inputs#>>'{components,recourse,score}','')::numeric,10::numeric),
    ('O',nullif(l.inputs#>>'{components,fairness,score}','')::numeric,20::numeric),
    ('B',nullif(l.inputs#>>'{components,burden,score}','')::numeric,30::numeric),
    ('U',nullif(l.inputs#>>'{components,uniformity,score}','')::numeric,15::numeric),
    ('S',nullif(l.inputs#>>'{components,stability,score}','')::numeric,15::numeric),
    ('T',nullif(l.inputs#>>'{components,trajectory,score}','')::numeric,10::numeric)
  ) x(component,score,weight)
), drops as (
  select distinct pams_pin,stored_score,coverage,component as dropped,weight as dropped_weight
  from comps where score is not null
), rescored as (
  select d.pams_pin,d.stored_score,d.coverage,d.dropped,(d.coverage-d.dropped_weight) as resulting_coverage,
    round(sum(case when c.component<>d.dropped and c.score is not null then c.score*c.weight else 0 end) /
      nullif(sum(case when c.component<>d.dropped and c.score is not null then c.weight else 0 end),0)) as rescored
  from drops d join comps c using(pams_pin,stored_score,coverage)
  group by d.pams_pin,d.stored_score,d.coverage,d.dropped,d.dropped_weight
)
select resulting_coverage,count(*) as simulations,
  round(avg(abs(rescored-stored_score)),2) as mean_abs_delta,
  max(abs(rescored-stored_score)) as max_abs_delta,
  round(100.0*avg(case when
    (case when rescored>=80 then 'A' when rescored>=65 then 'B' when rescored>=50 then 'C' when rescored>=35 then 'D' else 'E' end) <>
    (case when stored_score>=80 then 'A' when stored_score>=65 then 'B' when stored_score>=50 then 'C' when stored_score>=35 then 'D' else 'E' end)
    then 1 else 0 end),1) as band_migration_pct
from rescored
group by resulting_coverage
order by resulting_coverage;
