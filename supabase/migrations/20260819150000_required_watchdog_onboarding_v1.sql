-- Required Watchdog onboarding v1
-- First-party account context only. Demographic ranges are never housing-targeting inputs.

create table if not exists public.watchdog_onboarding_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  onboarding_version smallint not null default 1 check (onboarding_version between 1 and 100),
  status text not null default 'pending' check (status in ('pending','complete')),
  persona text check (persona is null or persona in ('homeowner','renter','professional','both','planning_to_buy','investor')),
  primary_profession text,
  home_status text check (home_status is null or home_status in ('own','rent','own_and_invest','rent_and_invest','planning_to_buy','other')),
  age_band text check (age_band is null or age_band in ('18_24','25_34','35_44','45_54','55_64','65_74','75_plus','prefer_not')),
  household_income_band text check (household_income_band is null or household_income_band in ('under_50k','50_99k','100_149k','150_249k','250k_plus','prefer_not')),
  household_size smallint check (household_size is null or household_size between 1 and 20),
  location_zip text check (location_zip is null or location_zip ~ '^[0-9]{5}$'),
  markets text[] not null default '{}',
  goals text[] not null default '{}',
  property_types text[] not null default '{}',
  time_horizon text check (time_horizon is null or time_horizon in ('now','0_3_months','3_6_months','6_12_months','12_plus_months','researching')),
  professional_years_band text check (professional_years_band is null or professional_years_band in ('new','1_3','4_7','8_15','16_plus')),
  professional_volume_band text check (professional_volume_band is null or professional_volume_band in ('under_5','5_14','15_29','30_59','60_plus','not_applicable')),
  professional_priorities text[] not null default '{}',
  intelligence_personalization boolean not null default true,
  responses jsonb not null default '{}'::jsonb check (jsonb_typeof(responses) = 'object' and pg_column_size(responses) <= 32768),
  grandfathered boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(markets) <= 20),
  check (cardinality(goals) <= 20),
  check (cardinality(property_types) <= 20),
  check (cardinality(professional_priorities) <= 20)
);

comment on table public.watchdog_onboarding_profiles is
  'First-party self-reported Watchdog onboarding context. Never use demographic answers to infer owner traits or as housing audience targeting criteria.';
comment on column public.watchdog_onboarding_profiles.responses is
  'Versioned self-reported survey snapshot. Context only; never authoritative property truth or entitlement state.';
comment on column public.watchdog_onboarding_profiles.intelligence_personalization is
  'Controls whether approved onboarding context may personalize the member own Watchdog Intelligence experience. It never alters source facts.';

alter table public.watchdog_onboarding_profiles enable row level security;
drop policy if exists "watchdog onboarding select own" on public.watchdog_onboarding_profiles;
create policy "watchdog onboarding select own" on public.watchdog_onboarding_profiles
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.watchdog_onboarding_profiles from anon;
revoke insert, update, delete on public.watchdog_onboarding_profiles from authenticated;
grant select on public.watchdog_onboarding_profiles to authenticated;

-- Existing members are grandfathered. The requirement starts with identities created after this migration.
insert into public.watchdog_onboarding_profiles (
  user_id,onboarding_version,status,persona,primary_profession,
  intelligence_personalization,responses,grandfathered,completed_at
)
select
  p.id,
  1,
  'complete',
  case when pref.profession is not null and pref.profession <> 'homeowner' then 'professional' else 'homeowner' end,
  case when pref.profession is not null and pref.profession <> 'homeowner' then pref.profession else null end,
  true,
  jsonb_build_object('source','grandfathered_existing_member','migrated_at',now()),
  true,
  now()
from public.profiles p
left join public.professional_preferences pref on pref.user_id = p.id
on conflict (user_id) do nothing;

create or replace function public.is_my_watchdog_onboarding_complete()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.watchdog_onboarding_profiles o
    where o.user_id = auth.uid()
      and o.status = 'complete'
      and o.completed_at is not null
  );
$$;

