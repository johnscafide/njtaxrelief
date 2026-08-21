create table if not exists public.marketing_email_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null default '',
  preview_text text not null default '',
  content text not null default '',
  from_email text,
  target_definition jsonb not null default '{}'::jsonb,
  template_key text,
  brand_profile_id uuid references public.marketing_brand_profiles(id) on delete set null,
  structured_content jsonb not null default '{}'::jsonb,
  experiment jsonb not null default '{}'::jsonb,
  source_broadcast_id uuid references public.marketing_email_broadcasts(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','archived','sent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_email_drafts_user_updated_idx on public.marketing_email_drafts(user_id, updated_at desc);

create table if not exists public.marketing_email_draft_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_id uuid not null references public.marketing_email_drafts(id) on delete cascade,
  snapshot jsonb not null,
  reason text not null default 'autosave',
  created_at timestamptz not null default now()
);
create index if not exists marketing_email_draft_versions_draft_created_idx on public.marketing_email_draft_versions(draft_id, created_at desc);
create index if not exists marketing_email_draft_versions_user_created_idx on public.marketing_email_draft_versions(user_id, created_at desc);

create table if not exists public.marketing_email_snippets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'custom' check (kind in ('custom','signature','contact','disclaimer','social','cta')),
  html_content text not null default '',
  text_content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_email_snippets_user_updated_idx on public.marketing_email_snippets(user_id, updated_at desc);

alter table public.marketing_email_drafts enable row level security;
alter table public.marketing_email_draft_versions enable row level security;
alter table public.marketing_email_snippets enable row level security;

grant select, insert, update, delete on public.marketing_email_drafts to authenticated;
grant select, insert, update, delete on public.marketing_email_draft_versions to authenticated;
grant select, insert, update, delete on public.marketing_email_snippets to authenticated;

create policy marketing_email_drafts_owner_beta on public.marketing_email_drafts for all to authenticated
using (user_id = (select auth.uid()) and (select private.marketing_email_beta_enabled()))
with check (user_id = (select auth.uid()) and (select private.marketing_email_beta_enabled()));

create policy marketing_email_draft_versions_owner_beta on public.marketing_email_draft_versions for all to authenticated
using (user_id = (select auth.uid()) and (select private.marketing_email_beta_enabled()))
with check (user_id = (select auth.uid()) and (select private.marketing_email_beta_enabled()));

create policy marketing_email_snippets_owner_beta on public.marketing_email_snippets for all to authenticated
using (user_id = (select auth.uid()) and (select private.marketing_email_beta_enabled()))
with check (user_id = (select auth.uid()) and (select private.marketing_email_beta_enabled()));
