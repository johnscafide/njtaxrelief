-- NJW-125: Watchdog targets property facts and governed intelligence, not owner demographics.
-- This guardrail is intentionally independent of plan tier or professional verification.

create or replace function public.watchdog_has_prohibited_demographic_key(payload jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  key_name text;
  child jsonb;
begin
  if payload is null then
    return false;
  end if;

  if jsonb_typeof(payload) = 'object' then
    for key_name, child in select key, value from jsonb_each(payload)
    loop
      if lower(key_name) = any (array[
        'gender', 'owner_gender', 'person_gender',
        'race', 'owner_race', 'person_race',
        'ethnicity', 'owner_ethnicity', 'person_ethnicity',
        'marital_status', 'owner_marital_status',
        'children_at_home', 'household_children',
        'household_income', 'owner_income',
        'net_worth', 'owner_net_worth',
        'education_level', 'owner_education',
        'religion', 'religious_affiliation',
        'political_affiliation', 'sexual_orientation',
        'owner_age', 'person_age'
      ]) then
        return true;
      end if;

      if public.watchdog_has_prohibited_demographic_key(child) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(payload) = 'array' then
    for child in select value from jsonb_array_elements(payload)
    loop
      if public.watchdog_has_prohibited_demographic_key(child) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end;
$$;

comment on function public.watchdog_has_prohibited_demographic_key(jsonb) is
  'Fail-closed Watchdog guardrail: demographic owner/person profiling keys are not valid audience or farm criteria. Property characteristics such as building_age remain allowed.';

revoke all on function public.watchdog_has_prohibited_demographic_key(jsonb) from public;
grant execute on function public.watchdog_has_prohibited_demographic_key(jsonb) to service_role;

alter table public.agent_dynamic_lists
  drop constraint if exists agent_dynamic_lists_no_demographic_owner_targeting;
alter table public.agent_dynamic_lists
  add constraint agent_dynamic_lists_no_demographic_owner_targeting
  check (not public.watchdog_has_prohibited_demographic_key(criteria));

alter table public.marketing_audiences
  drop constraint if exists marketing_audiences_no_demographic_owner_targeting;
alter table public.marketing_audiences
  add constraint marketing_audiences_no_demographic_owner_targeting
  check (
    not public.watchdog_has_prohibited_demographic_key(criteria)
    and not public.watchdog_has_prohibited_demographic_key(source_ref)
  );

comment on constraint agent_dynamic_lists_no_demographic_owner_targeting on public.agent_dynamic_lists is
  'NJW-125: saved property lists may use property facts and governed Watchdog intelligence, never owner/person demographic targeting.';
comment on constraint marketing_audiences_no_demographic_owner_targeting on public.marketing_audiences is
  'NJW-125: marketing audiences may use property facts and governed Watchdog intelligence, never owner/person demographic targeting.';
