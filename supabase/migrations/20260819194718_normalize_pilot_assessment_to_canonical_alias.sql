delete from public.data_center_provider_coverage
where marker_id='njplus.nj-dca-pilot-forecast.pilot_project_assessment';

delete from public.derived_formula_registry
where marker_id='njplus.nj-dca-pilot-forecast.pilot_project_assessment';

insert into public.workbench_marker_aliases(alias_id,canonical_id,notes,updated_at)
values(
  'njplus.nj-dca-pilot-forecast.pilot_project_assessment',
  'exemption.pilot_assessed_value',
  'Legacy v0.31 source-pack field. Exact semantic match to the canonical NJ DCA 2026 PILOT Summary By Town assessed-value marker. This alias does not activate or imply an authoritative PILOT forecast dataset.',
  now()
)
on conflict(alias_id) do update set
  canonical_id=excluded.canonical_id,
  notes=excluded.notes,
  updated_at=excluded.updated_at;