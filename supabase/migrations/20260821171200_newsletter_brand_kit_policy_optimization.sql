-- NJW-264: consolidate beta read paths and optimize RLS initialization.
begin;

alter policy marketing_brand_owner
on public.marketing_brand_profiles
using (
  user_id = (select auth.uid())
  and (
    can_use_data_workbench((select auth.uid()))
    or (select private.marketing_email_beta_enabled())
  )
);

drop policy if exists marketing_brand_newsletter_beta_select on public.marketing_brand_profiles;

alter policy marketing_creative_templates_read
on public.marketing_creative_templates
using (
  can_use_data_workbench((select auth.uid()))
  or (
    creative_type = 'email'
    and active
    and (select private.marketing_email_beta_enabled())
  )
);

drop policy if exists marketing_creative_templates_newsletter_beta_read on public.marketing_creative_templates;

alter policy marketing_brand_newsletter_beta_insert
on public.marketing_brand_profiles
with check (
  user_id = (select auth.uid())
  and (select private.marketing_email_beta_enabled())
);

alter policy marketing_brand_newsletter_beta_update
on public.marketing_brand_profiles
using (
  user_id = (select auth.uid())
  and (select private.marketing_email_beta_enabled())
)
with check (
  user_id = (select auth.uid())
  and (select private.marketing_email_beta_enabled())
);

alter policy marketing_brand_newsletter_beta_delete
on public.marketing_brand_profiles
using (
  user_id = (select auth.uid())
  and (select private.marketing_email_beta_enabled())
);

grant insert, update, delete on table public.marketing_brand_profiles to authenticated;

alter policy marketing_email_brand_assets_select
on storage.objects
using (
  bucket_id = 'marketing-email-brand-assets'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (select private.marketing_email_beta_enabled())
);

alter policy marketing_email_brand_assets_insert
on storage.objects
with check (
  bucket_id = 'marketing-email-brand-assets'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (select private.marketing_email_beta_enabled())
);

alter policy marketing_email_brand_assets_update
on storage.objects
using (
  bucket_id = 'marketing-email-brand-assets'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (select private.marketing_email_beta_enabled())
)
with check (
  bucket_id = 'marketing-email-brand-assets'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (select private.marketing_email_beta_enabled())
);

alter policy marketing_email_brand_assets_delete
on storage.objects
using (
  bucket_id = 'marketing-email-brand-assets'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (select private.marketing_email_beta_enabled())
);

commit;
