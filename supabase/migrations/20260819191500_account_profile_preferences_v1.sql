-- Editable Watchdog profile preferences v1
-- Keeps onboarding/profile context live after activation while preserving housing-targeting guardrails.

create or replace function public.update_my_watchdog_profile_v1(payload jsonb)
returns table (updated boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_email text;
  v_persona text;
  v_profession text;
  v_home_status text;
  v_age_band text;
  v_income_band text;
  v_household_size smallint;
  v_zip text;
  v_time_horizon text;
  v_years text;
  v_volume text;
  v_markets text[] := '{}';
  v_goals text[] := '{}';
  v_property_types text[] := '{}';
  v_priorities text[] := '{}';
  v_intel boolean := true;
  v_snapshot jsonb;
  v_pref_profession text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'Invalid profile payload'; end if;
  if pg_column_size(payload) > 32768 then raise exception 'Profile payload is too large'; end if;
  if not exists (
    select 1 from public.watchdog_onboarding_profiles
    where user_id=v_uid and status='complete' and completed_at is not null
  ) then raise exception 'Complete Watchdog onboarding before editing this profile'; end if;

  v_email := lower(btrim(coalesce(payload->>'contact_email','')));
  v_persona := nullif(btrim(payload->>'persona'),'');
  v_profession := nullif(btrim(payload->>'primary_profession'),'');
  v_home_status := nullif(btrim(payload->>'home_status'),'');
  v_age_band := nullif(btrim(payload->>'age_band'),'');
  v_income_band := nullif(btrim(payload->>'household_income_band'),'');
  v_zip := nullif(regexp_replace(coalesce(payload->>'location_zip',''),'[^0-9]','','g'),'');
  v_time_horizon := nullif(btrim(payload->>'time_horizon'),'');
  v_years := nullif(btrim(payload->>'professional_years_band'),'');
  v_volume := nullif(btrim(payload->>'professional_volume_band'),'');
  if payload ? 'intelligence_personalization' then
    v_intel := coalesce((payload->>'intelligence_personalization')::boolean,true);
  end if;

  if char_length(v_email) < 3 or char_length(v_email) > 254 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid contact email';
  end if;
  if v_persona not in ('homeowner','renter','professional','both','planning_to_buy','investor') then raise exception 'Choose how you use Watchdog'; end if;
  if v_profession is not null and v_profession not in (
    'real_estate','attorney','mortgage_lending','investor','appraiser','contractor',
    'property_tax_professional','title_closing','accountant','insurance','property_manager','other'
  ) then raise exception 'Invalid professional role'; end if;
  if v_persona in ('professional','both') and v_profession is null then raise exception 'Professional role is required'; end if;
  if v_home_status is not null and v_home_status not in ('own','rent','own_and_invest','rent_and_invest','planning_to_buy','other') then raise exception 'Invalid home status'; end if;
  if v_age_band is not null and v_age_band not in ('18_24','25_34','35_44','45_54','55_64','65_74','75_plus','prefer_not') then raise exception 'Invalid age band'; end if;
  if v_income_band is not null and v_income_band not in ('under_50k','50_99k','100_149k','150_249k','250k_plus','prefer_not') then raise exception 'Invalid income band'; end if;
  if v_time_horizon is not null and v_time_horizon not in ('now','0_3_months','3_6_months','6_12_months','12_plus_months','researching') then raise exception 'Invalid time horizon'; end if;
  if v_years is not null and v_years not in ('new','1_3','4_7','8_15','16_plus') then raise exception 'Invalid experience band'; end if;
  if v_volume is not null and v_volume not in ('under_5','5_14','15_29','30_59','60_plus','not_applicable') then raise exception 'Invalid volume band'; end if;
  if v_zip is not null and v_zip !~ '^[0-9]{5}$' then raise exception 'Enter a five digit ZIP code'; end if;

  if nullif(payload->>'household_size','') is not null then
    begin
      v_household_size := (payload->>'household_size')::smallint;
    exception when others then raise exception 'Invalid household size'; end;
    if v_household_size < 1 or v_household_size > 20 then raise exception 'Invalid household size'; end if;
  end if;

  select coalesce(array_agg(left(btrim(value),80)) filter (where btrim(value)<>''),'{}'::text[])
    into v_markets from jsonb_array_elements_text(coalesce(payload->'markets','[]'::jsonb));
  select coalesce(array_agg(left(btrim(value),80)) filter (where btrim(value)<>''),'{}'::text[])
    into v_goals from jsonb_array_elements_text(coalesce(payload->'goals','[]'::jsonb));
  select coalesce(array_agg(left(btrim(value),80)) filter (where btrim(value)<>''),'{}'::text[])
    into v_property_types from jsonb_array_elements_text(coalesce(payload->'property_types','[]'::jsonb));
  select coalesce(array_agg(left(btrim(value),80)) filter (where btrim(value)<>''),'{}'::text[])
    into v_priorities from jsonb_array_elements_text(coalesce(payload->'professional_priorities','[]'::jsonb));

  if cardinality(v_markets)>20 or cardinality(v_goals)>20 or cardinality(v_property_types)>20 or cardinality(v_priorities)>20 then
    raise exception 'Too many profile selections';
  end if;

  v_snapshot := jsonb_build_object(
    'contact_email',v_email,
    'persona',v_persona,
    'primary_profession',v_profession,
    'home_status',v_home_status,
    'age_band',v_age_band,
    'household_income_band',v_income_band,
    'household_size',v_household_size,
    'location_zip',v_zip,
    'markets',to_jsonb(v_markets),
    'goals',to_jsonb(v_goals),
    'property_types',to_jsonb(v_property_types),
    'time_horizon',v_time_horizon,
    'professional_years_band',v_years,
    'professional_volume_band',v_volume,
    'professional_priorities',to_jsonb(v_priorities),
    'intelligence_personalization',v_intel,
    'source_class','user_confirmed',
    'profile_updated_at',v_now
  );

  update public.watchdog_onboarding_profiles set
    contact_email=v_email,
    contact_email_confirmed_at=v_now,
    persona=v_persona,
    primary_profession=v_profession,
    home_status=v_home_status,
    age_band=v_age_band,
    household_income_band=v_income_band,
    household_size=v_household_size,
    location_zip=v_zip,
    markets=v_markets,
    goals=v_goals,
    property_types=v_property_types,
    time_horizon=v_time_horizon,
    professional_years_band=v_years,
    professional_volume_band=v_volume,
    professional_priorities=v_priorities,
    intelligence_personalization=v_intel,
    responses=coalesce(responses,'{}'::jsonb) || v_snapshot,
    updated_at=v_now
  where user_id=v_uid;

  v_pref_profession := case
    when v_profession in ('real_estate','attorney','mortgage_lending','investor','appraiser','contractor','property_tax_professional','title_closing','other') then v_profession
    else 'homeowner'
  end;
  insert into public.professional_preferences (user_id,profession,onboarding_complete,updated_at)
  values (v_uid,v_pref_profession,true,v_now)
  on conflict (user_id) do update set profession=excluded.profession,onboarding_complete=true,updated_at=excluded.updated_at;

  -- Only operational/member context is eligible for Intelligence personalization.
  -- Contact email, age, income and household size intentionally stay outside this block.
  if v_intel then
    insert into public.intelligence_assumptions (user_id,objective,profession,assumptions,updated_at)
    values (
      v_uid,'onboarding',coalesce(v_profession,v_persona),
      jsonb_build_object(
        'fact_class','user_confirmed',
        'source','watchdog_account_profile_v1',
        'allowed_use','member_personalization_not_housing_targeting',
        'persona',v_persona,
        'home_status',v_home_status,
        'location_zip',v_zip,
        'markets',to_jsonb(v_markets),
        'goals',to_jsonb(v_goals),
        'property_types',to_jsonb(v_property_types),
        'time_horizon',v_time_horizon,
        'professional_years_band',v_years,
        'professional_volume_band',v_volume,
        'professional_priorities',to_jsonb(v_priorities)
      ),v_now
    ) on conflict (user_id,objective) do update set
      profession=excluded.profession,
      assumptions=excluded.assumptions,
      updated_at=excluded.updated_at;
  else
    delete from public.intelligence_assumptions where user_id=v_uid and objective='onboarding';
  end if;

  return query select true,v_now;
end;
$$;

revoke all on function public.update_my_watchdog_profile_v1(jsonb) from public, anon;
grant execute on function public.update_my_watchdog_profile_v1(jsonb) to authenticated;
