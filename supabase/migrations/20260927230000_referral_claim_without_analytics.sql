-- Invite credit without analytics consent.
--
-- Until now a referral was only credited through watchdog_signup_attribution,
-- which the browser writes only when the visitor accepts analytics cookies. An
-- invite link is a first-party, user-initiated feature, so the new account can
-- now claim the invite code it arrived with directly. Only the code is used:
-- no visitor, session or campaign tracking is involved.
--
-- Guardrails: the caller must be signed in, the account must be new (created
-- within the last 14 days), self-referral is refused, and each account can be
-- credited to at most one inviter (unique referred_user_id). Points use the
-- same idempotent event key as the analytics trigger, so a user credited by
-- both paths is only counted once.

create or replace function public.claim_my_watchdog_referral(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g'));
  v_created timestamptz;
  v_inviter uuid;
  v_inserted integer;
begin
  if v_uid is null then return false; end if;
  if v_code !~ '^[A-Z0-9]{10,16}$' then return false; end if;
  select created_at into v_created from auth.users where id = v_uid;
  if v_created is null or v_created < now() - interval '14 days' then return false; end if;
  select user_id into v_inviter from public.watchdog_referral_codes where referral_code = v_code limit 1;
  if v_inviter is null or v_inviter = v_uid then return false; end if;
  insert into public.watchdog_referral_conversions(inviter_user_id, referred_user_id, referral_code)
  values (v_inviter, v_uid, v_code)
  on conflict (referred_user_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    perform public.watchdog_award_points_internal(v_inviter, 'verified_referral', 5, 'verified_referral:' || v_uid::text, 'referral', v_uid::text);
  end if;
  return v_inserted > 0;
end;
$$;

revoke all on function public.claim_my_watchdog_referral(text) from public, anon;
grant execute on function public.claim_my_watchdog_referral(text) to authenticated;

comment on function public.claim_my_watchdog_referral(text) is
  'Credits the inviter for a new account that arrived with a Watchdog invite code. Consent-independent: uses only the invite code the user followed.';
