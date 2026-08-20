create table public.marketing_brand_assets (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references public.marketing_brand_profiles(id) on delete cascade,
  user_id uuid not null,
  organization_id uuid,
  asset_type text not null check (asset_type in ('headshot','brokerage_logo','team_logo','personal_logo','secondary_logo','brand_mark','marketing_photo')),
  storage_bucket text not null default 'marketing-brand-media' check (storage_bucket = 'marketing-brand-media'),
  storage_path text not null unique,
  original_name text,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 15728640),
  width integer check (width is null or width between 1 and 20000),
  height integer check (height is null or height between 1 and 20000),
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marketing_brand_assets_profile_type_idx on public.marketing_brand_assets(brand_profile_id, asset_type, status, created_at desc);
create index marketing_brand_assets_user_idx on public.marketing_brand_assets(user_id, status, created_at desc);
create index marketing_brand_assets_org_idx on public.marketing_brand_assets(organization_id, status, created_at desc) where organization_id is not null;

alter table public.marketing_brand_assets enable row level security;
revoke all on public.marketing_brand_assets from anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('marketing-brand-media','marketing-brand-media',false,15728640,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy marketing_brand_media_select on storage.objects
for select to authenticated
using (
  bucket_id='marketing-brand-media' and (
    ((storage.foldername(name))[1]='user' and (storage.foldername(name))[2]=(select auth.uid())::text)
    or
    ((storage.foldername(name))[1]='org'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and public.watchdog_is_org_member(((storage.foldername(name))[2])::uuid,null))
  )
);

create policy marketing_brand_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='marketing-brand-media' and (
    ((storage.foldername(name))[1]='user' and (storage.foldername(name))[2]=(select auth.uid())::text)
    or
    ((storage.foldername(name))[1]='org'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and public.watchdog_is_org_member(((storage.foldername(name))[2])::uuid,array['owner','admin','member']))
  )
);

create policy marketing_brand_media_delete on storage.objects
for delete to authenticated
using (
  bucket_id='marketing-brand-media' and (
    ((storage.foldername(name))[1]='user' and (storage.foldername(name))[2]=(select auth.uid())::text)
    or
    ((storage.foldername(name))[1]='org'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and public.watchdog_is_org_member(((storage.foldername(name))[2])::uuid,array['owner','admin']))
  )
);

create or replace function public.marketing_brand_media_bootstrap(p_brand_profile_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  bp public.marketing_brand_profiles%rowtype;
begin
  if uid is null or not public.can_use_data_workbench(uid) then
    raise exception 'Marketing Studio requires Agent or higher';
  end if;

  if p_brand_profile_id is not null then
    select * into bp
    from public.marketing_brand_profiles b
    where b.id=p_brand_profile_id
      and (b.user_id=uid or (b.organization_id is not null and public.watchdog_is_org_member(b.organization_id,null)))
    limit 1;
  else
    select * into bp
    from public.marketing_brand_profiles b
    where b.user_id=uid or (b.organization_id is not null and public.watchdog_is_org_member(b.organization_id,null))
    order by (b.user_id=uid) desc,b.is_default desc,b.updated_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'brand', case when bp.id is null then null else jsonb_build_object('id',bp.id,'name',bp.name,'is_default',bp.is_default,'organization_id',bp.organization_id,'profile',bp.profile,'updated_at',bp.updated_at) end,
    'assets', case when bp.id is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',a.id,'asset_type',a.asset_type,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,
        'original_name',a.original_name,'mime_type',a.mime_type,'file_size_bytes',a.file_size_bytes,'width',a.width,'height',a.height,
        'is_primary',a.is_primary,'status',a.status,'metadata',a.metadata,'created_at',a.created_at
      ) order by a.asset_type,a.is_primary desc,a.created_at desc),'[]'::jsonb)
      from public.marketing_brand_assets a
      where a.brand_profile_id=bp.id and a.status='active'
    ) end
  );
end $$;

