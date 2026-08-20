-- NJW-254 Phase G customer snapshot privacy hardening.
-- Keep exact user counts and revenue internal to service-only learning rollups/prior.
-- Authenticated Marketing Studio receives thresholded campaign counts and observed rates only.

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
      'dimension_key',dimension_key,
      'dimension_value',dimension_value,
      'customer_cohort','5+ customers',
      'campaigns',campaigns,
      'leads',leads,
      'appointments',appointments,
      'deals',deals,
      'response_campaign_rate',metrics->'response_campaign_rate',
      'lead_campaign_rate',metrics->'lead_campaign_rate',
      'appointment_campaign_rate',metrics->'appointment_campaign_rate',
      'deal_campaign_rate',metrics->'deal_campaign_rate',
      'window_start',window_start,
      'window_end',window_end
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
    'policy_version','marketing-creative-learning-v1',
    'evidence_state',case when latest is null then 'insufficient_evidence' else 'ready' end,
    'privacy_threshold','5+ distinct customers',
    'minimum_campaigns',10,
    'window_days',days,
    'as_of',latest,
    'rows',rows,
    'exact_customer_counts_exposed',false,
    'aggregate_revenue_exposed',false,
    'recipient_level_scoring',false,
    'protected_trait_features',false,
    'audience_membership_changed',false,
    'auto_launch_enabled',false,
    'proof_approval_bypassed',false
  );
end;
$$;
revoke all on function public.marketing_creative_learning_snapshot(integer) from public,anon;
grant execute on function public.marketing_creative_learning_snapshot(integer) to authenticated;