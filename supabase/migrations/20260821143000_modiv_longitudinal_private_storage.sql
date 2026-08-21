-- Private, privacy-minimized storage plane for statewide MOD-IV longitudinal history.
-- No browser role receives direct object access. The server-side provider uses the
-- existing service credential only after Watchdog entitlement checks.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'modiv-longitudinal',
  'modiv-longitudinal',
  false,
  104857600,
  array['application/gzip','application/json','application/octet-stream']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.modiv_longitudinal_releases (
  release_id text primary key check (release_id ~ '^[a-z0-9][a-z0-9._-]{2,79}$'),
  storage_prefix text not null check (storage_prefix ~ '^[a-z0-9][a-z0-9/_-]{2,159}$'),
  source_years integer[] not null,
  source_urls jsonb not null default '[]'::jsonb,
  record_count bigint,
  district_count integer,
  manifest jsonb not null default '{}'::jsonb,
  status text not null default 'candidate' check (status in ('building','candidate','live','failed')),
  built_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.modiv_longitudinal_releases enable row level security;
revoke all on table public.modiv_longitudinal_releases from public, anon, authenticated;
grant select, insert, update, delete on table public.modiv_longitudinal_releases to service_role;

create unique index if not exists modiv_longitudinal_one_live_release_idx
  on public.modiv_longitudinal_releases ((status))
  where status = 'live';

comment on table public.modiv_longitudinal_releases is
  'Service-only release manifest for privacy-minimized NJ Treasury MOD-IV longitudinal district partitions.';
