-- Store only PCM design variables the verified provider API actually exposes.
create or replace function public.marketing_pcm_design_state(p_campaign_id uuid) returns jsonb language plpgsql stable security definer set search_path='public' as $$
declare uid uuid:=auth.uid(); s jsonb;
begin if uid is null then raise exception 'Sign in required'; end if; select coalesce(settings->'pcm_design','{}'::jsonb) into s from public.marketing_campaigns where id=p_campaign_id and user_id=uid; if s is null then raise exception 'Campaign not found'; end if; return s; end $$;
create or replace function public.marketing_save_pcm_design_variables(p_campaign_id uuid,p_design_id text,p_variables jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='public' as $$
declare uid uuid:=auth.uid(); vars jsonb:=coalesce(p_variables,'{}'::jsonb); did text:=left(trim(coalesce(p_design_id,'')),120); c public.marketing_campaigns%rowtype;
begin
 if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if; if did='' then raise exception 'PCM design ID is required'; end if; if jsonb_typeof(vars)<>'object' then raise exception 'PCM design variables must be an object'; end if; if length(vars::text)>50000 then raise exception 'PCM design variable state is too large'; end if;
 select * into c from public.marketing_campaigns where id=p_campaign_id and user_id=uid for update; if c.id is null then raise exception 'Campaign not found'; end if;
 update public.marketing_campaigns set settings=coalesce(settings,'{}'::jsonb)||jsonb_build_object('pcm_design',jsonb_build_object('design_id',did,'variables',vars,'saved_at',now())),updated_at=now() where id=c.id;
 insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,c.id,'creative.pcm_variables_saved','pcm',jsonb_build_object('design_id',did,'variable_count',(select count(*) from jsonb_object_keys(vars))));
 return jsonb_build_object('campaign_id',c.id,'design_id',did,'variables',vars,'saved_at',now());
end $$;
revoke all on function public.marketing_pcm_design_state(uuid) from public,anon; revoke all on function public.marketing_save_pcm_design_variables(uuid,text,jsonb) from public,anon;
grant execute on function public.marketing_pcm_design_state(uuid) to authenticated,service_role; grant execute on function public.marketing_save_pcm_design_variables(uuid,text,jsonb) to authenticated,service_role;