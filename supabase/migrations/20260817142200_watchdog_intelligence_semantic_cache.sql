create table if not exists public.intelligence_semantic_snapshot_cache (
  id uuid primary key default gen_random_uuid(),
  pams_pin text not null,
  plan_tier text not null check (plan_tier in ('standard','agent','pro','pro_plus','teams','developer')),
  pack_key text not null,
  registry_version text not null,
  facts_hash text not null check (char_length(facts_hash) = 64),
  payload jsonb not null,
  provider_summary jsonb not null default '{}'::jsonb,
  provider_versions jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pams_pin, plan_tier, pack_key, registry_version)
);

alter table public.intelligence_semantic_snapshot_cache enable row level security;

comment on table public.intelligence_semantic_snapshot_cache is
  'Service-only cache of governed semantic property snapshots. RLS intentionally has no browser policies; Edge Functions use service credentials.';

create index if not exists intelligence_semantic_snapshot_cache_expires_idx
  on public.intelligence_semantic_snapshot_cache (expires_at);

create index if not exists intelligence_semantic_snapshot_cache_pin_idx
  on public.intelligence_semantic_snapshot_cache (pams_pin, plan_tier);
