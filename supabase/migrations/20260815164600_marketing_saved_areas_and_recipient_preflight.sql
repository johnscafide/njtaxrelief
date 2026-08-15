create or replace function public.marketing_audience_saved_areas(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if not exists(select 1 from public.marketing_campaigns where id=p_campaign_id and user_id=uid) then raise exception 'Campaign not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'name',l.name,'scope_type',l.scope_type,'scope_value',l.scope_value,'criteria',coalesce(l.criteria,'{}'::jsonb),
    'last_count',coalesce(l.last_count,0),'created_at',l.created_at,'updated_at',l.updated_at,
    'materialized_count',coalesce(m.materialized_count,0),'source_count',coalesce(m.source_count,l.last_count,0),
    'capacity_limited',coalesce(m.capacity_limited,false),'source_complete',coalesce(m.source_complete,false),'status',coalesce(m.status,'not_prepared'),
    'importable',(m.dynamic_list_id is not null and m.definition_snapshot=jsonb_build_object('scope_type',l.scope_type,'scope_value',l.scope_value,'criteria',coalesce(l.criteria,'{}'::jsonb)) and m.status in ('ready','ready_capacity_limited') and m.source_complete and m.materialized_count>0)
  ) order by l.updated_at desc),'[]'::jsonb) into result
  from public.agent_dynamic_lists l left join public.agent_dynamic_list_materializations m on m.dynamic_list_id=l.id and m.user_id=uid
  where l.user_id=uid and l.scope_type in ('municipality','county','zip','radius','polygon') and coalesce(l.criteria->>'saved_area','false')='true';
  return result;
end $$;
revoke all on function public.marketing_audience_saved_areas(uuid) from public, anon;
grant execute on function public.marketing_audience_saved_areas(uuid) to authenticated;

create or replace function public.marketing_delete_saved_area(p_list_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare uid uuid:=auth.uid(); rowv public.agent_dynamic_lists%rowtype; detached integer:=0;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  select * into rowv from public.agent_dynamic_lists where id=p_list_id and user_id=uid;
  if rowv.id is null then raise exception 'Saved area not found'; end if;
  if coalesce(rowv.criteria->>'saved_area','false')<>'true' then raise exception 'Only Marketing Studio saved areas can be deleted here'; end if;
  delete from public.marketing_campaign_recipient_sources where user_id=uid and source_type='smart_list' and source_ref=p_list_id::text;
  get diagnostics detached=row_count;
  delete from public.agent_dynamic_lists where id=p_list_id and user_id=uid;
  return jsonb_build_object('deleted',true,'id',p_list_id,'detached_campaign_sources',detached);
end $$;
revoke all on function public.marketing_delete_saved_area(uuid) from public, anon;
grant execute on function public.marketing_delete_saved_area(uuid) to authenticated;

create or replace function public.marketing_exclude_invalid_direct_mail_recipients(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare uid uuid:=auth.uid(); affected integer:=0;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if not exists(select 1 from public.marketing_campaigns where id=p_campaign_id and user_id=uid) then raise exception 'Campaign not found'; end if;
  insert into public.marketing_direct_mail_recipient_exclusions(user_id,campaign_id,property_key,excluded,reason,updated_at)
  select uid,p_campaign_id,r.property_key,true,'Incomplete mailing address',now()
  from public.marketing_direct_mail_recipients r where r.user_id=uid and r.campaign_id=p_campaign_id and r.validation_status='invalid'
  on conflict(user_id,campaign_id,property_key) do update set excluded=true,reason='Incomplete mailing address',updated_at=now();
  update public.marketing_direct_mail_recipients r set validation_detail=coalesce(r.validation_detail,'{}'::jsonb)||jsonb_build_object('pre_exclusion_status','invalid'),validation_status='excluded'
  where r.user_id=uid and r.campaign_id=p_campaign_id and r.validation_status='invalid';
  get diagnostics affected=row_count;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,p_campaign_id,'direct_mail.invalid_recipients_excluded','watchdog',jsonb_build_object('affected',affected));
  return public.marketing_direct_mail_recipient_summary(p_campaign_id)||jsonb_build_object('affected',affected);
end $$;
revoke all on function public.marketing_exclude_invalid_direct_mail_recipients(uuid) from public, anon;
grant execute on function public.marketing_exclude_invalid_direct_mail_recipients(uuid) to authenticated;
