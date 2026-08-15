create or replace function public.marketing_direct_mail_fulfillment_recipients(p_user_id uuid,p_campaign_id uuid,p_limit integer default 5001)
returns table(property_key text,recipient_name text,address text,city text,state text,zip text)
language sql
stable
security definer
set search_path='public'
as $function$
  select r.property_key,r.recipient_name,r.address,r.city,r.state,r.zip
  from public.marketing_direct_mail_recipients r
  left join public.marketing_direct_mail_recipient_exclusions e
    on e.user_id=r.user_id and e.campaign_id=r.campaign_id and e.property_key=r.property_key
  where r.user_id=p_user_id and r.campaign_id=p_campaign_id and r.validation_status='valid' and not coalesce(e.excluded,false)
  order by r.property_key
  limit greatest(1,least(coalesce(p_limit,5001),100001));
$function$;
revoke all on function public.marketing_direct_mail_fulfillment_recipients(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.marketing_direct_mail_fulfillment_recipients(uuid,uuid,integer) to service_role;

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
    select p.*,greatest(0,(case when p.metadata ? 'amount_due_cents' and coalesce(p.metadata->>'amount_due_cents','')~'^\d+$' then (p.metadata->>'amount_due_cents')::bigint else coalesce(p.amount_cents,0) end)-coalesce(p.refunded_cents,0)) cash_paid
    from public.marketing_payments p where p.status in ('paid','succeeded','completed') and coalesce(p.paid_at,p.created_at)>=cutoff
  ), jobs as (
    select j.*,coalesce(j.recipient_count,nullif(j.request_summary->>'recipient_count','')::int,0) pieces from public.marketing_provider_jobs j where j.provider_key='pcm' and j.created_at>=cutoff and j.status not in ('failed','canceled','cancelled')
  ), campaigns as (
    select c.* from public.marketing_campaigns c where c.created_at>=cutoff
  ), funnel as (
    select jsonb_build_object('campaigns',count(distinct case when e.event_type='campaign.created' then e.campaign_id end),'audiences',count(distinct case when e.event_type like 'direct_mail.audience%' or e.event_type in ('direct_mail.saved_area_created','direct_mail.farm_materialized') then e.campaign_id end),'designs',count(distinct case when e.event_type in ('creative.pcm_design_selected','creative.created','creative.pcm_design_bound') then e.campaign_id end),'proofs',count(distinct case when e.event_type in ('creative.pcm_proof_reviewed','creative.approved') then e.campaign_id end),'recipients',count(distinct case when e.event_type in ('direct_mail.recipients_prepared','direct_mail.addresses_prepared') then e.campaign_id end),'quotes',count(distinct case when e.event_type='quote.created' then e.campaign_id end),'payments',count(distinct case when e.event_type in ('campaign.payment_captured','payment.captured') then e.campaign_id end),'submitted',count(distinct case when e.event_type='direct_mail.submitted' then e.campaign_id end)) value
    from public.marketing_events e where e.occurred_at>=cutoff
  )
  select jsonb_build_object('days',greatest(1,least(coalesce(p_days,90),730)),'customer_base',(select count(*) from public.account_entitlements a where a.plan_tier in ('agent','pro','pro_plus','teams','developer') and coalesce(a.subscription_status,'active') not in ('canceled','cancelled','expired')),'direct_mail_users',(select count(distinct c.user_id) from campaigns c),'campaigns',(select count(*) from campaigns),'paid_customers',(select count(distinct user_id) from paid),'cash_collected_cents',coalesce((select sum(cash_paid) from paid),0),'refunds_cents',coalesce((select sum(coalesce(refunded_cents,0)) from paid),0),'provider_orders',(select count(*) from jobs),'pieces',coalesce((select sum(pieces) from jobs),0),'vendor_cost_cents',coalesce((select sum(coalesce(vendor_cost_cents,0)) from jobs),0),'booked_retail_cents',coalesce((select sum(coalesce(q.retail_cents,j.retail_cents,0)) from jobs j left join public.marketing_price_quotes q on q.id=j.quote_id),0),'gross_margin_cents',coalesce((select sum(coalesce(q.retail_cents,j.retail_cents,0)-coalesce(j.credit_cents,0)-coalesce(j.vendor_cost_cents,0)) from jobs j left join public.marketing_price_quotes q on q.id=j.quote_id),0),'average_order_value_cents',coalesce((select round(avg(coalesce(q.retail_cents,j.retail_cents,0))) from jobs j left join public.marketing_price_quotes q on q.id=j.quote_id),0),'repeat_customers',(select count(*) from (select user_id from jobs group by user_id having count(*)>=2) x),'credits_granted_cents',coalesce((select sum(grant_cents) from public.marketing_credit_accounts),0),'credits_used_cents',coalesce((select sum(used_cents) from public.marketing_credit_accounts),0),'credits_available_cents',coalesce((select sum(greatest(grant_cents-used_cents,0)) from public.marketing_credit_accounts where expires_at>now()),0),'funnel',(select value from funnel),'generated_at',now()) into out;
  return out;
end $function$;

