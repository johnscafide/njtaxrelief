-- Private source/evidence warehouse behind the Pro+ Transaction Command Center.
-- Raw bulk files remain private. Customer-visible results are projected into transaction_items.

create table if not exists public.transaction_data_releases (
  release_id text primary key,
  source_id text not null,
  tax_year integer not null,
  schema_version integer not null default 1,
  storage_bucket text not null,
  storage_prefix text not null,
  status text not null default 'candidate' check (status in ('candidate','live','retired','failed')),
  record_count bigint,
  district_count integer,
  source_url text,
  source_sha256 text,
  manifest jsonb not null default '{}'::jsonb,
  built_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists transaction_data_releases_one_live_source_year_idx
  on public.transaction_data_releases(source_id, tax_year)
  where status = 'live';
create index if not exists transaction_data_releases_lookup_idx
  on public.transaction_data_releases(source_id, tax_year, status, activated_at desc);

alter table public.transaction_data_releases enable row level security;
revoke all on table public.transaction_data_releases from public, anon, authenticated;
grant all on table public.transaction_data_releases to service_role;

create table if not exists public.transaction_evidence_observations (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  user_id uuid not null,
  pams_pin text,
  evidence_key text not null,
  provider_key text not null,
  evidence_status text not null check (evidence_status in ('observed','no_issue_observed','verify','source_unavailable','not_applicable','provider_error')),
  value jsonb not null default '{}'::jsonb,
  source_label text not null,
  source_url text,
  source_checked_at timestamptz not null,
  source_effective_at timestamptz,
  facts_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint transaction_evidence_observations_workspace_fk
    foreign key (transaction_id, user_id)
    references public.transaction_workspaces(id, user_id)
    on delete cascade,
  constraint transaction_evidence_observations_fact_uniq
    unique (transaction_id, evidence_key, provider_key, facts_hash)
);

create index if not exists transaction_evidence_observations_tx_latest_idx
  on public.transaction_evidence_observations(transaction_id, evidence_key, source_checked_at desc);
create index if not exists transaction_evidence_observations_pin_idx
  on public.transaction_evidence_observations(pams_pin, provider_key, source_checked_at desc)
  where pams_pin is not null;

alter table public.transaction_evidence_observations enable row level security;
revoke all on table public.transaction_evidence_observations from public, anon, authenticated;
grant all on table public.transaction_evidence_observations to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'transaction-evidence-private',
  'transaction-evidence-private',
  false,
  52428800,
  array['application/json','application/gzip','application/octet-stream']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.activate_transaction_data_release(p_release_id text)
returns public.transaction_data_releases
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.transaction_data_releases;
begin
  select * into target
  from public.transaction_data_releases
  where release_id = p_release_id
  for update;

  if target.release_id is null then
    raise exception 'transaction data release not found';
  end if;
  if target.status not in ('candidate','live') then
    raise exception 'transaction data release is not activatable';
  end if;

  update public.transaction_data_releases
  set status = 'retired', updated_at = now()
  where source_id = target.source_id
    and tax_year = target.tax_year
    and release_id <> target.release_id
    and status = 'live';

  update public.transaction_data_releases
  set status = 'live', activated_at = coalesce(activated_at, now()), updated_at = now()
  where release_id = target.release_id
  returning * into target;

  return target;
end;
$$;

revoke all on function public.activate_transaction_data_release(text) from public, anon, authenticated;
grant execute on function public.activate_transaction_data_release(text) to service_role;

comment on table public.transaction_data_releases is
  'Service-only registry of validated source snapshots used by Transaction evidence. Raw bulk files live in private Storage.';
comment on table public.transaction_evidence_observations is
  'Append-only service evidence ledger for Transaction workspaces. Customer UI reads projected transaction_items, not this raw ledger.';
comment on function public.activate_transaction_data_release(text) is
  'Service-only atomic promotion for a validated Transaction source snapshot.';
