-- NJW-264: cover newsletter foreign keys flagged by Supabase performance advisor.

create index if not exists marketing_email_sender_provider_connection_idx
  on public.marketing_email_sender_identities(provider_connection_id);
create index if not exists marketing_email_sender_provider_key_idx
  on public.marketing_email_sender_identities(provider_key);

create index if not exists marketing_email_contact_crm_connection_idx
  on public.marketing_email_contact_links(crm_connection_id);
create index if not exists marketing_email_contact_provider_key_idx
  on public.marketing_email_contact_links(provider_key);

create index if not exists marketing_email_broadcast_campaign_idx
  on public.marketing_email_broadcasts(campaign_id)
  where campaign_id is not null;
create index if not exists marketing_email_broadcast_creative_idx
  on public.marketing_email_broadcasts(creative_id)
  where creative_id is not null;
create index if not exists marketing_email_broadcast_provider_key_idx
  on public.marketing_email_broadcasts(provider_key);
