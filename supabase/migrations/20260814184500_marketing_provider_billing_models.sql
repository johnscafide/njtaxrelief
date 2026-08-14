alter table public.marketing_providers
  add column if not exists billing_model text not null default 'platform_prepaid'
  check(billing_model in ('platform_prepaid','platform_usage','user_direct','included'));

update public.marketing_providers set billing_model='platform_prepaid' where provider_key in ('pcm','lob');
update public.marketing_providers set billing_model='platform_usage' where provider_key in ('callrail','sendgrid','twilio_sms');
update public.marketing_providers set billing_model='user_direct' where provider_key='google_ads';
