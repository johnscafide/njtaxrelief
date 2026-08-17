-- Govern how raw Watchdog facts/markers become normalized 0-100 Intelligence features.
-- Model weights and normalization transforms are versioned separately so historical runs remain reproducible.

create table if not exists public.intelligence_cohort_versions (
  cohort_key text not null,
  version integer not null check (version > 0),
  label text not null,
  description text not null,
  dimensions text[] not null default '{}'::text[],
  minimum_sample_size integer not null default 12 check (minimum_sample_size > 0),
  fallback_chain jsonb not null default '[]'::jsonb,
  status text not null default 'preview' check (status in ('draft','preview','live','retired')),
  created_at timestamptz not null default now(),
  primary key (cohort_key, version)
);

create table if not exists public.intelligence_feature_versions (
  feature_key text not null,
  version integer not null check (version > 0),
  source_key text not null,
  label text not null,
  transform_type text not null,
  cohort_key text,
  cohort_version integer,
  config jsonb not null default '{}'::jsonb,
  direction text not null default 'higher_attention' check (direction in ('higher_attention','higher_confidence')),
  status text not null default 'preview' check (status in ('draft','preview','live','retired')),
  explanation text not null,
  created_at timestamptz not null default now(),
  primary key (feature_key, version),
  constraint intelligence_feature_cohort_pair check ((cohort_key is null and cohort_version is null) or (cohort_key is not null and cohort_version is not null)),
  constraint intelligence_feature_cohort_fkey foreign key (cohort_key, cohort_version)
    references public.intelligence_cohort_versions(cohort_key, version)
);

alter table public.intelligence_cohort_versions enable row level security;
alter table public.intelligence_feature_versions enable row level security;
grant select on public.intelligence_cohort_versions to authenticated;
grant select on public.intelligence_feature_versions to authenticated;

create policy intelligence_cohort_versions_authenticated_read
on public.intelligence_cohort_versions for select to authenticated using (true);

create policy intelligence_feature_versions_authenticated_read
on public.intelligence_feature_versions for select to authenticated using (true);

alter table public.intelligence_runs
  add column if not exists normalization_manifest jsonb not null default '{}'::jsonb,
  add column if not exists cohort_manifest jsonb not null default '{}'::jsonb;

insert into public.intelligence_cohort_versions
(cohort_key,version,label,description,dimensions,minimum_sample_size,fallback_chain,status)
values
('municipality_property_class',1,'Municipality + property class peers','Primary property peer group for context-sensitive anomaly normalization.',array['municipality','property_class'],12,'["municipality","county_property_class","county"]'::jsonb,'preview'),
('municipality',1,'Municipality peers','Municipality-wide comparison group used when class-specific context is not required or not sufficiently populated.',array['municipality'],12,'["county"]'::jsonb,'preview')
on conflict (cohort_key,version) do nothing;

insert into public.intelligence_feature_versions
(feature_key,version,source_key,label,transform_type,cohort_key,cohort_version,config,direction,status,explanation)
values
('watchdog.assessment_to_sale_ratio',1,'watchdog.assessment_to_sale_ratio','Assessment-to-sale anomaly','distance_from_target',null,null,'{"target":1,"full_attention_delta":0.35,"clamp_min":0,"clamp_max":100}'::jsonb,'higher_attention','preview','Scores how far the governed assessment-to-sale ratio departs from 1.0; it is an anomaly signal, not a value conclusion.'),
('watchdog.sale_to_assessment_ratio',1,'watchdog.sale_to_assessment_ratio','Sale-to-assessment anomaly','distance_from_target',null,null,'{"target":1,"full_attention_delta":0.50,"clamp_min":0,"clamp_max":100}'::jsonb,'higher_attention','preview','Scores how far the reciprocal sale-to-assessment relationship departs from 1.0.'),
('watchdog.tax_to_assessment_rate',1,'watchdog.tax_to_assessment_rate','Tax-rate peer position','cohort_percentile_high','municipality_property_class',1,'{"winsorize_low":0.02,"winsorize_high":0.98}'::jsonb,'higher_attention','preview','Ranks the governed tax-to-assessment rate within the selected peer cohort; higher percentile means more review attention, not wrongdoing.'),
('watchdog.source_authority_coverage',1,'watchdog.source_authority_coverage','Source authority coverage','identity_0_100',null,null,'{}'::jsonb,'higher_confidence','preview','Uses the governed source-coverage percentage as evidence confidence.'),
('watchdog.closing_exception_priority',1,'watchdog.closing_exception_priority','Closing exception priority','identity_0_100',null,null,'{}'::jsonb,'higher_attention','preview','Consumes the existing governed 0-100 closing exception priority score without reinterpreting its underlying facts.'),
('watchdog.due_diligence_signal_count',1,'watchdog.due_diligence_signal_count','Due-diligence signal count','count_cap',null,null,'{"cap":6}'::jsonb,'higher_attention','preview','Normalizes the number of governed due-diligence signals to a bounded 0-100 attention feature.'),
('watchdog.permit_closure_confidence',1,'watchdog.permit_closure_confidence','Permit closure gap','inverse_0_100',null,null,'{}'::jsonb,'higher_attention','preview','Inverts permit-closure confidence so lower closure confidence produces more review attention.'),
('watchdog.title_constraint_stack',1,'watchdog.title_constraint_stack','Title/public-record constraint count','count_cap',null,null,'{"cap":6}'::jsonb,'higher_attention','preview','Normalizes the count of governed title/public-record constraint signals; it is not a title determination.'),
('watchdog.transaction_diligence_completion',1,'watchdog.transaction_diligence_completion','Transaction diligence completion','identity_0_100',null,null,'{}'::jsonb,'higher_confidence','preview','Uses governed diligence-completion coverage as evidence confidence.'),
('event.materiality',1,'event.materiality','Change materiality','categorical_map',null,null,'{"critical":100,"high":85,"medium":60,"low":30,"info":10}'::jsonb,'higher_attention','preview','Maps the governed change-event materiality band into a bounded attention score.'),
('event.recency',1,'event.occurred_at','Change recency','recency_decay',null,null,'{"breakpoints":[{"days":7,"score":100},{"days":30,"score":80},{"days":90,"score":55},{"days":180,"score":30},{"days":365,"score":15}],"older_score":5}'::jsonb,'higher_attention','preview','Maps event age to an attention score using explicit versioned recency breakpoints.'),
('event.delta_numeric',1,'event.delta_numeric','Numeric change magnitude','field_specific_normalization',null,null,'{}'::jsonb,'higher_attention','draft','Numeric deltas have different units by field and will remain unavailable until field-specific normalization is defined; Watchdog must not compare unlike units.'),
('watchdog.property_story_confidence',1,'watchdog.property_story_confidence','Property story confidence','identity_0_100',null,null,'{}'::jsonb,'higher_confidence','preview','Uses the governed property-story confidence measure as evidence confidence.')
on conflict (feature_key,version) do nothing;
