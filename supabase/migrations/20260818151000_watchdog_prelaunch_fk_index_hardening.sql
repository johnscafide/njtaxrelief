-- Prelaunch advisor hardening.
-- Adds low-risk indexes for foreign-key columns flagged by the Supabase advisor.
-- Every statement is guarded so this migration remains safe across environments
-- where optional product modules have not been installed.

do $$
begin
  if to_regclass('public.data_center_delivery_jobs') is not null then
    execute 'create index if not exists data_center_delivery_jobs_user_id_idx on public.data_center_delivery_jobs(user_id)';
    execute 'create index if not exists data_center_delivery_jobs_view_id_idx on public.data_center_delivery_jobs(view_id)';
  end if;

  if to_regclass('public.data_workbench_campaigns') is not null then
    execute 'create index if not exists data_workbench_campaigns_organization_id_idx on public.data_workbench_campaigns(organization_id)';
    execute 'create index if not exists data_workbench_campaigns_view_id_idx on public.data_workbench_campaigns(view_id)';
  end if;

  if to_regclass('public.marketing_automation_runs') is not null then
    execute 'create index if not exists marketing_automation_runs_user_id_idx on public.marketing_automation_runs(user_id)';
  end if;

  if to_regclass('public.marketing_dynamic_audience_rules') is not null then
    execute 'create index if not exists marketing_dynamic_audience_rules_campaign_id_idx on public.marketing_dynamic_audience_rules(campaign_id)';
  end if;

  if to_regclass('public.marketing_provider_oauth_states') is not null then
    execute 'create index if not exists marketing_provider_oauth_states_provider_key_idx on public.marketing_provider_oauth_states(provider_key)';
    execute 'create index if not exists marketing_provider_oauth_states_user_id_idx on public.marketing_provider_oauth_states(user_id)';
  end if;

  if to_regclass('public.marketing_tracking_links') is not null then
    execute 'create index if not exists marketing_tracking_links_user_id_idx on public.marketing_tracking_links(user_id)';
  end if;

  if to_regclass('public.pcm_direct_mail_orders') is not null then
    execute 'create index if not exists pcm_direct_mail_orders_organization_id_idx on public.pcm_direct_mail_orders(organization_id)';
  end if;

  if to_regclass('public.professional_campaign_properties') is not null then
    execute 'create index if not exists professional_campaign_properties_user_id_idx on public.professional_campaign_properties(user_id)';
  end if;

  if to_regclass('public.professional_marketing_plans') is not null then
    execute 'create index if not exists professional_marketing_plans_campaign_id_idx on public.professional_marketing_plans(campaign_id)';
    execute 'create index if not exists professional_marketing_plans_list_id_idx on public.professional_marketing_plans(list_id)';
  end if;

  if to_regclass('public.watchdog_test_auth_events') is not null then
    execute 'create index if not exists watchdog_test_auth_events_token_id_idx on public.watchdog_test_auth_events(token_id)';
    execute 'create index if not exists watchdog_test_auth_events_user_id_idx on public.watchdog_test_auth_events(user_id)';
  end if;
end
$$;
