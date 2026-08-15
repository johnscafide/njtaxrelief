create or replace function public.marketing_direct_mail_admin_summary(p_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare uid uuid:=auth.uid(); cutoff timestamptz:=now()-(greatest(1,least(coalesce(p_days,90),730))||' days')::interval; out jsonb;
begin
  if uid is null or not public.is_watchdog_developer() then raise exception 'Developer access required'; end if;
  with paid as (
    select p.*,greatest(0,coalesce(p.amount_cents,0)-coalesce(p.refunded_cents,0)) net_cash
    from public.marketing_payments p where p.status in ('paid','succeeded','completed') and coalesce(p.paid_at,p.created_at)>=cutoff
  ), jobs as (
    select j.*,coalesce(j.recipient_count,nullif(j.request_summary->>'recipient_count','')::int,0) pieces
    from public.marketing_provider_jobs j where j.provider_key='pcm' and j.created_at>=cutoff and j.status not in ('failed','canceled','cancelled')
  ), campaigns as (
    select c.* from public.marketing_campaigns c where c.created_at>=cutoff
  ), funnel as (
    select jsonb_build_object(
      'campaigns',count(distinct case when e.event_type='campaign.created' then e.campaign_id end),
      'audiences',count(distinct case when e.event_type like 'direct_mail.audience%' or e.event_type in ('direct_mail.saved_area_created','direct_mail.farm_materialized') then e.campaign_id end),
      'designs',count(distinct case when e.event_type in ('creative.pcm_design_selected','creative.created','creative.pcm_design_bound') then e.campaign_id end),
      'proofs',count(distinct case when e.event_type in ('creative.pcm_proof_reviewed','creative.approved') then e.campaign_id end),
      'recipients',count(distinct case when e.event_type in ('direct_mail.recipients_prepared','direct_mail.addresses_prepared') then e.campaign_id end),
      'quotes',count(distinct case when e.event_type='quote.created' then e.campaign_id end),
      'payments',count(distinct case when e.event_type in ('campaign.payment_captured','payment.captured') then e.campaign_id end),
      'submitted',count(distinct case when e.event_type='direct_mail.submitted' then e.campaign_id end)
    ) value from public.marketing_events e where e.occurred_at>=cutoff
  )
  select jsonb_build_object(
    'days',greatest(1,least(coalesce(p_days,90),730)),
    'customer_base',(select count(*) from public.account_entitlements a where a.plan_tier in ('agent','pro','pro_plus','teams','developer') and coalesce(a.subscription_status,'active') not in ('canceled','cancelled','expired')),
    'direct_mail_users',(select count(distinct c.user_id) from campaigns c),
    'campaigns',(select count(*) from campaigns),
    'paid_customers',(select count(distinct user_id) from paid),
    'cash_collected_cents',coalesce((select sum(net_cash) from paid),0),
    'refunds_cents',coalesce((select sum(coalesce(refunded_cents,0)) from paid),0),
    'provider_orders',(select count(*) from jobs),
    'pieces',coalesce((select sum(pieces) from jobs),0),
    'vendor_cost_cents',coalesce((select sum(coalesce(vendor_cost_cents,0)) from jobs),0),
    'booked_retail_cents',coalesce((select sum(coalesce(q.retail_cents,j.retail_cents,0)) from jobs j left join public.marketing_price_quotes q on q.id=j.quote_id),0),
    'gross_margin_cents',coalesce((select sum(coalesce(q.retail_cents,j.retail_cents,0)-coalesce(j.vendor_cost_cents,0)) from jobs j left join public.marketing_price_quotes q on q.id=j.quote_id),0),
    'average_order_value_cents',coalesce((select round(avg(coalesce(q.retail_cents,j.retail_cents,0))) from jobs j left join public.marketing_price_quotes q on q.id=j.quote_id),0),
    'repeat_customers',(select count(*) from (select user_id from jobs group by user_id having count(*)>=2) x),
    'credits_granted_cents',coalesce((select sum(grant_cents) from public.marketing_credit_accounts),0),
    'credits_used_cents',coalesce((select sum(used_cents) from public.marketing_credit_accounts),0),
    'credits_available_cents',coalesce((select sum(greatest(grant_cents-used_cents,0)) from public.marketing_credit_accounts where expires_at>now()),0),
    'funnel',(select value from funnel),
    'generated_at',now()
  ) into out;
  return out;
end $function$;
