-- Index user/campaign/FK access paths used by RLS and campaign orchestration.
create index if not exists marketing_snapshots_audience_idx on public.marketing_audience_snapshots(audience_id);
create index if not exists marketing_snapshots_user_idx on public.marketing_audience_snapshots(user_id,created_at desc);
create index if not exists marketing_campaigns_audience_idx on public.marketing_campaigns(audience_id) where audience_id is not null;
create index if not exists marketing_campaigns_snapshot_idx on public.marketing_campaigns(audience_snapshot_id) where audience_snapshot_id is not null;
create index if not exists marketing_versions_user_idx on public.marketing_campaign_versions(user_id,created_at desc);
create index if not exists marketing_brand_user_idx on public.marketing_brand_profiles(user_id,updated_at desc);
create index if not exists marketing_creatives_campaign_idx on public.marketing_creatives(campaign_id,created_at desc) where campaign_id is not null;
create index if not exists marketing_creatives_user_idx on public.marketing_creatives(user_id,created_at desc);
create index if not exists marketing_quotes_campaign_idx on public.marketing_price_quotes(campaign_id,created_at desc);
create index if not exists marketing_quotes_user_idx on public.marketing_price_quotes(user_id,created_at desc);
create index if not exists marketing_payments_campaign_idx on public.marketing_payments(campaign_id,created_at desc);
create index if not exists marketing_payments_quote_idx on public.marketing_payments(quote_id) where quote_id is not null;
create index if not exists marketing_jobs_user_idx on public.marketing_provider_jobs(user_id,created_at desc);
create index if not exists marketing_jobs_step_idx on public.marketing_provider_jobs(step_id) where step_id is not null;
create index if not exists marketing_events_job_idx on public.marketing_events(provider_job_id) where provider_job_id is not null;
create index if not exists marketing_attribution_user_idx on public.marketing_attribution(user_id,occurred_at desc);
