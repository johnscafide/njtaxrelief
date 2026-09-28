-- CRM <-> property connection for the Integration Center.
--
-- Gives the signed-in professional user one read of how their synced CRM and their
-- Watchdog dashboard line up, plus two narrow write paths:
--   * get_my_crm_property_overview(): CRM properties not yet on the dashboard,
--     dashboard properties with their CRM contacts, dashboard properties missing
--     from the CRM, match candidates waiting for review and resolution counts.
--   * add_my_crm_properties_to_dashboard(p_items): saves verified CRM-linked
--     properties through save_property(), within the plan's property limit.
--   * review_my_crm_property_matches(p_link_ids, p_decision): confirms or rejects
--     candidate matches through integration_bulk_decide_crm_candidates().
--
-- Matching rules are unchanged: only verified PAMS PIN links count as "in your CRM".
-- No fuzzy address or person-name matching is added, and nothing is auto-verified.
-- Plan access matches the Account page Sync Accounts connection (Agent and up).

-- Same rule as canonicalPin() in property/js/watchdog-why.js and workbench-score:
-- drop leading zeros from the block and lot, keep decimals and qualifiers.
create or replace function public.integration_canonical_pin(p_pin text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case
    when coalesce(array_length(a, 1), 0) < 3 then array_to_string(a, '_')
    else array_to_string(
      array[
        a[1],
        case when a[2] ~ '^[0-9]+([.][0-9]+)?$'
          then (substring(a[2] from '^([0-9]+)'))::numeric::text || coalesce(substring(a[2] from '([.][0-9]+)$'), '')
          else a[2] end,
        case when a[3] ~ '^[0-9]+([.][0-9]+)?$'
          then (substring(a[3] from '^([0-9]+)'))::numeric::text || coalesce(substring(a[3] from '([.][0-9]+)$'), '')
          else a[3] end
      ] || a[4:array_length(a, 1)],
      '_')
  end
  from (select string_to_array(btrim(coalesce(p_pin, '')), '_') as a) s
$$;

create or replace function public.integration_crm_property_limit(p_user uuid, p_plan text)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit bigint := coalesce((public.agent_plan_limits(p_plan) ->> 'properties')::bigint, 0);
  v_capacity integer;
begin
  select e.property_capacity into v_capacity from public.account_entitlements e where e.user_id = p_user;
  if v_capacity is not null and v_capacity > 0 then
    v_limit := least(v_limit, v_capacity);
  end if;
  return v_limit;
end;
$$;

create or replace function public.get_my_crm_property_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_limit bigint;
  v_saved integer;
  v_out jsonb;
begin
  if v_user is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  v_plan := coalesce(public.watchdog_effective_plan(v_user), 'standard');
  if v_plan not in ('agent', 'pro', 'pro_plus', 'teams', 'developer') then
    return jsonb_build_object('allowed', false, 'plan', v_plan);
  end if;

  v_limit := public.integration_crm_property_limit(v_user, v_plan);
  select count(distinct public.integration_canonical_pin(sp.pams_pin)) into v_saved
    from public.saved_properties sp where sp.user_id = v_user;

  with
  conn as (
    select ipc.provider, ipc.sync_status, ipc.last_success_at,
           coalesce(ipc.records_synced_total, 0) as records_synced_total,
           c.status as connection_status, c.external_account_label
      from public.integration_provider_connections ipc
      join public.integration_connections c on c.id = ipc.connection_id and c.user_id = ipc.user_id
     where ipc.user_id = v_user and ipc.sync_status <> 'revoked'
     order by ipc.last_success_at desc nulls last
     limit 1
  ),
  ctx as (
    select c.* from public.integration_crm_context c where c.user_id = v_user
  ),
  contact_json as (
    select ctx.id,
           jsonb_strip_nulls(jsonb_build_object(
             'name', nullif(btrim(ctx.contact_name), ''),
             'email', nullif(btrim(ctx.contact_email), ''),
             'phone', nullif(btrim(ctx.contact_phone), ''),
             'stage', nullif(btrim(ctx.lead_stage), ''),
             'relationship', nullif(btrim(ctx.relationship), ''),
             'tags', case when cardinality(ctx.tags) > 0 then to_jsonb(ctx.tags) end,
             'source', nullif(ctx.context ->> 'source', ''),
             'last_activity_at', ctx.last_activity_at,
             'updated_at', coalesce(ctx.source_updated_at, ctx.updated_at)
           )) as contact,
           coalesce(ctx.last_activity_at, ctx.source_updated_at, ctx.updated_at) as activity_at
      from ctx
  ),
  verified as (
    select l.*, public.integration_canonical_pin(l.pams_pin) as pin_c
      from public.integration_crm_property_links l
     where l.user_id = v_user and l.status = 'verified'
  ),
  verified_by_pin as (
    select v.pin_c,
           min(v.pams_pin) as pams_pin,
           max(v.candidate_property_address) as candidate_address,
           max(v.candidate_municipality) as candidate_municipality,
           max(v.crm_property_address) as crm_address,
           count(distinct v.crm_context_id) as contact_count,
           max(cj.activity_at) as activity_at,
           to_jsonb((array_agg(cj.contact order by cj.activity_at desc nulls last))[1:5]) as contacts
      from verified v
      join contact_json cj on cj.id = v.crm_context_id
     group by v.pin_c
  ),
  saved as (
    select distinct on (public.integration_canonical_pin(sp.pams_pin))
           sp.id, sp.pams_pin, sp.address, sp.town, sp.city, sp.county, sp.zip, sp.kind, sp.nickname, sp.created_at,
           public.integration_canonical_pin(sp.pams_pin) as pin_c
      from public.saved_properties sp
     where sp.user_id = v_user
     order by public.integration_canonical_pin(sp.pams_pin), (sp.kind = 'home') desc, sp.created_at
  ),
  ready as (
    select vb.*, pl.address as lookup_address, pl.town as lookup_town, pl.county as lookup_county
      from verified_by_pin vb
      left join public.property_lookups pl on pl.pams_pin = vb.pams_pin
     where not exists (select 1 from saved s where s.pin_c = vb.pin_c)
  ),
  on_dash as (
    select s.*, vb.contacts, vb.contact_count, vb.activity_at
      from saved s
      join verified_by_pin vb on vb.pin_c = s.pin_c
  ),
  dash_not_crm as (
    select s.* from saved s
     where not exists (select 1 from verified_by_pin vb where vb.pin_c = s.pin_c)
  ),
  review as (
    select l.id as link_id, l.pams_pin, l.crm_property_address, l.candidate_property_address,
           l.candidate_municipality, l.candidate_count, l.confidence, l.created_at, cj.contact
      from public.integration_crm_property_links l
      join contact_json cj on cj.id = l.crm_context_id
     where l.user_id = v_user and l.status = 'candidate'
  ),
  res as (
    select s.detail_status, count(*) as n
      from public.integration_crm_resolution_state s
     where s.user_id = v_user
     group by s.detail_status
  )
  select jsonb_build_object(
    'allowed', true,
    'plan', v_plan,
    'generated_at', now(),
    'connection', (select to_jsonb(conn) from conn),
    'capacity', jsonb_build_object('limit', v_limit, 'saved', v_saved, 'remaining', greatest(v_limit - v_saved, 0)),
    'counts', jsonb_build_object(
      'contacts', (select count(*) from ctx),
      'contacts_with_email', (select count(*) from ctx where nullif(btrim(ctx.contact_email), '') is not null),
      'matched_contacts', (select count(distinct crm_context_id) from verified),
      'matched_properties', (select count(*) from verified_by_pin),
      'on_dashboard', (select count(*) from on_dash),
      'ready_to_add', (select count(*) from ready),
      'needs_review', (select count(*) from review),
      'dashboard_total', (select count(*) from saved),
      'dashboard_not_in_crm', (select count(*) from dash_not_crm)
    ),
    'resolution', coalesce((select jsonb_object_agg(res.detail_status, res.n) from res), '{}'::jsonb),
    'ready_to_add', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'pams_pin', r.pams_pin,
               'address', coalesce(r.lookup_address, r.candidate_address, r.crm_address),
               'town', coalesce(r.lookup_town, r.candidate_municipality),
               'county', r.lookup_county,
               'contact_count', r.contact_count,
               'activity_at', r.activity_at,
               'contacts', r.contacts
             )) order by r.activity_at desc nulls last)
        from (select * from ready order by activity_at desc nulls last limit 300) r
    ), '[]'::jsonb),
    'on_dashboard', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'saved_id', d.id,
               'pams_pin', d.pams_pin,
               'address', d.address,
               'town', coalesce(d.town, d.city),
               'nickname', d.nickname,
               'kind', d.kind,
               'contact_count', d.contact_count,
               'activity_at', d.activity_at,
               'contacts', d.contacts
             )) order by d.activity_at desc nulls last)
        from on_dash d
    ), '[]'::jsonb),
    'dashboard_not_in_crm', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'saved_id', d.id,
               'pams_pin', d.pams_pin,
               'address', d.address,
               'town', coalesce(d.town, d.city),
               'county', d.county,
               'zip', d.zip,
               'nickname', d.nickname,
               'kind', d.kind
             )) order by d.created_at desc)
        from (select * from dash_not_crm order by created_at desc limit 500) d
    ), '[]'::jsonb),
    'needs_review', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'link_id', r.link_id,
               'pams_pin', r.pams_pin,
               'crm_address', r.crm_property_address,
               'candidate_address', r.candidate_property_address,
               'candidate_town', r.candidate_municipality,
               'candidate_count', r.candidate_count,
               'confidence', r.confidence,
               'contact', r.contact
             )) order by r.created_at desc)
        from (select * from review order by created_at desc limit 200) r
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

