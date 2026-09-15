alter table public.transaction_municipal_requirements
  add column if not exists curated_override boolean not null default false,
  add column if not exists curated_note text;

comment on column public.transaction_municipal_requirements.curated_override is
  'When true, automated statewide requirement publishing must not overwrite this hand-verified municipal requirement row.';

comment on column public.transaction_municipal_requirements.curated_note is
  'Internal provenance note describing why the row is curated or which official sources were reconciled.';
