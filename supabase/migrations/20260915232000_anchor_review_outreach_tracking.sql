-- NJW-364: privacy-safe ANCHOR review outreach analytics.
-- URLs carry only random opaque tokens; email addresses and application details remain server-side.

create table if not exists public.anchor_review_outreach (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null,
  campaign_key text not null check (char_length(campaign_key) between 1 and 120),
  token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  prepared_at timestamptz not null default now(),
  sent_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer not null default 0 check (open_count >= 0),
  first_clicked_at timestamptz,
  last_clicked_at timestamptz,
  click_count integer not null default 0 check (click_count >= 0),
  last_click_rating smallint check (last_click_rating between 1 and 5),
  review_submitted_at timestamptz,
  review_id uuid references public.anchor_application_reviews(id) on delete set null,
  written_review boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, campaign_key),
  constraint anchor_review_outreach_application_owner_fk
    foreign key (application_id, user_id)
    references public.anchor_applications(id, user_id)
    on delete cascade
);

comment on table public.anchor_review_outreach is
  'Privacy-safe ANCHOR review outreach funnel. URLs carry only an opaque random token; recipient identity stays server-side.';

create index if not exists anchor_review_outreach_campaign_idx
  on public.anchor_review_outreach(campaign_key, prepared_at desc);
create index if not exists anchor_review_outreach_user_idx
  on public.anchor_review_outreach(user_id, prepared_at desc);
create index if not exists anchor_review_outreach_review_idx
  on public.anchor_review_outreach(review_submitted_at desc)
  where review_submitted_at is not null;

alter table public.anchor_review_outreach enable row level security;
revoke all on public.anchor_review_outreach from anon, authenticated;

drop trigger if exists anchor_review_outreach_touch_updated_at on public.anchor_review_outreach;
create trigger anchor_review_outreach_touch_updated_at
before update on public.anchor_review_outreach
for each row execute function public.touch_updated_at();

create or replace function public.record_anchor_review_outreach_event_v1(
  p_token_digest text,
  p_event text,
  p_rating integer default null
) returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if p_token_digest is null or p_token_digest !~ '^[0-9a-f]{64}$' then return false; end if;

  if p_event = 'open' then
    update public.anchor_review_outreach
       set first_opened_at = coalesce(first_opened_at, now()),
           last_opened_at = now(),
           open_count = open_count + 1
     where token_digest = p_token_digest;
    return found;
  elsif p_event = 'click' then
    if p_rating is not null and (p_rating < 1 or p_rating > 5) then return false; end if;
    update public.anchor_review_outreach
       set first_clicked_at = coalesce(first_clicked_at, now()),
           last_clicked_at = now(),
           click_count = click_count + 1,
           last_click_rating = p_rating
     where token_digest = p_token_digest;
    return found;
  end if;

  return false;
end;
$$;
revoke all on function public.record_anchor_review_outreach_event_v1(text,text,integer) from public, anon, authenticated;
grant execute on function public.record_anchor_review_outreach_event_v1(text,text,integer) to service_role;

create or replace function private.sync_anchor_review_outreach_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.anchor_review_outreach
     set review_submitted_at = coalesce(review_submitted_at, new.submitted_at),
         review_id = new.id,
         written_review = nullif(btrim(coalesce(new.review_comment, '')), '') is not null
   where application_id = new.application_id
     and user_id = new.user_id;
  return new;
end;
$$;
revoke all on function private.sync_anchor_review_outreach_v1() from public, anon, authenticated;

drop trigger if exists anchor_application_reviews_sync_outreach on public.anchor_application_reviews;
create trigger anchor_application_reviews_sync_outreach
after insert or update of rating, review_comment on public.anchor_application_reviews
for each row execute function private.sync_anchor_review_outreach_v1();
