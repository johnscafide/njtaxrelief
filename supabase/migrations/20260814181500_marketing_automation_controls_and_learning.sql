-- NJW-152: dynamic audience controls, hashed suppression, normalized provider retries,
-- and privacy-thresholded aggregate performance learning.
create unique index if not exists marketing_dynamic_rules_audience_campaign_key
  on public.marketing_dynamic_audience_rules(audience_id,coalesce(campaign_id,'00000000-0000-0000-0000-000000000000'::uuid));

create or replace function public.marketing_configure_dynamic_audience(p_audience_id uuid,p_campaign_id uuid default null,p_criteria jsonb default '{}'::jsonb,p_trigger_mode text default 'review',p_enabled boolean default false,p_max_new_properties integer default 250) returns uuid
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); rid uuid; mode text:=lower(trim(coalesce(p_trigger_mode,'review'))); maxn integer:=greatest(1,least(coalesce(p_max_new_properties,250),5000));
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if not exists(select 1 from public.marketing_audiences where id=p_audience_id and user_id=uid) then raise exception 'Audience not found'; end if;
  if p_campaign_id is not null and not exists(select 1 from public.marketing_campaigns where id=p_campaign_id and user_id=uid and audience_id=p_audience_id) then raise exception 'Campaign does not match audience'; end if;
  if mode not in ('review','auto_add','auto_campaign') then raise exception 'Invalid trigger mode'; end if;
  insert into public.marketing_dynamic_audience_rules(user_id,audience_id,campaign_id,enabled,criteria,trigger_mode,max_new_properties_per_run,updated_at)
  values(uid,p_audience_id,p_campaign_id,coalesce(p_enabled,false),coalesce(p_criteria,'{}'::jsonb),mode,maxn,now())
  on conflict (audience_id,coalesce(campaign_id,'00000000-0000-0000-0000-000000000000'::uuid)) do update
    set enabled=excluded.enabled,criteria=excluded.criteria,trigger_mode=excluded.trigger_mode,max_new_properties_per_run=excluded.max_new_properties_per_run,updated_at=now()
  returning id into rid;
  if p_campaign_id is not null then insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,p_campaign_id,'audience.dynamic_rule_configured','watchdog',jsonb_build_object('rule_id',rid,'enabled',p_enabled,'trigger_mode',mode,'max_new_properties',maxn)); end if;
  return rid;
end $$;
revoke all on function public.marketing_configure_dynamic_audience(uuid,uuid,jsonb,text,boolean,integer) from public,anon;
grant execute on function public.marketing_configure_dynamic_audience(uuid,uuid,jsonb,text,boolean,integer) to authenticated;

create or replace function public.marketing_add_suppression(p_channel text,p_subject_hash text,p_reason text default null,p_expires_at timestamptz default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); ch text:=lower(trim(coalesce(p_channel,''))); h text:=lower(trim(coalesce(p_subject_hash,''))); sid uuid;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if ch not in ('direct_mail','email','sms','call_tracking','google_ads') then raise exception 'Unsupported suppression channel'; end if;
  if h !~ '^[a-f0-9]{64}$' then raise exception 'Suppression subject must be a SHA-256 hash'; end if;
  insert into public.marketing_suppressions(user_id,channel,subject_hash,reason,source,expires_at)
  values(uid,ch,h,left(nullif(trim(coalesce(p_reason,'')),''),240),'user',p_expires_at)
  on conflict(user_id,channel,subject_hash) do update set reason=excluded.reason,source='user',expires_at=excluded.expires_at
  returning id into sid;
  return sid;
end $$;
revoke all on function public.marketing_add_suppression(text,text,text,timestamptz) from public,anon;
grant execute on function public.marketing_add_suppression(text,text,text,timestamptz) to authenticated;

create or replace function public.marketing_is_suppressed(p_user_id uuid,p_channel text,p_subject_hash text) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.marketing_suppressions s where s.user_id=p_user_id and s.channel=lower(trim(p_channel)) and s.subject_hash=lower(trim(p_subject_hash)) and (s.expires_at is null or s.expires_at>now()))
$$;
revoke all on function public.marketing_is_suppressed(uuid,text,text) from public,anon,authenticated;
grant execute on function public.marketing_is_suppressed(uuid,text,text) to service_role;

