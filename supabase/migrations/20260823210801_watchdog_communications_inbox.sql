create table if not exists public.watchdog_contact_inbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('message','voice')),
  channel text not null default 'web' check (channel in ('web','sms','phone','email','provider')),
  status text not null default 'new' check (status in ('pending_upload','new','read','archived')),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  phone text null check (phone is null or char_length(phone) <= 40),
  subject text null check (subject is null or char_length(subject) <= 160),
  message text null check (message is null or char_length(message) <= 4000),
  voice_bucket text null,
  voice_path text null unique,
  voice_mime_type text null check (voice_mime_type is null or char_length(voice_mime_type) <= 100),
  voice_duration_seconds integer null check (voice_duration_seconds is null or voice_duration_seconds between 1 and 90),
  voice_size_bytes bigint null check (voice_size_bytes is null or voice_size_bytes between 1 and 6291456),
  source_path text null check (source_path is null or char_length(source_path) <= 500),
  referrer text null check (referrer is null or char_length(referrer) <= 1000),
  context jsonb not null default '{}'::jsonb,
  user_id uuid null references auth.users(id) on delete set null,
  connection_hash text null check (connection_hash is null or char_length(connection_hash) <= 128),
  upload_token_hash text null check (upload_token_hash is null or char_length(upload_token_hash) <= 128),
  upload_expires_at timestamptz null,
  read_at timestamptz null,
  archived_at timestamptz null,
  handled_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint watchdog_contact_inbox_kind_payload_check check (
    (kind = 'message' and status <> 'pending_upload' and message is not null and char_length(btrim(message)) between 1 and 4000 and voice_path is null)
    or
    (kind = 'voice' and voice_bucket is not null and voice_path is not null and voice_duration_seconds is not null and (status = 'pending_upload' or voice_size_bytes is not null))
  )
);

create index if not exists watchdog_contact_inbox_status_created_idx on public.watchdog_contact_inbox (status, created_at desc);
create index if not exists watchdog_contact_inbox_kind_created_idx on public.watchdog_contact_inbox (kind, created_at desc);
create index if not exists watchdog_contact_inbox_connection_created_idx on public.watchdog_contact_inbox (connection_hash, created_at desc) where connection_hash is not null;
create index if not exists watchdog_contact_inbox_user_created_idx on public.watchdog_contact_inbox (user_id, created_at desc) where user_id is not null;

alter table public.watchdog_contact_inbox enable row level security;
revoke all on table public.watchdog_contact_inbox from anon, authenticated;
grant select, insert, update, delete on table public.watchdog_contact_inbox to service_role;

comment on table public.watchdog_contact_inbox is 'Private first-party Watchdog website communications ledger. Public intake and developer access are mediated by Edge Functions; future SMS/phone providers can write to the same channel model.';
comment on column public.watchdog_contact_inbox.connection_hash is 'SHA-256 connection identifier used only for abuse-rate limiting; raw IP addresses are not stored.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('watchdog-voice-inbox','watchdog-voice-inbox',false,6291456,array['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-m4a','audio/aac']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
