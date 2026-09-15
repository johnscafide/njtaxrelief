create table if not exists public.watchdog_extension_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.watchdog_extension_sessions(id) on delete set null,
  event_name text not null,
  extension_version text,
  plan_tier text,
  crm_surface text not null default 'boldtrail',
  match_status text,
  fields_count smallint,
  metadata jsonb not null default '{}'::jsonb,
  constraint watchdog_extension_events_name_check check (event_name in (
    'session_connected','session_status','session_expired','session_disconnected',
    'extension_opened','boldtrail_contact_detected','boldtrail_contact_missing',
    'lookup_started','lookup_succeeded','lookup_no_match','lookup_ambiguous',
    'field_previewed','crm_write_started','crm_write_succeeded','crm_write_failed'
  )),
  constraint watchdog_extension_events_fields_check check (fields_count is null or fields_count between 0 and 50)
);

alter table public.watchdog_extension_events enable row level security;

create index if not exists watchdog_extension_events_time_idx
  on public.watchdog_extension_events(occurred_at desc);
create index if not exists watchdog_extension_events_user_idx
  on public.watchdog_extension_events(user_id, occurred_at desc);
create index if not exists watchdog_extension_events_name_idx
  on public.watchdog_extension_events(event_name, occurred_at desc);

comment on table public.watchdog_extension_events is
  'Privacy-minimized CRM Companion analytics. Do not store contact names, emails, phone numbers, full addresses, or free-form CRM content.';
