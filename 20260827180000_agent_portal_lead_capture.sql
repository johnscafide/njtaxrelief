-- NJW-61: governed public agent-portal lead capture.
-- Public callers never write these tables directly; Vercel mediates intake with abuse controls.

create table if not exists public.agent_portal_leads (
  id uuid primary key default gen_random_uuid(),
  agent_user_id uuid not null references auth.users(id) on delete cascade,
  farm_property_id uuid null references public.agent_farm_properties(id) on delete set null,
  portal_slug text not null,
  full_name text not null,
  email text null,
  phone text null,
  address text not null,
  city text null,
  municipality text null,
  county text null,
  zip text null,
  pams_pin text null,
  contact_consent boolean not null default false,
  source text not null default 'portal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_portal_leads_slug_check check (portal_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$'),
  constraint agent_portal_leads_name_check check (char_length(full_name) between 1 and 120),
  constraint agent_portal_leads_address_check check (char_length(address) between 3 and 240),
  constraint agent_portal_leads_source_check check (source = 'portal'),
  constraint agent_portal_leads_contact_check check (nullif(trim(coalesce(email,'')),'') is not null or nullif(trim(coalesce(phone,'')),'') is not null),
  constraint agent_portal_leads_consent_check check (contact_consent = true)
);

create index if not exists agent_portal_leads_agent_created_idx
  on public.agent_portal_leads(agent_user_id, created_at desc);
create index if not exists agent_portal_leads_slug_created_idx
  on public.agent_portal_leads(portal_slug, created_at desc);

alter table public.agent_portal_leads enable row level security;
revoke all on public.agent_portal_leads from anon;
revoke insert on public.agent_portal_leads from authenticated;
grant select, update, delete on public.agent_portal_leads to authenticated;

create policy "agent portal leads are readable by owning agent"
  on public.agent_portal_leads for select to authenticated
  using (agent_user_id = auth.uid());
create policy "agent portal leads are editable by owning agent"
  on public.agent_portal_leads for update to authenticated
  using (agent_user_id = auth.uid())
  with check (agent_user_id = auth.uid());
create policy "agent portal leads are deletable by owning agent"
  on public.agent_portal_leads for delete to authenticated
  using (agent_user_id = auth.uid());

alter table public.agent_farm_properties drop constraint if exists agent_farm_properties_relationship_check;
alter table public.agent_farm_properties
  add constraint agent_farm_properties_relationship_check
  check (relationship = any (array['past_client'::text,'sphere'::text,'claimed_home'::text,'watchlist'::text,'farm'::text,'lead'::text]));

alter table public.agent_farm_properties drop constraint if exists agent_farm_properties_source_check;
alter table public.agent_farm_properties
  add constraint agent_farm_properties_source_check
  check (source = any (array['manual'::text,'csv'::text,'saved_property'::text,'portal'::text]));

create or replace function public.capture_agent_portal_lead(
  p_slug text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_address text,
  p_city text default null,
  p_municipality text default null,
  p_county text default null,
  p_zip text default null,
  p_pams_pin text default null,
  p_contact_consent boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug,'')));
  v_name text := trim(coalesce(p_full_name,''));
  v_email text := lower(trim(coalesce(p_email,'')));
  v_phone text := trim(coalesce(p_phone,''));
  v_address text := trim(coalesce(p_address,''));
  v_agent uuid;
  v_lead uuid;
  v_farm uuid;
begin
  if v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$' then
    raise exception 'invalid portal slug' using errcode = '22023';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  if char_length(v_address) < 3 or char_length(v_address) > 240 then
    raise exception 'invalid address' using errcode = '22023';
  end if;
  if v_email = '' and v_phone = '' then
    raise exception 'email or phone required' using errcode = '22023';
  end if;
  if not coalesce(p_contact_consent,false) then
    raise exception 'contact consent required' using errcode = '22023';
  end if;

  select p.id into v_agent
  from public.profiles p
  where p.vanity_slug = v_slug
    and (
      p.account_role = 'developer'
      or exists (
        select 1 from public.account_entitlements e
        where e.user_id = p.id
          and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')
          and lower(coalesce(e.billing_tier,e.plan_tier,'')) in ('agent','pro','pro_plus','pro+','teams')
      )
    )
  limit 1;

  if v_agent is null then
    return jsonb_build_object('accepted',false,'reason','portal_unavailable');
  end if;

  insert into public.agent_portal_leads(
    agent_user_id, portal_slug, full_name, email, phone, address, city,
    municipality, county, zip, pams_pin, contact_consent
  ) values (
    v_agent, v_slug, v_name, nullif(v_email,''), nullif(v_phone,''), v_address,
    nullif(trim(coalesce(p_city,'')),''), nullif(trim(coalesce(p_municipality,'')),''),
    nullif(trim(coalesce(p_county,'')),''), nullif(trim(coalesce(p_zip,'')),''),
    nullif(trim(coalesce(p_pams_pin,'')),''), true
  ) returning id into v_lead;

  insert into public.agent_farm_properties(
    user_id, pams_pin, contact_ref, address, municipality, county, city, zip,
    relationship, source, match_status
  ) values (
    v_agent, nullif(trim(coalesce(p_pams_pin,'')),''), 'portal:' || v_lead::text,
    v_address, nullif(trim(coalesce(p_municipality,'')),''), nullif(trim(coalesce(p_county,'')),''),
    nullif(trim(coalesce(p_city,'')),''), nullif(trim(coalesce(p_zip,'')),''),
    'lead', 'portal', case when nullif(trim(coalesce(p_pams_pin,'')),'') is null then 'pending' else 'matched' end
  ) returning id into v_farm;

  update public.agent_portal_leads set farm_property_id = v_farm, updated_at = now() where id = v_lead;

  insert into public.agent_funnel_events(user_id, opportunity_key, pams_pin, event_name, metadata)
  values (
    v_agent, 'portal:' || v_lead::text, nullif(trim(coalesce(p_pams_pin,'')),''),
    'portal_lead_captured', jsonb_build_object('source','portal','portal_slug',v_slug,'farm_property_id',v_farm)
  );

  return jsonb_build_object('accepted',true);
end;
$$;

revoke all on function public.capture_agent_portal_lead(text,text,text,text,text,text,text,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.capture_agent_portal_lead(text,text,text,text,text,text,text,text,text,text,boolean) to service_role;
