-- Watchdog v0.46: durable change history, professional reports, Data Center jobs,
-- acceptance evidence and continuity controls.

create table if not exists public.property_record_snapshots (
  id bigint generated always as identity primary key,
  pams_pin text not null,
  source_key text not null,
  observed_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_hash text not null,
  lineage jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  unique (pams_pin, source_key, payload_hash)
);
create index if not exists property_record_snapshots_history_idx on public.property_record_snapshots (pams_pin, captured_at desc);
alter table public.property_record_snapshots enable row level security;
revoke all on table public.property_record_snapshots from anon, authenticated;
grant all on table public.property_record_snapshots to service_role;

create table if not exists public.property_field_changes (
  id bigint generated always as identity primary key,
  snapshot_id uuid not null references public.property_record_snapshots(id) on delete cascade,
  pams_pin text not null,
  field_key text not null,
  old_value jsonb,
  new_value jsonb,
  change_kind text not null check (change_kind in ('added','changed','removed')),
  materiality text not null check (materiality in ('informational','material','action')),
  delta_numeric numeric,
  source_key text not null,
  source_url text,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (snapshot_id, field_key)
);
create index if not exists property_field_changes_history_idx on public.property_field_changes (pams_pin, observed_at desc);
alter table public.property_field_changes enable row level security;
revoke all on table public.property_field_changes from anon, authenticated;
grant all on table public.property_field_changes to service_role;