create or replace function public.marketing_normalize_provider_event(p_provider_job_id uuid,p_event_type text,p_status text,p_payload jsonb default '{}'::jsonb) returns text
language plpgsql security definer set search_path=public as $$
declare j public.marketing_provider_jobs%rowtype; st public.marketing_campaign_steps%rowtype; normalized text:=lower(trim(coalesce(p_status,''))); ev text:=left(lower(trim(coalesce(p_event_type,'provider.event'))),80); retry_at timestamptz; err text;
begin
  if normalized not in ('queued','submitting','submitted','processing','live','mailed','completed','failed','cancelled') then raise exception 'Unsupported provider status'; end if;
  select * into j from public.marketing_provider_jobs where id=p_provider_job_id for update;
  if j.id is null then raise exception 'Provider job not found'; end if;
  update public.marketing_provider_jobs set status=normalized,response_summary=coalesce(response_summary,'{}'::jsonb)||jsonb_build_object('last_event',ev,'last_event_payload',coalesce(p_payload,'{}'::jsonb)),submitted_at=case when normalized in ('submitted','processing','live','mailed','completed') then coalesce(submitted_at,now()) else submitted_at end,completed_at=case when normalized in ('completed','failed','cancelled') then now() else completed_at end,updated_at=now() where id=j.id;
  insert into public.marketing_events(user_id,campaign_id,provider_job_id,event_type,source,payload) values(j.user_id,j.campaign_id,j.id,'provider.'||ev,j.provider_key,jsonb_build_object('status',normalized,'provider_payload',coalesce(p_payload,'{}'::jsonb)));
  if j.step_id is not null then
    select * into st from public.marketing_campaign_steps where id=j.step_id for update;
    if st.id is not null then
      if normalized='completed' then update public.marketing_campaign_steps set status='completed',completed_at=now(),last_error=null,updated_at=now() where id=st.id;
      elsif normalized='failed' then
        err:=left(coalesce(p_payload->>'error','Provider job failed'),500);
        if st.attempts<st.max_attempts then retry_at:=now()+make_interval(mins=>least(1440,greatest(5,round(power(2,greatest(st.attempts,1))::numeric*5)::integer))); update public.marketing_campaign_steps set status='retry',next_attempt_at=retry_at,last_error=err,updated_at=now() where id=st.id;
        else update public.marketing_campaign_steps set status='failed',completed_at=now(),last_error=err,updated_at=now() where id=st.id; end if;
      elsif normalized='cancelled' then update public.marketing_campaign_steps set status='cancelled',completed_at=now(),updated_at=now() where id=st.id;
      else update public.marketing_campaign_steps set status='processing',updated_at=now() where id=st.id; end if;
    end if;
  end if;
  return normalized;
end $$;
revoke all on function public.marketing_normalize_provider_event(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.marketing_normalize_provider_event(uuid,text,text,jsonb) to service_role;

create table if not exists public.marketing_performance_rollups (
  id uuid primary key default gen_random_uuid(), dimension_key text not null, dimension_value text not null,
  sample_size integer not null check(sample_size>=5), campaigns integer not null default 0,
  customer_spend_cents bigint not null default 0, vendor_cost_cents bigint not null default 0,
  attributed_revenue_cents bigint not null default 0, leads integer not null default 0,
  appointments integer not null default 0, deals integer not null default 0,
  metrics jsonb not null default '{}'::jsonb, window_start timestamptz, window_end timestamptz not null default now(),
  created_at timestamptz not null default now(), unique(dimension_key,dimension_value,window_end)
);
alter table public.marketing_performance_rollups enable row level security;
revoke all on public.marketing_performance_rollups from anon,authenticated;
grant all on public.marketing_performance_rollups to service_role;

create or replace function public.refresh_marketing_performance_rollups() returns integer
language plpgsql security definer set search_path=public as $$
declare inserted integer:=0;
begin
  insert into public.marketing_performance_rollups(dimension_key,dimension_value,sample_size,campaigns,customer_spend_cents,vendor_cost_cents,attributed_revenue_cents,leads,appointments,deals,metrics,window_start,window_end)
  select 'goal',c.goal,count(distinct c.user_id),count(distinct c.id),coalesce(sum(pm.net_spend),0),coalesce(sum(pj.vendor_cost),0),coalesce(sum(a.revenue),0),coalesce(sum(a.leads),0),coalesce(sum(a.appointments),0),coalesce(sum(a.deals),0),jsonb_build_object('privacy_threshold',5,'anonymized',true),now()-interval '180 days',date_trunc('day',now())
  from public.marketing_campaigns c
  left join lateral (select sum(greatest(amount_cents-coalesce(refunded_cents,0),0)) net_spend from public.marketing_payments where campaign_id=c.id and status in ('paid','partially_refunded')) pm on true
  left join lateral (select sum(coalesce(vendor_cost_cents,0)) vendor_cost from public.marketing_provider_jobs where campaign_id=c.id and status not in ('failed','cancelled')) pj on true
  left join lateral (select sum(coalesce(revenue_cents,0)) revenue,count(*) filter(where conversion_type in ('lead','qualified_lead')) leads,count(*) filter(where conversion_type='appointment') appointments,count(*) filter(where conversion_type in ('deal','closing')) deals from public.marketing_attribution where campaign_id=c.id) a on true
  where c.created_at>=now()-interval '180 days' group by c.goal having count(distinct c.user_id)>=5
  on conflict(dimension_key,dimension_value,window_end) do update set sample_size=excluded.sample_size,campaigns=excluded.campaigns,customer_spend_cents=excluded.customer_spend_cents,vendor_cost_cents=excluded.vendor_cost_cents,attributed_revenue_cents=excluded.attributed_revenue_cents,leads=excluded.leads,appointments=excluded.appointments,deals=excluded.deals,metrics=excluded.metrics,window_start=excluded.window_start;
  get diagnostics inserted=row_count; return inserted;
end $$;
revoke all on function public.refresh_marketing_performance_rollups() from public,anon,authenticated;
grant execute on function public.refresh_marketing_performance_rollups() to service_role;
