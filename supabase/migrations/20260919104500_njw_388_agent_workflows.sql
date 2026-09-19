-- NJW-388/389/390/391/392/393: connected Agent workflows.
-- Owner-scoped operational records; public open-house intake stays service-mediated.

create table if not exists public.agent_listing_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  address text not null check (char_length(address) between 3 and 240),
  city text,
  municipality text,
  county text,
  postal_code text,
  pams_pin text,
  client_label text,
  notes text,
  status text not null default 'draft' check (status in ('draft','ready','archived')),
  property_snapshot jsonb not null default '{}'::jsonb,
  checklist jsonb not null default '{}'::jsonb,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_listing_packs_user_updated_idx
  on public.agent_listing_packs(user_id, updated_at desc);
alter table public.agent_listing_packs enable row level security;
grant select, insert, update, delete on public.agent_listing_packs to authenticated;
drop policy if exists agent_listing_packs_owner_all on public.agent_listing_packs;
create policy agent_listing_packs_owner_all on public.agent_listing_packs
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.agent_buyer_shortlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  client_label text,
  status text not null default 'active' check (status in ('active','under_contract','archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_buyer_shortlists_user_updated_idx
  on public.agent_buyer_shortlists(user_id, updated_at desc);
alter table public.agent_buyer_shortlists enable row level security;
grant select, insert, update, delete on public.agent_buyer_shortlists to authenticated;
drop policy if exists agent_buyer_shortlists_owner_all on public.agent_buyer_shortlists;
create policy agent_buyer_shortlists_owner_all on public.agent_buyer_shortlists
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.agent_buyer_shortlist_properties (
  id uuid primary key default gen_random_uuid(),
  shortlist_id uuid not null references public.agent_buyer_shortlists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_property_id uuid references public.saved_properties(id) on delete set null,
  pams_pin text,
  address text not null check (char_length(address) between 3 and 240),
  town text,
  county text,
  assessed bigint,
  last_year_tax numeric,
  watchdog_value bigint,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(shortlist_id, address)
);
create index if not exists agent_buyer_shortlist_properties_list_idx
  on public.agent_buyer_shortlist_properties(shortlist_id, sort_order, created_at);
create index if not exists agent_buyer_shortlist_properties_user_idx
  on public.agent_buyer_shortlist_properties(user_id, updated_at desc);
alter table public.agent_buyer_shortlist_properties enable row level security;
grant select, insert, update, delete on public.agent_buyer_shortlist_properties to authenticated;
drop policy if exists agent_buyer_shortlist_properties_owner_all on public.agent_buyer_shortlist_properties;
create policy agent_buyer_shortlist_properties_owner_all on public.agent_buyer_shortlist_properties
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.agent_buyer_shortlists s
      where s.id = shortlist_id and s.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.agent_buyer_shortlists s
      where s.id = shortlist_id and s.user_id = (select auth.uid())
    )
  );