create table if not exists public.professional_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id uuid references public.professional_cases(id) on delete set null,
  pams_pin text,
  preset text not null check (preset in ('attorney_title','lender_collateral','broker_listing','investor_diligence','appeal_case','custom')),
  title text not null check (char_length(title) between 1 and 180),
  brand_name text not null default 'Watchdog',
  status text not null default 'draft' check (status in ('draft','ready','archived')),
  selected_marker_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_marker_ids)='array'),
  source_manifest jsonb not null default '[]'::jsonb check (jsonb_typeof(source_manifest)='array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.professional_reports
  add column if not exists brand_name text not null default 'Watchdog',
  add column if not exists status text not null default 'draft',
  add column if not exists selected_marker_ids jsonb not null default '[]'::jsonb,
  add column if not exists source_manifest jsonb not null default '[]'::jsonb;
create index if not exists professional_reports_user_updated_idx on public.professional_reports(user_id, updated_at desc);
alter table public.professional_reports enable row level security;
revoke all on table public.professional_reports from anon;
grant select, insert, update, delete on table public.professional_reports to authenticated;
drop policy if exists "professional reports own pro" on public.professional_reports;
drop policy if exists "professional reports select own pro" on public.professional_reports;
drop policy if exists "professional reports insert own pro" on public.professional_reports;
drop policy if exists "professional reports update own pro" on public.professional_reports;
drop policy if exists "professional reports delete own pro" on public.professional_reports;
create policy "professional reports own pro" on public.professional_reports for all to authenticated
  using ((select auth.uid())=user_id and public.has_watchdog_plan('pro'))
  with check ((select auth.uid())=user_id and public.has_watchdog_plan('pro'));

create table if not exists public.professional_report_versions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.professional_reports(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  content jsonb not null check (jsonb_typeof(content)='object'),
  source_manifest jsonb not null default '[]'::jsonb check (jsonb_typeof(source_manifest)='array'),
  created_at timestamptz not null default now(),
  unique(report_id, version_no)
);
alter table public.professional_report_versions
  add column if not exists version_number integer,
  add column if not exists report_payload jsonb,
  add column if not exists version_no integer,
  add column if not exists content jsonb;
update public.professional_report_versions
set version_no=coalesce(version_no,version_number), content=coalesce(content,report_payload)
where version_no is null or content is null;
create or replace function public.sync_professional_report_version_columns()
returns trigger language plpgsql set search_path=public as $$
begin
  new.version_number:=coalesce(new.version_number,new.version_no);
  new.version_no:=coalesce(new.version_no,new.version_number);
  new.report_payload:=coalesce(new.report_payload,new.content);
  new.content:=coalesce(new.content,new.report_payload);
  return new;
end $$;
drop trigger if exists professional_report_version_column_sync on public.professional_report_versions;
create trigger professional_report_version_column_sync before insert or update on public.professional_report_versions
for each row execute function public.sync_professional_report_version_columns();
create index if not exists professional_report_versions_report_idx on public.professional_report_versions(report_id, version_no desc);
alter table public.professional_report_versions enable row level security;
revoke all on table public.professional_report_versions from anon;
grant select, insert on table public.professional_report_versions to authenticated;
drop policy if exists "professional report versions own pro" on public.professional_report_versions;
drop policy if exists "report versions select own pro" on public.professional_report_versions;
create policy "professional report versions own pro" on public.professional_report_versions for all to authenticated
  using ((select auth.uid())=user_id and public.has_watchdog_plan('pro'))
  with check ((select auth.uid())=user_id and public.has_watchdog_plan('pro'));

create table if not exists public.professional_report_shares (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.professional_reports(id) on delete cascade,
  version_id uuid not null references public.professional_report_versions(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  view_count integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.professional_report_shares add column if not exists view_count integer not null default 0;
alter table public.professional_report_shares enable row level security;
revoke all on table public.professional_report_shares from anon;
grant select, insert, update, delete on table public.professional_report_shares to authenticated;
drop policy if exists "professional report shares own pro" on public.professional_report_shares;
create policy "professional report shares own pro" on public.professional_report_shares for all to authenticated
  using ((select auth.uid())=user_id and public.has_watchdog_plan('pro'))
  with check ((select auth.uid())=user_id and public.has_watchdog_plan('pro'));

create table if not exists public.data_center_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  view_id uuid references public.saved_data_center_views(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  scope text not null check (scope in ('property','town','county')),
  format text not null default 'csv' check (format in ('csv','json')),
  cadence text not null default 'once' check (cadence in ('once','weekly','monthly')),
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','queued','running','ready','failed','paused')),
  result jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists data_center_delivery_jobs_due_idx on public.data_center_delivery_jobs(status, next_run_at);
alter table public.data_center_delivery_jobs enable row level security;
revoke all on table public.data_center_delivery_jobs from anon;
grant select, insert, update, delete on table public.data_center_delivery_jobs to authenticated;
drop policy if exists "data center jobs own pro plus" on public.data_center_delivery_jobs;
create policy "data center jobs own pro plus" on public.data_center_delivery_jobs for all to authenticated
  using ((select auth.uid())=user_id and public.has_watchdog_plan('pro_plus'))
  with check ((select auth.uid())=user_id and public.has_watchdog_plan('pro_plus'));

create table if not exists public.data_center_provider_coverage (
  marker_id text primary key,
  scopes text[] not null default '{}',
  provider_key text not null,
  value_status text not null check (value_status in ('live','partial','planned','unavailable')),
  source_keys text[] not null default '{}',
  last_verified_at timestamptz,
  notes text
);
alter table public.data_center_provider_coverage enable row level security;
revoke all on table public.data_center_provider_coverage from anon, authenticated;
grant all on table public.data_center_provider_coverage to service_role;

insert into public.data_center_provider_coverage(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes)
values
 ('property.address',array['property'],'saved_properties','live',array['NJ MOD-IV'],now(),'Saved parcel address.'),
 ('property.municipality',array['property','town'],'saved_properties','live',array['NJ MOD-IV'],now(),'Municipality from the parcel record.'),
 ('property.county',array['property','county'],'saved_properties','live',array['NJ MOD-IV'],now(),'County from the parcel record.'),
 ('property.block',array['property'],'saved_properties','live',array['NJ MOD-IV'],now(),'Tax block.'),
 ('property.lot',array['property'],'saved_properties','live',array['NJ MOD-IV'],now(),'Tax lot.'),
 ('property.pams_pin',array['property'],'saved_properties','live',array['NJ MOD-IV'],now(),'Stable Watchdog parcel key.'),
 ('property.assessed_value',array['property','town','county'],'saved_properties','live',array['NJ MOD-IV'],now(),'Current assessed value; aggregates sum account records.'),
 ('property.annual_tax',array['property','town','county'],'saved_properties','live',array['NJ MOD-IV'],now(),'Latest full-year tax; aggregates sum account records.'),
 ('property.market_value',array['property','town','county'],'saved_properties','partial',array['NJ SR1A','NJ equalization tables'],now(),'Watchdog market-value estimate when available.'),
 ('watchdog.market_value_estimate',array['property','town','county'],'saved_properties','partial',array['NJ SR1A','NJ equalization tables'],now(),'Watchdog derived estimate when available.'),
 ('watchdog.effective_tax_rate',array['property','town','county'],'saved_properties','partial',array['NJ MOD-IV','NJ equalization tables'],now(),'Derived annual tax divided by market value.')
on conflict(marker_id) do update set scopes=excluded.scopes,provider_key=excluded.provider_key,
 value_status=excluded.value_status,source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes;

alter table public.production_acceptance_runs
  add column if not exists provider_mode text not null default 'sandbox',
  add column if not exists evidence_ref text,
  add column if not exists completed_at timestamptz;

alter table public.continuity_drills
  add column if not exists release_version text,
  add column if not exists restore_target text,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists reconciliation jsonb not null default '{}'::jsonb;

insert into public.platform_release_gates(gate_key,label,status,environment,evidence)
values
 ('live_billing_lifecycle','Controlled Paddle Live lifecycle','blocked','production','{"reason":"Controlled Live evidence required"}'::jsonb),
 ('four_role_acceptance','Four-role authorization acceptance','blocked','staging','{"reason":"Persisted account evidence required"}'::jsonb),
 ('isolated_restore_drill','Isolated restore and reconciliation','blocked','staging','{"reason":"Restore evidence required"}'::jsonb)
on conflict (gate_key) do update set label=excluded.label, environment=excluded.environment,
  status=case when public.platform_release_gates.status='passed' then 'passed' else excluded.status end,
  updated_at=now();

create or replace function public.queue_due_data_center_jobs()
returns integer language plpgsql security invoker set search_path=public as $$
declare n integer;
begin
  update public.data_center_delivery_jobs set status='queued', updated_at=now()
  where status='scheduled' and next_run_at<=now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.queue_due_data_center_jobs() from public, anon, authenticated;
grant execute on function public.queue_due_data_center_jobs() to service_role;

comment on table public.property_record_snapshots is 'Service-created immutable property observations with authoritative lineage.';
comment on table public.property_field_changes is 'Field-level before/after facts derived from adjacent trusted snapshots.';
comment on table public.professional_report_versions is 'Immutable client-safe report versions owned by a paid professional.';
comment on table public.data_center_provider_coverage is 'Governed truth table for marker value-provider availability; never fabricates missing values.';
