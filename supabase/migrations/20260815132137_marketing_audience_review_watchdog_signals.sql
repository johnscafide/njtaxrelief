create or replace function public.marketing_audience_review_page(
  p_campaign_id uuid,
  p_search text default '',
  p_prop_class text default 'all',
  p_page integer default 1,
  p_page_size integer default 50,
  p_sort text default 'address',
  p_dir text default 'asc'
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid(); c public.marketing_campaigns%rowtype;
  q text:=lower(trim(coalesce(p_search,''))); cls text:=upper(trim(coalesce(p_prop_class,'all')));
  pg integer:=greatest(1,coalesce(p_page,1)); psz integer:=least(100,greatest(10,coalesce(p_page_size,50))); offv integer;
  s text:=lower(trim(coalesce(p_sort,'address'))); d text:=case when lower(trim(coalesce(p_dir,'asc')))='desc' then 'desc' else 'asc' end;
  total_count integer:=0; rows jsonb:='[]'::jsonb;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  select * into c from public.marketing_campaigns where id=p_campaign_id and user_id=uid;
  if c.id is null then raise exception 'Campaign not found'; end if;
  if c.audience_snapshot_id is null then return jsonb_build_object('rows','[]'::jsonb,'total',0,'page',1,'page_size',psz,'pages',1); end if;
  if s not in ('address','town','class','year_built','assessment','tax','sale_year','tenure','watchdog_score','tax_pressure') then s:='address'; end if;
  offv:=(pg-1)*psz;

  with keys as (
    select value as pams_pin,ord from public.marketing_audience_snapshots a cross join lateral jsonb_array_elements_text(coalesce(a.property_keys,'[]'::jsonb)) with ordinality x(value,ord)
    where a.id=c.audience_snapshot_id and a.user_id=uid
  ), latest_metric_rows as (
    select distinct on (so.pams_pin,so.marker_id) so.pams_pin,so.marker_id,so.score from public.score_observations so join keys k on k.pams_pin=so.pams_pin
    where so.marker_id in ('watchdog.score','watchdog.tax_pressure','watchdog.revaluation_risk','uniformity.score')
    order by so.pams_pin,so.marker_id,so.observed_at desc nulls last
  ), metrics as (
    select pams_pin,max(score) filter(where marker_id='watchdog.score') watchdog_score,max(score) filter(where marker_id='watchdog.tax_pressure') tax_pressure,
      max(score) filter(where marker_id='watchdog.revaluation_risk') revaluation_risk,max(score) filter(where marker_id='uniformity.score') uniformity_score
    from latest_metric_rows group by pams_pin
  ), base as (
    select k.ord,k.pams_pin,p.address,p.town,p.county,p.zip,p.block,p.lot,p.qualifier,p.prop_class,p.year_built,p.acres,p.dwelling_units,p.building_desc,
      p.land_value,p.improvement_value,p.assessed_value,p.last_year_tax,p.effective_rate,p.last_sale_price,p.last_sale_year,p.lat,p.lon,p.last_seen,
      case when p.last_sale_year between 1900 and extract(year from current_date)::int then extract(year from current_date)::int-p.last_sale_year else null end years_since_sale,
      m.watchdog_score,m.tax_pressure,m.revaluation_risk,m.uniformity_score
    from keys k left join public.property_lookups p on p.pams_pin=k.pams_pin left join metrics m on m.pams_pin=k.pams_pin
  ), filtered as (
    select * from base where (cls='ALL' or coalesce(prop_class,'')=cls) and (q='' or lower(concat_ws(' ',pams_pin,address,town,county,zip,block,lot,qualifier,prop_class,building_desc)) like '%'||q||'%')
  ) select count(*) into total_count from filtered;

  with keys as (
    select value as pams_pin,ord from public.marketing_audience_snapshots a cross join lateral jsonb_array_elements_text(coalesce(a.property_keys,'[]'::jsonb)) with ordinality x(value,ord)
    where a.id=c.audience_snapshot_id and a.user_id=uid
  ), latest_metric_rows as (
    select distinct on (so.pams_pin,so.marker_id) so.pams_pin,so.marker_id,so.score from public.score_observations so join keys k on k.pams_pin=so.pams_pin
    where so.marker_id in ('watchdog.score','watchdog.tax_pressure','watchdog.revaluation_risk','uniformity.score') order by so.pams_pin,so.marker_id,so.observed_at desc nulls last
  ), metrics as (
    select pams_pin,max(score) filter(where marker_id='watchdog.score') watchdog_score,max(score) filter(where marker_id='watchdog.tax_pressure') tax_pressure,
      max(score) filter(where marker_id='watchdog.revaluation_risk') revaluation_risk,max(score) filter(where marker_id='uniformity.score') uniformity_score from latest_metric_rows group by pams_pin
  ), base as (
    select k.ord,k.pams_pin,p.address,p.town,p.county,p.zip,p.block,p.lot,p.qualifier,p.prop_class,p.year_built,p.acres,p.dwelling_units,p.building_desc,
      p.land_value,p.improvement_value,p.assessed_value,p.last_year_tax,p.effective_rate,p.last_sale_price,p.last_sale_year,p.lat,p.lon,p.last_seen,
      case when p.last_sale_year between 1900 and extract(year from current_date)::int then extract(year from current_date)::int-p.last_sale_year else null end years_since_sale,
      m.watchdog_score,m.tax_pressure,m.revaluation_risk,m.uniformity_score
    from keys k left join public.property_lookups p on p.pams_pin=k.pams_pin left join metrics m on m.pams_pin=k.pams_pin
  ), filtered as (
    select * from base where (cls='ALL' or coalesce(prop_class,'')=cls) and (q='' or lower(concat_ws(' ',pams_pin,address,town,county,zip,block,lot,qualifier,prop_class,building_desc)) like '%'||q||'%')
  ), ranked as (
    select * from filtered order by
      case when s='address' and d='asc' then lower(coalesce(address,'')) end asc nulls last,case when s='address' and d='desc' then lower(coalesce(address,'')) end desc nulls last,
      case when s='town' and d='asc' then lower(coalesce(town,'')) end asc nulls last,case when s='town' and d='desc' then lower(coalesce(town,'')) end desc nulls last,
      case when s='class' and d='asc' then prop_class end asc nulls last,case when s='class' and d='desc' then prop_class end desc nulls last,
      case when s='year_built' and d='asc' then year_built end asc nulls last,case when s='year_built' and d='desc' then year_built end desc nulls last,
      case when s='assessment' and d='asc' then assessed_value end asc nulls last,case when s='assessment' and d='desc' then assessed_value end desc nulls last,
      case when s='tax' and d='asc' then last_year_tax end asc nulls last,case when s='tax' and d='desc' then last_year_tax end desc nulls last,
      case when s='sale_year' and d='asc' then last_sale_year end asc nulls last,case when s='sale_year' and d='desc' then last_sale_year end desc nulls last,
      case when s='tenure' and d='asc' then years_since_sale end asc nulls last,case when s='tenure' and d='desc' then years_since_sale end desc nulls last,
      case when s='watchdog_score' and d='asc' then watchdog_score end asc nulls last,case when s='watchdog_score' and d='desc' then watchdog_score end desc nulls last,
      case when s='tax_pressure' and d='asc' then tax_pressure end asc nulls last,case when s='tax_pressure' and d='desc' then tax_pressure end desc nulls last,ord asc limit psz offset offv
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'pams_pin',pams_pin,'address',address,'town',town,'county',county,'zip',zip,'block',block,'lot',lot,'qualifier',qualifier,'prop_class',prop_class,
    'year_built',year_built,'acres',acres,'dwelling_units',dwelling_units,'building_desc',building_desc,'square_feet',null,'land_value',land_value,
    'improvement_value',improvement_value,'assessed_value',assessed_value,'last_year_tax',last_year_tax,'effective_rate',effective_rate,'last_sale_price',last_sale_price,
    'last_sale_year',last_sale_year,'years_since_sale',years_since_sale,'lat',lat,'lon',lon,'last_seen',last_seen,'watchdog_score',watchdog_score,
    'tax_pressure',tax_pressure,'revaluation_risk',revaluation_risk,'uniformity_score',uniformity_score)),'[]'::jsonb) into rows from ranked;
  return jsonb_build_object('rows',rows,'total',total_count,'page',pg,'page_size',psz,'pages',greatest(1,ceil(total_count::numeric/psz)::integer),'sort',s,'dir',d,'prop_class',cls);
end
$$;
revoke all on function public.marketing_audience_review_page(uuid,text,text,integer,integer,text,text) from public,anon;
grant execute on function public.marketing_audience_review_page(uuid,text,text,integer,integer,text,text) to authenticated;
