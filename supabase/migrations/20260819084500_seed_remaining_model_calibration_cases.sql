-- Initiative 3: seed human-review calibration queues from real governed production findings.
-- This migration intentionally does NOT infer expected labels or score bands.
-- Calibration remains gated on independent review evidence.
with targets as (
  select id, model_key, model_version
  from public.intelligence_calibration_sets
  where status = 'draft'
    and model_key in ('closing_review','property_change_priority')
), ranked as (
  select
    t.id as set_id,
    t.model_key,
    t.model_version,
    f.id as finding_id,
    f.pams_pin,
    f.property_address,
    f.score,
    f.confidence,
    f.evidence_coverage,
    f.why_now,
    f.evidence,
    f.missing_evidence,
    f.facts_hash,
    f.created_at,
    row_number() over (
      partition by t.id
      order by f.evidence_coverage desc nulls last,
               f.confidence desc nulls last,
               f.created_at desc
    ) as rn
  from targets t
  join public.intelligence_runs r
    on r.model_key = t.model_key
   and r.model_version = t.model_version
  join public.intelligence_findings f on f.run_id = r.id
)
insert into public.intelligence_calibration_cases (
  calibration_set_id,
  case_key,
  pams_pin,
  property_address,
  expected_class,
  evidence_snapshot,
  source_notes
)
select
  set_id,
  'finding:' || finding_id::text,
  pams_pin,
  property_address,
  'unreviewed',
  jsonb_build_object(
    'finding_id', finding_id,
    'model_key', model_key,
    'model_version', model_version,
    'score', score,
    'confidence', confidence,
    'evidence_coverage', evidence_coverage,
    'why_now', why_now,
    'evidence', evidence,
    'missing_evidence', missing_evidence,
    'facts_hash', facts_hash,
    'finding_created_at', created_at
  ),
  'Seeded from a real governed production finding for human calibration review; no expected class or score was inferred.'
from ranked
where rn <= 25
on conflict (calibration_set_id, case_key) do nothing;
