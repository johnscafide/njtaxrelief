create table if not exists public.agent_dynamic_list_materialization_runs (
  id uuid primary key default gen_random_uuid(),
  dynamic_list_id uuid not null references public.agent_dynamic_lists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  generation uuid not null,
  definition_snapshot jsonb not null default '{}'::jsonb,
  candidate_count integer not null default 0 check (candidate_count >= 0),
  scanned_count integer not null default 0 check (scanned_count >= 0),
  matched_count integer not null default 0 check (matched_count >= 0),
  status text not null default 'scanning' check (status in ('scanning','complete','failed','abandoned')),
  detail text,
  source_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists agent_dynamic_list_materialization_runs_lookup_idx
  on public.agent_dynamic_list_materialization_runs(user_id,dynamic_list_id,created_at desc);
create unique index if not exists agent_dynamic_list_materialization_runs_generation_idx
  on public.agent_dynamic_list_materialization_runs(generation);
alter table public.agent_dynamic_list_materialization_runs enable row level security;
revoke all on public.agent_dynamic_list_materialization_runs from public, anon, authenticated;

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
        'source_complete',coalesce(m.source_complete,false),
        'importable',(
          m.dynamic_list_id is not null
          and m.definition_snapshot=jsonb_build_object('scope_type',l.scope_type,'scope_value',l.scope_value,'criteria',coalesce(l.criteria,'{}'::jsonb))
          and m.status in ('ready','ready_capacity_limited')
          and m.source_complete
          and m.materialized_count>0
        ),
        'materializable',(l.scope_type in ('municipality','county','zip','radius','polygon')),
        'detail',case
          when l.scope_type not in ('municipality','county','zip','radius','polygon')
            then 'This saved list type is not eligible for direct-mail materialization yet.'
          when m.dynamic_list_id is null
            or m.definition_snapshot<>jsonb_build_object('scope_type',l.scope_type,'scope_value',l.scope_value,'criteria',coalesce(l.criteria,'{}'::jsonb))
            or m.status not in ('ready','ready_capacity_limited')
            then case
              when coalesce(l.criteria->'intelligence_filters','{}'::jsonb)<>'{}'::jsonb
                or coalesce(l.criteria->'filters','{}'::jsonb) ?| array['sale_year_min','sale_year_max']
              then 'Prepare this farm with a complete statewide scan before adding it.'
              else 'Prepare this farm from the live NJ statewide parcel source before adding it.'
            end
          when m.status='ready_capacity_limited'
            then concat(m.materialized_count,' of ',m.source_count,' complete source matches are available under the current plan.')
          when m.status='ready'
            then 'Prepared from a complete scan of the same live NJ statewide parcel source used by the farm.'
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
