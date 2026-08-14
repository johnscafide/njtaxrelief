-- Server-authoritative Marketing Studio bootstrap and campaign creation RPCs.
create or replace function public.marketing_studio_bootstrap() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare uid uuid:=auth.uid(); p text;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  p:=public.watchdog_effective_plan(uid);
  return jsonb_build_object(
    'plan',p,
    'providers',(select coalesce(jsonb_agg(jsonb_build_object('key',provider_key,'name',display_name,'type',provider_type,'mode',default_mode,'capabilities',capabilities) order by display_name),'[]'::jsonb) from public.marketing_providers where active),
    'campaigns',(select coalesce(jsonb_agg(to_jsonb(c) order by c.updated_at desc),'[]'::jsonb) from (select id,name,goal,status,budget_cents,spend_cap_cents,updated_at from public.marketing_campaigns where user_id=uid order by updated_at desc limit 25)c)
  );
end $$;
revoke all on function public.marketing_studio_bootstrap() from public,anon;
grant execute on function public.marketing_studio_bootstrap() to authenticated;

create or replace function public.marketing_studio_create_campaign(p_name text,p_goal text default 'general',p_profession text default null,p_property_keys jsonb default '[]'::jsonb,p_qualification_summary jsonb default '{}'::jsonb,p_source_type text default 'workbench') returns uuid
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); aid uuid; sid uuid; cid uuid; cnt integer;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Campaign name is required'; end if;
  if jsonb_typeof(coalesce(p_property_keys,'[]'::jsonb)) <> 'array' then raise exception 'property_keys must be an array'; end if;
  cnt:=jsonb_array_length(coalesce(p_property_keys,'[]'::jsonb));
  if cnt>10000 then raise exception 'Audience snapshot exceeds 10,000 properties'; end if;
  insert into public.marketing_audiences(user_id,name,source_type) values(uid,trim(p_name)||' audience',coalesce(nullif(p_source_type,''),'workbench')) returning id into aid;
  insert into public.marketing_audience_snapshots(audience_id,user_id,property_keys,qualification_summary,property_count) values(aid,uid,coalesce(p_property_keys,'[]'::jsonb),coalesce(p_qualification_summary,'{}'::jsonb),cnt) returning id into sid;
  insert into public.marketing_campaigns(user_id,audience_id,audience_snapshot_id,name,goal,profession,status) values(uid,aid,sid,trim(p_name),coalesce(nullif(p_goal,''),'general'),p_profession,'draft') returning id into cid;
  insert into public.marketing_campaign_versions(campaign_id,version,user_id,definition) values(cid,1,uid,jsonb_build_object('goal',coalesce(nullif(p_goal,''),'general'),'source_type',p_source_type,'property_count',cnt));
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,cid,'campaign.created','watchdog',jsonb_build_object('property_count',cnt));
  return cid;
end $$;
revoke all on function public.marketing_studio_create_campaign(text,text,text,jsonb,jsonb,text) from public,anon;
grant execute on function public.marketing_studio_create_campaign(text,text,text,jsonb,jsonb,text) to authenticated;
