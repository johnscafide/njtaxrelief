-- Marketing Studio Direct Mail 3.0: Audience Hub + annual signup credits.
create table if not exists public.marketing_credit_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 promo_key text not null default 'annual_direct_mail_signup',
 qualifying_tier text not null,
 qualifying_subscription_id text,
 grant_cents bigint not null check(grant_cents>=0),
 used_cents bigint not null default 0 check(used_cents>=0 and used_cents<=grant_cents),
 first_qualified_at timestamptz not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.marketing_credit_ledger (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 campaign_id uuid references public.marketing_campaigns(id) on delete set null,
 quote_id uuid references public.marketing_price_quotes(id) on delete set null,
 entry_type text not null check(entry_type in ('grant','top_up','redeem','release','expire','adjustment')),
 amount_cents bigint not null,
 balance_after_cents bigint not null check(balance_after_cents>=0),
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.marketing_credit_accounts enable row level security;
alter table public.marketing_credit_ledger enable row level security;
create index if not exists marketing_credit_ledger_user_created_idx on public.marketing_credit_ledger(user_id,created_at desc);
create index if not exists marketing_credit_ledger_campaign_idx on public.marketing_credit_ledger(campaign_id) where campaign_id is not null;

create or replace function public.marketing_annual_direct_mail_credit_amount(p_tier text) returns bigint language sql immutable as $$
 select case lower(regexp_replace(coalesce(p_tier,''),'[^a-z0-9]+','_','g')) when 'agent' then 5000 when 'pro' then 10000 when 'professional' then 10000 when 'pro_plus' then 30000 when 'proplus' then 30000 else 0 end::bigint
$$;

create or replace function public.sync_annual_direct_mail_signup_credit() returns trigger language plpgsql security definer set search_path='public' as $$
declare tier text:=coalesce(nullif(new.billing_tier,''),nullif(new.plan_tier,''),''); amount bigint:=public.marketing_annual_direct_mail_credit_amount(tier); interval_key text:=lower(coalesce(new.billing_interval,'')); qualified_at timestamptz:=coalesce(new.provider_event_at,new.updated_at,now()); existing public.marketing_credit_accounts%rowtype; delta bigint:=0;
begin
 if amount<=0 or interval_key not in ('year','yearly','annual') or lower(coalesce(new.subscription_status,'')) not in ('active','trialing') then return new; end if;
 select * into existing from public.marketing_credit_accounts where user_id=new.user_id for update;
 if existing.user_id is null then
  insert into public.marketing_credit_accounts(user_id,qualifying_tier,qualifying_subscription_id,grant_cents,used_cents,first_qualified_at,expires_at) values(new.user_id,tier,new.provider_subscription_id,amount,0,qualified_at,qualified_at+interval '30 days');
  insert into public.marketing_credit_ledger(user_id,entry_type,amount_cents,balance_after_cents,detail) values(new.user_id,'grant',amount,amount,jsonb_build_object('promo','annual_direct_mail_signup','tier',tier,'expires_at',qualified_at+interval '30 days'));
 elsif now()<existing.expires_at and amount>existing.grant_cents then
  delta:=amount-existing.grant_cents;
  update public.marketing_credit_accounts set qualifying_tier=tier,qualifying_subscription_id=coalesce(new.provider_subscription_id,qualifying_subscription_id),grant_cents=amount,updated_at=now() where user_id=new.user_id;
  insert into public.marketing_credit_ledger(user_id,entry_type,amount_cents,balance_after_cents,detail) values(new.user_id,'top_up',delta,amount-existing.used_cents,jsonb_build_object('promo','annual_direct_mail_signup','tier',tier,'reason','annual_plan_upgrade'));
 end if;
 return new;
end $$;
drop trigger if exists account_entitlements_annual_direct_mail_credit on public.account_entitlements;
create trigger account_entitlements_annual_direct_mail_credit after insert or update of billing_tier,plan_tier,billing_interval,subscription_status,provider_subscription_id,provider_event_at on public.account_entitlements for each row execute function public.sync_annual_direct_mail_signup_credit();

create or replace function public.marketing_credit_summary() returns jsonb language plpgsql stable security definer set search_path='public' as $$
declare uid uuid:=auth.uid(); a public.marketing_credit_accounts%rowtype; avail bigint:=0;
begin
 if uid is null then raise exception 'Sign in required'; end if;
 select * into a from public.marketing_credit_accounts where user_id=uid;
 if a.user_id is null then return jsonb_build_object('eligible',false,'available_cents',0,'reserved_cents',0,'grant_cents',0,'used_cents',0,'expires_at',null,'qualifying_tier',null,'promo','annual_direct_mail_signup'); end if;
 if now()<a.expires_at then avail:=greatest(a.grant_cents-a.used_cents,0); end if;
 return jsonb_build_object('eligible',now()<a.expires_at and avail>0,'available_cents',avail,'reserved_cents',0,'grant_cents',a.grant_cents,'used_cents',a.used_cents,'expires_at',a.expires_at,'qualifying_tier',a.qualifying_tier,'promo','annual_direct_mail_signup');
end $$;

create or replace function public.marketing_credit_quote_adjustment(p_quote_id uuid) returns jsonb language plpgsql stable security definer set search_path='public' as $$
declare uid uuid:=auth.uid(); q public.marketing_price_quotes%rowtype; s jsonb; avail bigint; applied bigint;
begin
 if uid is null then raise exception 'Sign in required'; end if;
 select * into q from public.marketing_price_quotes where id=p_quote_id and user_id=uid; if q.id is null then raise exception 'Quote not found'; end if;
 s:=public.marketing_credit_summary(); avail:=coalesce((s->>'available_cents')::bigint,0); applied:=least(avail,greatest(coalesce(q.retail_cents,0),0));
 return s||jsonb_build_object('quote_id',q.id,'retail_cents',q.retail_cents,'credit_applied_cents',applied,'amount_due_cents',greatest(coalesce(q.retail_cents,0)-applied,0));
end $$;

create or replace function public.marketing_audience_hub_apply_keys(p_campaign_id uuid,p_property_keys jsonb,p_source_type text default 'audience_hub',p_source_ref text default 'manual',p_source_label text default 'Custom Watchdog audience',p_limit integer default 1000,p_qualification_summary jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='public' as $$
declare uid uuid:=auth.uid(); c public.marketing_campaigns%rowtype; aid uuid; sid uuid; keys jsonb; cnt int; v int; lim int:=least(greatest(coalesce(p_limit,1000),1),10000); st text:=lower(trim(coalesce(p_source_type,'audience_hub'))); sr text:=trim(coalesce(p_source_ref,'manual')); sl text:=left(trim(coalesce(p_source_label,'Custom Watchdog audience')),180);
begin
 if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
 select * into c from public.marketing_campaigns where id=p_campaign_id and user_id=uid for update; if c.id is null then raise exception 'Campaign not found'; end if;
 if jsonb_typeof(coalesce(p_property_keys,'[]'::jsonb))<>'array' then raise exception 'property_keys must be an array'; end if;
 with raw as (select nullif(trim(value),'') k,min(ord) ord from jsonb_array_elements_text(coalesce(p_property_keys,'[]'::jsonb)) with ordinality x(value,ord) group by nullif(trim(value),'')),chosen as (select k,ord from raw where k is not null order by ord limit lim) select coalesce(jsonb_agg(k order by ord),'[]'::jsonb),count(*) into keys,cnt from chosen;
 if cnt<1 then raise exception 'Choose at least one property'; end if;
 aid:=c.audience_id;
 if aid is null then insert into public.marketing_audiences(user_id,name,source_type,source_ref,criteria,dynamic,status) values(uid,c.name||' audience',st,jsonb_build_object('source_ref',sr),coalesce(p_qualification_summary,'{}'::jsonb),false,'active') returning id into aid;
 else update public.marketing_audiences set name=c.name||' audience',source_type=st,source_ref=jsonb_build_object('source_ref',sr),criteria=coalesce(p_qualification_summary,'{}'::jsonb),updated_at=now() where id=aid and user_id=uid; end if;
 insert into public.marketing_audience_snapshots(audience_id,user_id,property_keys,qualification_summary,property_count) values(aid,uid,keys,coalesce(p_qualification_summary,'{}'::jsonb)||jsonb_build_object('source_type',st,'source_ref',sr,'source_label',sl),cnt) returning id into sid;
 delete from public.marketing_campaign_recipient_sources where user_id=uid and campaign_id=c.id;
 update public.marketing_campaigns set audience_id=aid,audience_snapshot_id=sid,current_version=current_version+1,updated_at=now(),settings=coalesce(settings,'{}'::jsonb)||jsonb_build_object('audience_source_type',st,'audience_source_ref',sr,'audience_source_label',sl) where id=c.id returning current_version into v;
 insert into public.marketing_campaign_versions(campaign_id,version,user_id,definition) values(c.id,v,uid,jsonb_build_object('change','audience_replaced','source_type',st,'source_ref',sr,'source_label',sl,'property_count',cnt,'qualification_summary',coalesce(p_qualification_summary,'{}'::jsonb)));
 insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,c.id,'audience.hub_applied','watchdog',jsonb_build_object('source_type',st,'source_ref',sr,'source_label',sl,'property_count',cnt));
 return jsonb_build_object('campaign_id',c.id,'audience_id',aid,'snapshot_id',sid,'property_count',cnt,'source_type',st,'source_ref',sr,'source_label',sl);
end $$;

create or replace function public.marketing_audience_hub_apply_source(p_campaign_id uuid,p_source_type text,p_source_ref text,p_limit integer default 1000) returns jsonb language plpgsql security definer set search_path='public' as $$
declare uid uuid:=auth.uid(); st text:=lower(trim(coalesce(p_source_type,''))); sr text:=trim(coalesce(p_source_ref,'')); sid uuid; labelv text; keys jsonb:='[]'::jsonb; lim int:=least(greatest(coalesce(p_limit,1000),1),10000); result jsonb;
begin
 if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
 if not exists(select 1 from public.marketing_campaigns where id=p_campaign_id and user_id=uid) then raise exception 'Campaign not found'; end if;
 if st='saved_properties' then if sr<>'all' then raise exception 'Invalid saved property source'; end if; labelv:='Saved properties & watchlist'; select coalesce(jsonb_agg(pams_pin order by pams_pin),'[]'::jsonb) into keys from (select distinct pams_pin from public.agent_farm_properties where user_id=uid and nullif(trim(pams_pin),'') is not null order by pams_pin limit lim)x;
 elsif st='data_workbench_campaign' then begin sid:=sr::uuid; exception when others then raise exception 'Invalid source reference'; end; select name into labelv from public.data_workbench_campaigns where id=sid and user_id=uid; select coalesce(jsonb_agg(k),'[]'::jsonb) into keys from (select distinct value#>>'{}' k from public.data_workbench_campaigns d cross join lateral jsonb_array_elements(coalesce(d.property_keys,'[]'::jsonb)) where d.id=sid and d.user_id=uid and nullif(trim(value#>>'{}'),'') is not null order by k limit lim)x;
 elsif st='professional_campaign' then begin sid:=sr::uuid; exception when others then raise exception 'Invalid source reference'; end; select name into labelv from public.professional_campaigns where id=sid and user_id=uid; select coalesce(jsonb_agg(pams_pin order by pams_pin),'[]'::jsonb) into keys from (select distinct pams_pin from public.professional_campaign_properties where campaign_id=sid and user_id=uid and nullif(trim(pams_pin),'') is not null order by pams_pin limit lim)x;
 elsif st='previous_campaign' then begin sid:=sr::uuid; exception when others then raise exception 'Invalid source reference'; end; select c.name into labelv from public.marketing_campaigns c where c.id=sid and c.user_id=uid and c.id<>p_campaign_id; select coalesce(jsonb_agg(k),'[]'::jsonb) into keys from (select distinct value#>>'{}' k from public.marketing_campaigns c join public.marketing_audience_snapshots a on a.id=c.audience_snapshot_id and a.user_id=uid cross join lateral jsonb_array_elements(coalesce(a.property_keys,'[]'::jsonb)) where c.id=sid and c.user_id=uid and c.id<>p_campaign_id and nullif(trim(value#>>'{}'),'') is not null order by k limit lim)x;
 elsif st='smart_list' then begin sid:=sr::uuid; exception when others then raise exception 'Invalid source reference'; end; select l.name into labelv from public.agent_dynamic_lists l join public.agent_dynamic_list_materializations m on m.dynamic_list_id=l.id and m.user_id=uid where l.id=sid and l.user_id=uid and m.definition_snapshot=jsonb_build_object('scope_type',l.scope_type,'scope_value',l.scope_value,'criteria',coalesce(l.criteria,'{}'::jsonb)) and m.status in ('ready','ready_capacity_limited') and m.source_complete and m.materialized_count>0; if labelv is null then raise exception 'Smart audience must be prepared from the complete statewide source first'; end if; select coalesce(jsonb_agg(pams_pin order by pams_pin),'[]'::jsonb) into keys from (select distinct p.pams_pin from public.agent_dynamic_list_properties p join public.agent_dynamic_list_materializations m on m.dynamic_list_id=p.dynamic_list_id and m.user_id=uid and m.generation=p.generation where p.dynamic_list_id=sid and p.user_id=uid order by p.pams_pin limit lim)x;
 else raise exception 'Unsupported audience source'; end if;
 if labelv is null then raise exception 'Audience source not found'; end if;
 result:=public.marketing_audience_hub_apply_keys(p_campaign_id,keys,st,sr,labelv,lim,jsonb_build_object('source_type',st,'source_ref',sr,'source_label',labelv));
 insert into public.marketing_campaign_recipient_sources(user_id,campaign_id,source_type,source_ref,source_label) values(uid,p_campaign_id,st,sr,labelv) on conflict(user_id,campaign_id,source_type,source_ref) do update set source_label=excluded.source_label;
 return result;
end $$;

create or replace function public.marketing_audience_hub_create_farm(p_campaign_id uuid,p_name text,p_scope_type text,p_scope_value text,p_criteria jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='public' as $$
declare uid uuid:=auth.uid(); st text:=lower(trim(coalesce(p_scope_type,''))); sv text:=trim(coalesce(p_scope_value,'')); nm text:=left(trim(coalesce(p_name,'Marketing Studio audience')),120); lid uuid; c jsonb:=coalesce(p_criteria,'{}'::jsonb); radius numeric;
begin
 if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if; if not exists(select 1 from public.marketing_campaigns where id=p_campaign_id and user_id=uid) then raise exception 'Campaign not found'; end if; if st not in ('municipality','county','zip','radius','polygon') then raise exception 'Unsupported audience geography'; end if; if sv='' then raise exception 'Audience geography is required'; end if;
 if st='radius' then radius:=coalesce((c->>'radius_miles')::numeric,1); if radius<0.1 or radius>50 then raise exception 'Radius must be between 0.1 and 50 miles'; end if; end if;
 insert into public.agent_dynamic_lists(user_id,name,scope_type,scope_value,criteria,monitored) values(uid,nm,st,sv,c||jsonb_build_object('marketing_studio_campaign_id',p_campaign_id),false) returning id into lid;
 insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,p_campaign_id,'audience.farm_created','watchdog',jsonb_build_object('list_id',lid,'scope_type',st,'scope_value',sv,'criteria',c));
 return jsonb_build_object('list_id',lid,'name',nm,'scope_type',st,'scope_value',sv,'materialize_required',true);
end $$;

revoke all on function public.marketing_credit_summary() from public,anon; revoke all on function public.marketing_credit_quote_adjustment(uuid) from public,anon;
grant execute on function public.marketing_credit_summary() to authenticated,service_role; grant execute on function public.marketing_credit_quote_adjustment(uuid) to authenticated,service_role;
revoke all on function public.marketing_audience_hub_apply_keys(uuid,jsonb,text,text,text,integer,jsonb) from public,anon; revoke all on function public.marketing_audience_hub_apply_source(uuid,text,text,integer) from public,anon; revoke all on function public.marketing_audience_hub_create_farm(uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.marketing_audience_hub_apply_keys(uuid,jsonb,text,text,text,integer,jsonb) to authenticated,service_role; grant execute on function public.marketing_audience_hub_apply_source(uuid,text,text,integer) to authenticated,service_role; grant execute on function public.marketing_audience_hub_create_farm(uuid,text,text,text,jsonb) to authenticated,service_role;