-- NJW-154: Creative Studio + Direct Mail Launch 1.0

create table if not exists public.marketing_creative_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  title text not null,
  description text not null default '',
  creative_type text not null check (creative_type in ('postcard','letter')),
  professions text[] not null default '{}',
  goals text[] not null default '{}',
  layout_key text not null default 'clean_local',
  content jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.marketing_creative_templates enable row level security;
create policy marketing_creative_templates_read on public.marketing_creative_templates for select to authenticated using (public.can_use_data_workbench(auth.uid()));
revoke insert,update,delete on public.marketing_creative_templates from authenticated;

alter table public.marketing_creatives
  add column if not exists template_key text,
  add column if not exists provider_design_id text,
  add column if not exists tracking_link_id uuid references public.marketing_tracking_links(id) on delete set null;
create index if not exists marketing_creatives_template_idx on public.marketing_creatives(template_key) where template_key is not null;

create table if not exists public.marketing_direct_mail_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  property_key text not null,
  recipient_name text not null default 'Current Resident',
  address text not null,
  city text not null,
  state text not null default 'NJ',
  zip text not null,
  validation_status text not null default 'valid' check (validation_status in ('valid','invalid')),
  validation_detail jsonb not null default '{}'::jsonb,
  snapshot_at timestamptz not null default now(),
  unique(campaign_id,property_key)
);
alter table public.marketing_direct_mail_recipients enable row level security;
create policy marketing_dm_recipients_owner on public.marketing_direct_mail_recipients for select to authenticated using (user_id=auth.uid() and public.can_use_data_workbench(auth.uid()));
revoke insert,update,delete on public.marketing_direct_mail_recipients from authenticated;
create index if not exists marketing_dm_recipients_campaign_idx on public.marketing_direct_mail_recipients(campaign_id,validation_status);

create table if not exists public.marketing_launch_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  channel text not null,
  provider_key text not null,
  creative_id uuid not null references public.marketing_creatives(id) on delete restrict,
  quote_id uuid not null references public.marketing_price_quotes(id) on delete restrict,
  payment_id uuid not null references public.marketing_payments(id) on delete restrict,
  recipient_count integer not null check (recipient_count>0),
  approval_fingerprint text not null,
  status text not null default 'approved' check (status in ('approved','consumed','revoked')),
  approved_at timestamptz not null default now(),
  consumed_at timestamptz,
  revoked_at timestamptz,
  unique(campaign_id,channel,provider_key,approval_fingerprint)
);
alter table public.marketing_launch_approvals enable row level security;
create policy marketing_launch_approvals_owner on public.marketing_launch_approvals for select to authenticated using (user_id=auth.uid() and public.can_use_data_workbench(auth.uid()));
revoke insert,update,delete on public.marketing_launch_approvals from authenticated;
create index if not exists marketing_launch_campaign_idx on public.marketing_launch_approvals(campaign_id,status,approved_at desc);

