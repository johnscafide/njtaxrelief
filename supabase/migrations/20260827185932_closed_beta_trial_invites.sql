create table if not exists public.billing_beta_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  code_prefix text not null check (char_length(code_prefix) between 4 and 24),
  label text,
  tier text not null check (tier in ('agent','pro','pro_plus')),
  duration_days integer not null check (duration_days in (30,60)),
  max_redemptions integer not null default 1 check (max_redemptions between 1 and 100),
  recipient_email_hash text check (recipient_email_hash is null or recipient_email_hash ~ '^[a-f0-9]{64}$'),
  recipient_hint text,
  active boolean not null default true,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.billing_beta_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.billing_beta_invites(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null check (tier in ('agent','pro','pro_plus')),
  duration_days integer not null check (duration_days in (30,60)),
  status text not null default 'reserved' check (status in ('reserved','completed','expired','failed')),
  reserved_until timestamptz not null,
  checkout_session_id text unique,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists billing_beta_invites_active_idx
  on public.billing_beta_invites (active, expires_at, created_at desc);
create index if not exists billing_beta_redemptions_invite_status_idx
  on public.billing_beta_redemptions (invite_id, status, reserved_until);
create index if not exists billing_beta_redemptions_user_status_idx
  on public.billing_beta_redemptions (user_id, status, reserved_until);

alter table public.billing_beta_invites enable row level security;
alter table public.billing_beta_redemptions enable row level security;
revoke all on table public.billing_beta_invites from anon, authenticated;
revoke all on table public.billing_beta_redemptions from anon, authenticated;
grant all on table public.billing_beta_invites to service_role;
grant all on table public.billing_beta_redemptions to service_role;

create or replace function public.claim_watchdog_beta_invite(
  p_code_hash text,
  p_user_id uuid,
  p_user_email_hash text
)
returns table (
  redemption_id uuid,
  invite_id uuid,
  tier text,
  duration_days integer,
  label text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_invite public.billing_beta_invites%rowtype;
  v_active_count integer;
  v_redemption_id uuid;
begin
  select * into v_invite
  from public.billing_beta_invites
  where code_hash = lower(trim(p_code_hash))
  for update;

  if not found or v_invite.active is not true or (v_invite.expires_at is not null and v_invite.expires_at <= now()) then
    raise exception 'BETA_CODE_INVALID';
  end if;

  if v_invite.recipient_email_hash is not null and v_invite.recipient_email_hash <> lower(trim(coalesce(p_user_email_hash,''))) then
    raise exception 'BETA_CODE_RECIPIENT_MISMATCH';
  end if;

  if exists (
    select 1 from public.billing_beta_redemptions r
    where r.user_id = p_user_id
      and (r.status = 'completed' or (r.status = 'reserved' and r.reserved_until > now()))
  ) then
    raise exception 'BETA_TRIAL_ALREADY_USED_OR_RESERVED';
  end if;

  select count(*)::integer into v_active_count
  from public.billing_beta_redemptions r
  where r.invite_id = v_invite.id
    and (r.status = 'completed' or (r.status = 'reserved' and r.reserved_until > now()));

  if v_active_count >= v_invite.max_redemptions then
    raise exception 'BETA_CODE_REDEMPTION_LIMIT';
  end if;

  insert into public.billing_beta_redemptions (
    invite_id, user_id, tier, duration_days, status, reserved_until, metadata
  ) values (
    v_invite.id, p_user_id, v_invite.tier, v_invite.duration_days, 'reserved', now() + interval '40 minutes',
    jsonb_build_object('source','closed_beta_invite')
  ) returning id into v_redemption_id;

  return query
  select v_redemption_id, v_invite.id, v_invite.tier, v_invite.duration_days, v_invite.label;
end;
$$;

revoke all on function public.claim_watchdog_beta_invite(text, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_watchdog_beta_invite(text, uuid, text) to service_role;

comment on table public.billing_beta_invites is 'Developer-issued closed beta trial invitation definitions. Plaintext codes are never stored.';
comment on table public.billing_beta_redemptions is 'Server-owned beta trial reservations and completed Stripe Checkout redemptions.';
comment on function public.claim_watchdog_beta_invite(text, uuid, text) is 'Service-role-only atomic claim for a closed beta trial invite; does not grant entitlement.';
