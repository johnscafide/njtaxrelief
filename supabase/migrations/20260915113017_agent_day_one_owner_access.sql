-- Align the marketed Agent Opportunity Desk with its server-owned paid tier.
-- Existing policy names are retained to avoid adding permissive duplicate policies.
-- Ownership, active-plan validation, roles, quotas, and higher-tier tools are unchanged.
begin;

alter policy "agent farm select own pro" on public.agent_farm_properties
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')));

alter policy "agent farm insert own pro" on public.agent_farm_properties
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')));

alter policy "agent farm update own pro" on public.agent_farm_properties
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')))
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')));

alter policy "agent farm delete own pro" on public.agent_farm_properties
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')));

alter policy "agent actions select own pro" on public.agent_opportunity_actions
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')));

alter policy "agent actions insert own pro" on public.agent_opportunity_actions
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')));

alter policy "agent actions update own pro" on public.agent_opportunity_actions
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')))
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')));

alter policy "agent actions delete own pro" on public.agent_opportunity_actions
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')));

alter policy "agent territories select own pro" on public.agent_territories
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')));

alter policy "agent territories insert own pro" on public.agent_territories
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')));

alter policy "agent territories update own pro" on public.agent_territories
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')))
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')));

alter policy "agent territories delete own pro" on public.agent_territories
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')));

alter policy "agent digest select own pro" on public.agent_digest_preferences
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')));

alter policy "agent digest insert own pro" on public.agent_digest_preferences
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')));

alter policy "agent digest update own pro" on public.agent_digest_preferences
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')))
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')));

alter policy "agent funnel select own pro" on public.agent_funnel_events
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')));

alter policy "agent funnel insert own pro" on public.agent_funnel_events
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent')));

commit;
