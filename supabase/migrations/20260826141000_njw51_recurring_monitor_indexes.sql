-- NJW-51: cover recurring saved-list alert/diff foreign keys flagged by the
-- production performance advisor. These do not change visibility or delivery behavior.

create index if not exists agent_dynamic_list_alert_deliveries_list_fk_idx
  on public.agent_dynamic_list_alert_deliveries(dynamic_list_id);

create index if not exists agent_dynamic_list_diff_items_list_fk_idx
  on public.agent_dynamic_list_diff_items(dynamic_list_id);
