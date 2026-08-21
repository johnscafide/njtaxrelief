create index if not exists marketing_email_drafts_brand_profile_id_idx
  on public.marketing_email_drafts (brand_profile_id)
  where brand_profile_id is not null;

create index if not exists marketing_email_drafts_source_broadcast_id_idx
  on public.marketing_email_drafts (source_broadcast_id)
  where source_broadcast_id is not null;
