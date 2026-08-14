-- Creative Studio owner bootstrap, including safe tracking-path access.
create or replace function public.marketing_creative_studio_bootstrap(p_campaign_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare uid uuid:=auth.uid();
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if not exists(select 1 from public.marketing_campaigns where id=p_campaign_id and user_id=uid) then raise exception 'Campaign not found'; end if;
  return jsonb_build_object(
    'campaign',(select to_jsonb(x) from (
      select c.id,c.name,c.goal,c.profession,c.status,c.budget_cents,c.spend_cap_cents,c.settings,c.updated_at,
        coalesce(s.property_count,0) audience_count,s.qualification_summary
      from public.marketing_campaigns c
      left join public.marketing_audience_snapshots s on s.id=c.audience_snapshot_id
      where c.id=p_campaign_id and c.user_id=uid
    )x),
    'brand',(select to_jsonb(b) from (
      select id,name,is_default,profile from public.marketing_brand_profiles
      where user_id=uid order by is_default desc,updated_at desc limit 1
    )b),
    'templates',(select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order),'[]'::jsonb) from (
      select template_key,title,description,creative_type,professions,goals,layout_key,content,sort_order
      from public.marketing_creative_templates where active
    )t),
    'creatives',(select coalesce(jsonb_agg(to_jsonb(cr) order by cr.version desc),'[]'::jsonb) from (
      select m.id,m.template_key,m.creative_type,m.version,m.content,m.status,m.provider_design_id,m.tracking_link_id,
        m.approved_at,m.updated_at,
        case when l.token is not null then '/functions/v1/marketing-track?token='||l.token else null end tracking_path
      from public.marketing_creatives m
      left join public.marketing_tracking_links l on l.id=m.tracking_link_id and l.user_id=uid
      where m.campaign_id=p_campaign_id and m.user_id=uid and m.channel='direct_mail'
    )cr),
    'latest_tracking',(select jsonb_build_object('id',l.id,'path','/functions/v1/marketing-track?token='||l.token,'link_type',l.link_type,'destination_path',l.destination_path)
      from public.marketing_tracking_links l where l.campaign_id=p_campaign_id and l.user_id=uid and l.active order by l.created_at desc limit 1),
    'recipients',(select jsonb_build_object('total',count(*),'valid',count(*) filter(where validation_status='valid'),'invalid',count(*) filter(where validation_status='invalid'),'prepared_at',max(snapshot_at))
      from public.marketing_direct_mail_recipients where campaign_id=p_campaign_id and user_id=uid),
    'billing',(select jsonb_build_object('quote_id',q.id,'quantity',q.quantity,'retail_cents',q.retail_cents,'expires_at',q.expires_at,'payment_id',p.id,'payment_status',p.status,'refunded_cents',coalesce(p.refunded_cents,0))
      from public.marketing_price_quotes q left join public.marketing_payments p on p.quote_id=q.id and p.user_id=uid
      where q.campaign_id=p_campaign_id and q.user_id=uid and q.channel='direct_mail' order by q.created_at desc limit 1),
    'launch_approval',(select to_jsonb(a) from (
      select id,creative_id,quote_id,payment_id,recipient_count,status,approved_at,consumed_at
      from public.marketing_launch_approvals where campaign_id=p_campaign_id and user_id=uid and channel='direct_mail' and provider_key='pcm'
      order by approved_at desc limit 1
    )a),
    'provider_job',(select to_jsonb(j) from (
      select id,provider_job_id,status,mode,vendor_cost_cents,submitted_at,completed_at,response_summary
      from public.marketing_provider_jobs where campaign_id=p_campaign_id and user_id=uid and provider_key='pcm'
      order by created_at desc limit 1
    )j),
    'metrics',public.marketing_campaign_metrics(p_campaign_id)
  );
end $$;
revoke all on function public.marketing_creative_studio_bootstrap(uuid) from public,anon;
grant execute on function public.marketing_creative_studio_bootstrap(uuid) to authenticated;
