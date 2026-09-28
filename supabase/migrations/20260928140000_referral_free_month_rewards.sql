-- Referral reward: when a pro who joined through a member's invite starts a
-- paid YEARLY plan, the member who invited them earns one free month of their
-- own plan. stripe-webhook applies it as a Stripe customer balance credit
-- (it comes off their next invoice). One reward per referred account, ever.
create table if not exists public.watchdog_referral_rewards (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  reward_type text not null default 'free_month' check (reward_type = 'free_month'),
  trigger_subscription_id text,
  trigger_price_id text,
  status text not null default 'pending'
    check (status in ('pending', 'waiting_for_subscription', 'credited', 'void')),
  inviter_tier text,
  amount_cents integer check (amount_cents is null or amount_cents > 0),
  currency text,
  stripe_customer_id text,
  stripe_balance_transaction_id text unique,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  credited_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists watchdog_referral_rewards_inviter_idx
  on public.watchdog_referral_rewards (inviter_user_id, status);

alter table public.watchdog_referral_rewards enable row level security;

-- Members can see the rewards they earned. Only the service role writes.
drop policy if exists watchdog_referral_rewards_inviter_read on public.watchdog_referral_rewards;
create policy watchdog_referral_rewards_inviter_read
  on public.watchdog_referral_rewards for select to authenticated
  using (inviter_user_id = auth.uid());

revoke all on public.watchdog_referral_rewards from anon, authenticated;
grant select on public.watchdog_referral_rewards to authenticated;
grant all on public.watchdog_referral_rewards to service_role;

comment on table public.watchdog_referral_rewards is
  'One free month for the inviter when a referred account starts a paid yearly plan. Written only by stripe-webhook (service role).';
