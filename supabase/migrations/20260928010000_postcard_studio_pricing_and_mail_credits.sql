-- Postcard Studio: fixed per-plan retail pricing for the 6 x 8.5 First Class
-- postcard, plus a mail-credit ledger for addresses PostcardMania could not mail.
--
-- Pricing. PCM cost today is $1.077 per card (startup tier). Retail is a fixed
-- per-plan price so our margin grows as PCM volume tiers lower our cost, with a
-- floor of cost / 0.80 so a PCM price increase can never push margin under 20%.
--   Agent $1.79 · Pro $1.69 · Pro+ $1.59 · Teams/Developer $1.49
--
-- Credits. PCM validates addresses before printing and does not bill invalid or
-- undeliverable ones. When PCM reports them, the agent gets a credit equal to
-- what they paid for those cards. Credits come off the next postcard quote.

update public.marketing_provider_cost_catalog
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'retail_unit_cents_by_plan', jsonb_build_object('agent', 179, 'pro', 169, 'pro_plus', 159, 'teams', 149, 'developer', 149),
      'retail_minimum_gross_margin', 0.20,
      'retail_pricing_set_at', '2026-09-28'
    ),
    updated_at = now()
where provider_key = 'pcm' and product_type = 'postcard' and size_label = '6 x 8.5'
  and lower(mail_class) = 'firstclass' and active;

create table if not exists public.marketing_mail_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  provider_job_id uuid,
  source_reference text not null,
  reason text not null default 'undeliverable_address',
  quantity integer not null default 0 check (quantity >= 0),
  amount_cents bigint not null check (amount_cents > 0),
  applied_quote_id uuid references public.marketing_price_quotes(id) on delete set null,
  applied_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, source_reference)
);

create index if not exists marketing_mail_credits_user_open_idx
  on public.marketing_mail_credits (user_id) where redeemed_at is null;

alter table public.marketing_mail_credits enable row level security;

drop policy if exists marketing_mail_credits_owner_read on public.marketing_mail_credits;
create policy marketing_mail_credits_owner_read on public.marketing_mail_credits
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.marketing_mail_credits from anon;
revoke insert, update, delete on public.marketing_mail_credits from authenticated;

-- Service-only: record a credit once per PCM reference (batch + reason), so webhook
-- retries and reconcile runs never double-credit.
create or replace function public.marketing_mail_credit_issue(
  p_user_id uuid,
  p_campaign_id uuid,
  p_provider_job_id uuid,
  p_source_reference text,
  p_quantity integer,
  p_amount_cents bigint,
  p_reason text default 'undeliverable_address'
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  row_id uuid;
begin
  if p_user_id is null or coalesce(trim(p_source_reference), '') = '' then
    raise exception 'Credit owner and source reference are required';
  end if;
  if coalesce(p_amount_cents, 0) <= 0 then
    return jsonb_build_object('issued', false, 'reason', 'nothing_to_credit');
  end if;
  insert into public.marketing_mail_credits(user_id, campaign_id, provider_job_id, source_reference, reason, quantity, amount_cents)
  values (p_user_id, p_campaign_id, p_provider_job_id, left(trim(p_source_reference), 200), left(coalesce(p_reason, 'undeliverable_address'), 60), greatest(coalesce(p_quantity, 0), 0), p_amount_cents)
  on conflict (user_id, source_reference) do nothing
  returning id into row_id;
  if row_id is null then
    return jsonb_build_object('issued', false, 'reason', 'already_issued');
  end if;
  insert into public.marketing_events(user_id, campaign_id, event_type, source, payload)
  values (p_user_id, p_campaign_id, 'direct_mail.credit_issued', 'watchdog',
    jsonb_build_object('credit_id', row_id, 'quantity', p_quantity, 'amount_cents', p_amount_cents, 'reason', p_reason, 'source_reference', p_source_reference));
  return jsonb_build_object('issued', true, 'credit_id', row_id, 'amount_cents', p_amount_cents);
end
$$;

revoke all on function public.marketing_mail_credit_issue(uuid, uuid, uuid, text, integer, bigint, text) from public, anon, authenticated;
grant execute on function public.marketing_mail_credit_issue(uuid, uuid, uuid, text, integer, bigint, text) to service_role;

-- Service-only: mark the credits held by a paid quote as used.
create or replace function public.marketing_mail_credit_redeem(p_user_id uuid, p_quote_id uuid)
returns bigint
language sql
security definer
set search_path to 'public'
as $$
  with used as (
    update public.marketing_mail_credits
    set redeemed_at = now()
    where user_id = p_user_id and applied_quote_id = p_quote_id and redeemed_at is null
    returning amount_cents
  )
  select coalesce(sum(amount_cents), 0)::bigint from used;
$$;

revoke all on function public.marketing_mail_credit_redeem(uuid, uuid) from public, anon, authenticated;
grant execute on function public.marketing_mail_credit_redeem(uuid, uuid) to service_role;

create or replace function public.marketing_mail_credit_summary()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'available_cents', coalesce(sum(c.amount_cents) filter (where c.redeemed_at is null), 0),
    'redeemed_cents', coalesce(sum(c.amount_cents) filter (where c.redeemed_at is not null), 0),
    'credit_count', count(*)
  )
  from public.marketing_mail_credits c
  where c.user_id = auth.uid();
