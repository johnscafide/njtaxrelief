-- NJW-152: safe automation, tracking, conversion attribution and ROI.
alter table public.marketing_campaigns
  add column if not exists automation_state text not null default 'draft' check (automation_state in ('draft','armed','running','paused','stopped')),
  add column if not exists kill_switch boolean not null default false,
  add column if not exists automation_started_at timestamptz,
  add column if not exists automation_stopped_at timestamptz;

alter table public.marketing_campaign_steps
  add column if not exists scheduled_for timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists attempts integer not null default 0,
  add column if not exists max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  add column if not exists next_attempt_at timestamptz,
  add column if not exists dedupe_key text,
  add column if not exists last_error text;
create unique index if not exists marketing_steps_dedupe_idx on public.marketing_campaign_steps(campaign_id,dedupe_key) where dedupe_key is not null;
create index if not exists marketing_steps_due_idx on public.marketing_campaign_steps(status,scheduled_for) where status in ('scheduled','retry');

create table if not exists public.marketing_automation_runs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  run_type text not null default 'sequence', status text not null default 'queued', started_at timestamptz, completed_at timestamptz,
  step_count integer not null default 0, processed_count integer not null default 0, failed_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists marketing_automation_runs_campaign_idx on public.marketing_automation_runs(campaign_id,created_at desc);
alter table public.marketing_automation_runs enable row level security;
create policy marketing_automation_runs_owner on public.marketing_automation_runs for select to authenticated using (user_id=auth.uid() and public.can_use_data_workbench(auth.uid()));
revoke insert,update,delete on public.marketing_automation_runs from authenticated;

create table if not exists public.marketing_dynamic_audience_rules (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  audience_id uuid not null references public.marketing_audiences(id) on delete cascade,
  campaign_id uuid references public.marketing_campaigns(id) on delete cascade,
  enabled boolean not null default false, criteria jsonb not null default '{}'::jsonb,
  trigger_mode text not null default 'review' check (trigger_mode in ('review','auto_add','auto_campaign')),
  max_new_properties_per_run integer not null default 250 check (max_new_properties_per_run between 1 and 5000),
  last_evaluated_at timestamptz, last_match_count integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists marketing_dynamic_rules_user_idx on public.marketing_dynamic_audience_rules(user_id,updated_at desc);
alter table public.marketing_dynamic_audience_rules enable row level security;
create policy marketing_dynamic_rules_owner on public.marketing_dynamic_audience_rules for select to authenticated using (user_id=auth.uid() and public.can_use_data_workbench(auth.uid()));
revoke insert,update,delete on public.marketing_dynamic_audience_rules from authenticated;

create table if not exists public.marketing_tracking_links (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  token text not null unique, link_type text not null default 'landing_page', destination_path text not null,
  active boolean not null default true, expires_at timestamptz, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists marketing_tracking_links_campaign_idx on public.marketing_tracking_links(campaign_id,created_at desc);
alter table public.marketing_tracking_links enable row level security;
create policy marketing_tracking_links_owner on public.marketing_tracking_links for select to authenticated using (user_id=auth.uid() and public.can_use_data_workbench(auth.uid()));
revoke insert,update,delete on public.marketing_tracking_links from authenticated;

alter table public.marketing_attribution
  add column if not exists channel text,
  add column if not exists provider_key text,
  add column if not exists tracking_link_id uuid references public.marketing_tracking_links(id) on delete set null,
  add column if not exists qualified boolean,
  add column if not exists attribution_model text not null default 'direct';
create index if not exists marketing_attribution_type_idx on public.marketing_attribution(campaign_id,conversion_type,occurred_at desc);

create or replace function public.marketing_configure_sequence(p_campaign_id uuid,p_steps jsonb,p_start_at timestamptz default now()) returns integer
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); elem jsonb; i integer:=0; start_at timestamptz:=coalesce(p_start_at,now()); delay integer; chan text; act text; provider text; maxa integer;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if not exists(select 1 from public.marketing_campaigns where id=p_campaign_id and user_id=uid and status not in ('refunded')) then raise exception 'Campaign not found'; end if;
  if jsonb_typeof(coalesce(p_steps,'[]'::jsonb))<>'array' then raise exception 'Steps must be an array'; end if;
  if jsonb_array_length(p_steps)>20 then raise exception 'A campaign may contain at most 20 automated steps'; end if;
  delete from public.marketing_campaign_steps where campaign_id=p_campaign_id and status in ('draft','scheduled','retry','claimed');
  for elem in select * from jsonb_array_elements(p_steps) loop
    i:=i+1; chan:=left(coalesce(nullif(trim(elem->>'channel'),''),'manual'),40); act:=left(coalesce(nullif(trim(elem->>'action'),''),'Campaign step'),120);
    provider:=nullif(left(trim(coalesce(elem->>'provider_key','')),60),''); delay:=greatest(0,least(coalesce((elem->>'delay_minutes')::integer,0),525600)); maxa:=greatest(1,least(coalesce((elem->>'max_attempts')::integer,3),10));
    insert into public.marketing_campaign_steps(campaign_id,step_order,channel,provider_key,action,delay_minutes,status,trigger_rule,config,scheduled_for,max_attempts,dedupe_key)
    values(p_campaign_id,i,chan,provider,act,delay,'scheduled',coalesce(elem->'trigger_rule','{}'::jsonb),coalesce(elem->'config','{}'::jsonb),start_at+make_interval(mins=>delay),maxa,coalesce(nullif(elem->>'dedupe_key',''),chan||':'||i::text));
  end loop;
  update public.marketing_campaigns set automation_state=case when i>0 then 'armed' else 'draft' end,kill_switch=false,updated_at=now() where id=p_campaign_id and user_id=uid;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,p_campaign_id,'automation.sequence_configured','watchdog',jsonb_build_object('steps',i,'start_at',start_at));
  return i;
