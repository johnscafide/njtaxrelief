create table if not exists public.anchor_result_sessions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  verification_id bigint not null references public.lead_otp(id) on delete cascade,
  result_token_hash text not null unique,
  result_payload jsonb not null,
  source_host text not null default 'njpropertytaxrelief.com',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  last_viewed_at timestamptz,
  view_count integer not null default 0 check (view_count >= 0)
);

alter table public.anchor_result_sessions enable row level security;

revoke all on table public.anchor_result_sessions from anon, authenticated;
grant select, insert, update, delete on table public.anchor_result_sessions to service_role;

create index if not exists anchor_result_sessions_expires_idx
  on public.anchor_result_sessions (expires_at);

create index if not exists anchor_result_sessions_email_created_idx
  on public.anchor_result_sessions (email, created_at desc);

comment on table public.anchor_result_sessions is
  'Short-lived ANCHOR-to-Watchdog result handoff. Service-role only; never exposed directly to browser roles.';
