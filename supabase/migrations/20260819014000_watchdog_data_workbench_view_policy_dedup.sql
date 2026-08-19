-- Production Gate 5 reconciliation: the Agent-tier catch-all policy added by
-- 20260818221753 duplicates the existing granular Data Workbench policies.
-- The granular policies already call can_use_data_workbench(), whose server-side
-- entitlement contract includes Agent and higher tiers while preserving owner and
-- organization-sharing checks. Keep those policies as the single authorization path.

drop policy if exists "data_workbench_views_owner_all" on public.data_workbench_views;
