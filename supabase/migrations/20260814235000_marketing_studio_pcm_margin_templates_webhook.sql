create table if not exists public.marketing_provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null,
  event_key text not null,
  event_type text,
  signature_verified boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  raw_body_sha256 text not null,
  status text not null default 'received',
  provider_job_id uuid references public.marketing_provider_jobs(id) on delete set null,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique(provider_key,event_key)
);

alter table public.marketing_provider_webhook_events enable row level security;
revoke all on public.marketing_provider_webhook_events from anon, authenticated;

create index if not exists marketing_provider_webhook_events_provider_received_idx on public.marketing_provider_webhook_events(provider_key, received_at desc);
create index if not exists marketing_provider_webhook_events_status_idx on public.marketing_provider_webhook_events(status, received_at);

create or replace function public.marketing_direct_mail_quote(
  p_campaign_id uuid,
  p_quantity integer,
  p_size_label text,
  p_mail_class text,
  p_provider_key text default 'pcm'
) returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  uid uuid:=auth.uid();
  plan text;
  provider text:=coalesce(nullif(trim(p_provider_key),''),'pcm');
  cost public.marketing_provider_cost_catalog%rowtype;
  gross_margin numeric;
  multiplier numeric;
  vendor_total_cents bigint;
  retail_unit_cents bigint;
  retail_total_cents bigint;
  margin_cents bigint;
  quote_id uuid;
  expires timestamptz:=now()+interval '30 minutes';
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if p_quantity is null or p_quantity<25 or p_quantity>100000 then raise exception 'Direct-mail quantity must be between 25 and 100000'; end if;
  if not exists(select 1 from public.marketing_campaigns c where c.id=p_campaign_id and c.user_id=uid) then raise exception 'Campaign not found'; end if;
  plan:=public.watchdog_effective_plan(uid);
  select * into cost from public.marketing_provider_cost_catalog c
    where c.provider_key=provider and c.product_type='postcard' and c.size_label=trim(p_size_label)
      and lower(c.mail_class)=lower(trim(p_mail_class)) and c.active
    order by c.effective_from desc, c.updated_at desc limit 1;
  if cost.id is null then raise exception 'PCM pricing is not configured for % / %',p_size_label,p_mail_class; end if;
  gross_margin:=case plan when 'agent' then .40 when 'pro' then .35 when 'pro_plus' then .30 when 'teams' then .25 when 'developer' then .25 else .40 end;
  multiplier:=1/(1-gross_margin);
  retail_unit_cents:=ceil((cost.base_cost_micros::numeric*multiplier)/10000.0);
  vendor_total_cents:=round((cost.base_cost_micros::numeric*p_quantity::numeric)/10000.0);
  retail_total_cents:=retail_unit_cents*p_quantity;
  margin_cents:=retail_total_cents-vendor_total_cents;
  insert into public.marketing_price_quotes(user_id,campaign_id,provider_key,channel,plan_key,quantity,vendor_cost_cents,retail_cents,margin_cents,pricing_detail,expires_at)
  values(uid,p_campaign_id,provider,'direct_mail',plan,p_quantity,vendor_total_cents,retail_total_cents,margin_cents,
    jsonb_build_object('pricing_model','provider_cost_plus_target_gross_margin','product_type','postcard','size_label',cost.size_label,'mail_class',cost.mail_class,'provider_unit_cost_micros',cost.base_cost_micros,'retail_unit_cents',retail_unit_cents,'target_gross_margin',gross_margin,'provider_cost_source',cost.source,'provider_cost_effective_from',cost.effective_from),expires)
  returning id into quote_id;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload)
  values(uid,p_campaign_id,'quote.created','watchdog',jsonb_build_object('quote_id',quote_id,'channel','direct_mail','provider_key',provider,'quantity',p_quantity,'retail_cents',retail_total_cents,'vendor_cost_cents',vendor_total_cents,'margin_cents',margin_cents,'size_label',cost.size_label,'mail_class',cost.mail_class,'plan',plan));
  return jsonb_build_object('quote_id',quote_id,'campaign_id',p_campaign_id,'channel','direct_mail','provider_key',provider,'plan',plan,'quantity',p_quantity,'size_label',cost.size_label,'mail_class',cost.mail_class,'vendor_cost_cents',vendor_total_cents,'provider_unit_cost_micros',cost.base_cost_micros,'retail_unit_cents',retail_unit_cents,'retail_cents',retail_total_cents,'margin_cents',margin_cents,'target_gross_margin',gross_margin,'expires_at',expires);
end $$;
revoke all on function public.marketing_direct_mail_quote(uuid,integer,text,text,text) from public;
grant execute on function public.marketing_direct_mail_quote(uuid,integer,text,text,text) to authenticated;

