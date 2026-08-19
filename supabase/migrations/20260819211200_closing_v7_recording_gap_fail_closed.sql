-- Missing sale-date context must not hide an observable recording-reference gap.
update public.derived_formula_registry
set formula='recording_reference_gap; sale recency remains supporting context and is not required to recognize the direct gap',
    dependencies=array['watchdog.closing_recording_reference_gap_v7'],
    explanation='Direct recording-reference exception. Missing sale-date context cannot hide an otherwise observable recording gap; county-record verification remains required.',
    operation='weighted_scores',
    config=jsonb_build_object('require_all',true,'items',jsonb_build_array(jsonb_build_object('dep','watchdog.closing_recording_reference_gap_v7','weight',1,'transform','identity'))),
    updated_at=now()
where marker_id='watchdog.closing_recording_exception_v7';

update public.intelligence_model_versions
set scoring_notes = scoring_notes || ' PRE-SHADOW CONTRACT: recording-reference gap remains directly scoreable even when sale recency is unavailable; recency cannot create or suppress the exception.'
where model_key='closing_review' and version=7;
