-- NJW-254 Marketing Studio Phase G: privacy-thresholded creative outcome learning.
-- Uses only authoritative mailed/completed live provider campaigns and recorded attribution.
-- No recipient-level scoring, audience mutation, payment, proof approval, or fulfillment action is introduced.

create table if not exists public.marketing_creative_learning_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  creative_id uuid not null unique references public.marketing_creatives(id) on delete cascade,
  creative_version integer not null,
  creative_tier text not null default 'unknown',
  template_key text,
  intelligence_brief_id uuid references public.marketing_intelligence_creative_briefs(id) on delete set null,
  recommendation_id uuid references public.marketing_campaign_recommendations(id) on delete set null,
  recommendation_policy_version text,
  recommendation_play_key text,
  recommendation_status text,
  approved_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists marketing_creative_learning_context_campaign_idx
  on public.marketing_creative_learning_contexts(campaign_id,approved_at desc);
create index if not exists marketing_creative_learning_context_recommendation_idx
  on public.marketing_creative_learning_contexts(recommendation_play_key,approved_at desc)
  where recommendation_play_key is not null;
alter table public.marketing_creative_learning_contexts enable row level security;
revoke all on table public.marketing_creative_learning_contexts from anon,authenticated;
grant all on table public.marketing_creative_learning_contexts to service_role;

create or replace function public.capture_marketing_creative_learning_context()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  brief_id uuid;
  tier text:='unknown';
  rec public.marketing_campaign_recommendations%rowtype;
  play text;
