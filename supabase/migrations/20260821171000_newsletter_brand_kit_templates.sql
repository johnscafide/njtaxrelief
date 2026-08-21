-- NJW-264 Phase 2: Newsletter Brand Kit + Basic/Deluxe/Premium templates.
-- Reuses Marketing Studio brand profiles and creative templates so branding remains channel-neutral.

begin;

-- Allow the shared creative-template registry to hold newsletter templates.
alter table public.marketing_creative_templates
  drop constraint if exists marketing_creative_templates_creative_type_check;

alter table public.marketing_creative_templates
  add constraint marketing_creative_templates_creative_type_check
  check (creative_type = any (array['postcard'::text, 'letter'::text, 'email'::text]));

-- Private beta helper used by RLS. It only reports access for the current authenticated user.
create or replace function public.marketing_email_beta_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.marketing_email_beta_access b
    where b.user_id = auth.uid()
      and (b.expires_at is null or b.expires_at > now())
  );
$$;

revoke all on function public.marketing_email_beta_enabled() from public;
grant execute on function public.marketing_email_beta_enabled() to authenticated, service_role;

-- Existing brand profiles are preserved. These additive policies let the private
-- Newsletter Studio beta manage only the signed-in user's own profiles.
drop policy if exists marketing_brand_newsletter_beta_select on public.marketing_brand_profiles;
create policy marketing_brand_newsletter_beta_select
on public.marketing_brand_profiles
for select
to authenticated
using (user_id = auth.uid() and public.marketing_email_beta_enabled());

drop policy if exists marketing_brand_newsletter_beta_insert on public.marketing_brand_profiles;
create policy marketing_brand_newsletter_beta_insert
on public.marketing_brand_profiles
for insert
to authenticated
with check (user_id = auth.uid() and public.marketing_email_beta_enabled());

drop policy if exists marketing_brand_newsletter_beta_update on public.marketing_brand_profiles;
create policy marketing_brand_newsletter_beta_update
on public.marketing_brand_profiles
for update
to authenticated
using (user_id = auth.uid() and public.marketing_email_beta_enabled())
with check (user_id = auth.uid() and public.marketing_email_beta_enabled());

drop policy if exists marketing_brand_newsletter_beta_delete on public.marketing_brand_profiles;
create policy marketing_brand_newsletter_beta_delete
on public.marketing_brand_profiles
for delete
to authenticated
using (user_id = auth.uid() and public.marketing_email_beta_enabled());

-- Newsletter beta users can read only the active email templates through this
-- additive policy. Existing Marketing Studio template policies remain untouched.
drop policy if exists marketing_creative_templates_newsletter_beta_read on public.marketing_creative_templates;
create policy marketing_creative_templates_newsletter_beta_read
on public.marketing_creative_templates
for select
to authenticated
using (
  creative_type = 'email'
  and active
  and public.marketing_email_beta_enabled()
);

-- Logos embedded in email require durable public URLs. Upload/update/delete remains
-- authenticated and user-scoped; public access applies only to the rendered asset URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketing-email-brand-assets',
  'marketing-email-brand-assets',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists marketing_email_brand_assets_select on storage.objects;
create policy marketing_email_brand_assets_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'marketing-email-brand-assets'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.marketing_email_beta_enabled()
);

drop policy if exists marketing_email_brand_assets_insert on storage.objects;
create policy marketing_email_brand_assets_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'marketing-email-brand-assets'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.marketing_email_beta_enabled()
);

drop policy if exists marketing_email_brand_assets_update on storage.objects;
create policy marketing_email_brand_assets_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'marketing-email-brand-assets'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.marketing_email_beta_enabled()
)
with check (
  bucket_id = 'marketing-email-brand-assets'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.marketing_email_beta_enabled()
);

drop policy if exists marketing_email_brand_assets_delete on storage.objects;
create policy marketing_email_brand_assets_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'marketing-email-brand-assets'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.marketing_email_beta_enabled()
);

-- The registry stores template capabilities and defaults. Newsletter content remains
-- independent and is rendered client-side into email-safe HTML before Kit delivery.
insert into public.marketing_creative_templates
  (template_key, title, description, creative_type, professions, goals, layout_key, content, active, sort_order)
values
  (
    'email_basic_clean_v1',
    'Basic · Clean Update',
    'A simple, polished, text-first newsletter inspired by modern creator email layouts.',
    'email',
    array[]::text[],
    array['newsletter','update','personal']::text[],
    'email_basic_clean',
    jsonb_build_object(
      'version', 1,
      'tier', 'basic',
      'badge', 'Basic',
      'summary', 'Simple, personal and easy to read.',
      'features', jsonb_build_array('logo','brand_colors','typography','stories','cta'),
      'defaults', jsonb_build_object(
        'personality','minimal',
        'button_style','rounded',
        'corner_radius','soft',
        'image_style','inline',
        'content_width','compact'
      )
    ),
    true,
    210
  ),
  (
    'email_deluxe_modern_v1',
    'Deluxe · Modern Brief',
    'A designed newsletter with a hero story, supporting stories, cards and branded callouts.',
    'email',
    array[]::text[],
    array['newsletter','market_update','insights']::text[],
    'email_deluxe_modern',
    jsonb_build_object(
      'version', 1,
      'tier', 'deluxe',
      'badge', 'Deluxe',
      'summary', 'Designed, modern and visually organized.',
      'features', jsonb_build_array('logo_variants','brand_colors','typography','hero_image','story_cards','callout','cta'),
      'defaults', jsonb_build_object(
        'personality','modern',
        'button_style','rounded',
        'corner_radius','medium',
        'image_style','rounded',
        'content_width','standard'
      )
    ),
    true,
    220
  ),
  (
    'email_premium_editorial_v1',
    'Premium · Editorial Intelligence',
    'A publication-style newsletter with a premium masthead, editorial typography, data callouts and layered story hierarchy.',
    'email',
    array[]::text[],
    array['newsletter','insights','luxury','research']::text[],
    'email_premium_editorial',
    jsonb_build_object(
      'version', 1,
      'tier', 'premium',
      'badge', 'Premium',
      'summary', 'Editorial, premium and publication-grade.',
      'features', jsonb_build_array('logo_variants','brand_colors','typography','hero_image','metrics','signal_callout','story_hierarchy','premium_cta'),
      'defaults', jsonb_build_object(
        'personality','editorial',
        'button_style','rounded',
        'corner_radius','medium',
        'image_style','full_bleed',
        'content_width','standard'
      )
    ),
    true,
    230
  )
on conflict (template_key) do update set
  title = excluded.title,
  description = excluded.description,
  creative_type = excluded.creative_type,
  professions = excluded.professions,
  goals = excluded.goals,
  layout_key = excluded.layout_key,
  content = excluded.content,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

commit;
