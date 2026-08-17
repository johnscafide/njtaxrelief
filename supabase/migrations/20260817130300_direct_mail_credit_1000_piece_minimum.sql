create or replace function public.marketing_credit_quote_adjustment(p_quote_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path='public'
as $function$
declare
  uid uuid:=auth.uid();
  q public.marketing_price_quotes%rowtype;
  s jsonb;
  avail bigint;
  applied bigint:=0;
  min_qty integer:=1000;
  order_eligible boolean:=false;
begin
  if uid is null then raise exception 'Sign in required'; end if;
  select * into q from public.marketing_price_quotes where id=p_quote_id and user_id=uid;
  if q.id is null then raise exception 'Quote not found'; end if;
  s:=public.marketing_credit_summary();
  avail:=coalesce((s->>'available_cents')::bigint,0);
  order_eligible:=coalesce(q.quantity,0)>=min_qty;
  if order_eligible then
    applied:=least(avail,greatest(coalesce(q.retail_cents,0),0));
  end if;
  return s||jsonb_build_object(
    'quote_id',q.id,
    'retail_cents',q.retail_cents,
    'credit_applied_cents',applied,
    'amount_due_cents',greatest(coalesce(q.retail_cents,0)-applied,0),
    'credit_order_eligible',order_eligible,
    'credit_minimum_quantity',min_qty,
    'credit_quantity',coalesce(q.quantity,0),
    'credit_reason',case when order_eligible then null else 'Annual-plan Direct Mail credit requires an order of at least 1,000 postcards.' end,
    'credit_classification','subscriber_acquisition_retention'
  );
end
$function$;

create or replace function public.marketing_credit_reserve(p_user_id uuid, p_campaign_id uuid, p_quote_id uuid, p_requested_cents bigint)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  a public.marketing_credit_accounts%rowtype;
  r public.marketing_credit_reservations%rowtype;
  q public.marketing_price_quotes%rowtype;
  held bigint:=0;
  avail bigint:=0;
  amount bigint:=0;
  min_qty integer:=1000;
begin
  if p_user_id is null or p_campaign_id is null or p_quote_id is null then raise exception 'Credit reservation identifiers are required'; end if;
  select * into q from public.marketing_price_quotes where id=p_quote_id and user_id=p_user_id and campaign_id=p_campaign_id;
  if q.id is null then raise exception 'Quote not found'; end if;
  if coalesce(q.quantity,0)<min_qty then
    return jsonb_build_object('reservation_id',null,'credit_cents',0,'expires_at',null,'reused',false,'credit_order_eligible',false,'credit_minimum_quantity',min_qty,'credit_quantity',coalesce(q.quantity,0),'reason','minimum_quantity');
  end if;
  select * into r from public.marketing_credit_reservations where user_id=p_user_id and quote_id=p_quote_id for update;
  if r.id is not null and r.status='pending' and r.expires_at>now() then
    return jsonb_build_object('reservation_id',r.id,'credit_cents',r.amount_cents,'expires_at',r.expires_at,'reused',true,'credit_order_eligible',true,'credit_minimum_quantity',min_qty,'credit_quantity',q.quantity);
  end if;
  select * into a from public.marketing_credit_accounts where user_id=p_user_id for update;
  if a.user_id is null or now()>=a.expires_at then return jsonb_build_object('reservation_id',null,'credit_cents',0,'expires_at',null,'reused',false,'credit_order_eligible',true,'credit_minimum_quantity',min_qty,'credit_quantity',q.quantity); end if;
  update public.marketing_credit_reservations set status='released',updated_at=now() where user_id=p_user_id and status='pending' and expires_at<=now();
  select coalesce(sum(amount_cents),0) into held from public.marketing_credit_reservations where user_id=p_user_id and status='pending' and expires_at>now() and quote_id<>p_quote_id;
  avail:=greatest(a.grant_cents-a.used_cents-held,0);
  amount:=least(greatest(coalesce(p_requested_cents,0),0),avail);
  if amount<=0 then return jsonb_build_object('reservation_id',null,'credit_cents',0,'expires_at',a.expires_at,'reused',false,'credit_order_eligible',true,'credit_minimum_quantity',min_qty,'credit_quantity',q.quantity); end if;
  insert into public.marketing_credit_reservations(user_id,campaign_id,quote_id,amount_cents,status,expires_at)
  values(p_user_id,p_campaign_id,p_quote_id,amount,'pending',least(a.expires_at,now()+interval '45 minutes'))
  on conflict(user_id,quote_id) do update set campaign_id=excluded.campaign_id,amount_cents=excluded.amount_cents,status='pending',expires_at=excluded.expires_at,processor_session_id=null,updated_at=now()
  returning * into r;
  return jsonb_build_object('reservation_id',r.id,'credit_cents',r.amount_cents,'expires_at',r.expires_at,'reused',false,'credit_order_eligible',true,'credit_minimum_quantity',min_qty,'credit_quantity',q.quantity);
end
$function$;

create or replace function public.marketing_credit_finalize(p_reservation_id uuid, p_action text, p_detail jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  r public.marketing_credit_reservations%rowtype;
  a public.marketing_credit_accounts%rowtype;
  action text:=lower(trim(coalesce(p_action,'')));
  bal bigint;
begin
  select * into r from public.marketing_credit_reservations where id=p_reservation_id for update;
  if r.id is null then return jsonb_build_object('changed',false,'reason','not_found'); end if;
  if r.status<>'pending' then return jsonb_build_object('changed',false,'status',r.status); end if;
  if action='redeem' then
    select * into a from public.marketing_credit_accounts where user_id=r.user_id for update;
    if a.user_id is null then raise exception 'Credit account not found'; end if;
    update public.marketing_credit_accounts set used_cents=least(grant_cents,used_cents+r.amount_cents),updated_at=now() where user_id=r.user_id returning grant_cents-used_cents into bal;
    update public.marketing_credit_reservations set status='redeemed',updated_at=now() where id=r.id;
    insert into public.marketing_credit_ledger(user_id,campaign_id,quote_id,entry_type,amount_cents,balance_after_cents,detail)
    values(r.user_id,r.campaign_id,r.quote_id,'redeem',-r.amount_cents,greatest(bal,0),coalesce(p_detail,'{}'::jsonb)||jsonb_build_object('reservation_id',r.id,'promo_class','subscriber_acquisition_retention','minimum_order_quantity',1000));
    return jsonb_build_object('changed',true,'status','redeemed','credit_cents',r.amount_cents,'balance_cents',greatest(bal,0),'promo_class','subscriber_acquisition_retention');
  elsif action='release' then
    update public.marketing_credit_reservations set status='released',updated_at=now() where id=r.id;
    return jsonb_build_object('changed',true,'status','released','credit_cents',r.amount_cents);
  else raise exception 'Unsupported credit finalization action'; end if;
end
$function$;

create or replace function public.marketing_direct_mail_product_quote(p_campaign_id uuid, p_product_type text, p_quantity integer, p_size_label text, p_mail_class text, p_provider_key text default 'pcm'::text)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  uid uuid:=auth.uid();
  plan text;
  provider text:=coalesce(nullif(trim(p_provider_key),''),'pcm');
  product text:=lower(replace(trim(coalesce(p_product_type,'postcard')),' ','_'));
  cost public.marketing_provider_cost_catalog%rowtype;
  gross_margin numeric;
  multiplier numeric;
  vendor_total_cents bigint;
  retail_unit_cents bigint;
  retail_total_cents bigint;
  margin_cents bigint;
  quote_id uuid;
  expires timestamptz:=now()+interval '30 minutes';
  eligible_count integer;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if product not in ('postcard','letter','brochure','snap_apart','greeting_card') then raise exception 'Unsupported Direct Mail product type'; end if;
  if not exists(select 1 from public.marketing_campaigns c where c.id=p_campaign_id and c.user_id=uid) then raise exception 'Campaign not found'; end if;
  select count(*) into eligible_count
  from public.marketing_direct_mail_recipients r
  left join public.marketing_direct_mail_recipient_exclusions e on e.user_id=r.user_id and e.campaign_id=r.campaign_id and e.property_key=r.property_key
  where r.campaign_id=p_campaign_id and r.user_id=uid and r.validation_status='valid' and not coalesce(e.excluded,false);
  if eligible_count<50 or eligible_count>100000 then raise exception 'Direct-mail eligible recipient count must be between 50 and 100000'; end if;
  if p_quantity is not null and p_quantity<>eligible_count then raise exception 'Recipient count changed. Current eligible count is %',eligible_count; end if;
  plan:=public.watchdog_effective_plan(uid);
  select * into cost from public.marketing_provider_cost_catalog c
   where c.provider_key=provider and c.product_type=product and c.size_label=trim(p_size_label)
     and lower(c.mail_class)=lower(trim(p_mail_class)) and c.active
   order by c.effective_from desc,c.updated_at desc limit 1;
  if cost.id is null then raise exception 'Verified provider pricing is not configured for % / % / %',product,p_size_label,p_mail_class; end if;
  gross_margin:=case plan when 'agent' then .40 when 'pro' then .35 when 'pro_plus' then .30 when 'teams' then .25 when 'developer' then .25 else .40 end;
  multiplier:=1/(1-gross_margin);
  retail_unit_cents:=ceil((cost.base_cost_micros::numeric*multiplier)/10000.0);
  vendor_total_cents:=round((cost.base_cost_micros::numeric*eligible_count::numeric)/10000.0);
  retail_total_cents:=retail_unit_cents*eligible_count;
  margin_cents:=retail_total_cents-vendor_total_cents;
  insert into public.marketing_price_quotes(user_id,campaign_id,provider_key,channel,plan_key,quantity,vendor_cost_cents,retail_cents,margin_cents,pricing_detail,expires_at)
  values(uid,p_campaign_id,provider,'direct_mail',plan,eligible_count,vendor_total_cents,retail_total_cents,margin_cents,
    jsonb_build_object('pricing_model','provider_cost_plus_target_gross_margin','product_type',product,'size_label',cost.size_label,'mail_class',cost.mail_class,'provider_unit_cost_micros',cost.base_cost_micros,'retail_unit_cents',retail_unit_cents,'target_gross_margin',gross_margin,'provider_cost_source',cost.source,'provider_cost_effective_from',cost.effective_from,'eligible_recipient_count',eligible_count,'minimum_order_quantity',50,'credit_minimum_quantity',1000),expires)
  returning id into quote_id;
  update public.marketing_campaigns
  set settings=jsonb_set(jsonb_set(jsonb_set(coalesce(settings,'{}'::jsonb),'{direct_mail,product_type}',to_jsonb(product),true),'{direct_mail,size_label}',to_jsonb(cost.size_label),true),'{direct_mail,mail_class}',to_jsonb(cost.mail_class),true),updated_at=now()
  where id=p_campaign_id and user_id=uid;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload)
  values(uid,p_campaign_id,'quote.created','watchdog',jsonb_build_object('quote_id',quote_id,'channel','direct_mail','provider_key',provider,'product_type',product,'quantity',eligible_count,'retail_cents',retail_total_cents,'vendor_cost_cents',vendor_total_cents,'margin_cents',margin_cents,'size_label',cost.size_label,'mail_class',cost.mail_class,'plan',plan,'minimum_order_quantity',50,'credit_minimum_quantity',1000));
  return jsonb_build_object('quote_id',quote_id,'campaign_id',p_campaign_id,'channel','direct_mail','provider_key',provider,'product_type',product,'plan',plan,'quantity',eligible_count,'size_label',cost.size_label,'mail_class',cost.mail_class,'vendor_cost_cents',vendor_total_cents,'provider_unit_cost_micros',cost.base_cost_micros,'retail_unit_cents',retail_unit_cents,'retail_cents',retail_total_cents,'margin_cents',margin_cents,'target_gross_margin',gross_margin,'minimum_order_quantity',50,'credit_minimum_quantity',1000,'expires_at',expires);
end
$function$;
