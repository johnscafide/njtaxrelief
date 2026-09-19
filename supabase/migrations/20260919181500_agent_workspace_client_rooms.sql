-- NJW-394 / NJW-397 / NJW-398: Agent workflow suite + client-safe transaction rooms.
create extension if not exists pgcrypto;

alter table public.agent_portal_leads add column if not exists open_house_id uuid null references public.agent_open_houses(id) on delete set null;
create index if not exists agent_portal_leads_open_house_created_idx on public.agent_portal_leads(open_house_id, created_at desc);

alter table public.transaction_items add column if not exists client_visible boolean not null default false;
alter table public.transaction_documents add column if not exists client_visible boolean not null default false;

create table if not exists public.transaction_client_rooms (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transaction_workspaces(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  client_label text null,
  message text null,
  active boolean not null default true,
  expires_at timestamptz not null default (now() + interval '180 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_client_rooms_label_check check (client_label is null or char_length(client_label) <= 160),
  constraint transaction_client_rooms_message_check check (message is null or char_length(message) <= 2000)
);
create index if not exists transaction_client_rooms_owner_updated_idx on public.transaction_client_rooms(owner_user_id, updated_at desc);
alter table public.transaction_client_rooms enable row level security;
revoke all on public.transaction_client_rooms from anon;
grant select, insert, update, delete on public.transaction_client_rooms to authenticated;
drop policy if exists "transaction client rooms owner all" on public.transaction_client_rooms;
create policy "transaction client rooms owner all" on public.transaction_client_rooms for all to authenticated
using (owner_user_id = (select auth.uid()))
with check (
  owner_user_id = (select auth.uid())
  and exists (
    select 1 from public.transaction_workspaces t
    where t.id = transaction_client_rooms.transaction_id
      and t.user_id = (select auth.uid())
  )
);

create or replace function public.rotate_transaction_client_room_v1(
  p_transaction_id uuid,
  p_client_label text default null,
  p_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
  v_hash text;
  v_room uuid;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='28000'; end if;
  if not exists(select 1 from public.transaction_workspaces where id=p_transaction_id and user_id=v_uid) then
    raise exception 'transaction not found' using errcode='42501';
  end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  v_hash := encode(digest(v_token,'sha256'),'hex');
  insert into public.transaction_client_rooms(transaction_id,owner_user_id,token_hash,client_label,message,active,expires_at,updated_at)
  values(p_transaction_id,v_uid,v_hash,nullif(trim(coalesce(p_client_label,'')),''),nullif(trim(coalesce(p_message,'')),''),true,now()+interval '180 days',now())
  on conflict(transaction_id) do update set
    token_hash=excluded.token_hash,
    client_label=excluded.client_label,
    message=excluded.message,
    active=true,
    expires_at=excluded.expires_at,
    updated_at=now()
  returning id into v_room;
  return jsonb_build_object('room_id',v_room,'token',v_token,'expires_at',now()+interval '180 days');
end;
$$;
revoke all on function public.rotate_transaction_client_room_v1(uuid,text,text) from public, anon;
grant execute on function public.rotate_transaction_client_room_v1(uuid,text,text) to authenticated;

create or replace function public.capture_agent_open_house_lead_v1(
  p_event_code text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_contact_consent boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := lower(trim(coalesce(p_event_code,'')));
  v_name text := trim(coalesce(p_full_name,''));
  v_email text := lower(trim(coalesce(p_email,'')));
  v_phone text := trim(coalesce(p_phone,''));
  v_event public.agent_open_houses%rowtype;
  v_lead uuid;
  v_farm uuid;
  v_slug text;
begin
  if v_code !~ '^[a-z0-9]{16,40}$' then raise exception 'invalid event code' using errcode='22023'; end if;
  if char_length(v_name)<1 or char_length(v_name)>120 then raise exception 'invalid name' using errcode='22023'; end if;
  if v_email='' and v_phone='' then raise exception 'email or phone required' using errcode='22023'; end if;
  if not coalesce(p_contact_consent,false) then raise exception 'contact consent required' using errcode='22023'; end if;

  select * into v_event from public.agent_open_houses
  where event_code=v_code and status in ('scheduled','live')
  limit 1;
  if v_event.id is null then return jsonb_build_object('accepted',false,'reason','event_unavailable'); end if;

  select coalesce(vanity_slug,'open-house') into v_slug from public.profiles where id=v_event.user_id;

  insert into public.agent_portal_leads(
    agent_user_id, portal_slug, full_name, email, phone, address, city,
    municipality, county, zip, pams_pin, contact_consent, source, open_house_id
  ) values (
    v_event.user_id, coalesce(v_slug,'open-house'), v_name, nullif(v_email,''), nullif(v_phone,''),
    v_event.address, v_event.city, v_event.municipality, v_event.county, v_event.postal_code,
    v_event.pams_pin, true, 'portal', v_event.id
  ) returning id into v_lead;

  insert into public.agent_farm_properties(
    user_id,pams_pin,contact_ref,address,municipality,county,city,zip,relationship,source,match_status
  ) values (
    v_event.user_id,v_event.pams_pin,'open-house:'||v_lead::text,v_event.address,v_event.municipality,
    v_event.county,v_event.city,v_event.postal_code,'lead','portal',
    case when v_event.pams_pin is null then 'pending' else 'matched' end
  ) returning id into v_farm;

  update public.agent_portal_leads set farm_property_id=v_farm,updated_at=now() where id=v_lead;
  return jsonb_build_object('accepted',true,'lead_id',v_lead);
end;
$$;
revoke all on function public.capture_agent_open_house_lead_v1(text,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.capture_agent_open_house_lead_v1(text,text,text,text,boolean) to service_role;
