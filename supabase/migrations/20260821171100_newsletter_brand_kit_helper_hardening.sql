-- NJW-264: keep the Newsletter Studio beta predicate out of the exposed public schema.
begin;

create or replace function private.marketing_email_beta_enabled()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.marketing_email_beta_access b
    where b.user_id = auth.uid()
      and (b.expires_at is null or b.expires_at > now())
  );
$$;

revoke all on function private.marketing_email_beta_enabled() from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.marketing_email_beta_enabled() to authenticated, service_role;

alter policy marketing_brand_newsletter_beta_select
on public.marketing_brand_profiles
using (user_id = auth.uid() and private.marketing_email_beta_enabled());

alter policy marketing_brand_newsletter_beta_insert
on public.marketing_brand_profiles
with check (user_id = auth.uid() and private.marketing_email_beta_enabled());

alter policy marketing_brand_newsletter_beta_update
on public.marketing_brand_profiles
using (user_id = auth.uid() and private.marketing_email_beta_enabled())
with check (user_id = auth.uid() and private.marketing_email_beta_enabled());

alter policy marketing_brand_newsletter_beta_delete
on public.marketing_brand_profiles
using (user_id = auth.uid() and private.marketing_email_beta_enabled());

alter policy marketing_creative_templates_newsletter_beta_read
on public.marketing_creative_templates
using (creative_type = 'email' and active and private.marketing_email_beta_enabled());

alter policy marketing_email_brand_assets_select
on storage.objects
using (
  bucket_id = 'marketing-email-brand-assets'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = auth.uid()::text
  and private.marketing_email_beta_enabled()
);

alter policy marketing_email_brand_assets_insert
on storage.objects
with check (
  bucket_id = 'marketing-email-brand-assets'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = auth.uid()::text
  and private.marketing_email_beta_enabled()
);

alter policy marketing_email_brand_assets_update
on storage.objects
using (
  bucket_id = 'marketing-email-brand-assets'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = auth.uid()::text
  and private.marketing_email_beta_enabled()
)
with check (
  bucket_id = 'marketing-email-brand-assets'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = auth.uid()::text
  and private.marketing_email_beta_enabled()
);

alter policy marketing_email_brand_assets_delete
on storage.objects
using (
  bucket_id = 'marketing-email-brand-assets'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = auth.uid()::text
  and private.marketing_email_beta_enabled()
);

drop function if exists public.marketing_email_beta_enabled();

commit;