insert into public.marketing_creative_templates(template_key,title,description,creative_type,professions,goals,layout_key,content,active,sort_order)
values
('just_listed_neighbors','Just Listed Neighborhood','Promote a fresh listing to nearby homeowners and invite local market conversations.','postcard',array['realtor'],array['seller_leads','relationship'],'listing_spotlight',jsonb_build_object('headline','A home near you just hit the market.','body','A new listing can change the conversation in a neighborhood. If you are curious what current buyer activity could mean for your property, I can provide a local market review.','cta','Scan for a neighborhood market review','disclaimer','Market activity and property estimates can change. This is not an appraisal.'),true,110),
('just_sold_neighbors','Just Sold Neighborhood','Use a recent closing as a neighborhood credibility and seller-opportunity touch.','postcard',array['realtor'],array['seller_leads','relationship'],'sold_spotlight',jsonb_build_object('headline','Another local home has sold.','body','Recent sales help shape expectations for nearby homeowners. If a move is on your radar, get a straightforward look at the latest neighborhood activity.','cta','See what recent sales may mean for your home','disclaimer','Past sales do not guarantee a future sale price.'),true,120),
('absentee_owner_review','Absentee Owner Property Review','Professional outreach for non-owner-occupied properties using property-level context.','postcard',array['realtor','investor'],array['seller_leads','investor_leads'],'property_focus',jsonb_build_object('headline','Owning property from a distance can create questions.','body','If you are reviewing a rental, inherited, or non-owner-occupied property, we can help with a current local property and market review.','cta','Request a no-pressure property review','disclaimer','No offer, sale price, or transaction outcome is implied.'),true,130),
('long_term_owner','Long-Term Owner Check-In','Relationship and seller-opportunity outreach to long-term owners.','postcard',array['realtor'],array['seller_leads','relationship'],'equity_story',jsonb_build_object('headline','A lot can change when you have owned a home for years.','body','Values, taxes, neighborhood activity, and your own plans may look very different today. A current property review can put the numbers in context.','cta','Get a current local property review','disclaimer','Property estimates are informational and are not appraisals.'),true,140),
('inherited_property_resource','Inherited Property Resource','Sensitive professional introduction for inherited-property situations without pressure.','letter',array['realtor','attorney','investor'],array['seller_leads','relationship'],'letterhead',jsonb_build_object('headline','A local resource when a property becomes part of an estate','body','Managing an inherited property can involve legal, tax, maintenance, valuation, and sale questions. If professional property information would be useful, we are available as a local resource without obligation.','cta','Contact us when you are ready for a property review','disclaimer','This communication is informational. Professional services depend on license and engagement.'),true,150),
('expired_listing_reconnect','Previous Listing Check-In','A respectful follow-up for property owners whose prior sale attempt did not result in a closing.','letter',array['realtor'],array['seller_leads'],'letterhead',jsonb_build_object('headline','If selling is still on your mind, a fresh plan may help.','body','Markets and marketing strategies change. If your previous sale did not reach the finish line, I can provide a fresh local review and explain what I would approach differently.','cta','Request a fresh selling strategy','disclaimer','No sale, price, timing, or outcome is guaranteed.'),true,160),
('investor_cash_interest','Investor Purchase Interest','Clearly framed investor interest without implying a binding offer.','postcard',array['investor','realtor'],array['investor_leads'],'bold_offer',jsonb_build_object('headline','Would you consider discussing a sale?','body','This property matched an investor-oriented property screen. If you are open to discussing an as-is sale or simply want to understand potential options, request a property review.','cta','Start a no-obligation property conversation','disclaimer','This is not a binding offer and no purchase price is implied.'),true,170),
('attorney_appeal_deadline','Assessment Review Reminder','Educational assessment-review reminder designed for attorney-led outreach.','postcard',array['attorney'],array['tax_appeal_education','property_tax_leads'],'deadline_card',jsonb_build_object('headline','Property assessment questions are easier to address before deadlines.','body','If you have questions about your assessment, comparable sales, or the appeal process, a timely professional review can help you understand whether further action makes sense.','cta','Request an assessment review','disclaimer','Attorney advertising where applicable. No tax reduction or legal outcome is guaranteed.'),true,180),
('lender_equity_check','Home Equity Financing Check-In','Lender campaign for homeowners reviewing equity-driven financing options.','postcard',array['lender'],array['lending_leads'],'finance',jsonb_build_object('headline','Has your home equity changed your financing options?','body','Home values and loan conditions change over time. A licensed mortgage professional can help you review refinance, cash-out, or other financing options that may be available.','cta','Request a financing review','disclaimer','Subject to qualification and applicable lending requirements. Not a commitment to lend.'),true,190),
('appraiser_professional_intro','Appraisal Services Introduction','Professional property-data introduction for appraisal-related services.','letter',array['appraiser'],array['relationship'],'letterhead',jsonb_build_object('headline','Independent property analysis when the details matter','body','Reliable property decisions depend on accurate records, relevant comparable information, and professional judgment. I am available when you need qualified appraisal services or property analysis.','cta','Contact me for appraisal availability','disclaimer','Services are subject to appraisal standards, scope of work, and applicable licensing requirements.'),true,200),
('home_anniversary','Home Anniversary Check-In','Light relationship touch that keeps a professional top-of-mind.','postcard',array['realtor','lender'],array['relationship'],'celebration',jsonb_build_object('headline','A quick homeowner check-in','body','Homeownership changes year by year. If you ever want an updated look at your property, local market, taxes, or financing, keep my information handy.','cta','Save your local property resource','disclaimer','Property and financing information changes over time.'),true,210),
('neighborhood_farm_intro','Neighborhood Farm Introduction','Evergreen local-farm introduction for agents building recognition over multiple touches.','postcard',array['realtor'],array['relationship','seller_leads'],'local_brand',jsonb_build_object('headline','Your neighborhood deserves a local real estate resource.','body','I work with homeowners in this area and use current local property data to help people understand the market before they need to make a decision.','cta','Scan to see your local property snapshot','disclaimer','Market data is informational and estimates are not appraisals.'),true,220)
on conflict (template_key) do update set title=excluded.title,description=excluded.description,creative_type=excluded.creative_type,professions=excluded.professions,goals=excluded.goals,layout_key=excluded.layout_key,content=excluded.content,active=excluded.active,sort_order=excluded.sort_order,updated_at=now();