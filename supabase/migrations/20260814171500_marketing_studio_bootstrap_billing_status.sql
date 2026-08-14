create or replace function public.marketing_studio_bootstrap() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare uid uuid:=auth.uid(); p text;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  p:=public.watchdog_effective_plan(uid);
  return jsonb_build_object(
    'plan',p,
    'providers',(select coalesce(jsonb_agg(jsonb_build_object('key',provider_key,'name',display_name,'type',provider_type,'mode',default_mode,'capabilities',capabilities) order by display_name),'[]'::jsonb) from public.marketing_providers where active),
    'campaigns',(select coalesce(jsonb_agg(to_jsonb(c) order by c.updated_at desc),'[]'::jsonb) from (
      select mc.id,mc.name,mc.goal,mc.status,mc.budget_cents,mc.spend_cap_cents,mc.updated_at,
        coalesce(ms.property_count,0) as audience_count,
        (select mp.status from public.marketing_payments mp where mp.campaign_id=mc.id and mp.user_id=uid order by mp.created_at desc limit 1) as payment_status,
        (select mq.id from public.marketing_price_quotes mq where mq.campaign_id=mc.id and mq.user_id=uid and mq.expires_at>now() order by mq.created_at desc limit 1) as active_quote_id
      from public.marketing_campaigns mc
      left join public.marketing_audience_snapshots ms on ms.id=mc.audience_snapshot_id
      where mc.user_id=uid order by mc.updated_at desc limit 25
    )c)
  );
end $$;
revoke all on function public.marketing_studio_bootstrap() from public,anon;
grant execute on function public.marketing_studio_bootstrap() to authenticated;
