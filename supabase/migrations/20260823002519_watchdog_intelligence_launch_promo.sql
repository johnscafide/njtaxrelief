create or replace function private.watchdog_intelligence_launch_promo_active()
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select coalesce((
    select status = 'passed' and coalesce((evidence->>'active')::boolean, false)
    from public.platform_release_gates
    where gate_key = 'watchdog_intelligence_launch_promo'
  ), false);
$$;

create or replace function private.sync_watchdog_intelligence_launch_promo_for_account()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_plan text := coalesce(new.billing_tier, new.plan_tier, 'standard');
  v_eligible boolean := v_plan in ('agent','pro') and new.subscription_status in ('active','trialing');
begin
  if private.watchdog_intelligence_launch_promo_active() and v_eligible then
    insert into public.account_feature_entitlements (
      user_id,
      feature_key,
      status,
      provider,
      current_period_end,
      source,
      metadata,
      updated_at
    ) values (
      new.user_id,
      'watchdog_intelligence',
      'active',
      new.provider,
      new.current_period_end,
      'launch_promo',
      jsonb_build_object(
        'promotion_key','watchdog_intelligence_launch_promo',
        'display_label','Limited time',
        'regular_monthly_price_cents',1200,
        'granted_from_plan',v_plan,
        'granted_at',now()
      ),
      now()
    )
    on conflict (user_id, feature_key) do update
      set status = 'active',
          provider = excluded.provider,
          current_period_end = excluded.current_period_end,
          metadata = excluded.metadata,
          updated_at = now()
      where public.account_feature_entitlements.source = 'launch_promo';
  else
    update public.account_feature_entitlements
       set status = case when status in ('canceled','expired') then status else 'expired' end,
           updated_at = now(),
           metadata = metadata || jsonb_build_object('promotion_revoked_at',now())
     where user_id = new.user_id
       and feature_key = 'watchdog_intelligence'
       and source = 'launch_promo';
  end if;
  return new;
end;
$$;

create or replace function private.resync_watchdog_intelligence_launch_promo()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.gate_key <> 'watchdog_intelligence_launch_promo' then
    return new;
  end if;

  if new.status = 'passed' and coalesce((new.evidence->>'active')::boolean, false) then
    insert into public.account_feature_entitlements (
      user_id,
      feature_key,
      status,
      provider,
      current_period_end,
      source,
      metadata,
      updated_at
    )
    select
      e.user_id,
      'watchdog_intelligence',
      'active',
      e.provider,
      e.current_period_end,
      'launch_promo',
      jsonb_build_object(
        'promotion_key','watchdog_intelligence_launch_promo',
        'display_label','Limited time',
        'regular_monthly_price_cents',1200,
        'granted_from_plan',coalesce(e.billing_tier,e.plan_tier),
        'granted_at',now()
      ),
      now()
    from public.account_entitlements e
    where coalesce(e.billing_tier,e.plan_tier) in ('agent','pro')
      and e.subscription_status in ('active','trialing')
    on conflict (user_id, feature_key) do update
      set status = 'active',
          provider = excluded.provider,
          current_period_end = excluded.current_period_end,
          metadata = excluded.metadata,
          updated_at = now()
      where public.account_feature_entitlements.source = 'launch_promo';
  else
    update public.account_feature_entitlements
       set status = 'expired',
           updated_at = now(),
           metadata = metadata || jsonb_build_object('promotion_revoked_at',now())
     where feature_key = 'watchdog_intelligence'
       and source = 'launch_promo'
       and status not in ('canceled','expired');
  end if;
  return new;
end;
$$;

drop trigger if exists account_entitlements_watchdog_intelligence_launch_promo on public.account_entitlements;
create trigger account_entitlements_watchdog_intelligence_launch_promo
after insert or update of plan_tier, billing_tier, subscription_status, provider, current_period_end
on public.account_entitlements
for each row execute function private.sync_watchdog_intelligence_launch_promo_for_account();

drop trigger if exists platform_release_gates_watchdog_intelligence_launch_promo on public.platform_release_gates;
create trigger platform_release_gates_watchdog_intelligence_launch_promo
after insert or update of status, evidence
on public.platform_release_gates
for each row execute function private.resync_watchdog_intelligence_launch_promo();

insert into public.platform_release_gates (
  gate_key,
  label,
  status,
  environment,
  evidence,
  verified_at,
  updated_at
) values (
  'watchdog_intelligence_launch_promo',
  'Watchdog Intelligence limited-time paid-member promotion',
  'passed',
  'production',
  jsonb_build_object(
    'active',true,
    'display_label','Limited time',
    'authorized_at','2026-08-22T20:14:00-04:00',
    'starts_on','2026-08-22',
    'ends_on',null,
    'deactivation','manual',
    'applies_to',jsonb_build_array('agent','pro'),
    'regular_monthly_price_cents',1200,
    'pro_plus_included',true,
    'teams_included',true,
    'free_included',false,
    'notes','Agent and Pro receive Watchdog Intelligence at no additional charge while this promotion is active. Normal commercial price remains $12/month. Pro+ and Teams include Intelligence as a base-plan benefit.'
  ),
  now(),
  now()
)
on conflict (gate_key) do update
set label = excluded.label,
    status = excluded.status,
    environment = excluded.environment,
    evidence = excluded.evidence,
    verified_at = excluded.verified_at,
    updated_at = excluded.updated_at;
