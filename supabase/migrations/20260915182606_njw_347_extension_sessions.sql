create table if not exists public.watchdog_extension_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  plan_tier text not null,
  extension_version text,
  browser_family text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint watchdog_extension_sessions_token_check check (length(token_hash)=64)
);

alter table public.watchdog_extension_sessions enable row level security;

create index if not exists watchdog_extension_sessions_user_idx
  on public.watchdog_extension_sessions(user_id, created_at desc);

create index if not exists watchdog_extension_sessions_active_idx
  on public.watchdog_extension_sessions(token_hash, expires_at)
  where revoked_at is null;
