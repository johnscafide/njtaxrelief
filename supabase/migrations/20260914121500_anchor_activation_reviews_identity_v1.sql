-- ANCHOR -> Watchdog activation: verified reviews, reusable identity sync and meaningful activation events.
-- Privacy boundary: no SSNs, income, disability answers, PDF contents or vault keys are stored here.

create table if not exists public.anchor_application_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  review_comment text check (review_comment is null or char_length(review_comment) <= 1200),
  public_comment_approved boolean not null default false,
  public_comment_approved_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, user_id),
  constraint anchor_application_reviews_application_owner_fk
    foreign key (application_id, user_id)
    references public.anchor_applications(id, user_id)
    on delete cascade
);

comment on table public.anchor_application_reviews is
  'Verified post-completion ANCHOR/PAS-1 helpfulness ratings. Comments remain private unless separately approved for public testimonial use.';

create index if not exists anchor_application_reviews_rating_idx
  on public.anchor_application_reviews(rating, submitted_at desc);
create index if not exists anchor_application_reviews_user_idx
  on public.anchor_application_reviews(user_id, submitted_at desc);

alter table public.anchor_application_reviews enable row level security;
revoke all on public.anchor_application_reviews from anon, authenticated;
grant select on public.anchor_application_reviews to authenticated;

drop policy if exists anchor_application_reviews_owner_select on public.anchor_application_reviews;
create policy anchor_application_reviews_owner_select on public.anchor_application_reviews
for select to authenticated using ((select auth.uid()) = user_id);

drop trigger if exists anchor_application_reviews_touch_updated_at on public.anchor_application_reviews;
create trigger anchor_application_reviews_touch_updated_at
before update on public.anchor_application_reviews
for each row execute function public.touch_updated_at();

create or replace function public.record_my_anchor_application_review_v1(
  p_application_id uuid,
  p_rating integer,
  p_review_comment text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_comment text := nullif(btrim(coalesce(p_review_comment,'')), '');
  v_row public.anchor_application_reviews%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'rating_must_be_1_to_5'; end if;
  if v_comment is not null and char_length(v_comment) > 1200 then raise exception 'review_comment_too_long'; end if;
  if not exists (
    select 1 from public.anchor_applications
    where id = p_application_id and user_id = v_uid and status = 'generated'
  ) then
    raise exception 'completed_application_required';
  end if;

  insert into public.anchor_application_reviews(application_id,user_id,rating,review_comment)
  values (p_application_id,v_uid,p_rating,v_comment)
  on conflict (application_id,user_id) do update set
    rating = excluded.rating,
    review_comment = excluded.review_comment,
    public_comment_approved = false,
    public_comment_approved_at = null,
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'rating', v_row.rating,
    'has_comment', v_row.review_comment is not null,
    'submitted_at', v_row.submitted_at,
    'updated_at', v_row.updated_at
  );
end;
$$;
revoke all on function public.record_my_anchor_application_review_v1(uuid,integer,text) from public, anon;
grant execute on function public.record_my_anchor_application_review_v1(uuid,integer,text) to authenticated;

