-- Keep Intelligence normalization/cohort lookups covered without redundant indexes.

create index if not exists intelligence_feature_versions_cohort_idx
on public.intelligence_feature_versions(cohort_key, cohort_version)
where cohort_key is not null;

-- Superseded by the composite (model_key, model_version) index.
drop index if exists public.intelligence_runs_model_key_idx;
