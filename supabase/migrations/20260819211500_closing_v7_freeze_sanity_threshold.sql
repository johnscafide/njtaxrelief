-- Freeze the development sanity trigger before any v7 human labels.
update public.intelligence_model_versions
set signal_config = jsonb_set(
      jsonb_set(signal_config,'{development_sanity_threshold}','50'::jsonb,true),
      '{development_sanity_threshold_rationale}',
      to_jsonb('50 is the interpretable midpoint for direct exception severity; in the pre-label statewide shadow, thresholds 40 through 75 selected the same 9 of 48 high-exception properties. Frozen before development sanity labels.'::text),
      true
    ),
    scoring_notes = scoring_notes || ' STRUCTURAL PASS 2026-08-19: fresh 48/48 scorable across all 21 counties; 9 distinct primary scores; 17 unique vectors; 2 variable direct families. Development sanity threshold 50 frozen before any v7 human labels. Thresholds 40-75 selected the same 9/48 positives.'
where model_key='closing_review' and version=7;
