create table if not exists public.agent_dynamic_list_materializations (
  dynamic_list_id uuid primary key references public.agent_dynamic_lists(id) on delete cascade,
  user_id uuid not null,
  generation uuid not null,
  definition_snapshot jsonb not null default '{}'::jsonb,
  source_count integer not null default 0,
  materialized_count integer not null default 0,
  source_complete boolean not null default false,
  capacity_limited boolean not null default false,
  status text not null default 'pending',
  source_name text,
  detail text,
  materialized_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists agent_dynamic_list_materializations_user_idx
  on public.agent_dynamic_list_materializations(user_id, updated_at desc);

create table if not exists public.agent_dynamic_list_properties (
  user_id uuid not null,
  dynamic_list_id uuid not null references public.agent_dynamic_lists(id) on delete cascade,
  pams_pin text not null,
  generation uuid not null,
  matched_at timestamptz not null default now(),
  primary key(dynamic_list_id, generation, pams_pin)
);

create index if not exists agent_dynamic_list_properties_user_list_idx
  on public.agent_dynamic_list_properties(user_id, dynamic_list_id);

alter table public.agent_dynamic_list_materializations enable row level security;
alter table public.agent_dynamic_list_properties enable row level security;

drop policy if exists "dynamic list materializations own rows" on public.agent_dynamic_list_materializations;
create policy "dynamic list materializations own rows"
  on public.agent_dynamic_list_materializations
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "dynamic list properties own rows" on public.agent_dynamic_list_properties;
create policy "dynamic list properties own rows"
  on public.agent_dynamic_list_properties
  for select to authenticated
  using (auth.uid() = user_id);

grant select on public.agent_dynamic_list_materializations to authenticated;
grant select on public.agent_dynamic_list_properties to authenticated;

create or replace function public.marketing_recipient_source_catalog(p_campaign_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  uid uuid:=auth.uid();
  campaign public.marketing_campaigns%rowtype;
  result jsonb;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  select * into campaign from public.marketing_campaigns where id=p_campaign_id and user_id=uid;
  if campaign.id is null then raise exception 'Campaign not found'; end if;

  select jsonb_build_object(
    'current_audience', jsonb_build_object(
      'source_type','campaign_audience','source_ref','current','label','Current campaign audience','selected',true,
      'count',coalesce((select property_count from public.marketing_audience_snapshots where id=campaign.audience_snapshot_id and user_id=uid),0)
    ),
    'saved_properties', jsonb_build_object(
      'source_type','saved_properties','source_ref','all','label','Saved farms & watchlist properties',
      'selected',exists(select 1 from public.marketing_campaign_recipient_sources s where s.user_id=uid and s.campaign_id=p_campaign_id and s.source_type='saved_properties' and s.source_ref='all'),
      'count',(select count(*) from public.agent_farm_properties where user_id=uid and nullif(trim(pams_pin),'') is not null)
    ),
    'data_workbench_campaigns', coalesce((select jsonb_agg(jsonb_build_object(
      'source_type','data_workbench_campaign','source_ref',d.id::text,'label',d.name,
      'selected',exists(select 1 from public.marketing_campaign_recipient_sources s where s.user_id=uid and s.campaign_id=p_campaign_id and s.source_type='data_workbench_campaign' and s.source_ref=d.id::text),
      'count',case when jsonb_typeof(coalesce(d.property_keys,'[]'::jsonb))='array' then jsonb_array_length(coalesce(d.property_keys,'[]'::jsonb)) else 0 end
    ) order by d.updated_at desc) from public.data_workbench_campaigns d where d.user_id=uid),'[]'::jsonb),
    'professional_campaigns', coalesce((select jsonb_agg(jsonb_build_object(
      'source_type','professional_campaign','source_ref',pc.id::text,'label',pc.name,
      'selected',exists(select 1 from public.marketing_campaign_recipient_sources s where s.user_id=uid and s.campaign_id=p_campaign_id and s.source_type='professional_campaign' and s.source_ref=pc.id::text),
      'count',(select count(*) from public.professional_campaign_properties pcp where pcp.user_id=uid and pcp.campaign_id=pc.id and nullif(trim(pcp.pams_pin),'') is not null)
    ) order by pc.updated_at desc) from public.professional_campaigns pc where pc.user_id=uid),'[]'::jsonb),
    'previous_campaigns', coalesce((select jsonb_agg(jsonb_build_object(
      'source_type','previous_campaign','source_ref',c.id::text,'label',c.name,
      'selected',exists(select 1 from public.marketing_campaign_recipient_sources s where s.user_id=uid and s.campaign_id=p_campaign_id and s.source_type='previous_campaign' and s.source_ref=c.id::text),
      'count',coalesce(a.property_count,0)
    ) order by c.updated_at desc) from public.marketing_campaigns c left join public.marketing_audience_snapshots a on a.id=c.audience_snapshot_id and a.user_id=uid where c.user_id=uid and c.id<>p_campaign_id and c.audience_snapshot_id is not null limit 20),'[]'::jsonb),
    'smart_lists', coalesce((select jsonb_agg(
      jsonb_build_object(
        'source_type','smart_list',
        'source_ref',l.id::text,
        'label',l.name,
        'selected',exists(select 1 from public.marketing_campaign_recipient_sources s where s.user_id=uid and s.campaign_id=p_campaign_id and s.source_type='smart_list' and s.source_ref=l.id::text),
        'count',case
          when m.dynamic_list_id is not null
            and m.definition_snapshot=jsonb_build_object('scope_type',l.scope_type,'scope_value',l.scope_value,'criteria',coalesce(l.criteria,'{}'::jsonb))
            and m.status in ('ready','ready_capacity_limited')
          then m.materialized_count
          else coalesce(l.last_count,0)
        end,
        'source_count',coalesce(m.source_count,l.last_count,0),
        'materialized_count',coalesce(m.materialized_count,0),
        'materialized_at',m.materialized_at,
        'capacity_limited',coalesce(m.capacity_limited,false),
        'importable',(
          m.dynamic_list_id is not null
          and m.definition_snapshot=jsonb_build_object('scope_type',l.scope_type,'scope_value',l.scope_value,'criteria',coalesce(l.criteria,'{}'::jsonb))
          and m.status in ('ready','ready_capacity_limited')
          and m.materialized_count>0
        ),
        'materializable',(
          l.scope_type in ('municipality','county','zip','radius','polygon')
          and coalesce(l.criteria->'intelligence_filters','{}'::jsonb)='{}'::jsonb
          and not (coalesce(l.criteria->'filters','{}'::jsonb) ?| array['sale_year_min','sale_year_max'])
        ),
        'detail',case
          when coalesce(l.criteria->'intelligence_filters','{}'::jsonb)<>'{}'::jsonb
            then 'Watchdog intelligence farms stay protected until a complete candidate scan can be materialized.'
          when coalesce(l.criteria->'filters','{}'::jsonb) ?| array['sale_year_min','sale_year_max']
            then 'Sale-year farms need exact upstream filtering before direct-mail import can be enabled.'
          when l.scope_type not in ('municipality','county','zip','radius','polygon')
            then 'This saved list type is not eligible for direct-mail materialization yet.'
          when m.dynamic_list_id is null
            or m.definition_snapshot<>jsonb_build_object('scope_type',l.scope_type,'scope_value',l.scope_value,'criteria',coalesce(l.criteria,'{}'::jsonb))
            then 'Prepare this farm from the live NJ statewide parcel source before adding it.'
          when m.status='ready_capacity_limited'
            then concat(m.materialized_count,' of ',m.source_count,' matches are available under the current plan.')
          when m.status='ready'
            then 'Prepared from the same live NJ statewide parcel source used by the farm.'
          else coalesce(m.detail,'Refresh this farm before adding it.')
        end
      )
      order by l.updated_at desc
    ) from public.agent_dynamic_lists l
      left join public.agent_dynamic_list_materializations m
        on m.dynamic_list_id=l.id and m.user_id=uid
      where l.user_id=uid),'[]'::jsonb)
  ) into result;
  return result;
end
$function$;

create or replace function public.marketing_set_recipient_source(
  p_campaign_id uuid,
  p_source_type text,
  p_source_ref text,
  p_selected boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid:=auth.uid();
  st text:=lower(trim(coalesce(p_source_type,'')));
  sr text:=trim(coalesce(p_source_ref,''));
  labelv text;
  sid uuid;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if not exists(select 1 from public.marketing_campaigns where id=p_campaign_id and user_id=uid) then raise exception 'Campaign not found'; end if;
  if st not in ('saved_properties','data_workbench_campaign','professional_campaign','previous_campaign','smart_list') then raise exception 'Unsupported recipient source'; end if;
  if sr='' then raise exception 'source_ref is required'; end if;

  if st='saved_properties' then
    if sr<>'all' then raise exception 'Invalid saved property source'; end if;
    labelv:='Saved farms & watchlist properties';
  elsif st='data_workbench_campaign' then
    begin sid:=sr::uuid; exception when others then raise exception 'Invalid source reference'; end;
    select name into labelv from public.data_workbench_campaigns where id=sid and user_id=uid;
  elsif st='professional_campaign' then
    begin sid:=sr::uuid; exception when others then raise exception 'Invalid source reference'; end;
    select name into labelv from public.professional_campaigns where id=sid and user_id=uid;
  elsif st='previous_campaign' then
    begin sid:=sr::uuid; exception when others then raise exception 'Invalid source reference'; end;
    select name into labelv from public.marketing_campaigns where id=sid and user_id=uid and id<>p_campaign_id;
  elsif st='smart_list' then
    begin sid:=sr::uuid; exception when others then raise exception 'Invalid source reference'; end;
    if coalesce(p_selected,true) then
      select l.name into labelv
      from public.agent_dynamic_lists l
      join public.agent_dynamic_list_materializations m
        on m.dynamic_list_id=l.id and m.user_id=uid
      where l.id=sid and l.user_id=uid
        and m.definition_snapshot=jsonb_build_object('scope_type',l.scope_type,'scope_value',l.scope_value,'criteria',coalesce(l.criteria,'{}'::jsonb))
        and m.status in ('ready','ready_capacity_limited')
        and m.materialized_count>0;
      if labelv is null then raise exception 'Smart farm must be prepared from the live parcel source before it can be added'; end if;
    else
      select name into labelv from public.agent_dynamic_lists where id=sid and user_id=uid;
    end if;
  end if;
  if labelv is null then raise exception 'Recipient source not found'; end if;

  if coalesce(p_selected,true) then
    insert into public.marketing_campaign_recipient_sources(user_id,campaign_id,source_type,source_ref,source_label)
    values(uid,p_campaign_id,st,sr,labelv)
    on conflict(user_id,campaign_id,source_type,source_ref) do update set source_label=excluded.source_label;
  else
    delete from public.marketing_campaign_recipient_sources where user_id=uid and campaign_id=p_campaign_id and source_type=st and source_ref=sr;
  end if;
  return public.marketing_recipient_source_catalog(p_campaign_id);
end
$function$;

create or replace function public.marketing_prepare_direct_mail_recipients(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
 uid uuid:=auth.uid(); campaign public.marketing_campaigns%rowtype; total int:=0; valid_count int:=0; invalid_count int:=0; excluded_count int:=0;
begin
 if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
 select * into campaign from public.marketing_campaigns where id=p_campaign_id and user_id=uid;
 if campaign.id is null then raise exception 'Campaign not found'; end if;
 if campaign.audience_snapshot_id is null and not exists(select 1 from public.marketing_campaign_recipient_sources where user_id=uid and campaign_id=p_campaign_id) then raise exception 'No recipient source is attached to this campaign'; end if;

 delete from public.marketing_direct_mail_recipients where campaign_id=p_campaign_id and user_id=uid;
 delete from public.marketing_direct_mail_recipient_sources where campaign_id=p_campaign_id and user_id=uid;

 create temporary table if not exists tmp_ms_recipient_sources(property_key text,source_type text,source_ref text,source_label text) on commit drop;
 truncate tmp_ms_recipient_sources;

 if campaign.audience_snapshot_id is not null then
   insert into tmp_ms_recipient_sources
   select distinct value#>>'{}','campaign_audience','current','Current campaign audience'
   from public.marketing_audience_snapshots a cross join lateral jsonb_array_elements(coalesce(a.property_keys,'[]'::jsonb))
   where a.id=campaign.audience_snapshot_id and a.user_id=uid and nullif(trim(value#>>'{}'),'') is not null;
 end if;

 insert into tmp_ms_recipient_sources
 select distinct f.pams_pin,'saved_properties','all',case when f.relationship='watchlist' then 'Watchlist / saved property' else 'Saved farm property' end
 from public.agent_farm_properties f
 where f.user_id=uid and nullif(trim(f.pams_pin),'') is not null
   and exists(select 1 from public.marketing_campaign_recipient_sources s where s.user_id=uid and s.campaign_id=p_campaign_id and s.source_type='saved_properties' and s.source_ref='all');

 insert into tmp_ms_recipient_sources
 select distinct k.value#>>'{}','data_workbench_campaign',d.id::text,d.name
 from public.marketing_campaign_recipient_sources s join public.data_workbench_campaigns d on d.id::text=s.source_ref and d.user_id=uid
 cross join lateral jsonb_array_elements(coalesce(d.property_keys,'[]'::jsonb)) k
 where s.user_id=uid and s.campaign_id=p_campaign_id and s.source_type='data_workbench_campaign' and nullif(trim(k.value#>>'{}'),'') is not null;

 insert into tmp_ms_recipient_sources
 select distinct p.pams_pin,'professional_campaign',pc.id::text,pc.name
 from public.marketing_campaign_recipient_sources s join public.professional_campaigns pc on pc.id::text=s.source_ref and pc.user_id=uid
 join public.professional_campaign_properties p on p.campaign_id=pc.id and p.user_id=uid
 where s.user_id=uid and s.campaign_id=p_campaign_id and s.source_type='professional_campaign' and nullif(trim(p.pams_pin),'') is not null;

 insert into tmp_ms_recipient_sources
 select distinct k.value#>>'{}','previous_campaign',c.id::text,c.name
 from public.marketing_campaign_recipient_sources s join public.marketing_campaigns c on c.id::text=s.source_ref and c.user_id=uid and c.id<>p_campaign_id
 join public.marketing_audience_snapshots a on a.id=c.audience_snapshot_id and a.user_id=uid
 cross join lateral jsonb_array_elements(coalesce(a.property_keys,'[]'::jsonb)) k
 where s.user_id=uid and s.campaign_id=p_campaign_id and s.source_type='previous_campaign' and nullif(trim(k.value#>>'{}'),'') is not null;

 insert into tmp_ms_recipient_sources
 select distinct p.pams_pin,'smart_list',l.id::text,l.name
 from public.marketing_campaign_recipient_sources s
 join public.agent_dynamic_lists l on l.id::text=s.source_ref and l.user_id=uid
 join public.agent_dynamic_list_materializations m on m.dynamic_list_id=l.id and m.user_id=uid
 join public.agent_dynamic_list_properties p on p.dynamic_list_id=l.id and p.user_id=uid and p.generation=m.generation
 where s.user_id=uid and s.campaign_id=p_campaign_id and s.source_type='smart_list'
   and m.definition_snapshot=jsonb_build_object('scope_type',l.scope_type,'scope_value',l.scope_value,'criteria',coalesce(l.criteria,'{}'::jsonb))
   and m.status in ('ready','ready_capacity_limited')
   and nullif(trim(p.pams_pin),'') is not null;

 delete from tmp_ms_recipient_sources where nullif(trim(property_key),'') is null;
 select count(distinct property_key) into total from tmp_ms_recipient_sources;

 with requested as (select distinct property_key from tmp_ms_recipient_sources), resolved as (
   select distinct on (r.property_key) r.property_key,p.address,p.town,p.zip
   from requested r left join public.property_lookups p on p.pams_pin=r.property_key
   order by r.property_key,p.last_seen desc nulls last
 )
 insert into public.marketing_direct_mail_recipients(user_id,campaign_id,property_key,address,city,state,zip,validation_status,validation_detail)
 select uid,p_campaign_id,property_key,coalesce(nullif(trim(address),''),'MISSING'),coalesce(nullif(trim(town),''),'MISSING'),'NJ',coalesce(regexp_replace(zip,'[^0-9]','','g'),'')::text,
 case when length(coalesce(trim(address),''))>=3 and length(coalesce(trim(town),''))>=2 and regexp_replace(coalesce(zip,''),'[^0-9]','','g') ~ '^\d{5}([0-9]{4})?$' then 'valid' else 'invalid' end,
 jsonb_build_object('source','watchdog_recipient_assembly','resolved',address is not null) from resolved;

 insert into public.marketing_direct_mail_recipient_sources(user_id,campaign_id,property_key,source_type,source_ref,source_label)
 select distinct uid,p_campaign_id,property_key,source_type,source_ref,source_label from tmp_ms_recipient_sources
 on conflict do nothing;

 update public.marketing_direct_mail_recipients r set validation_detail=coalesce(r.validation_detail,'{}'::jsonb)||jsonb_build_object('pre_exclusion_status',r.validation_status),validation_status='excluded'
 from public.marketing_direct_mail_recipient_exclusions e where e.user_id=uid and e.campaign_id=p_campaign_id and e.property_key=r.property_key and e.excluded and r.user_id=uid and r.campaign_id=p_campaign_id;

 select count(*) filter(where validation_status='valid'),count(*) filter(where validation_status='invalid'),count(*) filter(where validation_status='excluded') into valid_count,invalid_count,excluded_count from public.marketing_direct_mail_recipients where campaign_id=p_campaign_id and user_id=uid;
 insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,p_campaign_id,'direct_mail.recipients_prepared','watchdog',jsonb_build_object('audience_count',total,'valid_count',valid_count,'invalid_count',invalid_count,'excluded_count',excluded_count,'additional_sources',(select count(*) from public.marketing_campaign_recipient_sources where user_id=uid and campaign_id=p_campaign_id)));
 return jsonb_build_object('audience_count',total,'valid_count',valid_count,'invalid_count',invalid_count,'excluded_count',excluded_count,'prepared_at',now());
end
$function$;

revoke all on function public.marketing_recipient_source_catalog(uuid) from public;
revoke all on function public.marketing_set_recipient_source(uuid,text,text,boolean) from public;
revoke all on function public.marketing_prepare_direct_mail_recipients(uuid) from public;
grant execute on function public.marketing_recipient_source_catalog(uuid) to authenticated;
grant execute on function public.marketing_set_recipient_source(uuid,text,text,boolean) to authenticated;
grant execute on function public.marketing_prepare_direct_mail_recipients(uuid) to authenticated;
