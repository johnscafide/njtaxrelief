-- NJW-167: harden SECURITY DEFINER permissions surfaced by Supabase Security Advisor.
-- Scope is deliberately narrow: remove cross-user/global-write exposure, convert one
-- unnecessary definer wrapper and the provider summary view, while preserving
-- intentional public score reads and authenticated owner-scoped APIs.

-- 1) Internal plan resolver: browser clients must not probe another user's plan.
-- Authenticated surfaces should use get_my_entitlement(), has_watchdog_plan(),
-- can_use_data_workbench(auth.uid()), or another owner-scoped wrapper.
revoke execute on function public.watchdog_effective_plan(uuid) from anon, authenticated;
grant execute on function public.watchdog_effective_plan(uuid) to service_role;

-- Keep can_use_data_workbench available to authenticated callers because it is used
-- by RLS policies and app contracts, but refuse an arbitrary user id from a browser.
create or replace function public.can_use_data_workbench(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_target uuid;
begin
  if v_role = 'service_role' then
    v_target := coalesce(p_user_id, v_uid);
  else
    if v_uid is null then
      return false;
    end if;
    if p_user_id is not null and p_user_id <> v_uid then
      return false;
    end if;
    v_target := v_uid;
  end if;

  return coalesce(public.watchdog_effective_plan(v_target), 'standard')
    in ('agent','pro','pro_plus','teams','developer');
end;
$$;

revoke execute on function public.can_use_data_workbench(uuid) from public, anon;
grant execute on function public.can_use_data_workbench(uuid) to authenticated, service_role;

-- 2) Public score cache writes were globally writable through an anonymous
-- SECURITY DEFINER RPC. Reads remain public, but cache mutation is service-only.
revoke execute on function public.save_public_watchdog_score_cache(jsonb) from public, anon, authenticated;
grant execute on function public.save_public_watchdog_score_cache(jsonb) to service_role;

-- 3) The compatibility Direct Mail quote wrapper does not need elevated privileges;
-- its delegated product quote performs the authenticated owner/plan checks.
create or replace function public.marketing_direct_mail_quote(
  p_campaign_id uuid,
  p_quantity integer,
  p_size_label text,
  p_mail_class text,
  p_provider_key text default 'pcm'::text
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select public.marketing_direct_mail_product_quote(
    p_campaign_id,
    'postcard',
    p_quantity,
    p_size_label,
    p_mail_class,
    p_provider_key
  )
$$;

revoke execute on function public.marketing_direct_mail_quote(uuid,integer,text,text,text) from public, anon;
grant execute on function public.marketing_direct_mail_quote(uuid,integer,text,text,text) to authenticated, service_role;

-- 4) The provider-registry summary must evaluate permissions/RLS as the caller.
-- The base table previously had RLS enabled with no SELECT policy, so establish an
-- explicit entitled-user policy and grant only the three columns used by the view.
alter view public.workbench_provider_registry_summary set (security_invoker = true);
revoke select on public.workbench_provider_registry_summary from public, anon;
grant select on public.workbench_provider_registry_summary to authenticated, service_role;

revoke all on public.data_center_provider_coverage from anon;
grant select (provider_kind, value_status, bulk_capable)
  on public.data_center_provider_coverage to authenticated;

drop policy if exists "entitled users read provider coverage summary" on public.data_center_provider_coverage;
create policy "entitled users read provider coverage summary"
on public.data_center_provider_coverage
for select
to authenticated
using (public.can_use_data_workbench(auth.uid()));

-- service_role remains the unrestricted server-side reader/writer for this table.
grant select on public.data_center_provider_coverage to service_role;
