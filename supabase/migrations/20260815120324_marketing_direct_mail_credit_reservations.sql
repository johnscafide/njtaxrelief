-- Reserve annual Direct Mail credits at checkout without reducing balance until payment succeeds.
create table if not exists public.marketing_credit_reservations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
 quote_id uuid not null references public.marketing_price_quotes(id) on delete cascade,
 amount_cents bigint not null check(amount_cents>0),
 status text not null default 'pending' check(status in ('pending','redeemed','released')),
 expires_at timestamptz not null,
 processor_session_id text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,quote_id)
);
alter table public.marketing_credit_reservations enable row level security;
create index if not exists marketing_credit_reservations_active_idx on public.marketing_credit_reservations(user_id,status,expires_at);

create or replace function public.marketing_credit_summary() returns jsonb language plpgsql stable security definer set search_path='public' as $$
declare uid uuid:=auth.uid(); a public.marketing_credit_accounts%rowtype; avail bigint:=0; held bigint:=0;
begin
 if uid is null then raise exception 'Sign in required'; end if; select * into a from public.marketing_credit_accounts where user_id=uid;
 if a.user_id is null then return jsonb_build_object('eligible',false,'available_cents',0,'reserved_cents',0,'grant_cents',0,'used_cents',0,'expires_at',null,'qualifying_tier',null,'promo','annual_direct_mail_signup'); end if;
 select coalesce(sum(amount_cents),0) into held from public.marketing_credit_reservations where user_id=uid and status='pending' and expires_at>now(); if now()<a.expires_at then avail:=greatest(a.grant_cents-a.used_cents-held,0); end if;
 return jsonb_build_object('eligible',now()<a.expires_at and avail>0,'available_cents',avail,'reserved_cents',held,'grant_cents',a.grant_cents,'used_cents',a.used_cents,'expires_at',a.expires_at,'qualifying_tier',a.qualifying_tier,'promo','annual_direct_mail_signup');
end $$;

create or replace function public.marketing_credit_reserve(p_user_id uuid,p_campaign_id uuid,p_quote_id uuid,p_requested_cents bigint) returns jsonb language plpgsql security definer set search_path='public' as $$
declare a public.marketing_credit_accounts%rowtype; r public.marketing_credit_reservations%rowtype; held bigint:=0; avail bigint:=0; amount bigint:=0;
begin
 if p_user_id is null or p_campaign_id is null or p_quote_id is null then raise exception 'Credit reservation identifiers are required'; end if;
 if not exists(select 1 from public.marketing_price_quotes where id=p_quote_id and user_id=p_user_id and campaign_id=p_campaign_id) then raise exception 'Quote not found'; end if;
 select * into r from public.marketing_credit_reservations where user_id=p_user_id and quote_id=p_quote_id for update; if r.id is not null and r.status='pending' and r.expires_at>now() then return jsonb_build_object('reservation_id',r.id,'credit_cents',r.amount_cents,'expires_at',r.expires_at,'reused',true); end if;
 select * into a from public.marketing_credit_accounts where user_id=p_user_id for update; if a.user_id is null or now()>=a.expires_at then return jsonb_build_object('reservation_id',null,'credit_cents',0,'expires_at',null,'reused',false); end if;
 update public.marketing_credit_reservations set status='released',updated_at=now() where user_id=p_user_id and status='pending' and expires_at<=now();
 select coalesce(sum(amount_cents),0) into held from public.marketing_credit_reservations where user_id=p_user_id and status='pending' and expires_at>now() and quote_id<>p_quote_id;
 avail:=greatest(a.grant_cents-a.used_cents-held,0); amount:=least(greatest(coalesce(p_requested_cents,0),0),avail); if amount<=0 then return jsonb_build_object('reservation_id',null,'credit_cents',0,'expires_at',a.expires_at,'reused',false); end if;
 insert into public.marketing_credit_reservations(user_id,campaign_id,quote_id,amount_cents,status,expires_at) values(p_user_id,p_campaign_id,p_quote_id,amount,'pending',least(a.expires_at,now()+interval '45 minutes')) on conflict(user_id,quote_id) do update set campaign_id=excluded.campaign_id,amount_cents=excluded.amount_cents,status='pending',expires_at=excluded.expires_at,processor_session_id=null,updated_at=now() returning * into r;
 return jsonb_build_object('reservation_id',r.id,'credit_cents',r.amount_cents,'expires_at',r.expires_at,'reused',false);
end $$;
create or replace function public.marketing_credit_bind_session(p_reservation_id uuid,p_session_id text) returns void language plpgsql security definer set search_path='public' as $$ begin update public.marketing_credit_reservations set processor_session_id=nullif(trim(p_session_id),''),updated_at=now() where id=p_reservation_id and status='pending'; end $$;
create or replace function public.marketing_credit_finalize(p_reservation_id uuid,p_action text,p_detail jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='public' as $$
declare r public.marketing_credit_reservations%rowtype; a public.marketing_credit_accounts%rowtype; action text:=lower(trim(coalesce(p_action,''))); bal bigint;
begin
 select * into r from public.marketing_credit_reservations where id=p_reservation_id for update; if r.id is null then return jsonb_build_object('changed',false,'reason','not_found'); end if; if r.status<>'pending' then return jsonb_build_object('changed',false,'status',r.status); end if;
 if action='redeem' then select * into a from public.marketing_credit_accounts where user_id=r.user_id for update; if a.user_id is null then raise exception 'Credit account not found'; end if; update public.marketing_credit_accounts set used_cents=least(grant_cents,used_cents+r.amount_cents),updated_at=now() where user_id=r.user_id returning grant_cents-used_cents into bal; update public.marketing_credit_reservations set status='redeemed',updated_at=now() where id=r.id; insert into public.marketing_credit_ledger(user_id,campaign_id,quote_id,entry_type,amount_cents,balance_after_cents,detail) values(r.user_id,r.campaign_id,r.quote_id,'redeem',-r.amount_cents,greatest(bal,0),coalesce(p_detail,'{}'::jsonb)||jsonb_build_object('reservation_id',r.id)); return jsonb_build_object('changed',true,'status','redeemed','credit_cents',r.amount_cents,'balance_cents',greatest(bal,0));
 elsif action='release' then update public.marketing_credit_reservations set status='released',updated_at=now() where id=r.id; return jsonb_build_object('changed',true,'status','released','credit_cents',r.amount_cents); else raise exception 'Unsupported credit finalization action'; end if;
end $$;
revoke all on function public.marketing_credit_reserve(uuid,uuid,uuid,bigint) from public,anon,authenticated; revoke all on function public.marketing_credit_bind_session(uuid,text) from public,anon,authenticated; revoke all on function public.marketing_credit_finalize(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.marketing_credit_reserve(uuid,uuid,uuid,bigint) to service_role; grant execute on function public.marketing_credit_bind_session(uuid,text) to service_role; grant execute on function public.marketing_credit_finalize(uuid,text,jsonb) to service_role;