create or replace function public.add_my_crm_properties_to_dashboard(p_items jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_limit bigint;
  v_saved integer;
  v_item jsonb;
  v_pin text;
  v_pin_c text;
  v_link record;
  v_payload jsonb;
  v_id uuid;
  v_lat numeric;
  v_lon numeric;
  v_added jsonb := '[]'::jsonb;
  v_not_linked integer := 0;
  v_already integer := 0;
  v_over integer := 0;
  v_failed integer := 0;
begin
  if v_user is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  v_plan := coalesce(public.watchdog_effective_plan(v_user), 'standard');
  if v_plan not in ('agent', 'pro', 'pro_plus', 'teams', 'developer') then
    raise exception 'Adding CRM properties requires an Agent, Pro, Pro+ or Teams plan' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'Choose between 1 and 100 properties' using errcode = '22023';
  end if;

  v_limit := public.integration_crm_property_limit(v_user, v_plan);
  select count(distinct public.integration_canonical_pin(sp.pams_pin)) into v_saved
    from public.saved_properties sp where sp.user_id = v_user;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      v_not_linked := v_not_linked + 1;
      continue;
    end if;
    v_pin := left(btrim(coalesce(v_item ->> 'pams_pin', '')), 40);
    if v_pin = '' then
      v_not_linked := v_not_linked + 1;
      continue;
    end if;
    v_pin_c := public.integration_canonical_pin(v_pin);

    select l.pams_pin, l.candidate_property_address, l.candidate_municipality, l.crm_property_address
      into v_link
      from public.integration_crm_property_links l
     where l.user_id = v_user
       and l.status = 'verified'
       and public.integration_canonical_pin(l.pams_pin) = v_pin_c
     order by l.verified_at desc nulls last
     limit 1;
    if not found then
      v_not_linked := v_not_linked + 1;
      continue;
    end if;

    if exists (
      select 1 from public.saved_properties sp
       where sp.user_id = v_user and public.integration_canonical_pin(sp.pams_pin) = v_pin_c
    ) then
      v_already := v_already + 1;
      continue;
    end if;

    if v_saved >= v_limit then
      v_over := v_over + 1;
      continue;
    end if;

    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'kind', 'watch',
      'pams_pin', v_link.pams_pin,
      'address', left(coalesce(nullif(btrim(v_item ->> 'address'), ''), v_link.candidate_property_address, v_link.crm_property_address, ''), 120),
      'town', left(coalesce(nullif(btrim(v_item ->> 'town'), ''), v_link.candidate_municipality), 80),
      'county', left(nullif(btrim(v_item ->> 'county'), ''), 40),
      'block', left(nullif(btrim(v_item ->> 'block'), ''), 20),
      'lot', left(nullif(btrim(v_item ->> 'lot'), ''), 20),
      'assessed', case when (v_item ->> 'assessed') ~ '^[0-9]{1,10}([.][0-9]+)?$'
                       then round((v_item ->> 'assessed')::numeric)::bigint end,
      'last_year_tax', case when (v_item ->> 'last_year_tax') ~ '^[0-9]{1,8}([.][0-9]+)?$'
                            then round((v_item ->> 'last_year_tax')::numeric, 2) end
    ));

    v_id := public.save_property(v_payload);
    if v_id is null then
      v_failed := v_failed + 1;
      continue;
    end if;

    if (v_item ->> 'lat') ~ '^-?[0-9]{1,3}([.][0-9]+)?$' and (v_item ->> 'lon') ~ '^-?[0-9]{1,3}([.][0-9]+)?$' then
      v_lat := (v_item ->> 'lat')::numeric;
      v_lon := (v_item ->> 'lon')::numeric;
      if v_lat between 38.5 and 41.6 and v_lon between -75.8 and -73.5 then
        update public.saved_properties
           set lat = round(v_lat, 6), lon = round(v_lon, 6)
         where id = v_id and user_id = v_user and lat is null and lon is null;
      end if;
    end if;

    v_saved := v_saved + 1;
    v_added := v_added || jsonb_build_array(jsonb_build_object('pams_pin', v_link.pams_pin, 'id', v_id));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'added', v_added,
    'added_count', jsonb_array_length(v_added),
    'not_linked', v_not_linked,
    'already_on_dashboard', v_already,
    'over_limit', v_over,
    'failed', v_failed,
    'limit', v_limit,
    'saved', v_saved
  );
end;
$$;

create or replace function public.review_my_crm_property_matches(p_link_ids uuid[], p_decision text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
begin
  if v_user is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  v_plan := coalesce(public.watchdog_effective_plan(v_user), 'standard');
  if v_plan not in ('agent', 'pro', 'pro_plus', 'teams', 'developer') then
    raise exception 'Reviewing CRM matches requires an Agent, Pro, Pro+ or Teams plan' using errcode = '42501';
  end if;
  return public.integration_bulk_decide_crm_candidates(v_user, p_link_ids, p_decision, 'Reviewed on Integration Center');
end;
$$;

revoke all on function public.integration_crm_property_limit(uuid, text) from public, anon, authenticated;
revoke all on function public.get_my_crm_property_overview() from public, anon;
revoke all on function public.add_my_crm_properties_to_dashboard(jsonb) from public, anon;
revoke all on function public.review_my_crm_property_matches(uuid[], text) from public, anon;
grant execute on function public.get_my_crm_property_overview() to authenticated;
grant execute on function public.add_my_crm_properties_to_dashboard(jsonb) to authenticated;
grant execute on function public.review_my_crm_property_matches(uuid[], text) to authenticated;
grant execute on function public.integration_canonical_pin(text) to authenticated;
