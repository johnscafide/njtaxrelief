alter table public.intelligence_findings add column if not exists property_context jsonb not null default '{}'::jsonb;
comment on column public.intelligence_findings.property_context is 'Non-scoring property context preserved with a finding for audit/filter UX, such as municipality, county and property class.';
