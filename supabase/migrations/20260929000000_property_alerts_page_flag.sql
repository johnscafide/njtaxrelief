-- Property alerts, part 2.
--   * get_public_property_page returns alerts_enabled so the page only shows
--     the alert signup once property_alert_settings.enabled is switched on.
--   * Confirmation links expire after 7 days.

create or replace function public.confirm_property_alert(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub public.property_alert_subscriptions%rowtype;
  v_snap jsonb;
begin
  select * into v_sub from public.property_alert_subscriptions
  where confirm_token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and length(coalesce(p_token, '')) >= 32
    and confirm_sent_at > now() - interval '7 days';
  if not found then return jsonb_build_object('ok', false); end if;
  v_snap := public.property_alert_snapshot(v_sub.pams_pin);
  update public.property_alert_subscriptions
  set status = 'active', confirmed_at = coalesce(confirmed_at, now()), confirm_token_hash = null, baseline = v_snap
  where id = v_sub.id;
  return jsonb_build_object('ok', true, 'pams_pin', v_sub.pams_pin, 'address', v_snap ->> 'address', 'town', v_snap ->> 'town');
end;
$$;
revoke all on function public.confirm_property_alert(text) from public, anon, authenticated;
grant execute on function public.confirm_property_alert(text) to service_role;

create or replace function public.get_public_property_page(p_pin text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.property_lookups%rowtype;
  v_score jsonb;
  v_town jsonb;
  v_neighbors jsonb;
  v_sales jsonb;
  v_sales_summary jsonb;
  v_photo text;
  v_street text;
  v_blocknum numeric;
begin
  select * into v_row
  from public.property_lookups p
  where p.pams_pin = left(coalesce(p_pin, ''), 80)
    and p.county is not null and p.county <> '';
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'score', c.score, 'evidence_coverage', c.evidence_coverage, 'confidence', c.confidence,
    'verdict', c.verdict, 'model_version', c.model_version, 'computed_at', c.computed_at,
    'components', c.inputs -> 'components', 'precomputed', coalesce((c.inputs ->> 'precomputed')::boolean, false))
  into v_score
  from public.public_watchdog_score_cache_v1 c
  where c.pams_pin = v_row.pams_pin and c.model_version = 'ROBUST-v1';

  if v_row.last_year_tax is not null and v_row.last_year_tax > 0 then
    select jsonb_build_object(
      'peers', s.peers, 'median_tax', s.median_tax, 'median_assessed', s.median_assessed,
      'share_paying_less', (select count(*) from unnest(s.tax_percentiles[2:101]) q where q < v_row.last_year_tax),
      'refreshed_at', s.refreshed_at)
    into v_town
    from public.public_town_class_stats s
    where s.town = v_row.town and s.county = v_row.county and s.prop_class = v_row.prop_class;
  end if;

  -- Other properties on the same tax block (uses property_lookups_town_block_idx).
  select coalesce(jsonb_agg(jsonb_build_object('pams_pin', n.pams_pin, 'address', n.address, 'town', n.town,
           'assessed_value', n.assessed_value, 'last_year_tax', n.last_year_tax) order by n.pams_pin), '[]'::jsonb)
  into v_neighbors
  from (
    select pams_pin, address, town, assessed_value, last_year_tax
    from public.property_lookups
    where town = v_row.town and county = v_row.county and county <> '' and block = v_row.block
      and pams_pin <> v_row.pams_pin
    order by pams_pin
    limit 8
  ) n;

  -- Recent sales nearby: same town and class (public_recent_sales).
  v_street := regexp_replace(upper(coalesce(v_row.address, '')), '^\S+\s+', '');
  v_blocknum := nullif(substring(coalesce(v_row.block, '') from '^[0-9]+'), '')::numeric;
  with s as (
    select r.pams_pin, r.address, r.town, r.price as last_sale_price, r.sale_date as last_sale_date, r.year_built, r.assessed_value,
           r.street = v_street as same_street,
           abs(coalesce(r.block_num, 1e9) - coalesce(v_blocknum, 0)) as block_gap
    from public.public_recent_sales r
    where r.town = v_row.town and r.county = v_row.county and r.prop_class = coalesce(v_row.prop_class, '')
      and r.pams_pin <> v_row.pams_pin
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object('pams_pin', x.pams_pin, 'address', x.address, 'town', x.town,
                'price', x.last_sale_price, 'date', x.last_sale_date, 'year_built', x.year_built,
                'assessed_value', x.assessed_value, 'same_street', x.same_street) order by x.same_street desc, x.block_gap, x.last_sale_date desc)
              from (select * from s order by same_street desc, block_gap, last_sale_date desc limit 6) x), '[]'::jsonb),
    (select jsonb_build_object('count', count(*),
              'median', round(percentile_cont(0.5) within group (order by last_sale_price)::numeric, 0),
              'first_date', min(last_sale_date), 'last_date', max(last_sale_date))
     from s)
  into v_sales, v_sales_summary;

  select ph.storage_path into v_photo
  from public.property_photos ph
  where ph.pams_pin = v_row.pams_pin and ph.visibility = 'contribution' and ph.moderation_status = 'approved'
    and ph.contribution_revoked_at is null
  order by ph.is_primary desc, ph.updated_at desc
  limit 1;

  return jsonb_build_object(
    'pams_pin', v_row.pams_pin, 'address', v_row.address, 'town', v_row.town, 'county', v_row.county, 'zip', v_row.zip,
    'block', v_row.block, 'lot', v_row.lot, 'qualifier', v_row.qualifier, 'prop_class', v_row.prop_class,
    'year_built', v_row.year_built, 'acres', v_row.acres, 'dwelling_units', v_row.dwelling_units, 'building_desc', v_row.building_desc,
    'land_value', v_row.land_value, 'improvement_value', v_row.improvement_value, 'assessed_value', v_row.assessed_value,
    'last_year_tax', v_row.last_year_tax,
    'last_sale_price', nullif(v_row.last_sale_price, 0), 'last_sale_date', v_row.last_sale_date, 'last_sale_year', v_row.last_sale_year,
    'sale_flagged_non_market', false,
    'source_synced_at', v_row.source_synced_at,
    'score', v_score, 'town_compare', v_town, 'neighbors', v_neighbors,
    'recent_sales', v_sales, 'sales_summary', v_sales_summary, 'photo_path', v_photo,
    'alerts_enabled', coalesce((select a.enabled from public.property_alert_settings a where a.singleton), false));
end;
$$;

revoke all on function public.get_public_property_page(text) from public, anon, authenticated;
grant execute on function public.get_public_property_page(text) to service_role;