$$;

revoke all on function public.marketing_mail_credit_summary() from public, anon;
grant execute on function public.marketing_mail_credit_summary() to authenticated;

create or replace function public.marketing_direct_mail_product_quote(p_campaign_id uuid, p_product_type text, p_quantity integer, p_size_label text, p_mail_class text, p_provider_key text DEFAULT 'pcm'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  plan text;
  provider text := coalesce(nullif(trim(p_provider_key), ''), 'pcm');
  product text := lower(replace(trim(coalesce(p_product_type, 'postcard')), ' ', '_'));
  cost public.marketing_provider_cost_catalog%rowtype;
  tier public.marketing_creative_service_tiers%rowtype;
  creative_tier_key text;
  gross_margin numeric;
  multiplier numeric;
  vendor_total_cents bigint;
  retail_unit_cents bigint;
  plan_unit_cents bigint;
  floor_unit_cents bigint;
  print_retail_cents bigint;
  creative_fee_cents bigint;
  gross_retail_cents bigint;
  mail_credit_cents bigint := 0;
  retail_total_cents bigint;
  v_margin_cents bigint;
  quote_id uuid;
  expires timestamptz := now() + interval '30 minutes';
  eligible_count integer;
  plan_rank integer;
  required_rank integer;
  pricing_model text;
begin
  if uid is null or not public.can_use_data_workbench(uid) then
    raise exception 'Marketing Studio requires Agent or higher';
  end if;

  if provider = 'pcm' and not (
    product = 'postcard'
    and trim(p_size_label) = '6 x 8.5'
    and lower(trim(p_mail_class)) = 'firstclass'
  ) then
    raise exception 'Initial Watchdog Direct Mail launch supports only 6 x 8.5 First Class postcards';
  end if;

  if product not in ('postcard','letter','brochure','snap_apart','greeting_card') then
    raise exception 'Unsupported Direct Mail product type';
  end if;

  select coalesce(settings #>> '{direct_mail,creative_tier}','smart')
  into creative_tier_key
  from public.marketing_campaigns c
  where c.id=p_campaign_id and c.user_id=uid;
  if creative_tier_key is null then raise exception 'Campaign not found'; end if;

  plan := public.watchdog_effective_plan(uid);
  select * into tier from public.marketing_creative_service_tiers where tier_key=creative_tier_key and active limit 1;
  if tier.tier_key is null then raise exception 'Selected creative tier is unavailable'; end if;
  plan_rank := case plan when 'agent' then 1 when 'pro' then 2 when 'pro_plus' then 3 when 'teams' then 4 when 'developer' then 5 else 0 end;
  required_rank := case tier.minimum_plan when 'agent' then 1 when 'pro' then 2 when 'pro_plus' then 3 when 'teams' then 4 when 'developer' then 5 else 99 end;
  if plan_rank < required_rank then raise exception '% creative requires % or higher',tier.label,tier.minimum_plan; end if;

  select count(*) into eligible_count
  from public.marketing_direct_mail_recipients r
  left join public.marketing_direct_mail_recipient_exclusions e
    on e.user_id = r.user_id and e.campaign_id = r.campaign_id and e.property_key = r.property_key
  where r.campaign_id = p_campaign_id and r.user_id = uid and r.validation_status = 'valid' and not coalesce(e.excluded, false);

  if eligible_count < 50 or eligible_count > 100000 then
    raise exception 'Direct-mail eligible recipient count must be between 50 and 100000';
  end if;
  if p_quantity is not null and p_quantity <> eligible_count then
    raise exception 'Recipient count changed. Current eligible count is %', eligible_count;
  end if;

  select * into cost
  from public.marketing_provider_cost_catalog c
  where c.provider_key = provider and c.product_type = product and c.size_label = trim(p_size_label)
    and lower(c.mail_class) = lower(trim(p_mail_class)) and c.active
  order by c.effective_from desc, c.updated_at desc limit 1;
  if cost.id is null then raise exception 'Verified provider pricing is not configured for % / % / %', product, p_size_label, p_mail_class; end if;

  gross_margin := case plan when 'agent' then .40 when 'pro' then .35 when 'pro_plus' then .30 when 'teams' then .25 when 'developer' then .25 else .40 end;
  multiplier := 1 / (1 - gross_margin);
  plan_unit_cents := nullif(cost.metadata #>> array['retail_unit_cents_by_plan', plan], '')::bigint;
  -- Never below cost / (1 - minimum margin), whatever the configured plan price.
  floor_unit_cents := ceil((cost.base_cost_micros::numeric / (1 - coalesce((cost.metadata->>'retail_minimum_gross_margin')::numeric, .20))) / 10000.0);
  if plan_unit_cents is not null then
    retail_unit_cents := greatest(plan_unit_cents, floor_unit_cents);
    pricing_model := 'fixed_plan_retail_with_margin_floor';
  else
    retail_unit_cents := ceil((cost.base_cost_micros::numeric * multiplier) / 10000.0);
    pricing_model := 'provider_cost_plus_target_gross_margin_plus_creative_service';
  end if;
  vendor_total_cents := round((cost.base_cost_micros::numeric * eligible_count::numeric) / 10000.0);
  print_retail_cents := retail_unit_cents * eligible_count;
  creative_fee_cents := tier.fee_cents;
  gross_retail_cents := print_retail_cents + creative_fee_cents;

  insert into public.marketing_price_quotes(user_id,campaign_id,provider_key,channel,plan_key,quantity,vendor_cost_cents,retail_cents,margin_cents,pricing_detail,expires_at)
  values(uid,p_campaign_id,provider,'direct_mail',plan,eligible_count,vendor_total_cents,gross_retail_cents,gross_retail_cents - vendor_total_cents,'{}'::jsonb,expires)
  returning id into quote_id;

  -- Mail credits: free any held by quotes that expired unpaid, then hold what fits
  -- on this quote. At least $1.00 stays due so checkout always has a real charge.
  update public.marketing_mail_credits mc
  set applied_quote_id = null, applied_at = null
  where mc.user_id = uid and mc.redeemed_at is null and mc.applied_quote_id is not null
    and exists (select 1 from public.marketing_price_quotes q where q.id = mc.applied_quote_id and q.expires_at < now())
    and not exists (select 1 from public.marketing_payments p where p.quote_id = mc.applied_quote_id and p.status in ('paid','succeeded','completed'));

  with open_credits as (
    select id, amount_cents, sum(amount_cents) over (order by created_at, id) as running
    from public.marketing_mail_credits
    where user_id = uid and redeemed_at is null and applied_quote_id is null
  ), picked as (
    update public.marketing_mail_credits mc
    set applied_quote_id = quote_id, applied_at = now()
    from open_credits oc
    where mc.id = oc.id and oc.running <= greatest(gross_retail_cents - 100, 0)
    returning mc.amount_cents
  )
  select coalesce(sum(amount_cents), 0) into mail_credit_cents from picked;

  retail_total_cents := gross_retail_cents - mail_credit_cents;
  v_margin_cents := retail_total_cents - vendor_total_cents;

  update public.marketing_price_quotes
  set retail_cents = retail_total_cents,
      margin_cents = v_margin_cents,
      pricing_detail = jsonb_build_object(
      'pricing_model',pricing_model,
      'product_type',product,'size_label',cost.size_label,'mail_class',cost.mail_class,
      'provider_unit_cost_micros',cost.base_cost_micros,'retail_unit_cents',retail_unit_cents,
      'retail_floor_unit_cents',floor_unit_cents,
      'print_retail_cents',print_retail_cents,'creative_tier',tier.tier_key,'creative_tier_label',tier.label,
      'creative_fee_cents',creative_fee_cents,'creative_variant_count',tier.variant_count,
      'creative_intelligence_enabled',tier.intelligence_enabled,'creative_image_generation_eligible',tier.image_generation_eligible,
      'mail_credit_applied_cents',mail_credit_cents,'gross_retail_cents',gross_retail_cents,
      'target_gross_margin',gross_margin,'provider_cost_source',cost.source,'provider_cost_effective_from',cost.effective_from,
      'eligible_recipient_count',eligible_count,'minimum_order_quantity',50,'credit_minimum_quantity',1000,
      'printing_estimate_business_days','1-3','delivery_estimate_business_days','2-5','initial_launch_contract',true
    )
  where id = quote_id;

  update public.marketing_campaigns
  set settings=jsonb_set(jsonb_set(jsonb_set(coalesce(settings,'{}'::jsonb),'{direct_mail,product_type}',to_jsonb(product),true),'{direct_mail,size_label}',to_jsonb(cost.size_label),true),'{direct_mail,mail_class}',to_jsonb(cost.mail_class),true),updated_at=now()
  where id=p_campaign_id and user_id=uid;

  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload)
  values(uid,p_campaign_id,'quote.created','watchdog',jsonb_build_object('quote_id',quote_id,'channel','direct_mail','provider_key',provider,'product_type',product,'quantity',eligible_count,'retail_cents',retail_total_cents,'print_retail_cents',print_retail_cents,'creative_fee_cents',creative_fee_cents,'creative_tier',tier.tier_key,'mail_credit_applied_cents',mail_credit_cents,'vendor_cost_cents',vendor_total_cents,'margin_cents',v_margin_cents,'size_label',cost.size_label,'mail_class',cost.mail_class,'plan',plan,'minimum_order_quantity',50,'credit_minimum_quantity',1000,'initial_launch_contract',true));

  return jsonb_build_object('quote_id',quote_id,'campaign_id',p_campaign_id,'channel','direct_mail','provider_key',provider,'product_type',product,'plan',plan,'quantity',eligible_count,'size_label',cost.size_label,'mail_class',cost.mail_class,'vendor_cost_cents',vendor_total_cents,'provider_unit_cost_micros',cost.base_cost_micros,'retail_unit_cents',retail_unit_cents,'print_retail_cents',print_retail_cents,'creative_tier',tier.tier_key,'creative_tier_label',tier.label,'creative_fee_cents',creative_fee_cents,'creative_variant_count',tier.variant_count,'creative_intelligence_enabled',tier.intelligence_enabled,'creative_image_generation_eligible',tier.image_generation_eligible,'mail_credit_applied_cents',mail_credit_cents,'gross_retail_cents',gross_retail_cents,'retail_cents',retail_total_cents,'margin_cents',v_margin_cents,'target_gross_margin',gross_margin,'pricing_model',pricing_model,'minimum_order_quantity',50,'credit_minimum_quantity',1000,'printing_estimate_business_days','1-3','delivery_estimate_business_days','2-5','initial_launch_contract',true,'expires_at',expires);
end
$function$;
