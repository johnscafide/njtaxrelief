-- Immutable operational history for the NJ publisher monitor. This is private
-- data-governance metadata, not customer-facing parcel data.
create table if not exists watchdog_warehouse.source_monitor_runs (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null,
  checked_count integer not null default 0 check (checked_count >= 0),
  confirmed_change_count integer not null default 0 check (confirmed_change_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  monitor_schema_version integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists watchdog_warehouse.source_monitor_observations (
  run_id uuid not null references watchdog_warehouse.source_monitor_runs(id) on delete cascade,
  source_id text not null,
  source_url text not null,
  agency text,
  label text,
  http_status integer,
  stable_token text,
  etag text,
  last_modified text,
  content_length text,
  diagnostic_sha256_prefix text,
  observed_at timestamptz not null,
  primary key (run_id, source_id)
);

create index if not exists source_monitor_runs_checked_idx on watchdog_warehouse.source_monitor_runs (checked_at desc);
create index if not exists source_monitor_observations_source_time_idx on watchdog_warehouse.source_monitor_observations (source_id, observed_at desc);

alter table watchdog_warehouse.source_monitor_runs enable row level security;
alter table watchdog_warehouse.source_monitor_observations enable row level security;
revoke all on table watchdog_warehouse.source_monitor_runs from public, anon, authenticated;
revoke all on table watchdog_warehouse.source_monitor_observations from public, anon, authenticated;
grant select, insert, update, delete on table watchdog_warehouse.source_monitor_runs to service_role;
grant select, insert, update, delete on table watchdog_warehouse.source_monitor_observations to service_role;

comment on table watchdog_warehouse.source_monitor_runs is 'Private, timestamped NJ source-monitor health history. Retain to prove when Watchdog observed a publisher release surface.';
comment on table watchdog_warehouse.source_monitor_observations is 'Private source endpoint observations. A stable publisher token is required before announcing a source change.';
