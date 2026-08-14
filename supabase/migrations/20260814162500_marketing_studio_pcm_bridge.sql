-- NJW-149: non-breaking bridge from the existing PCM integration into Marketing Studio.
alter table public.pcm_direct_mail_orders
  add column if not exists marketing_campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  add column if not exists marketing_provider_job_id uuid references public.marketing_provider_jobs(id) on delete set null;

create index if not exists pcm_direct_mail_orders_marketing_campaign_idx
  on public.pcm_direct_mail_orders(marketing_campaign_id) where marketing_campaign_id is not null;
create index if not exists pcm_direct_mail_orders_marketing_job_idx
  on public.pcm_direct_mail_orders(marketing_provider_job_id) where marketing_provider_job_id is not null;