begin
  if new.channel<>'direct_mail' or new.status<>'approved' or new.approved_at is null then return new; end if;
  if exists(select 1 from public.marketing_creative_learning_contexts x where x.creative_id=new.id) then return new; end if;

  if coalesce(new.content->>'intelligence_brief_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    brief_id:=(new.content->>'intelligence_brief_id')::uuid;
    select coalesce(b.creative_tier,'unknown') into tier
    from public.marketing_intelligence_creative_briefs b
    where b.id=brief_id and b.user_id=new.user_id and b.campaign_id=new.campaign_id;
    tier:=coalesce(tier,'unknown');
  end if;

  select * into rec
  from public.marketing_campaign_recommendations r
  where r.user_id=new.user_id and r.campaign_id=new.campaign_id and r.status<>'superseded'
  order by r.created_at desc limit 1;
  if rec.id is not null then
    play:=case when rec.status in ('accepted','overridden') then rec.decision_play_key when rec.status='recommended' then rec.recommended_play_key else null end;
  end if;

  insert into public.marketing_creative_learning_contexts(
    user_id,campaign_id,creative_id,creative_version,creative_tier,template_key,intelligence_brief_id,
    recommendation_id,recommendation_policy_version,recommendation_play_key,recommendation_status,approved_at
  ) values (
    new.user_id,new.campaign_id,new.id,new.version,tier,new.template_key,brief_id,
    rec.id,rec.policy_version,play,rec.status,new.approved_at
  ) on conflict(creative_id) do nothing;
  return new;
end;
$$;
revoke all on function public.capture_marketing_creative_learning_context() from public,anon,authenticated;

drop trigger if exists marketing_creative_learning_context_capture on public.marketing_creatives;
create trigger marketing_creative_learning_context_capture
after insert or update of status,approved_at on public.marketing_creatives
for each row execute function public.capture_marketing_creative_learning_context();

-- Backfill already-approved creative revisions using the same immutable approval-time dimensions.
insert into public.marketing_creative_learning_contexts(
  user_id,campaign_id,creative_id,creative_version,creative_tier,template_key,intelligence_brief_id,
  recommendation_id,recommendation_policy_version,recommendation_play_key,recommendation_status,approved_at
)
select
  c.user_id,c.campaign_id,c.id,c.version,coalesce(b.creative_tier,'unknown'),c.template_key,b.id,
  r.id,r.policy_version,
  case when r.status in ('accepted','overridden') then r.decision_play_key when r.status='recommended' then r.recommended_play_key else null end,
  r.status,c.approved_at
from public.marketing_creatives c
left join public.marketing_intelligence_creative_briefs b
  on b.user_id=c.user_id and b.campaign_id=c.campaign_id
 and b.id=case when coalesce(c.content->>'intelligence_brief_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (c.content->>'intelligence_brief_id')::uuid else null end
left join lateral (
  select rr.* from public.marketing_campaign_recommendations rr
  where rr.user_id=c.user_id and rr.campaign_id=c.campaign_id and rr.status<>'superseded'
  order by rr.created_at desc limit 1
) r on true
where c.channel='direct_mail' and c.status='approved' and c.approved_at is not null
on conflict(creative_id) do nothing;

create or replace function public.refresh_marketing_creative_learning_rollups(p_days integer default 180)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  days integer:=greatest(30,least(coalesce(p_days,180),730));
  start_at timestamptz:=date_trunc('day',now())-make_interval(days=>greatest(30,least(coalesce(p_days,180),730)));
  end_at timestamptz:=date_trunc('day',now());
  changed integer:=0;
begin
  delete from public.marketing_performance_rollups
  where dimension_key in ('creative_tier','template_key','recommendation_play','creative_tier_template')
    and window_end=end_at;

  with executed as (
    select distinct on (j.user_id,j.campaign_id)
      j.user_id,j.campaign_id,j.id provider_job_row_id,j.provider_key,j.status provider_status,
      coalesce(j.recipient_count,0) recipient_count,coalesce(j.vendor_cost_cents,0) vendor_cost_cents,
      coalesce(j.submitted_at,j.created_at) execution_at,la.creative_id
    from public.marketing_provider_jobs j
    join lateral (
      select a.creative_id,a.consumed_at
      from public.marketing_launch_approvals a
      where a.user_id=j.user_id and a.campaign_id=j.campaign_id and a.channel='direct_mail'
        and a.consumed_at is not null and a.revoked_at is null
      order by a.consumed_at desc limit 1
    ) la on true
    where j.mode='live' and j.status in ('mailed','completed')
      and coalesce(j.completed_at,j.submitted_at,j.created_at)>=start_at
    order by j.user_id,j.campaign_id,coalesce(j.completed_at,j.submitted_at,j.created_at) desc
  ), campaign_facts as (
    select e.user_id,e.campaign_id,e.provider_key,e.provider_status,e.recipient_count,e.vendor_cost_cents,e.execution_at,
      ctx.creative_id,ctx.creative_tier,ctx.template_key,ctx.recommendation_play_key,ctx.recommendation_policy_version,
      coalesce(pay.customer_spend_cents,0) customer_spend_cents,
      coalesce(a.touchpoints,0) touchpoints,coalesce(a.page_views,0) page_views,coalesce(a.qr_scans,0) qr_scans,
      coalesce(a.leads,0) leads,coalesce(a.appointments,0) appointments,coalesce(a.deals,0) deals,
      coalesce(a.attributed_revenue_cents,0) attributed_revenue_cents
    from executed e
    join public.marketing_creative_learning_contexts ctx on ctx.creative_id=e.creative_id and ctx.user_id=e.user_id and ctx.campaign_id=e.campaign_id
    left join lateral (
      select coalesce(sum(greatest(p.amount_cents-coalesce(p.refunded_cents,0),0)),0)::bigint customer_spend_cents
      from public.marketing_payments p
      where p.user_id=e.user_id and p.campaign_id=e.campaign_id and p.status in ('paid','partially_refunded')
    ) pay on true
    left join lateral (
      select count(*)::int touchpoints,
        count(*) filter(where x.touchpoint_type='page_view')::int page_views,
        count(*) filter(where x.touchpoint_type='qr_scan')::int qr_scans,
        count(*) filter(where x.conversion_type in ('lead','qualified_lead'))::int leads,
        count(*) filter(where x.conversion_type='appointment')::int appointments,
        count(*) filter(where x.conversion_type in ('deal','closing'))::int deals,
        coalesce(sum(coalesce(x.revenue_cents,0)),0)::bigint attributed_revenue_cents
      from public.marketing_attribution x
      where x.user_id=e.user_id and x.campaign_id=e.campaign_id
        and x.occurred_at>=e.execution_at-interval '1 day' and x.occurred_at<=now()
    ) a on true
  ), dimensions as (
    select f.*,'creative_tier'::text dimension_key,f.creative_tier dimension_value
    from campaign_facts f where nullif(f.creative_tier,'') is not null and f.creative_tier<>'unknown'
    union all
    select f.*,'template_key',f.template_key from campaign_facts f where nullif(f.template_key,'') is not null
    union all
    select f.*,'recommendation_play',f.recommendation_play_key from campaign_facts f where nullif(f.recommendation_play_key,'') is not null
    union all
    select f.*,'creative_tier_template',f.creative_tier||'|'||f.template_key
    from campaign_facts f where nullif(f.creative_tier,'') is not null and f.creative_tier<>'unknown' and nullif(f.template_key,'') is not null
  ), grouped as (
    select dimension_key,dimension_value,
      count(distinct user_id)::int sample_size,count(distinct campaign_id)::int campaigns,
      sum(customer_spend_cents)::bigint customer_spend_cents,sum(vendor_cost_cents)::bigint vendor_cost_cents,
      sum(attributed_revenue_cents)::bigint attributed_revenue_cents,sum(leads)::int leads,sum(appointments)::int appointments,sum(deals)::int deals,
      sum(recipient_count)::bigint pieces_mailed,sum(touchpoints)::bigint touchpoints,sum(page_views)::bigint page_views,sum(qr_scans)::bigint qr_scans,
      count(distinct campaign_id) filter(where touchpoints>0)::int response_campaigns,
      count(distinct campaign_id) filter(where leads>0)::int lead_campaigns,
      count(distinct campaign_id) filter(where appointments>0)::int appointment_campaigns,
      count(distinct campaign_id) filter(where deals>0)::int deal_campaigns,
      min(execution_at) first_execution,max(execution_at) last_execution
    from dimensions group by dimension_key,dimension_value
    having count(distinct user_id)>=5 and count(distinct campaign_id)>=10
  )
  insert into public.marketing_performance_rollups(
    dimension_key,dimension_value,sample_size,campaigns,customer_spend_cents,vendor_cost_cents,attributed_revenue_cents,
    leads,appointments,deals,metrics,window_start,window_end
  )
  select dimension_key,dimension_value,sample_size,campaigns,customer_spend_cents,vendor_cost_cents,attributed_revenue_cents,
    leads,appointments,deals,
    jsonb_build_object(
      'learning_policy_version','marketing-creative-learning-v1',
      'privacy_threshold_users',5,'minimum_campaigns',10,'anonymized',true,'cohort_unit','campaign',
      'authoritative_execution_statuses',jsonb_build_array('mailed','completed'),
      'pieces_mailed',pieces_mailed,'touchpoints',touchpoints,'page_views',page_views,'qr_scans',qr_scans,
      'response_campaigns',response_campaigns,'lead_campaigns',lead_campaigns,'appointment_campaigns',appointment_campaigns,'deal_campaigns',deal_campaigns,
      'response_campaign_rate',round(response_campaigns::numeric/nullif(campaigns,0)*100,2),
      'lead_campaign_rate',round(lead_campaigns::numeric/nullif(campaigns,0)*100,2),
      'appointment_campaign_rate',round(appointment_campaigns::numeric/nullif(campaigns,0)*100,2),
      'deal_campaign_rate',round(deal_campaigns::numeric/nullif(campaigns,0)*100,2),
      'first_execution_at',first_execution,'last_execution_at',last_execution,
      'recipient_level_scoring',false,'protected_trait_features',false,'auto_launch_enabled',false
    ),start_at,end_at
  from grouped
  on conflict(dimension_key,dimension_value,window_end) do update set
    sample_size=excluded.sample_size,campaigns=excluded.campaigns,customer_spend_cents=excluded.customer_spend_cents,
    vendor_cost_cents=excluded.vendor_cost_cents,attributed_revenue_cents=excluded.attributed_revenue_cents,
    leads=excluded.leads,appointments=excluded.appointments,deals=excluded.deals,metrics=excluded.metrics,window_start=excluded.window_start;
  get diagnostics changed=row_count;
  return changed;
end;
$$;
revoke all on function public.refresh_marketing_creative_learning_rollups(integer) from public,anon,authenticated;
grant execute on function public.refresh_marketing_creative_learning_rollups(integer) to service_role;

create or replace function public.marketing_creative_learning_snapshot(p_days integer default 180)
returns jsonb
language plpgsql
stable security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  days integer:=greatest(30,least(coalesce(p_days,180),730));
  latest timestamptz;
  rows jsonb:='[]'::jsonb;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  select max(window_end) into latest
  from public.marketing_performance_rollups
  where dimension_key in ('creative_tier','template_key','recommendation_play','creative_tier_template')
    and window_start>=date_trunc('day',now())-make_interval(days=>days)
    and sample_size>=5 and campaigns>=10
    and coalesce((metrics->>'anonymized')::boolean,false)=true
    and metrics->>'learning_policy_version'='marketing-creative-learning-v1';
  if latest is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'dimension_key',dimension_key,'dimension_value',dimension_value,'sample_size',sample_size,'campaigns',campaigns,
      'leads',leads,'appointments',appointments,'deals',deals,'attributed_revenue_cents',attributed_revenue_cents,
      'response_campaign_rate',metrics->'response_campaign_rate','lead_campaign_rate',metrics->'lead_campaign_rate',
      'appointment_campaign_rate',metrics->'appointment_campaign_rate','deal_campaign_rate',metrics->'deal_campaign_rate',
      'window_start',window_start,'window_end',window_end
    ) order by dimension_key,coalesce((metrics->>'lead_campaign_rate')::numeric,0) desc,dimension_value),'[]'::jsonb)
    into rows
    from public.marketing_performance_rollups
    where window_end=latest
      and dimension_key in ('creative_tier','template_key','recommendation_play','creative_tier_template')
      and sample_size>=5 and campaigns>=10
      and coalesce((metrics->>'anonymized')::boolean,false)=true
      and metrics->>'learning_policy_version'='marketing-creative-learning-v1';
  end if;
  return jsonb_build_object(
    'policy_version','marketing-creative-learning-v1','evidence_state',case when latest is null then 'insufficient_evidence' else 'ready' end,
    'privacy_threshold_users',5,'minimum_campaigns',10,'window_days',days,'as_of',latest,'rows',rows,
    'recipient_level_scoring',false,'protected_trait_features',false,'audience_membership_changed',false,'auto_launch_enabled',false,'proof_approval_bypassed',false
  );