create or replace function public.marketing_update_brand_media_profile(p_brand_profile_id uuid, p_patch jsonb, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  bid uuid;
  current_profile jsonb;
  patch jsonb;
  org_id uuid;
begin
  if uid is null or not public.can_use_data_workbench(uid) then
    raise exception 'Marketing Studio requires Agent or higher';
  end if;

  if p_brand_profile_id is null then
    select id,profile,organization_id into bid,current_profile,org_id
    from public.marketing_brand_profiles
    where user_id=uid
    order by is_default desc,updated_at desc
    limit 1;
  else
    select id,profile,organization_id into bid,current_profile,org_id
    from public.marketing_brand_profiles
    where id=p_brand_profile_id
      and (user_id=uid or (organization_id is not null and public.watchdog_is_org_member(organization_id,array['owner','admin'])))
    limit 1;
  end if;

  if bid is null then
    insert into public.marketing_brand_profiles(user_id,name,is_default,profile)
    values(uid,coalesce(nullif(trim(p_name),''),'Default brand'),true,'{}'::jsonb)
    returning id,profile,organization_id into bid,current_profile,org_id;
  end if;

  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into patch
  from jsonb_each(coalesce(p_patch,'{}'::jsonb))
  where key = any(array[
    'display_name','name','professional_title','title','company','brokerage','phone','email','website','license','brokerage_disclosure',
    'primary_color','secondary_color','neutral_preference','typography_pairing','logo_treatment','headshot_treatment','asset_selection'
  ]);

  if patch ? 'primary_color' and coalesce(patch->>'primary_color','') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid primary color'; end if;
  if patch ? 'secondary_color' and coalesce(patch->>'secondary_color','') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid secondary color'; end if;
  if patch ? 'neutral_preference' and coalesce(patch->>'neutral_preference','') not in ('light','warm','cool','dark') then raise exception 'Invalid neutral preference'; end if;
  if patch ? 'typography_pairing' and coalesce(patch->>'typography_pairing','') not in ('jakarta_source','jakarta_inter','libre_source','dm_sans_source') then raise exception 'Invalid typography pairing'; end if;
  if patch ? 'logo_treatment' and coalesce(patch->>'logo_treatment','') not in ('dark','light','full_color') then raise exception 'Invalid logo treatment'; end if;
  if patch ? 'headshot_treatment' and coalesce(patch->>'headshot_treatment','') not in ('circle','rounded_card','editorial_crop','none') then raise exception 'Invalid headshot treatment'; end if;

  update public.marketing_brand_profiles
  set name=coalesce(nullif(trim(p_name),''),name),profile=coalesce(current_profile,'{}'::jsonb)||patch,updated_at=now()
  where id=bid;

  insert into public.marketing_events(user_id,event_type,source,payload)
  values(uid,'brand.media_profile_saved','watchdog',jsonb_build_object('brand_profile_id',bid,'changed_keys',(select coalesce(jsonb_agg(key),'[]'::jsonb) from jsonb_each(patch))));

  return bid;
end $$;

create or replace function public.marketing_register_brand_asset(
  p_brand_profile_id uuid,
  p_asset_type text,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_width integer default null,
  p_height integer default null,
  p_make_primary boolean default true,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  bp public.marketing_brand_profiles%rowtype;
  aid uuid;
  expected_user_prefix text;
  expected_org_prefix text;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if p_asset_type not in ('headshot','brokerage_logo','team_logo','personal_logo','secondary_logo','brand_mark','marketing_photo') then raise exception 'Invalid brand asset type'; end if;
  if p_mime_type not in ('image/jpeg','image/png','image/webp') then raise exception 'Unsupported brand asset type'; end if;
  if p_file_size_bytes is null or p_file_size_bytes <= 0 or p_file_size_bytes > 15728640 then raise exception 'Brand asset exceeds the 15 MB limit'; end if;
  if p_storage_path is null or position('..' in p_storage_path)>0 then raise exception 'Invalid storage path'; end if;

  select * into bp from public.marketing_brand_profiles b
  where b.id=p_brand_profile_id
    and (b.user_id=uid or (b.organization_id is not null and public.watchdog_is_org_member(b.organization_id,array['owner','admin','member'])))
  limit 1;
  if bp.id is null then raise exception 'Brand profile not found'; end if;

  expected_user_prefix:='user/'||uid::text||'/'||bp.id::text||'/';
  expected_org_prefix:=case when bp.organization_id is null then null else 'org/'||bp.organization_id::text||'/'||bp.id::text||'/' end;
  if p_storage_path not like expected_user_prefix||'%' and (expected_org_prefix is null or p_storage_path not like expected_org_prefix||'%') then
    raise exception 'Brand asset path is outside the governed brand profile';
  end if;

  if p_make_primary then
    update public.marketing_brand_assets set is_primary=false,updated_at=now()
    where brand_profile_id=bp.id and asset_type=p_asset_type and status='active';
  end if;

  insert into public.marketing_brand_assets(
    brand_profile_id,user_id,organization_id,asset_type,storage_path,original_name,mime_type,file_size_bytes,width,height,is_primary,metadata
  ) values(
    bp.id,uid,bp.organization_id,p_asset_type,p_storage_path,left(coalesce(p_original_name,''),240),p_mime_type,p_file_size_bytes,p_width,p_height,p_make_primary,coalesce(p_metadata,'{}'::jsonb)
  ) returning id into aid;

  insert into public.marketing_events(user_id,event_type,source,payload)
  values(uid,'brand.asset_registered','watchdog',jsonb_build_object('brand_profile_id',bp.id,'brand_asset_id',aid,'asset_type',p_asset_type));
  return aid;
end $$;

create or replace function public.marketing_archive_brand_asset(p_asset_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare uid uuid:=auth.uid(); affected integer;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  update public.marketing_brand_assets a
  set status='archived',is_primary=false,updated_at=now()
  where a.id=p_asset_id and (
    a.user_id=uid or (a.organization_id is not null and public.watchdog_is_org_member(a.organization_id,array['owner','admin']))
  );
  get diagnostics affected=row_count;
  if affected>0 then
    insert into public.marketing_events(user_id,event_type,source,payload)
    values(uid,'brand.asset_archived','watchdog',jsonb_build_object('brand_asset_id',p_asset_id));
  end if;
  return affected>0;
end $$;

revoke all on function public.marketing_brand_media_bootstrap(uuid) from public,anon;
revoke all on function public.marketing_update_brand_media_profile(uuid,jsonb,text) from public,anon;
revoke all on function public.marketing_register_brand_asset(uuid,text,text,text,text,bigint,integer,integer,boolean,jsonb) from public,anon;
revoke all on function public.marketing_archive_brand_asset(uuid) from public,anon;
grant execute on function public.marketing_brand_media_bootstrap(uuid) to authenticated;
grant execute on function public.marketing_update_brand_media_profile(uuid,jsonb,text) to authenticated;
grant execute on function public.marketing_register_brand_asset(uuid,text,text,text,text,bigint,integer,integer,boolean,jsonb) to authenticated;
grant execute on function public.marketing_archive_brand_asset(uuid) to authenticated;