end $$;
revoke all on function public.marketing_configure_sequence(uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.marketing_configure_sequence(uuid,jsonb,timestamptz) to authenticated;

create or replace function public.marketing_set_automation_state(p_campaign_id uuid,p_action text) returns text
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); next_state text;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if not exists(select 1 from public.marketing_campaigns where id=p_campaign_id and user_id=uid) then raise exception 'Campaign not found'; end if;
  case lower(p_action) when 'start' then next_state:='running'; when 'resume' then next_state:='running'; when 'pause' then next_state:='paused'; when 'kill' then next_state:='stopped'; when 'stop' then next_state:='stopped'; else raise exception 'Invalid automation action'; end case;
  update public.marketing_campaigns set automation_state=next_state,kill_switch=(next_state='stopped'),automation_started_at=case when next_state='running' then coalesce(automation_started_at,now()) else automation_started_at end,automation_stopped_at=case when next_state='stopped' then now() else automation_stopped_at end,paused_at=case when next_state='paused' then now() else null end,updated_at=now() where id=p_campaign_id and user_id=uid;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,p_campaign_id,'automation.'||next_state,'watchdog',jsonb_build_object('action',lower(p_action)));
  return next_state;
end $$;
revoke all on function public.marketing_set_automation_state(uuid,text) from public,anon;
grant execute on function public.marketing_set_automation_state(uuid,text) to authenticated;

create or replace function public.marketing_create_tracking_link(p_campaign_id uuid,p_destination_path text,p_link_type text default 'landing_page') returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); tok text; lid uuid; dest text:=trim(coalesce(p_destination_path,''));
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if not exists(select 1 from public.marketing_campaigns where id=p_campaign_id and user_id=uid) then raise exception 'Campaign not found'; end if;
  if dest !~ '^/[A-Za-z0-9/_?&=.%+-]*$' or dest like '//%' then raise exception 'Tracking destination must be a local Watchdog path'; end if;
  tok:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.marketing_tracking_links(user_id,campaign_id,token,link_type,destination_path) values(uid,p_campaign_id,tok,left(coalesce(nullif(trim(p_link_type),''),'landing_page'),40),dest) returning id into lid;
  return jsonb_build_object('id',lid,'token',tok,'path','/functions/v1/marketing-track?token='||tok);
end $$;
revoke all on function public.marketing_create_tracking_link(uuid,text,text) from public,anon;
grant execute on function public.marketing_create_tracking_link(uuid,text,text) to authenticated;

create or replace function public.marketing_record_manual_conversion(p_campaign_id uuid,p_conversion_type text,p_revenue_cents bigint default null,p_metadata jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); aid uuid; typ text:=lower(trim(coalesce(p_conversion_type,'')));
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if typ not in ('lead','qualified_lead','appointment','deal','closing','revenue') then raise exception 'Unsupported conversion type'; end if;
  if p_revenue_cents is not null and (p_revenue_cents<0 or p_revenue_cents>1000000000) then raise exception 'Invalid revenue amount'; end if;
  if not exists(select 1 from public.marketing_campaigns where id=p_campaign_id and user_id=uid) then raise exception 'Campaign not found'; end if;
  insert into public.marketing_attribution(user_id,campaign_id,touchpoint_type,conversion_type,revenue_cents,metadata,occurred_at,attribution_model)
  values(uid,p_campaign_id,'manual',typ,p_revenue_cents,coalesce(p_metadata,'{}'::jsonb),now(),'manual') returning id into aid;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,p_campaign_id,'conversion.'||typ,'watchdog',jsonb_build_object('attribution_id',aid,'revenue_cents',p_revenue_cents));
  return aid;
end $$;
revoke all on function public.marketing_record_manual_conversion(uuid,text,bigint,jsonb) from public,anon;
grant execute on function public.marketing_record_manual_conversion(uuid,text,bigint,jsonb) to authenticated;

