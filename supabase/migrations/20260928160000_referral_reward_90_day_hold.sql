-- Referral free month: hold every reward 90 days (past any refund window)
-- before paying it out. stripe-webhook records the reward with eligible_at;
-- the daily referral-rewards-sweep function pays out cleared rewards.
alter table public.watchdog_referral_rewards
  add column if not exists eligible_at timestamptz;

update public.watchdog_referral_rewards
  set eligible_at = created_at + interval '90 days'
  where eligible_at is null;

alter table public.watchdog_referral_rewards
  alter column eligible_at set default (now() + interval '90 days'),
  alter column eligible_at set not null;

create index if not exists watchdog_referral_rewards_due_idx
  on public.watchdog_referral_rewards (eligible_at)
  where status in ('pending', 'waiting_for_subscription');

-- Sweep token lives only in Vault. The edge function checks it through this
-- service-only function, so no token is stored in code or function secrets.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'watchdog_referral_sweep_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'watchdog_referral_sweep_token', 'Token for the referral-rewards-sweep cron call');
  end if;
end $$;

create or replace function public.referral_rewards_sweep_authorized(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, vault, pg_temp
as $$
  select coalesce(length(p_token) >= 32 and p_token = (
    select decrypted_secret from vault.decrypted_secrets
    where name = 'watchdog_referral_sweep_token'
    order by created_at desc limit 1
  ), false);
$$;

revoke all on function public.referral_rewards_sweep_authorized(text) from public, anon, authenticated;
grant execute on function public.referral_rewards_sweep_authorized(text) to service_role;

create or replace function public.invoke_referral_rewards_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net, pg_temp
as $$
declare
  v_token text;
  v_request bigint;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets
    where name = 'watchdog_referral_sweep_token' order by created_at desc limit 1;
  if v_token is null then return null; end if;
  select net.http_post(
    url := 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/referral-rewards-sweep',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-referral-sweep-token', v_token),
    body := '{}'::jsonb
  ) into v_request;
  return v_request;
end;
$$;

revoke all on function public.invoke_referral_rewards_sweep() from public, anon, authenticated;

-- Daily, mid-morning Eastern.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'watchdog-referral-rewards-sweep') then
    perform cron.unschedule('watchdog-referral-rewards-sweep');
  end if;
  perform cron.schedule('watchdog-referral-rewards-sweep', '41 14 * * *', 'select public.invoke_referral_rewards_sweep();');
end $$;
