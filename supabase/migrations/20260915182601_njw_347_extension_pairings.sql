create table if not exists public.watchdog_extension_pairings (
  device_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_sha256 text not null,
  plan_tier text not null,
  extension_version text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz not null default now(),
  claimed_at timestamptz,
  constraint watchdog_extension_pairings_challenge_check check (length(challenge_sha256)=64)
);

alter table public.watchdog_extension_pairings enable row level security;

create index if not exists watchdog_extension_pairings_user_idx
  on public.watchdog_extension_pairings(user_id, created_at desc);

create index if not exists watchdog_extension_pairings_expiry_idx
  on public.watchdog_extension_pairings(expires_at)
  where claimed_at is null;