create or replace function public.get_my_watchdog_onboarding_state()
returns table (
  completed boolean,
  onboarding_version smallint,
  persona text,
  primary_profession text,
  completed_at timestamptz,
  grandfathered boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    coalesce(o.status = 'complete' and o.completed_at is not null,false),
    coalesce(o.onboarding_version,1::smallint),
    o.persona,
    o.primary_profession,
    o.completed_at,
    coalesce(o.grandfathered,false)
  from (select auth.uid() as uid) me
  left join public.watchdog_onboarding_profiles o on o.user_id = me.uid
  where me.uid is not null;
$$;

create or replace function public.complete_my_watchdog_onboarding(payload jsonb)
returns table (completed boolean, persona text, primary_profession text, completed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
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
  v_now timestamptz := now();
  v_pref_profession text;
  v_profile_role text;
  v_profile_custom jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'Invalid onboarding payload'; end if;
  if pg_column_size(payload) > 32768 then raise exception 'Onboarding payload is too large'; end if;

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
    exception when others then
      raise exception 'Invalid household size';
    end;
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
    raise exception 'Too many onboarding selections';
  end if;

  insert into public.watchdog_onboarding_profiles (
    user_id,onboarding_version,status,persona,primary_profession,home_status,age_band,household_income_band,household_size,location_zip,
    markets,goals,property_types,time_horizon,professional_years_band,professional_volume_band,professional_priorities,intelligence_personalization,responses,
    grandfathered,completed_at,updated_at
  ) values (
    v_uid,1,'complete',v_persona,v_profession,v_home_status,v_age_band,v_income_band,v_household_size,v_zip,
    v_markets,v_goals,v_property_types,v_time_horizon,v_years,v_volume,v_priorities,v_intel,
    payload || jsonb_build_object('source_class','user_confirmed','onboarding_version',1),false,v_now,v_now
  ) on conflict (user_id) do update set
    onboarding_version=excluded.onboarding_version,
    status='complete',
    persona=excluded.persona,
    primary_profession=excluded.primary_profession,
    home_status=excluded.home_status,
    age_band=excluded.age_band,
    household_income_band=excluded.household_income_band,
    household_size=excluded.household_size,
    location_zip=excluded.location_zip,
    markets=excluded.markets,
    goals=excluded.goals,
    property_types=excluded.property_types,
    time_horizon=excluded.time_horizon,
    professional_years_band=excluded.professional_years_band,
    professional_volume_band=excluded.professional_volume_band,
    professional_priorities=excluded.professional_priorities,
    intelligence_personalization=excluded.intelligence_personalization,
    responses=excluded.responses,
    grandfathered=false,
    completed_at=excluded.completed_at,
    updated_at=excluded.updated_at;

  -- Keep legacy professional preference consumers aligned without letting the client grant plan access.
  v_pref_profession := case
    when v_profession in ('real_estate','attorney','mortgage_lending','investor','appraiser','contractor','property_tax_professional','title_closing','other') then v_profession
    else 'homeowner'
  end;
  insert into public.professional_preferences (user_id,profession)
  values (v_uid,v_pref_profession)
  on conflict (user_id) do update set profession=excluded.profession;

  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='professional_preferences' and column_name='onboarding_complete') then
    execute 'update public.professional_preferences set onboarding_complete=true where user_id=$1' using v_uid;
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='professional_preferences' and column_name='updated_at') then
    execute 'update public.professional_preferences set updated_at=$2 where user_id=$1' using v_uid,v_now;
  end if;

  -- Production has a richer profiles table than staging. Sync columns only when they exist.
  v_profile_role := coalesce(v_profession,case when v_persona='renter' then 'renter' when v_persona='investor' then 'investor' else 'homeowner' end);
  v_profile_custom := jsonb_build_object(
    'onboarding_version',1,
    'persona',v_persona,
    'household_income_band',v_income_band,
    'markets',to_jsonb(v_markets),
    'property_types',to_jsonb(v_property_types),
    'time_horizon',v_time_horizon,
    'professional_years_band',v_years,
    'professional_volume_band',v_volume,
    'professional_priorities',to_jsonb(v_priorities)
  );

  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='profile_complete') then execute 'update public.profiles set profile_complete=true where id=$1' using v_uid; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='owner_status') then execute 'update public.profiles set owner_status=$2 where id=$1' using v_uid,v_home_status; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='household_size') then execute 'update public.profiles set household_size=$2 where id=$1' using v_uid,v_household_size; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='age_band') then execute 'update public.profiles set age_band=$2 where id=$1' using v_uid,v_age_band; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='zip') then execute 'update public.profiles set zip=coalesce($2,zip) where id=$1' using v_uid,v_zip; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='role') then execute 'update public.profiles set role=$2 where id=$1' using v_uid,v_profile_role; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='roles') then execute 'update public.profiles set roles=array[$2] where id=$1' using v_uid,v_profile_role; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='interests') then execute 'update public.profiles set interests=$2 where id=$1' using v_uid,v_goals; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='custom') then execute 'update public.profiles set custom=coalesce(custom,''{}''::jsonb) || $2 where id=$1' using v_uid,v_profile_custom; end if;

  -- Only operational/member context is fed to Intelligence. Age, income and household size stay in the onboarding/profile record and are not professional targeting inputs.
  if v_intel then
    insert into public.intelligence_assumptions (user_id,objective,profession,assumptions,updated_at)
    values (
      v_uid,
      'onboarding',
      coalesce(v_profession,v_persona),
      jsonb_build_object(
        'fact_class','user_confirmed',
        'source','watchdog_onboarding_v1',
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
      ),
      v_now
    )
    on conflict (user_id,objective) do update set
      profession=excluded.profession,
      assumptions=excluded.assumptions,
      updated_at=excluded.updated_at;
  else
    delete from public.intelligence_assumptions where user_id=v_uid and objective='onboarding';
  end if;

  return query select true,v_persona,v_profession,v_now;
end;
$$;

revoke all on function public.is_my_watchdog_onboarding_complete() from public, anon;
revoke all on function public.get_my_watchdog_onboarding_state() from public, anon;
revoke all on function public.complete_my_watchdog_onboarding(jsonb) from public, anon;
grant execute on function public.is_my_watchdog_onboarding_complete() to authenticated;
grant execute on function public.get_my_watchdog_onboarding_state() to authenticated;
grant execute on function public.complete_my_watchdog_onboarding(jsonb) to authenticated;