create table if not exists public.agent_open_houses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  address text not null check (char_length(address) between 3 and 240),
  city text,
  municipality text,
  county text,
  postal_code text,
  pams_pin text,
  event_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','open','ended','archived')),
  event_code text not null default substr(replace(gen_random_uuid()::text,'-',''),1,24)
    unique check (event_code ~ '^[a-f0-9]{24}$'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_open_houses_user_event_idx
  on public.agent_open_houses(user_id, event_at desc nulls last, created_at desc);
alter table public.agent_open_houses enable row level security;
grant select, insert, update, delete on public.agent_open_houses to authenticated;
drop policy if exists agent_open_houses_owner_all on public.agent_open_houses;
create policy agent_open_houses_owner_all on public.agent_open_houses
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.agent_portal_leads
  add column if not exists open_house_id uuid references public.agent_open_houses(id) on delete set null;

alter table public.agent_portal_leads drop constraint if exists agent_portal_leads_source_check;
alter table public.agent_portal_leads
  add constraint agent_portal_leads_source_check
  check (source in ('portal','open_house'));

alter table public.agent_farm_properties drop constraint if exists agent_farm_properties_source_check;
alter table public.agent_farm_properties
  add constraint agent_farm_properties_source_check
  check (source in ('manual','csv','saved_property','portal','open_house'));

alter table public.agent_funnel_events drop constraint if exists agent_funnel_events_event_name_check;
alter table public.agent_funnel_events
  add constraint agent_funnel_events_event_name_check
  check (event_name = any (array[
    'signal_viewed'::text,'evidence_opened'::text,'property_opened'::text,'watched'::text,
    'conversation_started'::text,'reply'::text,'valuation_request'::text,'appointment'::text,
    'listing'::text,'dismissed'::text,'portal_view'::text,'portal_lead_captured'::text,
    'open_house_lead_captured'::text
  ]));

alter table public.transaction_items add column if not exists client_visible boolean not null default false;
alter table public.transaction_documents add column if not exists client_visible boolean not null default false;

alter table public.transaction_professional_invites
  drop constraint if exists transaction_professional_invites_role_check;
alter table public.transaction_professional_invites
  add constraint transaction_professional_invites_role_check
  check (role in ('title','lender','tc','attorney','buyer','seller','other'));

alter table public.transaction_professional_memberships
  drop constraint if exists transaction_professional_memberships_role_check;
alter table public.transaction_professional_memberships
  add constraint transaction_professional_memberships_role_check
  check (role in ('title','lender','tc','attorney','buyer','seller','other'));

alter table public.transaction_documents
  drop constraint if exists transaction_documents_uploaded_by_role_check;
alter table public.transaction_documents
  add constraint transaction_documents_uploaded_by_role_check
  check (uploaded_by_role is null or uploaded_by_role in ('owner','title','lender','tc','attorney','buyer','seller','other'));

create or replace function public.capture_agent_open_house_lead(
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
  v_slug text;
  v_lead uuid;
  v_farm uuid;
begin
  if v_code !~ '^[a-f0-9]{24}$' then
    raise exception 'invalid open house code' using errcode = '22023';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  if v_email = '' and v_phone = '' then
    raise exception 'email or phone required' using errcode = '22023';
  end if;
  if not coalesce(p_contact_consent,false) then
    raise exception 'contact consent required' using errcode = '22023';
  end if;

  select * into v_event
  from public.agent_open_houses
  where event_code = v_code and status in ('scheduled','open')
  limit 1;

  if v_event.id is null then
    return jsonb_build_object('accepted',false,'reason','event_unavailable');
  end if;

  if not exists (
    select 1
    from public.profiles p
    left join public.account_entitlements e on e.user_id = p.id
    where p.id = v_event.user_id
      and (
        p.account_role = 'developer'
        or (
          e.subscription_status in ('active','trialing','past_due','cancel_scheduled')
          and lower(coalesce(e.billing_tier,e.plan_tier,'')) in ('agent','pro','pro_plus','pro+','teams')
        )
      )
  ) then
    return jsonb_build_object('accepted',false,'reason','agent_unavailable');
  end if;

  select vanity_slug into v_slug from public.profiles where id = v_event.user_id;
  v_slug := coalesce(nullif(v_slug,''),v_code);

  insert into public.agent_portal_leads(
    agent_user_id, portal_slug, full_name, email, phone, address, city,
    municipality, county, zip, pams_pin, contact_consent, source, open_house_id
  ) values (
    v_event.user_id, v_slug, v_name, nullif(v_email,''), nullif(v_phone,''),
    v_event.address, v_event.city, v_event.municipality, v_event.county,
    v_event.postal_code, v_event.pams_pin, true, 'open_house', v_event.id
  ) returning id into v_lead;

  insert into public.agent_farm_properties(
    user_id,pams_pin,contact_ref,address,municipality,county,city,zip,
    relationship,source,match_status
  ) values (
    v_event.user_id,v_event.pams_pin,'open-house:'||v_lead::text,v_event.address,
    v_event.municipality,v_event.county,v_event.city,v_event.postal_code,
    'lead','open_house',case when v_event.pams_pin is null then 'pending' else 'matched' end
  ) returning id into v_farm;

  update public.agent_portal_leads
  set farm_property_id=v_farm,updated_at=now()
  where id=v_lead;

  insert into public.agent_funnel_events(user_id,opportunity_key,pams_pin,event_name,metadata)
  values (
    v_event.user_id,'open-house:'||v_event.id::text,v_event.pams_pin,
    'open_house_lead_captured',
    jsonb_build_object('source','open_house','open_house_id',v_event.id,'farm_property_id',v_farm)
  );

  return jsonb_build_object('accepted',true,'open_house_id',v_event.id);
end;
$$;

revoke all on function public.capture_agent_open_house_lead(text,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.capture_agent_open_house_lead(text,text,text,text,boolean) to service_role;

comment on table public.agent_listing_packs is 'Private agent pre-listing workspaces keyed to a property.';
comment on table public.agent_buyer_shortlists is 'Private agent buyer comparison workspaces.';
comment on table public.agent_open_houses is 'Private agent open-house events; event_code is safe for public QR routing but not contact data.';
comment on column public.transaction_items.client_visible is 'Owner-controlled flag for Client Room exposure. Default false.';
comment on column public.transaction_documents.client_visible is 'Owner-controlled flag for Client Room exposure. Default false.';
