-- Support requests: replace the never-deployed submit-support-request Edge Function
-- with a database function. Production is at the Edge Function count cap, and the
-- /support form has never been able to reach the function (support_requests had 0 rows).
--
-- The form offers "Plan or access" (access) and "Other" (other), which the original
-- category check rejected, so those values are added here. Existing values are kept.

alter table public.support_requests drop constraint if exists support_requests_category_check;
alter table public.support_requests add constraint support_requests_category_check
  check (category = any (array['account','access','billing','data','technical','privacy','feature','other']));

create or replace function public.submit_support_request(
  p_category text,
  p_priority text,
  p_subject text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_category text := lower(trim(coalesce(p_category, 'other')));
  v_priority text := lower(trim(coalesce(p_priority, 'normal')));
  v_subject text := left(trim(coalesce(p_subject, '')), 140);
  v_message text := left(trim(coalesce(p_message, '')), 5000);
  v_recent integer;
  v_row public.support_requests;
begin
  if v_user is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if v_category not in ('account', 'access', 'data', 'technical', 'billing', 'other') then
    raise exception 'Invalid support category' using errcode = '22023';
  end if;
  if v_priority not in ('normal', 'high') then
    raise exception 'Invalid support priority' using errcode = '22023';
  end if;
  if char_length(v_subject) < 4 or char_length(v_message) < 10 then
    raise exception 'Please include a subject and enough detail to investigate' using errcode = '22023';
  end if;

  select count(*) into v_recent
  from public.support_requests
  where user_id = v_user and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'Too many support requests in the last hour. Please try again later.' using errcode = 'P0001';
  end if;

  insert into public.support_requests (user_id, category, priority, subject, message, status)
  values (v_user, v_category, v_priority, v_subject, v_message, 'open')
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'created_at', v_row.created_at);
end;
$$;

revoke all on function public.submit_support_request(text, text, text, text) from public, anon;
grant execute on function public.submit_support_request(text, text, text, text) to authenticated;
