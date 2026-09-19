-- NJW-394: source-control the private Agent workflow tables already promoted to production.
create table if not exists public.agent_listing_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  address text not null,
  city text null,
  municipality text null,
  county text null,
  postal_code text null,
  pams_pin text null,
  client_label text null,
  notes text null,
  status text not null default 'draft',
  property_snapshot jsonb not null default '{}'::jsonb,
  checklist jsonb not null default '{}'::jsonb,
  last_opened_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_listing_packs_owner_updated_idx on public.agent_listing_packs(user_id,updated_at desc);

create table if not exists public.agent_buyer_shortlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  client_label text null,
  status text not null default 'active',
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_buyer_shortlists_owner_updated_idx on public.agent_buyer_shortlists(user_id,updated_at desc);

create table if not exists public.agent_buyer_shortlist_properties (
  id uuid primary key default gen_random_uuid(),
  shortlist_id uuid not null references public.agent_buyer_shortlists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_property_id uuid null,
  pams_pin text null,
  address text not null,
  town text null,
  county text null,
  assessed bigint null,
  last_year_tax numeric null,
  watchdog_value bigint null,
  notes text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_buyer_shortlist_properties_shortlist_idx on public.agent_buyer_shortlist_properties(shortlist_id,sort_order,created_at);

create table if not exists public.agent_open_houses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text null,
  address text not null,
  city text null,
  municipality text null,
  county text null,
  postal_code text null,
  pams_pin text null,
  event_at timestamptz null,
  status text not null default 'scheduled',
  event_code text not null default substr(replace(gen_random_uuid()::text,'-',''),1,24),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agent_open_houses_event_code_uidx on public.agent_open_houses(event_code);
create index if not exists agent_open_houses_owner_event_idx on public.agent_open_houses(user_id,event_at desc);

alter table public.agent_listing_packs enable row level security;
alter table public.agent_buyer_shortlists enable row level security;
alter table public.agent_buyer_shortlist_properties enable row level security;
alter table public.agent_open_houses enable row level security;

revoke all on public.agent_listing_packs,public.agent_buyer_shortlists,public.agent_buyer_shortlist_properties,public.agent_open_houses from anon;
grant select,insert,update,delete on public.agent_listing_packs,public.agent_buyer_shortlists,public.agent_buyer_shortlist_properties,public.agent_open_houses to authenticated;

drop policy if exists agent_listing_packs_owner_all on public.agent_listing_packs;
create policy agent_listing_packs_owner_all on public.agent_listing_packs for all to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

drop policy if exists agent_buyer_shortlists_owner_all on public.agent_buyer_shortlists;
create policy agent_buyer_shortlists_owner_all on public.agent_buyer_shortlists for all to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

drop policy if exists agent_buyer_shortlist_properties_owner_all on public.agent_buyer_shortlist_properties;
create policy agent_buyer_shortlist_properties_owner_all on public.agent_buyer_shortlist_properties for all to authenticated
using (
  user_id=(select auth.uid()) and exists(
    select 1 from public.agent_buyer_shortlists s where s.id=shortlist_id and s.user_id=(select auth.uid())
  )
) with check (
  user_id=(select auth.uid()) and exists(
    select 1 from public.agent_buyer_shortlists s where s.id=shortlist_id and s.user_id=(select auth.uid())
  )
);

drop policy if exists agent_open_houses_owner_all on public.agent_open_houses;
create policy agent_open_houses_owner_all on public.agent_open_houses for all to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
