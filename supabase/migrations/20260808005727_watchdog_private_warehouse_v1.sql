create schema if not exists watchdog_warehouse;

revoke all on schema watchdog_warehouse from public, anon, authenticated;
grant usage on schema watchdog_warehouse to service_role;

create table watchdog_warehouse.source_releases (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  edition text not null,
  source_sha256 text not null,
  source_record_count bigint not null check (source_record_count >= 0),
  normalized_record_count bigint not null check (normalized_record_count >= 0),
  status text not null default 'validated' check (status in ('received','validated','loaded','approved','published','retired','failed')),
  validation_contract_version integer not null default 1,
  source_metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz,
  validated_at timestamptz not null default now(),
  loaded_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, edition, source_sha256)
);

create table watchdog_warehouse.load_runs (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references watchdog_warehouse.source_releases(id) on delete cascade,
  status text not null default 'staging' check (status in ('staging','copying','validated','failed','approved')),
  expected_rows bigint not null check (expected_rows >= 0),
  copied_rows bigint not null default 0 check (copied_rows >= 0),
  rejected_rows bigint not null default 0 check (rejected_rows >= 0),
  partition_count integer not null default 0 check (partition_count >= 0),
  error_summary text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by text not null default 'watchdog-data-factory'
);

create table watchdog_warehouse.modiv_observations (
  release_id uuid not null references watchdog_warehouse.source_releases(id) on delete cascade,
  tax_year smallint not null check (tax_year between 1900 and 2100),
  parcel_key text not null,
  county_district char(4) not null,
  block text not null,
  lot text not null,
  qualifier text,
  record_id text,
  property_class text,
  property_location text,
  building_description text,
  land_description text,
  calculated_acres numeric(14,4),
  zoning text,
  tax_map_page text,
  deed_book text,
  deed_page text,
  sales_price_code text,
  deed_date date,
  sale_price bigint,
  sale_assessment bigint,
  sale_sr1a_unusable_code text,
  building_class text,
  year_constructed smallint,
  land_value bigint,
  improvement_value bigint,
  net_value bigint,
  property_use_code text,
  last_year_tax numeric(14,2),
  current_year_tax numeric(14,2),
  prior_year_net_value bigint,
  state_aid_amount numeric(14,2),
  ingested_at timestamptz not null default now(),
  primary key (release_id, parcel_key)
);

create table watchdog_warehouse.publication_sets (
  source_id text primary key,
  release_id uuid not null references watchdog_warehouse.source_releases(id),
  previous_release_id uuid references watchdog_warehouse.source_releases(id),
  publication_note text,
  published_at timestamptz not null default now(),
  published_by text not null
);

create table watchdog_warehouse.data_quality_summary (
  release_id uuid not null references watchdog_warehouse.source_releases(id) on delete cascade,
  check_id text not null,
  severity text not null check (severity in ('info','warning','error','blocking')),
  observation_count bigint not null default 0 check (observation_count >= 0),
  detail jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  primary key (release_id, check_id)
);

create index modiv_observations_parcel_year_idx on watchdog_warehouse.modiv_observations (parcel_key, tax_year desc);
create index modiv_observations_muni_block_lot_idx on watchdog_warehouse.modiv_observations (county_district, block, lot, tax_year desc);
create index modiv_observations_muni_class_idx on watchdog_warehouse.modiv_observations (county_district, property_class, tax_year desc);
create index modiv_observations_deed_date_idx on watchdog_warehouse.modiv_observations (deed_date desc) where deed_date is not null;
create index source_releases_source_status_idx on watchdog_warehouse.source_releases (source_id, status, validated_at desc);
create index load_runs_release_started_idx on watchdog_warehouse.load_runs (release_id, started_at desc);

alter table watchdog_warehouse.source_releases enable row level security;
alter table watchdog_warehouse.load_runs enable row level security;
alter table watchdog_warehouse.modiv_observations enable row level security;
alter table watchdog_warehouse.publication_sets enable row level security;
alter table watchdog_warehouse.data_quality_summary enable row level security;

revoke all on all tables in schema watchdog_warehouse from public, anon, authenticated;
revoke all on all sequences in schema watchdog_warehouse from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema watchdog_warehouse to service_role;
grant usage, select on all sequences in schema watchdog_warehouse to service_role;

alter default privileges in schema watchdog_warehouse revoke all on tables from public, anon, authenticated;
alter default privileges in schema watchdog_warehouse revoke all on sequences from public, anon, authenticated;
alter default privileges in schema watchdog_warehouse grant select, insert, update, delete on tables to service_role;
alter default privileges in schema watchdog_warehouse grant usage, select on sequences to service_role;

comment on schema watchdog_warehouse is 'Private Watchdog source warehouse. Never add to Supabase exposed schemas; customer access must pass through reviewed server-side projections.';
comment on table watchdog_warehouse.modiv_observations is 'Versioned privacy-limited MOD-IV observations. Person-level owner, mailing, mortgage, SSN and rebate fields are intentionally absent.';
comment on table watchdog_warehouse.publication_sets is 'Explicit pointer to the release approved for downstream publication. Updating this pointer is a separate review action from ingestion.';
