-- Watchdog Marketing Studio + Watchdog Intelligence creative foundation.
-- Campaign-level intelligence only: no protected-class targeting, private-life inference,
-- seller-intent prediction, or recipient-specific AI claims.

create table if not exists public.marketing_creative_service_tiers (
  tier_key text primary key,
  label text not null,
  description text not null default '',
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  minimum_plan text not null default 'agent',
  variant_count integer not null default 1 check (variant_count between 1 and 10),
  intelligence_enabled boolean not null default false,
  custom_visual_concept boolean not null default false,
  image_generation_eligible boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.marketing_creative_service_tiers enable row level security;
revoke all on public.marketing_creative_service_tiers from anon;
grant select on public.marketing_creative_service_tiers to authenticated;
grant all on public.marketing_creative_service_tiers to service_role;
drop policy if exists "marketing users read creative tiers" on public.marketing_creative_service_tiers;
create policy "marketing users read creative tiers" on public.marketing_creative_service_tiers
for select to authenticated using (public.can_use_data_workbench(auth.uid()));

insert into public.marketing_creative_service_tiers(
  tier_key,label,description,fee_cents,minimum_plan,variant_count,
  intelligence_enabled,custom_visual_concept,image_generation_eligible,active,sort_order,metadata
) values
('smart','Smart','Clean PCM-ready campaign creative using Watchdog templates, brand settings and campaign goal.',0,'agent',1,false,false,false,true,10,
 '{"positioning":"good","workflow":"template_assisted","revision_rounds":1,"recommended_badge":"Fastest"}'::jsonb),
('signature','Signature','Watchdog Intelligence builds the campaign angle and three brand-aware creative directions from governed farm-level evidence.',2900,'pro',3,true,true,false,true,20,
 '{"positioning":"great","workflow":"intelligence_directed","revision_rounds":2,"recommended_badge":"Recommended"}'::jsonb),
('studio','Studio','Premium Watchdog Intelligence creative direction with five concepts, stronger visual hierarchy and custom-image eligibility.',7900,'pro',5,true,true,true,true,30,
 '{"positioning":"stunning","workflow":"intelligence_studio","revision_rounds":3,"recommended_badge":"Highest impact","image_generation_release_state":"feature_gated"}'::jsonb)
on conflict (tier_key) do update set
  label=excluded.label,description=excluded.description,fee_cents=excluded.fee_cents,
  minimum_plan=excluded.minimum_plan,variant_count=excluded.variant_count,
  intelligence_enabled=excluded.intelligence_enabled,custom_visual_concept=excluded.custom_visual_concept,
  image_generation_eligible=excluded.image_generation_eligible,active=excluded.active,
  sort_order=excluded.sort_order,metadata=excluded.metadata,updated_at=now();

create table if not exists public.marketing_intelligence_creative_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  audience_snapshot_id uuid null references public.marketing_audience_snapshots(id) on delete set null,
  creative_tier text not null references public.marketing_creative_service_tiers(tier_key),
  status text not null default 'draft' check (status in ('draft','complete','provider_unavailable','failed','superseded')),
  profession text null,
  goal text null,
  audience_count integer not null default 0,
  intelligence_enabled boolean not null default false,
  source_finding_ids uuid[] not null default '{}'::uuid[],
  source_run_ids uuid[] not null default '{}'::uuid[],
  input_manifest jsonb not null default '{}'::jsonb,
  brief jsonb not null default '{}'::jsonb,
  variants jsonb not null default '[]'::jsonb,
  facts_hash text null,
  provider text null,
  model text null,
  prompt_version text null,
  input_tokens integer null,
  output_tokens integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_intelligence_creative_briefs_campaign_idx
  on public.marketing_intelligence_creative_briefs(user_id,campaign_id,created_at desc);
alter table public.marketing_intelligence_creative_briefs enable row level security;
revoke all on public.marketing_intelligence_creative_briefs from anon;
revoke insert,update,delete on public.marketing_intelligence_creative_briefs from authenticated;
grant select on public.marketing_intelligence_creative_briefs to authenticated;
grant all on public.marketing_intelligence_creative_briefs to service_role;
drop policy if exists "users read own intelligence creative briefs" on public.marketing_intelligence_creative_briefs;
create policy "users read own intelligence creative briefs" on public.marketing_intelligence_creative_briefs
for select to authenticated using (user_id = auth.uid());

create or replace function public.marketing_set_direct_mail_creative_tier(p_campaign_id uuid,p_tier_key text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid(); plan text; tier public.marketing_creative_service_tiers%rowtype;
  plan_rank integer; required_rank integer;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio access required'; end if;
  if not exists(select 1 from public.marketing_campaigns where id=p_campaign_id and user_id=uid) then raise exception 'Campaign not found'; end if;
  select * into tier from public.marketing_creative_service_tiers where tier_key=lower(trim(p_tier_key)) and active limit 1;
  if tier.tier_key is null then raise exception 'Creative tier not available'; end if;
  plan := public.watchdog_effective_plan(uid);
  plan_rank := case plan when 'agent' then 1 when 'pro' then 2 when 'pro_plus' then 3 when 'teams' then 4 when 'developer' then 5 else 0 end;
  required_rank := case tier.minimum_plan when 'agent' then 1 when 'pro' then 2 when 'pro_plus' then 3 when 'teams' then 4 when 'developer' then 5 else 99 end;
  if plan_rank < required_rank then raise exception '% creative requires % or higher', tier.label, tier.minimum_plan; end if;
  update public.marketing_campaigns
    set settings=jsonb_set(coalesce(settings,'{}'::jsonb),'{direct_mail,creative_tier}',to_jsonb(tier.tier_key),true),updated_at=now()
    where id=p_campaign_id and user_id=uid;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload)
    values(uid,p_campaign_id,'creative.tier_selected','watchdog',jsonb_build_object('tier_key',tier.tier_key,'label',tier.label,'fee_cents',tier.fee_cents,'intelligence_enabled',tier.intelligence_enabled));
  return jsonb_build_object('campaign_id',p_campaign_id,'tier_key',tier.tier_key,'label',tier.label,'fee_cents',tier.fee_cents,'variant_count',tier.variant_count,'intelligence_enabled',tier.intelligence_enabled,'image_generation_eligible',tier.image_generation_eligible);
end $$;
revoke execute on function public.marketing_set_direct_mail_creative_tier(uuid,text) from public,anon;
grant execute on function public.marketing_set_direct_mail_creative_tier(uuid,text) to authenticated,service_role;

-- Creative service fees are added to Watchdog retail, never to PCM vendor cost.
-- The current initial-launch provider guard remains 6 x 8.5 First Class only.
create or replace function public.marketing_direct_mail_product_quote(
  p_campaign_id uuid,p_product_type text,p_quantity integer,p_size_label text,p_mail_class text,p_provider_key text default 'pcm'::text
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  uid uuid := auth.uid(); plan text; provider text := coalesce(nullif(trim(p_provider_key), ''), 'pcm');
  product text := lower(replace(trim(coalesce(p_product_type, 'postcard')), ' ', '_'));
  cost public.marketing_provider_cost_catalog%rowtype; tier public.marketing_creative_service_tiers%rowtype;
  creative_tier_key text; gross_margin numeric; multiplier numeric; vendor_total_cents bigint;
  retail_unit_cents bigint; print_retail_cents bigint; creative_fee_cents bigint;
  retail_total_cents bigint; margin_cents bigint; quote_id uuid; expires timestamptz := now()+interval '30 minutes';
  eligible_count integer; plan_rank integer; required_rank integer;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if provider='pcm' and not (product='postcard' and trim(p_size_label)='6 x 8.5' and lower(trim(p_mail_class))='firstclass') then
    raise exception 'Initial Watchdog Direct Mail launch supports only 6 x 8.5 First Class postcards';
  end if;
  if product not in ('postcard','letter','brochure','snap_apart','greeting_card') then raise exception 'Unsupported Direct Mail product type'; end if;
  select coalesce(settings #>> '{direct_mail,creative_tier}','smart') into creative_tier_key
    from public.marketing_campaigns where id=p_campaign_id and user_id=uid;
  if creative_tier_key is null then raise exception 'Campaign not found'; end if;
  plan := public.watchdog_effective_plan(uid);
  select * into tier from public.marketing_creative_service_tiers where tier_key=creative_tier_key and active limit 1;
  if tier.tier_key is null then raise exception 'Selected creative tier is unavailable'; end if;
  plan_rank := case plan when 'agent' then 1 when 'pro' then 2 when 'pro_plus' then 3 when 'teams' then 4 when 'developer' then 5 else 0 end;
  required_rank := case tier.minimum_plan when 'agent' then 1 when 'pro' then 2 when 'pro_plus' then 3 when 'teams' then 4 when 'developer' then 5 else 99 end;
  if plan_rank < required_rank then raise exception '% creative requires % or higher',tier.label,tier.minimum_plan; end if;
  select count(*) into eligible_count from public.marketing_direct_mail_recipients r
    left join public.marketing_direct_mail_recipient_exclusions e on e.user_id=r.user_id and e.campaign_id=r.campaign_id and e.property_key=r.property_key
    where r.campaign_id=p_campaign_id and r.user_id=uid and r.validation_status='valid' and not coalesce(e.excluded,false);
  if eligible_count<50 or eligible_count>100000 then raise exception 'Direct-mail eligible recipient count must be between 50 and 100000'; end if;
  if p_quantity is not null and p_quantity<>eligible_count then raise exception 'Recipient count changed. Current eligible count is %',eligible_count; end if;
  select * into cost from public.marketing_provider_cost_catalog c where c.provider_key=provider and c.product_type=product
    and c.size_label=trim(p_size_label) and lower(c.mail_class)=lower(trim(p_mail_class)) and c.active
    order by c.effective_from desc,c.updated_at desc limit 1;
  if cost.id is null then raise exception 'Verified provider pricing is not configured for % / % / %',product,p_size_label,p_mail_class; end if;
  gross_margin := case plan when 'agent' then .40 when 'pro' then .35 when 'pro_plus' then .30 when 'teams' then .25 when 'developer' then .25 else .40 end;
  multiplier:=1/(1-gross_margin);
  retail_unit_cents:=ceil((cost.base_cost_micros::numeric*multiplier)/10000.0);
  vendor_total_cents:=round((cost.base_cost_micros::numeric*eligible_count::numeric)/10000.0);
  print_retail_cents:=retail_unit_cents*eligible_count;
  creative_fee_cents:=tier.fee_cents;
  retail_total_cents:=print_retail_cents+creative_fee_cents;
  margin_cents:=retail_total_cents-vendor_total_cents;
  insert into public.marketing_price_quotes(user_id,campaign_id,provider_key,channel,plan_key,quantity,vendor_cost_cents,retail_cents,margin_cents,pricing_detail,expires_at)
  values(uid,p_campaign_id,provider,'direct_mail',plan,eligible_count,vendor_total_cents,retail_total_cents,margin_cents,
    jsonb_build_object('pricing_model','provider_cost_plus_target_gross_margin_plus_creative_service','product_type',product,
      'size_label',cost.size_label,'mail_class',cost.mail_class,'provider_unit_cost_micros',cost.base_cost_micros,
      'retail_unit_cents',retail_unit_cents,'print_retail_cents',print_retail_cents,'creative_tier',tier.tier_key,
      'creative_tier_label',tier.label,'creative_fee_cents',creative_fee_cents,'creative_variant_count',tier.variant_count,
      'creative_intelligence_enabled',tier.intelligence_enabled,'creative_image_generation_eligible',tier.image_generation_eligible,
      'target_gross_margin',gross_margin,'provider_cost_source',cost.source,'provider_cost_effective_from',cost.effective_from,
      'eligible_recipient_count',eligible_count,'minimum_order_quantity',50,'credit_minimum_quantity',1000,
      'printing_estimate_business_days','1-3','delivery_estimate_business_days','2-5','initial_launch_contract',true),expires)
  returning id into quote_id;
  update public.marketing_campaigns set settings=jsonb_set(jsonb_set(jsonb_set(coalesce(settings,'{}'::jsonb),'{direct_mail,product_type}',to_jsonb(product),true),'{direct_mail,size_label}',to_jsonb(cost.size_label),true),'{direct_mail,mail_class}',to_jsonb(cost.mail_class),true),updated_at=now()
    where id=p_campaign_id and user_id=uid;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload)
    values(uid,p_campaign_id,'quote.created','watchdog',jsonb_build_object('quote_id',quote_id,'channel','direct_mail','provider_key',provider,'product_type',product,'quantity',eligible_count,'retail_cents',retail_total_cents,'print_retail_cents',print_retail_cents,'creative_fee_cents',creative_fee_cents,'creative_tier',tier.tier_key,'vendor_cost_cents',vendor_total_cents,'margin_cents',margin_cents,'size_label',cost.size_label,'mail_class',cost.mail_class,'plan',plan,'minimum_order_quantity',50,'credit_minimum_quantity',1000,'initial_launch_contract',true));
  return jsonb_build_object('quote_id',quote_id,'campaign_id',p_campaign_id,'channel','direct_mail','provider_key',provider,'product_type',product,'plan',plan,'quantity',eligible_count,'size_label',cost.size_label,'mail_class',cost.mail_class,'vendor_cost_cents',vendor_total_cents,'provider_unit_cost_micros',cost.base_cost_micros,'retail_unit_cents',retail_unit_cents,'print_retail_cents',print_retail_cents,'creative_tier',tier.tier_key,'creative_tier_label',tier.label,'creative_fee_cents',creative_fee_cents,'creative_variant_count',tier.variant_count,'creative_intelligence_enabled',tier.intelligence_enabled,'creative_image_generation_eligible',tier.image_generation_eligible,'retail_cents',retail_total_cents,'margin_cents',margin_cents,'target_gross_margin',gross_margin,'minimum_order_quantity',50,'credit_minimum_quantity',1000,'printing_estimate_business_days','1-3','delivery_estimate_business_days','2-5','initial_launch_contract',true,'expires_at',expires);
end $function$;
revoke execute on function public.marketing_direct_mail_product_quote(uuid,text,integer,text,text,text) from public,anon;
grant execute on function public.marketing_direct_mail_product_quote(uuid,text,integer,text,text,text) to authenticated,service_role;
