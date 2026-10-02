-- Local reporters' stories for the Watchdog home feed.
-- Filled hourly by property/scripts/sync_local_news.mjs (service role) and read
-- by api/watchdog-home-feed.js (service role). Each row is a reporter's own
-- headline, short excerpt, featured photo and link; the story stays on their
-- site. Set hidden = true to pull a single story from the feed at once; the
-- sync never overwrites it.
create table if not exists public.local_news_items (
  id bigint generated always as identity primary key,
  source_id text not null,
  external_id text not null,
  title text not null,
  url text not null,
  published_at timestamptz not null,
  excerpt text,
  image_url text,
  image_alt text,
  video_id text,
  town_codes text[] not null default '{}',
  address_keys text[] not null default '{}',
  hidden boolean not null default false,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint local_news_items_source_external_key unique (source_id, external_id),
  constraint local_news_items_url_https check (url like 'https://%'),
  constraint local_news_items_image_https check (image_url is null or image_url like 'https://%')
);

comment on table public.local_news_items is
  'Local reporters'' stories (headline, excerpt, photo, link) shown in the Watchdog home feed. Synced hourly; hidden=true removes a story.';

create index if not exists local_news_items_town_codes_idx
  on public.local_news_items using gin (town_codes);
create index if not exists local_news_items_published_idx
  on public.local_news_items (published_at desc);

alter table public.local_news_items enable row level security;
revoke all on public.local_news_items from anon, authenticated;
