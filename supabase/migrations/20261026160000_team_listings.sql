-- Team listings: the Backoffice page /backoffice/team-listings and the public page /listings.
--
-- What this adds
--   * team_listing_members: Watchdog accounts the owner added by email. A member can open
--     /backoffice/team-listings and add or change their own listings. Nothing else in Backoffice.
--   * team_listings: one row per listing. Only public fields are kept (no agent remarks,
--     showing instructions, lockbox, owner or compensation fields from the MLS printout).
--   * team-listing-photos: public Storage bucket for listing photos (JPEG/PNG/WebP, 10 MB max).
--
-- Access
--   Every read and write goes through api/watchdog-team-listings.js (Backoffice) and
--   api/team-listings-page.js (public page) with the service role. RLS is on and browsers get
--   no direct table access.

create table if not exists public.team_listing_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null check (length(display_name) between 1 and 120),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.team_listing_members enable row level security;
revoke all on table public.team_listing_members from public, anon, authenticated;

create table if not exists public.team_listings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,120}$'),
  mls_number text check (mls_number is null or mls_number ~ '^[A-Z0-9-]{4,20}$'),
  status text not null default 'active' check (status in ('coming_soon', 'active', 'under_contract', 'sold', 'off_market')),
  address text not null check (length(address) between 3 and 200),
  unit text,
  city text not null check (length(city) between 1 and 80),
  state text not null default 'NJ',
  zip text check (zip is null or zip ~ '^[0-9]{5}$'),
  county text,
  price integer check (price is null or price between 0 and 1000000000),
  beds smallint check (beds is null or beds between 0 and 99),
  baths_full smallint check (baths_full is null or baths_full between 0 and 99),
  baths_half smallint check (baths_half is null or baths_half between 0 and 99),
  sqft integer check (sqft is null or sqft between 0 and 1000000),
  lot text,
  year_built smallint check (year_built is null or year_built between 1600 and 2100),
  property_type text,
  style text,
  annual_tax integer check (annual_tax is null or annual_tax between 0 and 10000000),
  school_district text,
  subdivision text,
  remarks text check (remarks is null or length(remarks) <= 6000),
  features jsonb not null default '[]'::jsonb,
  photos jsonb not null default '[]'::jsonb,
  list_date date,
  agent_user_id uuid references auth.users(id) on delete set null,
  agent_name text,
  brokerage text not null default 'Opus Elite Real Estate',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_listings_public_idx on public.team_listings (published, status, created_at desc);
create unique index if not exists team_listings_mls_idx on public.team_listings (mls_number) where mls_number is not null;

alter table public.team_listings enable row level security;
revoke all on table public.team_listings from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-listing-photos', 'team-listing-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

comment on table public.team_listing_members is 'Watchdog accounts allowed to add team listings at /backoffice/team-listings. Service role only.';
comment on table public.team_listings is 'Team listings shown at www.watchdogindex.com/listings. Public MLS fields only. Service role only.';
