create or replace function public.marketing_set_brand_studio_references(
  p_brand_profile_id uuid,
  p_asset_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  bp public.marketing_brand_profiles%rowtype;
  ids uuid[]:=coalesce(p_asset_ids,'{}'::uuid[]);
  valid_count integer:=0;
  selection jsonb;
begin
  if uid is null or not public.can_use_data_workbench(uid) then
    raise exception 'Marketing Studio requires Agent or higher';
  end if;

  if cardinality(ids)>2 then
    raise exception 'Studio supports up to two Brand & Media reference photos';
  end if;

  if exists(
    select 1
    from unnest(ids) x
    group by x
    having count(*)>1
  ) then
    raise exception 'Studio reference photos must be unique';
  end if;

  if p_brand_profile_id is null then
    select * into bp
    from public.marketing_brand_profiles b
    where b.user_id=uid
       or (b.organization_id is not null and public.watchdog_is_org_member(b.organization_id,array['owner','admin']))
    order by (b.user_id=uid) desc,b.is_default desc,b.updated_at desc
    limit 1;
  else
    select * into bp
    from public.marketing_brand_profiles b
    where b.id=p_brand_profile_id
      and (b.user_id=uid or (b.organization_id is not null and public.watchdog_is_org_member(b.organization_id,array['owner','admin'])))
    limit 1;
  end if;

  if bp.id is null then
    raise exception 'Brand profile not found';
  end if;

  if cardinality(ids)>0 then
    select count(*) into valid_count
    from public.marketing_brand_assets a
    where a.id=any(ids)
      and a.brand_profile_id=bp.id
      and a.asset_type='marketing_photo'
      and a.status='active';

    if valid_count<>cardinality(ids) then
      raise exception 'Studio references must be active marketing photos from this Brand & Media profile';
    end if;
  end if;

  selection:=coalesce(bp.profile->'asset_selection','{}'::jsonb)
    || jsonb_build_object('studio_reference_asset_ids',to_jsonb(ids));

  update public.marketing_brand_profiles
  set profile=coalesce(profile,'{}'::jsonb)||jsonb_build_object('asset_selection',selection),
      updated_at=now()
  where id=bp.id;

  insert into public.marketing_events(user_id,event_type,source,payload)
  values(
    uid,
    'brand.studio_references_saved',
    'watchdog',
    jsonb_build_object(
      'brand_profile_id',bp.id,
      'reference_count',cardinality(ids),
      'reference_asset_ids',to_jsonb(ids)
    )
  );

  return jsonb_build_object(
    'brand_profile_id',bp.id,
    'studio_reference_asset_ids',to_jsonb(ids),
    'reference_count',cardinality(ids)
  );
end $$;

revoke all on function public.marketing_set_brand_studio_references(uuid,uuid[]) from public,anon;
grant execute on function public.marketing_set_brand_studio_references(uuid,uuid[]) to authenticated;
