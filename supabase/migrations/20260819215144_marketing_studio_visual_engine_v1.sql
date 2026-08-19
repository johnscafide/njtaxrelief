create table if not exists public.marketing_visual_style_presets (
  preset_key text primary key,
  label text not null,
  description text not null default '',
  minimum_tier text not null default 'smart' check (minimum_tier in ('smart','signature','studio')),
  art_direction jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.marketing_visual_style_presets(preset_key,label,description,minimum_tier,art_direction,sort_order)
values
  ('clean_local','Clean Local','Crisp local-professional layout with restrained property imagery and generous whitespace.','smart',jsonb_build_object('mood','clean, trustworthy, local','composition','bright architectural crop with generous negative space','texture','minimal'),10),
  ('editorial_luxury','Editorial Luxury','High-end real-estate editorial direction with premium architectural photography energy.','signature',jsonb_build_object('mood','premium, editorial, confident','composition','architectural detail, magazine-like crop, quiet negative space','texture','refined natural materials'),20),
  ('neighborhood_modern','Neighborhood Modern','Contemporary neighborhood storytelling with warmth, depth and polished local-market energy.','signature',jsonb_build_object('mood','modern, warm, local','composition','streetscape or home exterior atmosphere, layered depth','texture','subtle natural light'),30),
  ('data_signal','Data Signal','Watchdog-forward visual language using abstract property intelligence, maps and structured geometry.','signature',jsonb_build_object('mood','intelligent, modern, precise','composition','abstract property-grid and map-inspired geometry, no literal data claims','texture','clean digital depth'),40),
  ('architectural_gallery','Architectural Gallery','Gallery-grade architectural visual with dramatic composition and restrained luxury.','studio',jsonb_build_object('mood','gallery, architectural, elevated','composition','wide architectural hero crop, strong lines, intentional negative space','texture','cinematic natural light'),50),
  ('cinematic_local','Cinematic Local','Atmospheric South Jersey residential visual with cinematic light and premium campaign presence.','studio',jsonb_build_object('mood','cinematic, local, aspirational','composition','suburban New Jersey residential atmosphere, non-identifiable property, broad landscape framing','texture','golden-hour or blue-hour depth'),60),
  ('property_intelligence','Property Intelligence','Distinctive Watchdog-style visual built from abstract property forms, parcels and analytical layers.','studio',jsonb_build_object('mood','advanced, analytical, premium technology','composition','abstract parcel geometry, property silhouettes and restrained information layers','texture','dimensional glass and paper forms'),70),
  ('modern_heritage','Modern Heritage','Classic Northeast home character interpreted through a contemporary editorial lens.','studio',jsonb_build_object('mood','established, local, sophisticated','composition','timeless residential architecture, modern framing, no identifiable address','texture','tactile paper and natural materials'),80)
on conflict (preset_key) do update set
  label=excluded.label,
  description=excluded.description,
  minimum_tier=excluded.minimum_tier,
  art_direction=excluded.art_direction,
  active=true,
  sort_order=excluded.sort_order,
  updated_at=now();

alter table public.marketing_visual_style_presets enable row level security;
drop policy if exists marketing_visual_style_presets_authenticated_read on public.marketing_visual_style_presets;
create policy marketing_visual_style_presets_authenticated_read
on public.marketing_visual_style_presets
for select
to authenticated
using (active = true);
revoke all on public.marketing_visual_style_presets from anon;
grant select on public.marketing_visual_style_presets to authenticated;
grant all on public.marketing_visual_style_presets to service_role;

create table if not exists public.marketing_intelligence_visual_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  brief_id uuid not null references public.marketing_intelligence_creative_briefs(id) on delete cascade,
  creative_id uuid references public.marketing_creatives(id) on delete set null,
  variant_index integer not null default 0 check (variant_index >= 0 and variant_index <= 9),
  style_preset_key text references public.marketing_visual_style_presets(preset_key) on delete set null,
  asset_kind text not null default 'generated_preview' check (asset_kind in ('generated_preview','uploaded_preview','provider_asset')),
  status text not null default 'generated' check (status in ('generating','generated','selected','superseded','failed')),
  production_status text not null default 'preview_only' check (production_status in ('preview_only','awaiting_pcm_mapping','mapped_to_pcm','provider_rejected')),
  provider text,
  model text,
  prompt text,
  prompt_hash text,
  storage_bucket text not null default 'marketing-intelligence-visuals',
  storage_path text,
  mime_type text,
  width integer,
  height integer,
  bytes bigint,
  metadata jsonb not null default '{}'::jsonb,
  selected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_intelligence_visual_assets_user_campaign_idx
  on public.marketing_intelligence_visual_assets(user_id,campaign_id,created_at desc);
create index if not exists marketing_intelligence_visual_assets_brief_variant_idx
  on public.marketing_intelligence_visual_assets(brief_id,variant_index,created_at desc);
create index if not exists marketing_intelligence_visual_assets_selected_idx
  on public.marketing_intelligence_visual_assets(campaign_id,status)
  where status='selected';

alter table public.marketing_intelligence_visual_assets enable row level security;
drop policy if exists marketing_intelligence_visual_assets_owner_read on public.marketing_intelligence_visual_assets;
create policy marketing_intelligence_visual_assets_owner_read
on public.marketing_intelligence_visual_assets
for select
to authenticated
using ((select auth.uid()) = user_id);
revoke all on public.marketing_intelligence_visual_assets from anon;
revoke insert,update,delete on public.marketing_intelligence_visual_assets from authenticated;
grant select on public.marketing_intelligence_visual_assets to authenticated;
grant all on public.marketing_intelligence_visual_assets to service_role;

alter table public.marketing_creatives
  add column if not exists visual_asset_id uuid references public.marketing_intelligence_visual_assets(id) on delete set null;
create index if not exists marketing_creatives_visual_asset_id_idx on public.marketing_creatives(visual_asset_id) where visual_asset_id is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('marketing-intelligence-visuals','marketing-intelligence-visuals',false,12582912,array['image/webp','image/png','image/jpeg'])
on conflict (id) do update set
  name=excluded.name,
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists marketing_intelligence_visuals_owner_read on storage.objects;
create policy marketing_intelligence_visuals_owner_read
on storage.objects
for select
to authenticated
using (
  bucket_id='marketing-intelligence-visuals'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
