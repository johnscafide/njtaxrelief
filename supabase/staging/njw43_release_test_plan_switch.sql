-- STAGING ONLY. Never include this file in production migration execution.
-- Reuses the hosted Standard release-test identity to exercise Agent and Teams
-- against real Supabase Auth/RPC/RLS boundaries without permanent extra accounts.

create or replace function public.staging_set_release_test_plan(target_plan text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  allowed_test_user constant uuid := '1f3537b9-0aca-44b2-836c-d6d15cb6d622'::uuid;
begin
  if caller is null or caller <> allowed_test_user then
    raise exception 'staging release-test plan switch denied';
  end if;
  if target_plan not in ('standard','agent','teams') then
    raise exception 'unsupported staging release-test plan';
  end if;

  update public.profiles
     set plan_tier = target_plan,
         account_role = 'user'
   where id = caller;

  insert into public.account_entitlements(
    user_id, plan_tier, subscription_status, billing_tier, provider, source, updated_at
  ) values (
    caller,
    target_plan,
    case when target_plan = 'standard' then 'none' else 'active' end,
    case when target_plan = 'standard' then null else target_plan end,
    case when target_plan = 'standard' then null else 'manual' end,
    'staging_release_gate',
    now()
  )
  on conflict (user_id) do update set
    plan_tier = excluded.plan_tier,
    subscription_status = excluded.subscription_status,
    billing_tier = excluded.billing_tier,
    provider = excluded.provider,
    source = excluded.source,
    updated_at = excluded.updated_at;

  return target_plan;
end;
$$;

revoke all on function public.staging_set_release_test_plan(text) from public, anon;
grant execute on function public.staging_set_release_test_plan(text) to authenticated;