insert into public.marketing_creative_templates(template_key,title,description,creative_type,professions,goals,layout_key,content,sort_order) values
('seller_value_local','Local Home Value','A simple seller-focused postcard built around local value and a property review.','postcard',array['realtor'],array['seller_leads'],'split_photo','{"headline":"Curious what your home could be worth?","body":"Your local market keeps changing. Get a straightforward property review and see what may matter if you are thinking about a move.","cta":"Scan for a local property review","disclaimer":"Not a promise of value or sale price."}'::jsonb,10),
('seller_equity_signal','Equity Opportunity','Seller outreach for properties selected from equity and ownership signals.','postcard',array['realtor','investor'],array['seller_leads','investor_leads'],'bold_number','{"headline":"Your property may be worth a closer look.","body":"Watchdog property intelligence identified this address for a local market review. If you are considering selling, refinancing, or simply want context, we can help.","cta":"Request a property review","disclaimer":"Selection is based on property-level public records and derived signals."}'::jsonb,20),
('tax_review_education','Property Tax Review','Educational property-tax postcard for attorneys and real estate professionals.','postcard',array['attorney','realtor'],array['tax_appeal_education','property_tax_leads'],'clean_local','{"headline":"Is your property assessment worth reviewing?","body":"Property assessments and market conditions can change. A professional review can help you understand the available information and whether further action may be appropriate.","cta":"Review your property information","disclaimer":"Educational information only. No tax reduction or legal outcome is guaranteed."}'::jsonb,30),
('tax_high_burden','High Tax Context','Property-tax context for properties selected by tax-burden signals.','letter',array['attorney','realtor'],array['property_tax_leads'],'letterhead','{"headline":"A note about your property tax information","body":"We are reaching out because public property records indicate this property may warrant a closer review of its assessment and tax context. We can help explain the available records and next steps.","cta":"Contact us for a property review","disclaimer":"This communication is informational and is not a guarantee of tax savings."}'::jsonb,40),
('new_homeowner_welcome','New Homeowner Welcome','Relationship-building mail for recently transferred properties.','postcard',array['realtor','lender'],array['relationship'],'welcome','{"headline":"Welcome home.","body":"Owning a home comes with questions about value, taxes, financing, improvements, and the local market. Keep our information handy whenever you need a local resource.","cta":"Save your local property resource","disclaimer":"Property information is compiled from public and third-party sources."}'::jsonb,50),
('lender_property_review','Lending Property Review','Property-led financing outreach for lending professionals.','postcard',array['lender'],array['lending_leads'],'finance','{"headline":"Review your home financing options.","body":"Property value, equity, and financing conditions change over time. A licensed mortgage professional can help you review options that may fit your situation.","cta":"Request a financing review","disclaimer":"Subject to qualification and applicable lending requirements. This is not a commitment to lend."}'::jsonb,60),
('investor_property_opportunity','Investor Property Opportunity','Investor-oriented service outreach based on property characteristics.','postcard',array['investor','realtor'],array['investor_leads'],'data_card','{"headline":"A property opportunity may be worth reviewing.","body":"This property matched a Watchdog property-intelligence screen. If you are considering a sale or want to understand investor interest, request a no-pressure property review.","cta":"See the property opportunity","disclaimer":"No offer or purchase price is implied by this mailing."}'::jsonb,70),
('local_market_update','Local Market Update','General local-market farming postcard for real estate professionals.','postcard',array['realtor'],array['seller_leads','relationship'],'market_update','{"headline":"A quick update on your local housing market","body":"Recent sales, assessments, and neighborhood activity can change how homeowners think about their property. Get a current local review whenever you are ready.","cta":"View your local property snapshot","disclaimer":"Market information changes and estimates are not appraisals."}'::jsonb,80),
('professional_intro_letter','Professional Introduction','Long-form introduction letter suitable for attorneys, lenders, or agents.','letter',array['realtor','attorney','lender','appraiser'],array['relationship','seller_leads','tax_appeal_education','lending_leads'],'letterhead','{"headline":"A local resource for your property questions","body":"I am reaching out as a local professional who works with property owners and real estate data. If you have questions about your property, the local market, taxes, financing, or next steps, I would be glad to be a resource.","cta":"Contact me when you need a property professional","disclaimer":"Services and professional scope vary by license and engagement."}'::jsonb,90),
('second_touch_followup','Second Touch Follow-Up','A concise second-touch postcard for an existing campaign sequence.','postcard',array['realtor','attorney','lender','investor'],array['seller_leads','tax_appeal_education','property_tax_leads','lending_leads','investor_leads','relationship'],'followup','{"headline":"One more note about your property","body":"We recently sent information because this property matched a local property-intelligence campaign. If the timing is not right, no action is needed. If you have questions, the property review is still available.","cta":"Review the property details","disclaimer":"You may disregard this message if it is not relevant to you."}'::jsonb,100)
on conflict(template_key) do update set title=excluded.title,description=excluded.description,creative_type=excluded.creative_type,professions=excluded.professions,goals=excluded.goals,layout_key=excluded.layout_key,content=excluded.content,sort_order=excluded.sort_order,updated_at=now();

create or replace function public.marketing_save_brand_profile(p_name text,p_profile jsonb,p_make_default boolean default true) returns uuid
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); bid uuid;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if p_make_default then update public.marketing_brand_profiles set is_default=false,updated_at=now() where user_id=uid; end if;
  insert into public.marketing_brand_profiles(user_id,name,is_default,profile) values(uid,coalesce(nullif(trim(p_name),''),'Default brand'),p_make_default,coalesce(p_profile,'{}'::jsonb)) returning id into bid;
  insert into public.marketing_events(user_id,event_type,source,payload) values(uid,'brand.saved','watchdog',jsonb_build_object('brand_profile_id',bid));
  return bid;
end $$;
revoke all on function public.marketing_save_brand_profile(text,jsonb,boolean) from public,anon;
grant execute on function public.marketing_save_brand_profile(text,jsonb,boolean) to authenticated;

