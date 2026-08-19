-- Watchdog Intelligence: minimal governed derived-formula graph required by Closing Review.
-- Production already owns these rows. ON CONFLICT DO NOTHING keeps this migration promotion-safe.

create table if not exists public.derived_formula_registry (
  marker_id text primary key,
  engine_version text not null,
  formula text not null,
  dependencies text[] not null default '{}',
  confidence text not null check (confidence in ('high','medium','low')),
  status text not null default 'live' check (status in ('live','partial','planned','disabled')),
  explanation text,
  updated_at timestamptz not null default now(),
  operation text,
  config jsonb not null default '{}'::jsonb
);

alter table public.derived_formula_registry enable row level security;
grant select on public.derived_formula_registry to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='derived_formula_registry' and policyname='derived_formula_registry_read'
  ) then
    create policy derived_formula_registry_read on public.derived_formula_registry
      for select to authenticated using (true);
  end if;
end $$;

insert into public.derived_formula_registry
(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config)
values
('watchdog.closing_exception_priority','watchdog-derived-v3','30% open-permit screen + 25% title constraints + 25% environmental screen + 20% flood/environment screen',array['preflight.open_permit_count','watchdog.title_constraint_stack','watchdog.environmental_encumbrance_severity','watchdog.flood_environment_risk_score'],'medium','live','Ranks governed public-record exceptions for a closing checklist without making a legal or title determination.','weighted_scores','{"items":[{"dep":"preflight.open_permit_count","weight":30,"transform":"count10"},{"dep":"watchdog.title_constraint_stack","weight":25,"transform":"count6"},{"dep":"watchdog.environmental_encumbrance_severity","weight":25,"transform":"identity"},{"dep":"watchdog.flood_environment_risk_score","weight":20,"transform":"identity"}]}'::jsonb),
('watchdog.due_diligence_signal_count','watchdog-derived-v3','count(active governed preflight signals)',array['preflight.fema_flood_zone','preflight.tidal_cafe_hit','preflight.wetlands_2012_hit','preflight.epa_priority_wetland_hit','preflight.tidelands_reference_hit','preflight.deed_notice_hit','preflight.cea_hit','preflight.highlands_hit','preflight.pinelands_hit'],'medium','live','Count of active mapped due-diligence signals.','signal_count','{"flood_dep":"preflight.fema_flood_zone"}'::jsonb),
('watchdog.environmental_encumbrance_severity','watchdog-derived-v3','deed_notice*35 + CEA*30 + min(contaminated_sites,3)*12 + min(UST,3)*8',array['preflight.deed_notice_hit','preflight.cea_hit','preflight.contaminated_site_500m','preflight.ust_250m'],'medium','live','Environmental due-diligence screening severity; not a contamination determination.','weighted_signals','{"signals":[{"dep":"preflight.deed_notice_hit","weight":35,"transform":"bool"},{"dep":"preflight.cea_hit","weight":30,"transform":"bool"},{"dep":"preflight.contaminated_site_500m","weight":36,"transform":"count3"},{"dep":"preflight.ust_250m","weight":24,"transform":"count3"}]}'::jsonb),
('watchdog.flood_environment_risk_score','watchdog-derived-v3','FEMA_zone_weight + tidal_CAFE*18 + wetlands*10 + priority_wetlands*6',array['preflight.fema_flood_zone','preflight.tidal_cafe_hit','preflight.wetlands_2012_hit','preflight.epa_priority_wetland_hit'],'medium','live','Combined flood/environment screening score.','weighted_signals','{"signals":[{"dep":"preflight.fema_flood_zone","weight":66,"transform":"flood100"},{"dep":"preflight.tidal_cafe_hit","weight":18,"transform":"bool"},{"dep":"preflight.wetlands_2012_hit","weight":10,"transform":"bool"},{"dep":"preflight.epa_priority_wetland_hit","weight":6,"transform":"bool"}]}'::jsonb),
('watchdog.permit_closure_confidence','watchdog-derived-v3','100 * (1 - min(open_permit_count / permit_count, 1))',array['preflight.permit_count','preflight.open_permit_count'],'medium','live','Permit-record closure screening confidence from published permit counts; not a certificate or code-clearance determination.','permit_closure','{}'::jsonb),
('watchdog.title_constraint_stack','watchdog-derived-v3','count(tidelands, deed_notice, wetlands, priority_wetlands, highlands, pinelands)',array['preflight.tidelands_reference_hit','preflight.deed_notice_hit','preflight.wetlands_2012_hit','preflight.epa_priority_wetland_hit','preflight.highlands_hit','preflight.pinelands_hit'],'medium','live','Count of mapped title/due-diligence constraint signals; not a title opinion.','signal_count','{}'::jsonb),
('watchdog.transaction_diligence_completion','watchdog-derived-v3','checked governed preflight sources / required governed preflight sources * 100',array['preflight.fema_flood_zone','preflight.tidal_cafe_hit','preflight.wetlands_2012_hit','preflight.epa_priority_wetland_hit','preflight.tidelands_reference_hit','preflight.deed_notice_hit','preflight.cea_hit','preflight.highlands_hit','preflight.pinelands_hit','preflight.permit_count','preflight.open_permit_count'],'medium','live','Completion meter for the defined governed public-record transaction checks; it measures source coverage, not transaction readiness.','completeness','{"mode":"checked"}'::jsonb)
on conflict (marker_id) do nothing;