end;
$$;
revoke all on function public.marketing_creative_learning_snapshot(integer) from public,anon;
grant execute on function public.marketing_creative_learning_snapshot(integer) to authenticated;

create or replace function public.marketing_thresholded_creative_learning_prior(p_dimension_key text,p_dimension_value text,p_days integer default 180)
returns jsonb
language plpgsql
stable security definer
set search_path=public
as $$
declare
  key text:=lower(trim(coalesce(p_dimension_key,'')));
  val text:=trim(coalesce(p_dimension_value,''));
  days integer:=greatest(30,least(coalesce(p_days,180),730));
  r public.marketing_performance_rollups%rowtype;
begin
  if key not in ('creative_tier','template_key','recommendation_play','creative_tier_template') or val='' then return jsonb_build_object('eligible',false,'reason','invalid_dimension'); end if;
  select * into r from public.marketing_performance_rollups
  where dimension_key=key and dimension_value=val
    and window_start>=date_trunc('day',now())-make_interval(days=>days)
    and sample_size>=5 and campaigns>=10
    and coalesce((metrics->>'anonymized')::boolean,false)=true
    and metrics->>'learning_policy_version'='marketing-creative-learning-v1'
  order by window_end desc limit 1;
  if r.id is null then return jsonb_build_object('eligible',false,'reason','insufficient_evidence','privacy_threshold_users',5,'minimum_campaigns',10); end if;
  return jsonb_build_object('eligible',true,'policy_version','marketing-creative-learning-v1','dimension_key',r.dimension_key,'dimension_value',r.dimension_value,
    'sample_size',r.sample_size,'campaigns',r.campaigns,'lead_campaign_rate',r.metrics->'lead_campaign_rate',
    'appointment_campaign_rate',r.metrics->'appointment_campaign_rate','deal_campaign_rate',r.metrics->'deal_campaign_rate',
    'window_start',r.window_start,'window_end',r.window_end,'recipient_level_scoring',false,'protected_trait_features',false);
end;
$$;
revoke all on function public.marketing_thresholded_creative_learning_prior(text,text,integer) from public,anon,authenticated;
grant execute on function public.marketing_thresholded_creative_learning_prior(text,text,integer) to service_role;

-- Daily refresh. Safe to replay: replace any prior job with the same name.
do $$
declare jid bigint;
begin
  for jid in select jobid from cron.job where jobname='watchdog_marketing_creative_learning_daily' loop
    perform cron.unschedule(jid);
  end loop;
  perform cron.schedule('watchdog_marketing_creative_learning_daily','17 7 * * *','select public.refresh_marketing_creative_learning_rollups(180);');
end $$;