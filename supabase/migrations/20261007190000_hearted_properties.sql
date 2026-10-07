-- Hearted homes: the heart (Save) button on a property popup.
--
-- Separate from saved_properties (claimed home and watchlist, which feed the
-- dashboard). Each signed-in member keeps their own list, read and changed
-- only through RLS as themselves. Listed at /saved.

create table if not exists public.hearted_properties (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pams_pin text not null check (pams_pin ~ '^\d{4}_[0-9A-Za-z.&_-]{1,70}$'),
  address text check (address is null or length(address) <= 120),
  town text check (town is null or length(town) <= 80),
  zip text check (zip is null or zip ~ '^0[78][0-9]{3}$'),
  page_path text check (page_path is null or page_path ~ '^/nj/[a-z0-9-]{1,80}/[a-z0-9-]{1,120}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, pams_pin)
);
create index if not exists hearted_properties_user_created_idx
  on public.hearted_properties (user_id, created_at desc);

alter table public.hearted_properties enable row level security;
revoke all on public.hearted_properties from anon, authenticated;
grant select, insert, delete on public.hearted_properties to authenticated;

drop policy if exists "hearted properties select own" on public.hearted_properties;
drop policy if exists "hearted properties insert own" on public.hearted_properties;
drop policy if exists "hearted properties delete own" on public.hearted_properties;
create policy "hearted properties select own" on public.hearted_properties
  for select to authenticated using (user_id = auth.uid());
create policy "hearted properties insert own" on public.hearted_properties
  for insert to authenticated with check (user_id = auth.uid());
create policy "hearted properties delete own" on public.hearted_properties
  for delete to authenticated using (user_id = auth.uid());
