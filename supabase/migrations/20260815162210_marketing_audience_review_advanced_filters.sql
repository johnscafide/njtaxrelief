create or replace function public.marketing_audience_review_filtered_page(
  p_campaign_id uuid,
  p_search text default '',
  p_filters jsonb default '{}'::jsonb,
  p_page integer default 1,
  p_page_size integer default 50,
  p_sort text default 'address',
  p_dir text default 'asc'
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c public.marketing_campaigns%rowtype;
  q text := lower(trim(coalesce(p_search,'')));
  pg integer := greatest(1,coalesce(p_page,1));
  psz integer := least(100,greatest(10,coalesce(p_page_size,50)));
  offv integer;
  s text := lower(trim(coalesce(p_sort,'address')));
  d text := case when lower(trim(coalesce(p_dir,'asc')))='desc' then 'desc' else 'asc' end;
  classes text[] := array[]::text[];
  tenure_buckets text[] := array[]::text[];
  include_unknown boolean := false;
  keyword text := '';
  year_min numeric := null;
  year_max numeric := null;
  assessment_min numeric := null;
  assessment_max numeric := null;
  tax_min numeric := null;
  tax_max numeric := null;
  acres_min numeric := null;
  acres_max numeric := null;
  units_min numeric := null;
  units_max numeric := null;
  sale_year_min numeric := null;
  sale_year_max numeric := null;
  watchdog_min numeric := null;
  tax_pressure_min numeric := null;
  revaluation_min numeric := null;
  uniformity_min numeric := null;
  result jsonb;
begin
  if uid is null or not public.can_use_data_workbench(uid) then
    raise exception 'Marketing Studio requires Agent or higher';
  end if;

  select * into c
  from public.marketing_campaigns
  where id=p_campaign_id and user_id=uid;

  if c.id is null then raise exception 'Campaign not found'; end if;
  if c.audience_snapshot_id is null then
    return jsonb_build_object('rows','[]'::jsonb,'total',0,'page',1,'page_size',psz,'pages',1,'filtered_keys','[]'::jsonb,'insights','{}'::jsonb);
  end if;

  select coalesce(array_agg(upper(x)),array[]::text[]) into classes
  from jsonb_array_elements_text(case when jsonb_typeof(p_filters->'classes')='array' then p_filters->'classes' else '[]'::jsonb end) x
  where upper(x) ~ '^[0-9A-Z.]{1,4}$';

  select coalesce(array_agg(x),array[]::text[]) into tenure_buckets
  from jsonb_array_elements_text(case when jsonb_typeof(p_filters->'tenure_buckets')='array' then p_filters->'tenure_buckets' else '[]'::jsonb end) x
  where x in ('0_5','5_10','10_15','15_20','20_plus');

  include_unknown := coalesce(p_filters->'include_unknown','false'::jsonb) = 'true'::jsonb;
  keyword := lower(trim(coalesce(p_filters->>'keyword','')));

  year_min := case when jsonb_typeof(p_filters->'year_built_min')='number' then (p_filters->>'year_built_min')::numeric end;
  year_max := case when jsonb_typeof(p_filters->'year_built_max')='number' then (p_filters->>'year_built_max')::numeric end;
  assessment_min := case when jsonb_typeof(p_filters->'assessment_min')='number' then (p_filters->>'assessment_min')::numeric end;
  assessment_max := case when jsonb_typeof(p_filters->'assessment_max')='number' then (p_filters->>'assessment_max')::numeric end;
  tax_min := case when jsonb_typeof(p_filters->'tax_min')='number' then (p_filters->>'tax_min')::numeric end;
  tax_max := case when jsonb_typeof(p_filters->'tax_max')='number' then (p_filters->>'tax_max')::numeric end;
  acres_min := case when jsonb_typeof(p_filters->'acres_min')='number' then (p_filters->>'acres_min')::numeric end;
  acres_max := case when jsonb_typeof(p_filters->'acres_max')='number' then (p_filters->>'acres_max')::numeric end;
  units_min := case when jsonb_typeof(p_filters->'units_min')='number' then (p_filters->>'units_min')::numeric end;
  units_max := case when jsonb_typeof(p_filters->'units_max')='number' then (p_filters->>'units_max')::numeric end;
  sale_year_min := case when jsonb_typeof(p_filters->'sale_year_min')='number' then (p_filters->>'sale_year_min')::numeric end;
  sale_year_max := case when jsonb_typeof(p_filters->'sale_year_max')='number' then (p_filters->>'sale_year_max')::numeric end;
  watchdog_min := case when jsonb_typeof(p_filters->'watchdog_score_min')='number' then (p_filters->>'watchdog_score_min')::numeric end;
  tax_pressure_min := case when jsonb_typeof(p_filters->'tax_pressure_min')='number' then (p_filters->>'tax_pressure_min')::numeric end;
  revaluation_min := case when jsonb_typeof(p_filters->'revaluation_risk_min')='number' then (p_filters->>'revaluation_risk_min')::numeric end;
  uniformity_min := case when jsonb_typeof(p_filters->'uniformity_score_min')='number' then (p_filters->>'uniformity_score_min')::numeric end;

  if s not in ('address','town','class','year_built','assessment','tax','sale_year','tenure','acres','units','watchdog_score','tax_pressure','revaluation_risk','uniformity') then s:='address'; end if;
  offv := (pg-1)*psz;

  with keys as (
    select value as pams_pin, ord
    from public.marketing_audience_snapshots a
    cross join lateral jsonb_array_elements_text(coalesce(a.property_keys,'[]'::jsonb)) with ordinality x(value,ord)
    where a.id=c.audience_snapshot_id and a.user_id=uid
  ), latest_metric_rows as (
    select distinct on (so.pams_pin,so.marker_id) so.pams_pin,so.marker_id,so.score
    from public.score_observations so
    join keys k on k.pams_pin=so.pams_pin
    where so.marker_id in ('watchdog.score','watchdog.tax_pressure','watchdog.revaluation_risk','uniformity.score')
    order by so.pams_pin,so.marker_id,so.observed_at desc nulls last
  ), metrics as (
    select pams_pin,
      max(score) filter(where marker_id='watchdog.score') as watchdog_score,
      max(score) filter(where marker_id='watchdog.tax_pressure') as tax_pressure,
      max(score) filter(where marker_id='watchdog.revaluation_risk') as revaluation_risk,
      max(score) filter(where marker_id='uniformity.score') as uniformity_score
    from latest_metric_rows group by pams_pin
  ), base as (
    select k.ord,k.pams_pin,p.address,p.town,p.county,p.zip,p.block,p.lot,p.qualifier,p.prop_class,p.year_built,p.acres,p.dwelling_units,p.building_desc,
           p.land_value,p.improvement_value,p.assessed_value,p.last_year_tax,p.effective_rate,p.last_sale_price,
           case when coalesce(p.history->>'deed_parser_version','')='2' and p.last_sale_year between 1900 and extract(year from current_date)::int then p.last_sale_year else null end as last_sale_year,
           p.lat,p.lon,p.last_seen,
           case when coalesce(p.history->>'deed_parser_version','')='2' and p.last_sale_year between 1900 and extract(year from current_date)::int then extract(year from current_date)::int-p.last_sale_year else null end as years_since_sale,
           m.watchdog_score,m.tax_pressure,m.revaluation_risk,m.uniformity_score
    from keys k
    left join public.property_lookups p on p.pams_pin=k.pams_pin
    left join metrics m on m.pams_pin=k.pams_pin
  ), filtered as (
    select * from base
    where (cardinality(classes)=0 or coalesce(prop_class,'')=any(classes))
      and (q='' or lower(concat_ws(' ',pams_pin,address,town,county,zip,block,lot,qualifier,prop_class,building_desc)) like '%'||q||'%')
      and (keyword='' or lower(coalesce(building_desc,'')) like '%'||keyword||'%')
      and (year_min is null or year_built>=year_min or (include_unknown and year_built is null))
      and (year_max is null or year_built<=year_max or (include_unknown and year_built is null))
      and (assessment_min is null or assessed_value>=assessment_min or (include_unknown and assessed_value is null))
      and (assessment_max is null or assessed_value<=assessment_max or (include_unknown and assessed_value is null))
      and (tax_min is null or last_year_tax>=tax_min or (include_unknown and last_year_tax is null))
      and (tax_max is null or last_year_tax<=tax_max or (include_unknown and last_year_tax is null))
      and (acres_min is null or acres>=acres_min or (include_unknown and acres is null))
      and (acres_max is null or acres<=acres_max or (include_unknown and acres is null))
      and (units_min is null or dwelling_units>=units_min or (include_unknown and dwelling_units is null))
      and (units_max is null or dwelling_units<=units_max or (include_unknown and dwelling_units is null))
      and (sale_year_min is null or last_sale_year>=sale_year_min or (include_unknown and last_sale_year is null))
      and (sale_year_max is null or last_sale_year<=sale_year_max or (include_unknown and last_sale_year is null))
      and (watchdog_min is null or watchdog_score>=watchdog_min or (include_unknown and watchdog_score is null))
      and (tax_pressure_min is null or tax_pressure>=tax_pressure_min or (include_unknown and tax_pressure is null))
      and (revaluation_min is null or revaluation_risk>=revaluation_min or (include_unknown and revaluation_risk is null))
      and (uniformity_min is null or uniformity_score>=uniformity_min or (include_unknown and uniformity_score is null))
      and (
        cardinality(tenure_buckets)=0
        or (include_unknown and years_since_sale is null)
        or ('0_5'=any(tenure_buckets) and years_since_sale>=0 and years_since_sale<5)
        or ('5_10'=any(tenure_buckets) and years_since_sale>=5 and years_since_sale<10)
        or ('10_15'=any(tenure_buckets) and years_since_sale>=10 and years_since_sale<15)
        or ('15_20'=any(tenure_buckets) and years_since_sale>=15 and years_since_sale<20)
        or ('20_plus'=any(tenure_buckets) and years_since_sale>=20)
      )
  ), sorted as (
    select * from filtered
    order by
      case when s='address' and d='asc' then lower(coalesce(address,'')) end asc nulls last,
      case when s='address' and d='desc' then lower(coalesce(address,'')) end desc nulls last,
      case when s='town' and d='asc' then lower(coalesce(town,'')) end asc nulls last,
      case when s='town' and d='desc' then lower(coalesce(town,'')) end desc nulls last,
      case when s='class' and d='asc' then prop_class end asc nulls last,
      case when s='class' and d='desc' then prop_class end desc nulls last,
      case when s='year_built' and d='asc' then year_built end asc nulls last,
      case when s='year_built' and d='desc' then year_built end desc nulls last,
      case when s='assessment' and d='asc' then assessed_value end asc nulls last,
      case when s='assessment' and d='desc' then assessed_value end desc nulls last,
      case when s='tax' and d='asc' then last_year_tax end asc nulls last,
      case when s='tax' and d='desc' then last_year_tax end desc nulls last,
      case when s='sale_year' and d='asc' then last_sale_year end asc nulls last,
      case when s='sale_year' and d='desc' then last_sale_year end desc nulls last,
      case when s='tenure' and d='asc' then years_since_sale end asc nulls last,
      case when s='tenure' and d='desc' then years_since_sale end desc nulls last,
      case when s='acres' and d='asc' then acres end asc nulls last,
      case when s='acres' and d='desc' then acres end desc nulls last,
      case when s='units' and d='asc' then dwelling_units end asc nulls last,
      case when s='units' and d='desc' then dwelling_units end desc nulls last,
      case when s='watchdog_score' and d='asc' then watchdog_score end asc nulls last,
      case when s='watchdog_score' and d='desc' then watchdog_score end desc nulls last,
      case when s='tax_pressure' and d='asc' then tax_pressure end asc nulls last,
      case when s='tax_pressure' and d='desc' then tax_pressure end desc nulls last,
      case when s='revaluation_risk' and d='asc' then revaluation_risk end asc nulls last,
      case when s='revaluation_risk' and d='desc' then revaluation_risk end desc nulls last,
      case when s='uniformity' and d='asc' then uniformity_score end asc nulls last,
      case when s='uniformity' and d='desc' then uniformity_score end desc nulls last,
      ord asc
  ), paged as (
    select *, row_number() over () as page_ord
    from (select * from sorted limit psz offset offv) z
  ), summary as (
    select
      count(*)::integer as filtered_count,
      percentile_cont(0.5) within group(order by assessed_value) filter(where assessed_value is not null) as median_assessment,
      percentile_cont(0.5) within group(order by last_year_tax) filter(where last_year_tax is not null) as median_tax,
      percentile_cont(0.5) within group(order by year_built) filter(where year_built is not null) as median_year_built,
      round(avg(watchdog_score)::numeric,1) as avg_watchdog_score,
      round(avg(tax_pressure)::numeric,1) as avg_tax_pressure,
      round(avg(revaluation_risk)::numeric,1) as avg_revaluation_risk,
      round(avg(uniformity_score)::numeric,1) as avg_uniformity_score,
      count(*) filter(where years_since_sale>=15)::integer as owned_15_plus,
      count(*) filter(where years_since_sale>=20)::integer as owned_20_plus,
      count(*) filter(where last_sale_year is null)::integer as unknown_sale_age
    from filtered
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'pams_pin',pams_pin,'address',address,'town',town,'county',county,'zip',zip,'block',block,'lot',lot,'qualifier',qualifier,'prop_class',prop_class,
      'year_built',year_built,'acres',acres,'dwelling_units',dwelling_units,'building_desc',building_desc,'square_feet',null,
      'land_value',land_value,'improvement_value',improvement_value,'assessed_value',assessed_value,'last_year_tax',last_year_tax,'effective_rate',effective_rate,
      'last_sale_price',last_sale_price,'last_sale_year',last_sale_year,'years_since_sale',years_since_sale,'lat',lat,'lon',lon,'last_seen',last_seen,
      'watchdog_score',watchdog_score,'tax_pressure',tax_pressure,'revaluation_risk',revaluation_risk,'uniformity_score',uniformity_score
    ) order by page_ord) from paged),'[]'::jsonb),
    'total', (select filtered_count from summary),
    'page', pg,
    'page_size', psz,
    'pages', greatest(1,ceil((select filtered_count from summary)::numeric/psz)::integer),
    'sort', s,
    'dir', d,
    'filtered_keys', coalesce((select jsonb_agg(pams_pin order by ord) from filtered),'[]'::jsonb),
    'insights', (select jsonb_build_object(
      'filtered_count',filtered_count,
      'median_assessment',median_assessment,
      'median_tax',median_tax,
      'median_year_built',median_year_built,
      'avg_watchdog_score',avg_watchdog_score,
      'avg_tax_pressure',avg_tax_pressure,
      'avg_revaluation_risk',avg_revaluation_risk,
      'avg_uniformity_score',avg_uniformity_score,
      'owned_15_plus',owned_15_plus,
      'owned_20_plus',owned_20_plus,
      'unknown_sale_age',unknown_sale_age
    ) from summary)
  ) into result;

  return result;
end
$$;

revoke all on function public.marketing_audience_review_filtered_page(uuid,text,jsonb,integer,integer,text,text) from public;
revoke all on function public.marketing_audience_review_filtered_page(uuid,text,jsonb,integer,integer,text,text) from anon;
grant execute on function public.marketing_audience_review_filtered_page(uuid,text,jsonb,integer,integer,text,text) to authenticated;