create or replace function public.marketing_campaign_metrics(p_campaign_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare uid uuid:=auth.uid(); spend bigint; vendor bigint; revenue bigint; touches bigint; conversions bigint; leads bigint; appointments bigint; deals bigint; margin bigint; roi numeric;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if not exists(select 1 from public.marketing_campaigns where id=p_campaign_id and user_id=uid) then raise exception 'Campaign not found'; end if;
  select coalesce(sum(greatest(amount_cents-coalesce(refunded_cents,0),0)),0) into spend from public.marketing_payments where campaign_id=p_campaign_id and user_id=uid and status in ('paid','partially_refunded');
  select coalesce(sum(coalesce(vendor_cost_cents,0)),0) into vendor from public.marketing_provider_jobs where campaign_id=p_campaign_id and user_id=uid and status not in ('failed','cancelled');
  select coalesce(sum(coalesce(revenue_cents,0)),0),count(*),count(*) filter(where conversion_type is not null),count(*) filter(where conversion_type in ('lead','qualified_lead')),count(*) filter(where conversion_type='appointment'),count(*) filter(where conversion_type in ('deal','closing')) into revenue,touches,conversions,leads,appointments,deals from public.marketing_attribution where campaign_id=p_campaign_id and user_id=uid;
  margin:=spend-vendor; roi:=case when spend>0 then round(((revenue-spend)::numeric/spend::numeric)*100,2) else null end;
  return jsonb_build_object('campaign_id',p_campaign_id,'customer_spend_cents',spend,'vendor_cost_cents',vendor,'watchdog_margin_cents',margin,'attributed_revenue_cents',revenue,'touchpoints',touches,'conversions',conversions,'leads',leads,'appointments',appointments,'deals',deals,'roi_percent',roi);
end $$;
revoke all on function public.marketing_campaign_metrics(uuid) from public,anon;
grant execute on function public.marketing_campaign_metrics(uuid) to authenticated;

create or replace function public.marketing_claim_due_steps(p_limit integer default 25) returns setof public.marketing_campaign_steps
language plpgsql security definer set search_path=public as $$
begin
  return query with due as (
    select s.id from public.marketing_campaign_steps s join public.marketing_campaigns c on c.id=s.campaign_id
    where s.status in ('scheduled','retry') and coalesce(s.next_attempt_at,s.scheduled_for)<=now() and s.attempts<s.max_attempts and c.automation_state='running' and not c.kill_switch
    order by coalesce(s.next_attempt_at,s.scheduled_for),s.step_order for update of s skip locked limit greatest(1,least(coalesce(p_limit,25),100))
  ) update public.marketing_campaign_steps s set status='claimed',attempts=s.attempts+1,started_at=coalesce(s.started_at,now()),updated_at=now() from due where s.id=due.id returning s.*;
end $$;
revoke all on function public.marketing_claim_due_steps(integer) from public,anon,authenticated;
grant execute on function public.marketing_claim_due_steps(integer) to service_role;

create or replace function public.enforce_marketing_provider_funding() returns trigger
language plpgsql security definer set search_path=public as $$
declare q public.marketing_price_quotes%rowtype; p public.marketing_payments%rowtype; c public.marketing_campaigns%rowtype;
begin
  select * into c from public.marketing_campaigns where id=new.campaign_id and user_id=new.user_id;
  if c.id is null then raise exception 'Provider job campaign does not exist'; end if;
  if c.kill_switch or c.automation_state in ('paused','stopped') then raise exception 'Provider spend is blocked by campaign automation controls'; end if;
  if new.requires_funding and new.status in ('submitting','submitted','processing','live','mailed','completed') then
    if new.quote_id is null or new.payment_id is null then raise exception 'Provider spend requires linked quote and captured payment'; end if;
    select * into q from public.marketing_price_quotes where id=new.quote_id and campaign_id=new.campaign_id and user_id=new.user_id;
    if q.id is null then raise exception 'Provider spend quote does not match campaign'; end if;
    select * into p from public.marketing_payments where id=new.payment_id and quote_id=new.quote_id and campaign_id=new.campaign_id and user_id=new.user_id and status='paid';
    if p.id is null then raise exception 'Provider spend is blocked until linked campaign funding is captured'; end if;
    if coalesce(p.refunded_cents,0)>0 then raise exception 'Provider spend is blocked while linked payment has refunds'; end if;
    if p.amount_cents<q.retail_cents then raise exception 'Captured payment is below the linked campaign quote'; end if;
    if c.spend_cap_cents is not null and p.amount_cents>c.spend_cap_cents then raise exception 'Provider spend exceeds the campaign hard cap'; end if;
  end if;
  return new;
end $$;
revoke all on function public.enforce_marketing_provider_funding() from public,anon,authenticated;
