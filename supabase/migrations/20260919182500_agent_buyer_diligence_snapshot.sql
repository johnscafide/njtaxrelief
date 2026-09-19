-- NJW-396: retain the sourced shortlist diligence snapshot returned by the Agent property-search boundary.
alter table public.agent_buyer_shortlist_properties
  add column if not exists diligence_snapshot jsonb not null default '{}'::jsonb;
