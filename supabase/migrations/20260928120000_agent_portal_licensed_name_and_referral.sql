-- Public agent portal (/agent/<slug>): show the agent's name exactly as the
-- New Jersey Real Estate Commission lists it (from the verified NJDOBI record),
-- mark the license as verified, and hand the page the agent's own referral code
-- so pros who build their own page from it are credited to that agent.

-- NJDOBI lists names as "LAST,FIRST MIDDLE [SUFFIX]". Turn that into
-- "First M. Last Suffix" for display.
create or replace function public.watchdog_format_licensee_name(p_raw text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_raw text := btrim(regexp_replace(coalesce(p_raw, ''), '\s+', ' ', 'g'));
  v_last text;
  v_rest text;
  v_tok text;
  v_up text;
  v_names text[] := '{}';
  v_suffix text[] := '{}';
  v_word text;
begin
  if v_raw = '' then return null; end if;
  if position(',' in v_raw) > 0 then
    v_last := btrim(split_part(v_raw, ',', 1));
    v_rest := btrim(substr(v_raw, position(',' in v_raw) + 1));
  else
    v_last := '';
    v_rest := v_raw;
  end if;

  foreach v_tok in array string_to_array(btrim(v_rest || ' ' || v_last), ' ') loop
    continue when v_tok is null or v_tok = '';
    v_up := upper(replace(v_tok, '.', ''));
    if v_up in ('JR', 'SR') then
      v_suffix := v_suffix || (initcap(v_up) || '.');
    elsif v_up in ('II', 'III', 'IV') then
      v_suffix := v_suffix || v_up;
    elsif char_length(v_up) = 1 then
      v_names := v_names || (v_up || '.');
    else
      -- initcap() does not treat an apostrophe as a word break (O'Brien).
      v_word := array_to_string(array(select initcap(x) from unnest(string_to_array(v_tok, '''')) x), '''');
      if v_word ~ '^Mc[a-z]' then
        v_word := 'Mc' || upper(substr(v_word, 3, 1)) || substr(v_word, 4);
      end if;
      v_names := v_names || v_word;
    end if;
  end loop;

  return nullif(array_to_string(v_names || v_suffix, ' '), '');
end;
$$;

revoke all on function public.watchdog_format_licensee_name(text) from public, anon, authenticated;
grant execute on function public.watchdog_format_licensee_name(text) to service_role;

-- Same boundary as before (only approved marketing fields, only while the
-- Agent+ entitlement is active), plus:
--   licensed_name     official NJDOBI name, only while the verification is current
--   license_verified  true only for a current, verified NJDOBI match
--   referral_code     the agent's member invite code (created on first view)
create or replace function public.get_public_agent_portal_profile(p_slug text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_verified boolean := false;
  v_licensee text;
  v_license text;
  v_code text;
  v_try integer := 0;
begin
  select p.* into v_profile
  from public.profiles p
  where p.vanity_slug = lower(trim(p_slug))
    and (
      p.account_role = 'developer'
      or exists (
        select 1
        from public.account_entitlements e
        where e.user_id = p.id
          and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')
          and lower(coalesce(e.billing_tier,e.plan_tier,'')) in ('agent','pro','pro_plus','pro+','teams')
      )
    )
  limit 1;
  if v_profile.id is null then return null; end if;

  select true, v.licensee_name, v.license_number
    into v_verified, v_licensee, v_license
  from public.professional_license_verifications v
  where v.user_id = v_profile.id
    and v.verification_status = 'verified'
    and v.verified_professional
    and (v.verification_due_at is null or v.verification_due_at > now())
  limit 1;
  v_verified := coalesce(v_verified, false);

  select referral_code into v_code from public.watchdog_referral_codes where user_id = v_profile.id;
  while v_code is null and v_try < 5 loop
    v_try := v_try + 1;
    begin
      insert into public.watchdog_referral_codes(user_id, referral_code)
      values (v_profile.id, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)))
      returning referral_code into v_code;
    exception when unique_violation then
      select referral_code into v_code from public.watchdog_referral_codes where user_id = v_profile.id;
    end;
  end loop;

  return jsonb_build_object(
    'slug', v_profile.vanity_slug,
    'display_name', nullif(trim(coalesce(v_profile.display_name, v_profile.full_name, '')), ''),
    'licensed_name', case when v_verified then public.watchdog_format_licensee_name(v_licensee) end,
    'license_verified', v_verified,
    'photo_url', nullif(trim(coalesce(v_profile.pro_agent->>'headshot_url', v_profile.photo_url, v_profile.avatar_url, '')), ''),
    'brokerage_name', nullif(trim(coalesce(v_profile.pro_agent->>'brokerage_name', '')), ''),
    'license_number', coalesce(case when v_verified then nullif(trim(v_license), '') end, nullif(trim(coalesce(v_profile.pro_agent->>'license_number', '')), '')),
    'business_phone', nullif(trim(coalesce(v_profile.pro_agent->>'business_phone', '')), ''),
    'business_email', nullif(trim(coalesce(v_profile.pro_agent->>'business_email', '')), ''),
    'brokerage_logo_url', nullif(trim(coalesce(v_profile.pro_agent->>'brokerage_logo_url', '')), ''),
    'brokerage_disclosure', nullif(trim(coalesce(v_profile.pro_agent->>'brokerage_disclosure', '')), ''),
    'referral_code', v_code
  );
end;
$$;

comment on function public.get_public_agent_portal_profile(text) is
  'Service-only resolver for NJW-61 public agent portals. Returns only approved agent marketing fields, the NJDOBI-verified licensee name while verification is current, and the agent''s member referral code, and only while the server-owned Agent+ entitlement is active.';

revoke all on function public.get_public_agent_portal_profile(text) from public, anon, authenticated;
grant execute on function public.get_public_agent_portal_profile(text) to service_role;
