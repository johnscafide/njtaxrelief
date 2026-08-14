drop policy if exists marketing_performance_rollups_service on public.marketing_performance_rollups;
create policy marketing_performance_rollups_service on public.marketing_performance_rollups
  for all to service_role using (true) with check (true);
