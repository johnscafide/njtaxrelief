-- Initiative 3 repair: ensure seeded independent-review cases have their model result rows.
-- This does not set or infer human expected_class labels.
insert into public.intelligence_calibration_reviews (
  calibration_case_id,
  model_key,
  model_version,
  actual_score,
  actual_confidence,
  evidence_coverage,
  predicted_class,
  review_outcome,
  review_notes,
  reviewer_user_id,
  reviewed_at
)
select
  c.id,
  s.model_key,
  s.model_version,
  nullif(c.evidence_snapshot->>'score','')::numeric,
  nullif(c.evidence_snapshot->>'confidence','')::numeric,
  nullif(c.evidence_snapshot->>'evidence_coverage','')::numeric,
  case
    when nullif(c.evidence_snapshot->>'evidence_coverage','')::numeric < coalesce(nullif(r.normalization_manifest->>'minimum_evidence_coverage','')::numeric,0)
      then 'insufficient_evidence'
    when nullif(c.evidence_snapshot->>'score','')::numeric >= coalesce(nullif(s.source_manifest->>'priority_threshold','')::numeric,60)
      then 'review_priority'
    else 'not_priority'
  end,
  'needs_review',
  null,
  null,
  null
from public.intelligence_calibration_cases c
join public.intelligence_calibration_sets s on s.id = c.calibration_set_id
left join public.intelligence_findings f on f.id = nullif(c.evidence_snapshot->>'finding_id','')::uuid
left join public.intelligence_runs r on r.id = f.run_id
where c.expected_class = 'unreviewed'
  and s.status <> 'retired'
  and s.model_key in ('closing_review','property_change_priority')
on conflict (calibration_case_id, model_key, model_version) do nothing;
