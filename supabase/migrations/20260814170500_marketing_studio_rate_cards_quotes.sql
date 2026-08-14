create table if not exists public.marketing_rate_cards (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  provider_key text,
  plan_key text not null,
  unit text not null default 'piece',
  unit_price_micros bigint not null check (unit_price_micros>=0),
  minimum_quantity integer not null default 1 check (minimum_quantity>0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(channel,provider_key,plan_key,unit)
);
alter table public.marketing_rate_cards enable row level security;
create policy marketing_rate_cards_read on public.marketing_rate_cards for select to authenticated using (public.can_use_data_workbench(auth.uid()));
revoke insert,update,delete on public.marketing_rate_cards from authenticated;
insert into public.marketing_rate_cards(channel,provider_key,plan_key,unit,unit_price_micros,minimum_quantity,metadata) values
('direct_mail','pcm','agent','piece',760000,25,'{"display_rate":"$0.760"}'::jsonb),
('direct_mail','pcm','pro','piece',735000,25,'{"display_rate":"$0.735"}'::jsonb),
('direct_mail','pcm','pro_plus','piece',720000,25,'{"display_rate":"$0.720"}'::jsonb),
('direct_mail','pcm','teams','piece',720000,25,'{"display_rate":"preferred / configurable"}'::jsonb),
('direct_mail','pcm','developer','piece',720000,1,'{"display_rate":"developer test"}'::jsonb)
on conflict(channel,provider_key,plan_key,unit) do update set unit_price_micros=excluded.unit_price_micros,minimum_quantity=excluded.minimum_quantity,metadata=excluded.metadata,updated_at=now();
create index if not exists marketing_rate_cards_lookup_idx on public.marketing_rate_cards(channel,provider_key,plan_key) where active;

create or replace function public.marketing_studio_quote(p_campaign_id uuid,p_channel text,p_quantity integer,p_provider_key text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); plan text; provider text; rate public.marketing_rate_cards%rowtype; quote_id uuid; total_cents bigint; expires timestamptz:=now()+interval '30 minutes';
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if p_quantity is null or p_quantity<=0 or p_quantity>100000 then raise exception 'Invalid campaign quantity'; end if;
  if not exists(select 1 from public.marketing_campaigns c where c.id=p_campaign_id and c.user_id=uid) then raise exception 'Campaign not found'; end if;
  plan:=public.watchdog_effective_plan(uid);
  provider:=coalesce(nullif(p_provider_key,''),case when p_channel='direct_mail' then 'pcm' else null end);
  select * into rate from public.marketing_rate_cards r where r.channel=p_channel and r.plan_key=plan and r.active and r.provider_key is not distinct from provider order by r.updated_at desc limit 1;
  if rate.id is null then raise exception 'Pricing is not configured for this channel and plan'; end if;
  if p_quantity<rate.minimum_quantity then raise exception 'Campaign quantity is below the minimum of %',rate.minimum_quantity; end if;
  total_cents:=round((p_quantity::numeric*rate.unit_price_micros::numeric)/10000.0);
  insert into public.marketing_price_quotes(user_id,campaign_id,provider_key,channel,plan_key,quantity,vendor_cost_cents,retail_cents,margin_cents,pricing_detail,expires_at)
  values(uid,p_campaign_id,provider,p_channel,plan,p_quantity,null,total_cents,null,jsonb_build_object('unit',rate.unit,'unit_price_micros',rate.unit_price_micros,'display_rate',rate.metadata->>'display_rate','provider_cost_known',false,'rate_card_id',rate.id),expires)
  returning id into quote_id;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload)
  values(uid,p_campaign_id,'quote.created','watchdog',jsonb_build_object('quote_id',quote_id,'channel',p_channel,'provider_key',provider,'quantity',p_quantity,'retail_cents',total_cents,'plan',plan));
  return jsonb_build_object('quote_id',quote_id,'campaign_id',p_campaign_id,'channel',p_channel,'provider_key',provider,'plan',plan,'quantity',p_quantity,'retail_cents',total_cents,'unit_price_micros',rate.unit_price_micros,'display_rate',rate.metadata->>'display_rate','minimum_quantity',rate.minimum_quantity,'expires_at',expires,'provider_cost_known',false);
end $$;
revoke all on function public.marketing_studio_quote(uuid,text,integer,text) from public,anon;
grant execute on function public.marketing_studio_quote(uuid,text,integer,text) to authenticated;
