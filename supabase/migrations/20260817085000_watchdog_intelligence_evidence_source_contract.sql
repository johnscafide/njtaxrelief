-- Watchdog Intelligence trusted evidence source vocabulary.
-- Keep source kinds small, explicit, and semantically stable across adapters.

alter table public.intelligence_evidence_batches
  drop constraint if exists intelligence_evidence_batches_source_kind_check;

alter table public.intelligence_evidence_batches
  add constraint intelligence_evidence_batches_source_kind_check
  check (source_kind in (
    'workbench_hydrate',
    'workbench_derived',
    'property_change_events',
    'governed_fixture'
  ));