create or replace function public.marketing_save_creative(p_campaign_id uuid,p_template_key text,p_content jsonb,p_provider_design_id text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); tmpl public.marketing_creative_templates%rowtype; brand uuid; nextv integer; cid uuid; track uuid;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if not exists(select 1 from public.marketing_campaigns where id=p_campaign_id and user_id=uid) then raise exception 'Campaign not found'; end if;
  select * into tmpl from public.marketing_creative_templates where template_key=p_template_key and active;
  if tmpl.id is null then raise exception 'Creative template not found'; end if;
  select id into brand from public.marketing_brand_profiles where user_id=uid order by is_default desc,updated_at desc limit 1;
  select coalesce(max(version),0)+1 into nextv from public.marketing_creatives where campaign_id=p_campaign_id and channel='direct_mail';
  select id into track from public.marketing_tracking_links where campaign_id=p_campaign_id and user_id=uid and active order by created_at desc limit 1;
  insert into public.marketing_creatives(user_id,campaign_id,brand_profile_id,channel,creative_type,version,content,status,template_key,provider_design_id,tracking_link_id)
  values(uid,p_campaign_id,brand,'direct_mail',tmpl.creative_type,nextv,tmpl.content||coalesce(p_content,'{}'::jsonb),'draft',tmpl.template_key,nullif(trim(p_provider_design_id),''),track) returning id into cid;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,p_campaign_id,'creative.saved','watchdog',jsonb_build_object('creative_id',cid,'template_key',tmpl.template_key,'version',nextv));
  return cid;
end $$;
revoke all on function public.marketing_save_creative(uuid,text,jsonb,text) from public,anon;
grant execute on function public.marketing_save_creative(uuid,text,jsonb,text) to authenticated;

create or replace function public.marketing_approve_creative(p_creative_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); c public.marketing_creatives%rowtype;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  select * into c from public.marketing_creatives where id=p_creative_id and user_id=uid;
  if c.id is null then raise exception 'Creative not found'; end if;
  if coalesce(c.content->>'headline','')='' or coalesce(c.content->>'body','')='' or coalesce(c.content->>'cta','')='' then raise exception 'Headline, body and CTA are required'; end if;
  update public.marketing_creatives set status='approved',approved_at=now(),updated_at=now() where id=c.id;
  update public.marketing_creatives set status='superseded',updated_at=now() where campaign_id=c.campaign_id and channel=c.channel and id<>c.id and status='approved';
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,c.campaign_id,'creative.approved','watchdog',jsonb_build_object('creative_id',c.id,'version',c.version));
  return jsonb_build_object('creative_id',c.id,'campaign_id',c.campaign_id,'status','approved');
end $$;
revoke all on function public.marketing_approve_creative(uuid) from public,anon;
grant execute on function public.marketing_approve_creative(uuid) to authenticated;

create or replace function public.marketing_prepare_direct_mail_recipients(p_campaign_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); sid uuid; keys jsonb; total int:=0; valid_count int:=0; invalid_count int:=0;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  select audience_snapshot_id into sid from public.marketing_campaigns where id=p_campaign_id and user_id=uid;
  if sid is null then raise exception 'Campaign audience snapshot not found'; end if;
  select property_keys into keys from public.marketing_audience_snapshots where id=sid and user_id=uid;
  if jsonb_typeof(coalesce(keys,'[]'::jsonb))<>'array' then raise exception 'Campaign audience is invalid'; end if;
  total:=jsonb_array_length(keys);
  delete from public.marketing_direct_mail_recipients where campaign_id=p_campaign_id and user_id=uid;
  with requested as (select value#>>'{}' as property_key from jsonb_array_elements(keys)),
  resolved as (select distinct on (r.property_key) r.property_key,p.address,p.town,p.zip from requested r left join public.property_lookups p on p.pams_pin=r.property_key order by r.property_key,p.last_seen desc nulls last)
  insert into public.marketing_direct_mail_recipients(user_id,campaign_id,property_key,address,city,state,zip,validation_status,validation_detail)
  select uid,p_campaign_id,property_key,coalesce(nullif(trim(address),''),'MISSING'),coalesce(nullif(trim(town),''),'MISSING'),'NJ',coalesce(regexp_replace(zip,'[^0-9]','','g'),'')::text,
    case when length(coalesce(trim(address),''))>=3 and length(coalesce(trim(town),''))>=2 and regexp_replace(coalesce(zip,''),'[^0-9]','','g') ~ '^\d{5}([0-9]{4})?$' then 'valid' else 'invalid' end,
    jsonb_build_object('source','property_lookups','resolved',address is not null) from resolved;
  select count(*) filter(where validation_status='valid'),count(*) filter(where validation_status='invalid') into valid_count,invalid_count from public.marketing_direct_mail_recipients where campaign_id=p_campaign_id and user_id=uid;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,p_campaign_id,'direct_mail.recipients_prepared','watchdog',jsonb_build_object('audience_count',total,'valid_count',valid_count,'invalid_count',invalid_count));
  return jsonb_build_object('audience_count',total,'valid_count',valid_count,'invalid_count',invalid_count,'prepared_at',now());
end $$;
revoke all on function public.marketing_prepare_direct_mail_recipients(uuid) from public,anon;
grant execute on function public.marketing_prepare_direct_mail_recipients(uuid) to authenticated;