create or replace function public.marketing_direct_mail_admin_customers(p_limit integer default 100,p_offset integer default 0,p_segment text default 'all')
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare uid uuid:=auth.uid(); lim int:=greatest(1,least(coalesce(p_limit,100),500)); off int:=greatest(0,coalesce(p_offset,0)); seg text:=lower(coalesce(nullif(trim(p_segment),''),'all')); out jsonb;
begin
  if uid is null or not public.is_watchdog_developer() then raise exception 'Developer access required'; end if;
  with members as (
    select a.user_id,a.plan_tier,a.billing_interval,a.subscription_status,p.email,p.full_name,p.display_name,p.created_at account_created from public.account_entitlements a left join public.profiles p on p.id=a.user_id where a.plan_tier in ('agent','pro','pro_plus','teams','developer')
  ), campaign_stats as (
    select user_id,count(*) campaigns,max(created_at) last_campaign_at from public.marketing_campaigns group by user_id
  ), pay_stats as (
    select user_id,count(*) filter(where status in ('paid','succeeded','completed')) paid_payments,coalesce(sum(greatest(0,(case when metadata ? 'amount_due_cents' and coalesce(metadata->>'amount_due_cents','')~'^\d+$' then (metadata->>'amount_due_cents')::bigint else coalesce(amount_cents,0) end)-coalesce(refunded_cents,0))) filter(where status in ('paid','succeeded','completed')),0) cash_spend_cents,max(coalesce(paid_at,created_at)) filter(where status in ('paid','succeeded','completed')) last_paid_at from public.marketing_payments group by user_id
  ), job_stats as (
    select user_id,count(*) filter(where provider_key='pcm' and status not in ('failed','canceled','cancelled')) orders,coalesce(sum(coalesce(recipient_count,nullif(request_summary->>'recipient_count','')::int,0)) filter(where provider_key='pcm' and status not in ('failed','canceled','cancelled')),0) pieces,coalesce(sum(coalesce(vendor_cost_cents,0)) filter(where provider_key='pcm' and status not in ('failed','canceled','cancelled')),0) vendor_cost_cents,max(submitted_at) filter(where provider_key='pcm' and status not in ('failed','canceled','cancelled')) last_order_at,mode() within group(order by product_type) filter(where provider_key='pcm' and product_type is not null) favorite_format from public.marketing_provider_jobs group by user_id
  ), credit as (
    select user_id,sum(grant_cents) grant_cents,sum(used_cents) used_cents,max(expires_at) expires_at from public.marketing_credit_accounts group by user_id
  ), base as (
    select m.*,coalesce(c.campaigns,0) campaigns,c.last_campaign_at,coalesce(ps.paid_payments,0) paid_payments,coalesce(ps.cash_spend_cents,0) cash_spend_cents,ps.last_paid_at,coalesce(js.orders,0) orders,coalesce(js.pieces,0) pieces,coalesce(js.vendor_cost_cents,0) vendor_cost_cents,js.last_order_at,js.favorite_format,coalesce(cr.grant_cents,0) credit_granted_cents,coalesce(cr.used_cents,0) credit_used_cents,greatest(coalesce(cr.grant_cents,0)-coalesce(cr.used_cents,0),0) credit_remaining_cents,cr.expires_at,case when greatest(coalesce(cr.grant_cents,0)-coalesce(cr.used_cents,0),0)>0 and cr.expires_at between now() and now()+interval '7 days' then 'credit_expiring' when coalesce(ps.cash_spend_cents,0)>=50000 then 'heavy_user' when coalesce(js.orders,0)>=2 then 'repeat_customer' when coalesce(js.orders,0)=1 then 'first_order' when coalesce(c.campaigns,0)>0 then 'started_not_ordered' else 'not_started' end segment from members m left join campaign_stats c on c.user_id=m.user_id left join pay_stats ps on ps.user_id=m.user_id left join job_stats js on js.user_id=m.user_id left join credit cr on cr.user_id=m.user_id
  ), filtered as (select * from base where seg='all' or segment=seg)
  select jsonb_build_object('total',(select count(*) from filtered),'segment',seg,'customers',coalesce((select jsonb_agg(to_jsonb(x) order by cash_spend_cents desc,campaigns desc,email) from (select * from filtered order by cash_spend_cents desc,campaigns desc,email limit lim offset off) x),'[]'::jsonb)) into out;
  return out;
end $function$;

create or replace function public.marketing_direct_mail_admin_orders(p_limit integer default 100,p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare uid uuid:=auth.uid(); lim int:=greatest(1,least(coalesce(p_limit,100),500)); off int:=greatest(0,coalesce(p_offset,0)); out jsonb;
begin
  if uid is null or not public.is_watchdog_developer() then raise exception 'Developer access required'; end if;
  select jsonb_build_object('total',(select count(*) from public.marketing_provider_jobs where provider_key='pcm'),'orders',coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)) into out
  from (select j.id,j.user_id,p.email,p.full_name,c.name campaign_name,j.campaign_id,j.status,j.mode,j.provider_job_id,coalesce(j.product_type,q.pricing_detail->>'product_type') product_type,coalesce(j.size_label,q.pricing_detail->>'size_label') size_label,coalesce(j.mail_class,q.pricing_detail->>'mail_class') mail_class,coalesce(j.recipient_count,nullif(j.request_summary->>'recipient_count','')::int,q.quantity,0) recipient_count,coalesce(j.retail_cents,q.retail_cents,0) retail_cents,coalesce(j.credit_cents,0) credit_cents,coalesce(j.vendor_cost_cents,q.vendor_cost_cents,0) vendor_cost_cents,coalesce(j.gross_margin_cents,coalesce(j.retail_cents,q.retail_cents,0)-coalesce(j.credit_cents,0)-coalesce(j.vendor_cost_cents,q.vendor_cost_cents,0)) gross_margin_cents,j.submitted_at,j.completed_at,j.created_at,j.response_summary from public.marketing_provider_jobs j left join public.profiles p on p.id=j.user_id left join public.marketing_campaigns c on c.id=j.campaign_id left join public.marketing_price_quotes q on q.id=j.quote_id where j.provider_key='pcm' order by j.created_at desc limit lim offset off) x;
  return coalesce(out,jsonb_build_object('total',0,'orders','[]'::jsonb));
end $function$;
