alter table public.intelligence_semantic_snapshot_cache
  add column if not exists user_id uuid not null references auth.users(id) on delete cascade;

alter table public.intelligence_semantic_snapshot_cache
  drop constraint if exists intelligence_semantic_snapsho_pams_pin_plan_tier_pack_key_r_key;

alter table public.intelligence_semantic_snapshot_cache
  add constraint intelligence_semantic_snapshot_cache_user_scope_key
  unique (user_id, pams_pin, plan_tier, pack_key, registry_version);

create index if not exists intelligence_semantic_snapshot_cache_user_idx
  on public.intelligence_semantic_snapshot_cache (user_id, expires_at);
