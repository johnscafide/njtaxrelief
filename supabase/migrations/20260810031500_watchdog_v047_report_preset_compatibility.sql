begin;

-- The first report-builder release used job-family preset names. The current
-- interface uses profession-specific names. Keep both generations valid so
-- existing reports remain readable while new reports can be created.
alter table public.professional_reports
  drop constraint if exists professional_reports_preset_check;

alter table public.professional_reports
  add constraint professional_reports_preset_check
  check (preset = any (array[
    'due_diligence'::text,
    'appeal'::text,
    'listing'::text,
    'lending'::text,
    'investment'::text,
    'title'::text,
    'construction'::text,
    'attorney_title'::text,
    'lender_collateral'::text,
    'broker_listing'::text,
    'investor_diligence'::text,
    'appeal_case'::text,
    'custom'::text
  ]));

comment on constraint professional_reports_preset_check on public.professional_reports is
  'Backward-compatible report presets: legacy job families plus current profession-specific presets.';

commit;
