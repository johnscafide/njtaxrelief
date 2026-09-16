-- Review integrity: require diagnostic feedback for ratings <= 3 and allow a reviewer to withdraw a mistaken rating.

alter table public.anchor_application_reviews
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdrawal_reason text;

alter table public.anchor_application_reviews
  drop constraint if exists anchor_application_reviews_withdrawal_reason_len;
alter table public.anchor_application_reviews
  add constraint anchor_application_reviews_withdrawal_reason_len
  check (withdrawal_reason is null or char_length(withdrawal_reason) <= 240);

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
  if p_rating <= 3 and v_comment is null then raise exception 'feedback_required_for_rating_3_or_below'; end if;
  if v_comment is not null and char_length(v_comment) > 1200 then raise exception 'review_comment_too_long'; end if;
  if not exists (
    select 1 from public.anchor_applications
    where id = p_application_id and user_id = v_uid and status = 'generated'
  ) then
    raise exception 'completed_application_required';
  end if;

  insert into public.anchor_application_reviews(
    application_id,user_id,rating,review_comment,withdrawn_at,withdrawal_reason
  )
  values (p_application_id,v_uid,p_rating,v_comment,null,null)
  on conflict (application_id,user_id) do update set
    rating = excluded.rating,
    review_comment = excluded.review_comment,
    public_comment_approved = false,
    public_comment_approved_at = null,
    withdrawn_at = null,
    withdrawal_reason = null,
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

create or replace function public.withdraw_my_anchor_application_review_v1(
  p_application_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_changed integer := 0;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  update public.anchor_application_reviews
  set withdrawn_at = now(),
      withdrawal_reason = 'reviewer_requested',
      public_comment_approved = false,
      public_comment_approved_at = null,
      updated_at = now()
  where application_id = p_application_id
    and user_id = v_uid
    and withdrawn_at is null;
  get diagnostics v_changed = row_count;

  return jsonb_build_object('ok', true, 'withdrawn', v_changed > 0);
end;
$$;
revoke all on function public.withdraw_my_anchor_application_review_v1(uuid) from public, anon;
grant execute on function public.withdraw_my_anchor_application_review_v1(uuid) to authenticated;

create or replace function public.refresh_anchor_application_rating_public_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.anchor_application_rating_public(
    singleton, average_rating, rating_count, five_star_count, updated_at
  )
  select
    true,
    coalesce(round(avg(rating)::numeric, 1), 0::numeric),
    count(*)::bigint,
    count(*) filter (where rating = 5)::bigint,
    now()
  from public.anchor_application_reviews
  where withdrawn_at is null
  on conflict (singleton) do update set
    average_rating = excluded.average_rating,
    rating_count = excluded.rating_count,
    five_star_count = excluded.five_star_count,
    updated_at = excluded.updated_at;
  return null;
end;
$$;
revoke all on function public.refresh_anchor_application_rating_public_v1() from public, anon, authenticated;

insert into public.anchor_application_rating_public(singleton, average_rating, rating_count, five_star_count, updated_at)
select
  true,
  coalesce(round(avg(rating)::numeric, 1), 0::numeric),
  count(*)::bigint,
  count(*) filter (where rating = 5)::bigint,
  now()
from public.anchor_application_reviews
where withdrawn_at is null
on conflict (singleton) do update set
  average_rating = excluded.average_rating,
  rating_count = excluded.rating_count,
  five_star_count = excluded.five_star_count,
  updated_at = excluded.updated_at;
