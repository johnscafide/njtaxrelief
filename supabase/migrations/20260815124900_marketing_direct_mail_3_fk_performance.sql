-- Direct Mail 3.0 FK covering indexes for recipient, creative, approval, payment and provider hot paths.
create index if not exists agent_dynamic_list_materialization_runs_dynamic_list_idx on public.agent_dynamic_list_materialization_runs(dynamic_list_id);
create index if not exists marketing_attribution_tracking_link_idx on public.marketing_attribution(tracking_link_id) where tracking_link_id is not null;
create index if not exists marketing_campaign_recipient_sources_campaign_only_idx on public.marketing_campaign_recipient_sources(campaign_id);
create index if not exists marketing_creatives_brand_profile_idx on public.marketing_creatives(brand_profile_id) where brand_profile_id is not null;
create index if not exists marketing_creatives_tracking_link_idx on public.marketing_creatives(tracking_link_id) where tracking_link_id is not null;
create index if not exists marketing_direct_mail_recipient_exclusions_campaign_idx on public.marketing_direct_mail_recipient_exclusions(campaign_id);
create index if not exists marketing_direct_mail_recipient_sources_campaign_only_idx on public.marketing_direct_mail_recipient_sources(campaign_id);
create index if not exists marketing_direct_mail_recipients_user_idx on public.marketing_direct_mail_recipients(user_id);
create index if not exists marketing_launch_approvals_creative_idx on public.marketing_launch_approvals(creative_id) where creative_id is not null;
create index if not exists marketing_launch_approvals_payment_idx on public.marketing_launch_approvals(payment_id) where payment_id is not null;
create index if not exists marketing_launch_approvals_quote_idx on public.marketing_launch_approvals(quote_id) where quote_id is not null;
create index if not exists marketing_launch_approvals_user_idx on public.marketing_launch_approvals(user_id);
create index if not exists marketing_payments_user_idx on public.marketing_payments(user_id);
create index if not exists marketing_provider_webhook_events_campaign_idx on public.marketing_provider_webhook_events(campaign_id) where campaign_id is not null;
create index if not exists marketing_provider_webhook_events_job_idx on public.marketing_provider_webhook_events(provider_job_id) where provider_job_id is not null;