create or replace function public.get_public_anchor_application_rating_v1()
returns table(average_rating numeric, rating_count bigint, five_star_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(round(avg(rating)::numeric, 1), 0::numeric) as average_rating,
    count(*)::bigint as rating_count,
    count(*) filter (where rating = 5)::bigint as five_star_count
  from public.anchor_application_reviews;
$$;
revoke all on function public.get_public_anchor_application_rating_v1() from public;
grant execute on function public.get_public_anchor_application_rating_v1() to anon, authenticated;

-- Keep the existing reusable-profile RPC signature, but also promote the safe identity
-- fields to the normal account profile. Null inputs no longer erase previously saved fields.
create or replace function public.set_my_reusable_profile_v1(
  p_application_id uuid default null,
  p_first_name text default null,
  p_middle_name text default null,
  p_last_name text default null,
  p_address text default null,
  p_city text default null,
  p_state text default null,
  p_zip text default null,
  p_municipality_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_tax_year smallint;
  v_source text := 'account_profile';
  v_first text := nullif(btrim(coalesce(p_first_name,'')), '');
  v_middle text := nullif(btrim(coalesce(p_middle_name,'')), '');
  v_last text := nullif(btrim(coalesce(p_last_name,'')), '');
  v_address text := nullif(btrim(coalesce(p_address,'')), '');
  v_city text := nullif(btrim(coalesce(p_city,'')), '');
  v_state text := upper(nullif(btrim(coalesce(p_state,'')), ''));
  v_zip text := nullif(btrim(coalesce(p_zip,'')), '');
  v_municipality text := nullif(regexp_replace(coalesce(p_municipality_code,''),'[^0-9]','','g'), '');
  v_name text;
  v_email text;
  v_now timestamptz := now();
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  if p_application_id is not null then
    select tax_year into v_tax_year
      from public.anchor_applications
      where id = p_application_id and user_id = v_uid;
    if not found then raise exception 'application_not_found'; end if;
    v_source := 'anchor_application';
  end if;

  if v_first is not null and char_length(v_first) > 80 then raise exception 'first_name_too_long'; end if;
  if v_middle is not null and char_length(v_middle) > 80 then raise exception 'middle_name_too_long'; end if;
  if v_last is not null and char_length(v_last) > 100 then raise exception 'last_name_too_long'; end if;
  if v_address is not null and char_length(v_address) > 180 then raise exception 'address_too_long'; end if;
  if v_city is not null and char_length(v_city) > 100 then raise exception 'city_too_long'; end if;
  if v_state is not null and v_state !~ '^[A-Z]{2}$' then raise exception 'invalid_state'; end if;
  if v_zip is not null and v_zip !~ '^[0-9]{5}(-[0-9]{4})?$' then raise exception 'invalid_zip'; end if;
  if v_municipality is not null and v_municipality !~ '^[0-9]{4}$' then raise exception 'invalid_municipality_code'; end if;

  v_name := nullif(btrim(concat_ws(' ', v_first, v_middle, v_last)), '');
  select email into v_email from auth.users where id = v_uid;

  insert into public.profiles (
    id, email, full_name, display_name,
    legal_first_name, legal_middle_name, legal_last_name,
    mailing_address, mailing_city, mailing_state, mailing_zip, municipality_code,
    reusable_profile_source, reusable_profile_source_application_id,
    reusable_profile_source_tax_year, reusable_profile_synced_at
  ) values (
    v_uid, v_email, v_name, v_name,
    v_first, v_middle, v_last,
    v_address, v_city, v_state, v_zip, v_municipality,
    v_source, p_application_id, v_tax_year, v_now
  )
  on conflict (id) do update set
    email = coalesce(excluded.email, profiles.email),
    full_name = coalesce(excluded.full_name, profiles.full_name),
    display_name = coalesce(nullif(profiles.display_name,''), excluded.display_name),
    legal_first_name = coalesce(excluded.legal_first_name, profiles.legal_first_name),
    legal_middle_name = coalesce(excluded.legal_middle_name, profiles.legal_middle_name),
    legal_last_name = coalesce(excluded.legal_last_name, profiles.legal_last_name),
    mailing_address = coalesce(excluded.mailing_address, profiles.mailing_address),
    mailing_city = coalesce(excluded.mailing_city, profiles.mailing_city),
    mailing_state = coalesce(excluded.mailing_state, profiles.mailing_state),
    mailing_zip = coalesce(excluded.mailing_zip, profiles.mailing_zip),
    municipality_code = coalesce(excluded.municipality_code, profiles.municipality_code),
    reusable_profile_source = excluded.reusable_profile_source,
    reusable_profile_source_application_id = excluded.reusable_profile_source_application_id,
    reusable_profile_source_tax_year = excluded.reusable_profile_source_tax_year,
    reusable_profile_synced_at = excluded.reusable_profile_synced_at;

  return jsonb_build_object(
    'ok', true,
    'source', v_source,
    'source_application_id', p_application_id,
    'source_tax_year', v_tax_year,
    'synced_at', v_now,
    'identity_synced', v_name is not null,
    'email_synced', v_email is not null
  );
end;
$$;
revoke all on function public.set_my_reusable_profile_v1(uuid,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.set_my_reusable_profile_v1(uuid,text,text,text,text,text,text,text,text) to authenticated;

-- Extend the ANCHOR completion event vocabulary with actions that represent real Watchdog activation.
alter table public.anchor_funnel_events drop constraint if exists anchor_funnel_events_event_name_check;
alter table public.anchor_funnel_events add constraint anchor_funnel_events_event_name_check check (event_name in (
  'application_started','progress_quarter','progress_half','progress_three_quarters',
  'review_reached','pdf_generated','pdf_saved_to_vault','download_clicked','print_clicked',
  'application_reopened','watchdog_cta_clicked','completion_feedback_saved','referral_share_opened',
  'application_review_saved','property_save_prompt_viewed','property_saved_from_anchor','monitoring_enabled'
));

create or replace function public.record_my_anchor_funnel_event(
  p_application_id uuid,
  p_event_name text
) returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_key text;
begin
  if v_uid is null then return false; end if;
  if p_event_name not in (
    'application_started','progress_quarter','progress_half','progress_three_quarters','review_reached',
    'pdf_generated','pdf_saved_to_vault','download_clicked','print_clicked','application_reopened',
    'watchdog_cta_clicked','completion_feedback_saved','referral_share_opened','application_review_saved',
    'property_save_prompt_viewed','property_saved_from_anchor','monitoring_enabled'
  ) then return false; end if;
  if not exists(select 1 from public.anchor_applications where id=p_application_id and user_id=v_uid) then return false; end if;
  v_key := v_uid::text||':'||p_application_id::text||':'||p_event_name;
  insert into public.anchor_funnel_events(application_id,user_id,event_name,event_key)
  values(p_application_id,v_uid,p_event_name,v_key)
  on conflict(event_key) do nothing;
  return found;
end;
$$;
revoke all on function public.record_my_anchor_funnel_event(uuid,text) from public, anon;
grant execute on function public.record_my_anchor_funnel_event(uuid,text) to authenticated;

-- Activation now requires meaningful product behavior. A passive page/tool load is not activation.
create or replace view public.analytics_daily_funnel as
with events as (
  select
    (created_at at time zone 'America/New_York')::date as event_date,
    visitor_id,
    session_id,
    event_name
  from public.watchdog_product_events
  where audience_class = 'external'
), daily as (
  select
    event_date,
    count(distinct visitor_id) as visitors,
    count(distinct session_id) as sessions,
    count(distinct visitor_id) filter (where event_name in (
      'property_lookup_succeeded','export_completed','property_saved','monitoring_enabled',
      'intelligence_action_completed','data_center_dataset_built','data_center_export_completed'
    )) as activated_visitors,
    count(distinct visitor_id) filter (where event_name='upgrade_cta_clicked') as upgrade_intent_visitors,
    count(distinct visitor_id) filter (where event_name='checkout_started') as checkout_visitors,
    count(distinct visitor_id) filter (where event_name='subscription_confirmed') as subscription_visitors
  from events
  group by event_date
)
select * from daily order by event_date desc;
