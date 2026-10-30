-- Link pages: the Backoffice page /backoffice/link-pages and the public pages /links/<slug>.
--
-- What this adds
--   * link_pages: one row per link page (a "link in bio" page). The whole page (profile, links,
--     social icons, colors, fonts) is one checked JSON object in content, written only by
--     api/watchdog-link-pages.js after link-page-render.js cleanPage() checks it.
--   * link_page_hits: daily view and click counts per page. item '' is a page view, any other
--     value is the id of the link or social icon that was tapped.
--   * link_page_hit(): adds one view or click. Called by api/link-page.js with the service role.
--   * link-page-photos: public Storage bucket for profile, link and background photos.
--
-- Access
--   Backoffice operators (John and Heather) and team listing members can make pages. Every read
--   and write goes through the API with the service role. RLS is on and browsers get no direct
--   table access.

create table if not exists public.link_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_name text not null default '',
  published boolean not null default true,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists link_pages_owner_idx on public.link_pages (owner_user_id, created_at);

alter table public.link_pages enable row level security;
revoke all on table public.link_pages from public, anon, authenticated;

create table if not exists public.link_page_hits (
  page_id uuid not null references public.link_pages(id) on delete cascade,
  day date not null default ((now() at time zone 'America/New_York')::date),
  item text not null default '' check (item ~ '^[a-z0-9]{0,12}$'),
  hits integer not null default 0,
  primary key (page_id, day, item)
);

alter table public.link_page_hits enable row level security;
revoke all on table public.link_page_hits from public, anon, authenticated;

create or replace function public.link_page_hit(p_slug text, p_item text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page public.link_pages%rowtype;
  v_item text := coalesce(p_item, '');
begin
  if v_item !~ '^[a-z0-9]{0,12}$' then return; end if;
  select * into v_page from public.link_pages where slug = lower(p_slug) and published;
  if not found then return; end if;
  if v_item <> '' and not exists (
    select 1 from jsonb_array_elements(coalesce(v_page.content->'blocks', '[]'::jsonb)) b where b->>'id' = v_item
    union all
    select 1 from jsonb_array_elements(coalesce(v_page.content->'socials', '[]'::jsonb)) s where s->>'id' = v_item
  ) then return; end if;
  insert into public.link_page_hits (page_id, day, item, hits)
  values (v_page.id, (now() at time zone 'America/New_York')::date, v_item, 1)
  on conflict (page_id, day, item) do update set hits = public.link_page_hits.hits + 1;
end;
$$;

revoke all on function public.link_page_hit(text, text) from public, anon, authenticated;
grant execute on function public.link_page_hit(text, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('link-page-photos', 'link-page-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

comment on table public.link_pages is 'Link in bio pages made at /backoffice/link-pages, shown at /links/<slug>. Service role only.';
comment on table public.link_page_hits is 'Daily views (item = '''') and taps per link for link pages. Service role only.';
