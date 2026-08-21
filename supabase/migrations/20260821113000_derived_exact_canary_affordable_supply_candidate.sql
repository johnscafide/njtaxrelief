-- Reusable token-bound exact-derived release canary + first exact candidate.
-- This migration does NOT promote provider coverage for the candidate.
-- Canonical LIVE promotion remains post-canary only.

insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values (
  'watchdog.njplus.affordable_supply_coverage',
  'watchdog-derived-v16-chapter123-fields',
  'affordable_units_total / max(low_income_households, 1)',
  array[
    'njplus.nj-dca-affordable-housing.affordable_units_total',
    'njplus.nj-dca-affordable-housing.low_income_households'
  ]::text[],
  'high',
  'live',
  'Exact governed ratio from the v0.31 source catalog. The denominator floor of 1 is part of the published formula contract. Missing source dependencies remain missing; the floor applies only when a numeric denominator is present.',
  'ratio',
  '{"num":"njplus.nj-dca-affordable-housing.affordable_units_total","den":"njplus.nj-dca-affordable-housing.low_income_households","den_min":1,"scale":1,"precision":3}'::jsonb,
  now()
)
on conflict (marker_id) do update set
  engine_version=excluded.engine_version,
  formula=excluded.formula,
  dependencies=excluded.dependencies,
  confidence=excluded.confidence,
  status=excluded.status,
  explanation=excluded.explanation,
  operation=excluded.operation,
  config=excluded.config,
  updated_at=excluded.updated_at;

create or replace function public.dispatch_derived_exact_canary(
  p_pin text,
  p_values jsonb,
  p_kinds jsonb default '{}'::jsonb,
  p_sources jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_raw text := encode(gen_random_bytes(48), 'hex');
  v_email text := 'watchdog-derived-canary-' || substr(v_raw,1,10) || '@example.com';
  v_request_id bigint;
  v_count integer;
begin
  if nullif(trim(p_pin),'') is null then
    raise exception 'Control parcel is required';
  end if;
  if jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then
    raise exception 'Expected values must be a non-empty JSON object';
  end if;
  if jsonb_typeof(coalesce(p_kinds,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_sources,'{}'::jsonb)) <> 'object' then
    raise exception 'Kinds and sources must be JSON objects';
  end if;
  select count(*) into v_count from jsonb_object_keys(p_values);
  if v_count < 1 or v_count > 25 then
    raise exception 'Exact-derived canary supports 1-25 markers';
  end if;
  if exists (
    select 1 from jsonb_object_keys(coalesce(p_kinds,'{}'::jsonb)) k
    where not (p_values ? k)
  ) or exists (
    select 1 from jsonb_object_keys(coalesce(p_sources,'{}'::jsonb)) k
    where not (p_values ? k)
  ) then
    raise exception 'Kind/source expectations must be a subset of expected value markers';
  end if;

  insert into public.watchdog_test_bootstrap_tokens
    (token_hash, desired_email, redirect_to, expires_at, metadata)
  values
    (
      encode(digest(v_raw,'sha256'),'hex'),
      v_email,
      'https://njpropertytaxrelief.com/property/dashboard',
      now()+interval '10 minutes',
      jsonb_build_object(
        'purpose','provider_release_canary',
        'scenario','derived_exact_v1',
        'no_real_spend',true,
        'derived_exact',jsonb_build_object(
          'pin',trim(p_pin),
          'values',p_values,
          'kinds',coalesce(p_kinds,'{}'::jsonb),
          'sources',coalesce(p_sources,'{}'::jsonb)
        )
      )
    );

  select net.http_post(
    url := 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/provider-release-canary',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('token',v_raw,'scenario','derived_exact_v1'),
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.dispatch_derived_exact_canary(text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.dispatch_derived_exact_canary(text,jsonb,jsonb,jsonb) to service_role;
