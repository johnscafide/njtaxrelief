create or replace function public.lookup_sr1a_subject_evidence(p_subjects jsonb)
returns table(
  request_key text,
  district_code text,
  block_key text,
  lot_key text,
  qualifier_key text,
  living_space integer,
  sale_year smallint,
  sale_month smallint,
  year_built smallint,
  assessed_value bigint,
  sale_price bigint,
  sale_ratio numeric,
  sale_ppsf numeric,
  match_quality text
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  with input as (
    select
      ordinality::int as ord,
      left(coalesce(nullif(item->>'key',''), ordinality::text), 120) as request_key,
      item->>'district' as district_code,
      item->>'block' as block_key,
      item->>'lot' as lot_key,
      replace(item->>'block', '.', '') as compact_block_key,
      replace(item->>'lot', '.', '') as compact_lot_key,
      coalesce(item->>'qualifier','') as qualifier_key
    from jsonb_array_elements(coalesce(p_subjects, '[]'::jsonb)) with ordinality as src(item, ordinality)
    where item ? 'district' and item ? 'block' and item ? 'lot'
  ),
  warehouse_keys as (
    select
      left(regexp_replace(coalesce(pams_pin,''),'\D','','g'), 4) as district_code,
      replace(upper(regexp_replace(regexp_replace(coalesce(block,''),'\s+','','g'),'^0+','','g')), '.', '') as compact_block_key,
      replace(upper(regexp_replace(regexp_replace(coalesce(lot,''),'\s+','','g'),'^0+','','g')), '.', '') as compact_lot_key,
      count(distinct pams_pin)::int as property_count
    from public.property_lookups
    group by 1,2,3
  ),
  exact_candidates as (
    select
      i.ord,
      i.request_key,
      i.qualifier_key as requested_qualifier,
      e.*,
      count(*) over (partition by i.ord) as candidate_count,
      case when e.qualifier_key = i.qualifier_key then 0 else 1 end as priority
    from input i
    join public.sr1a_subject_evidence e
      on e.district_code = i.district_code
     and e.block_key = i.block_key
     and e.lot_key = i.lot_key
  ),
  exact_eligible as (
    select *,
      row_number() over (
        partition by ord
        order by priority, sale_year desc nulls last, sale_month desc nulls last, qualifier_key
      ) as rn
    from exact_candidates
    where priority = 0 or candidate_count = 1
  ),
  compact_candidates as (
    select
      i.ord,
      i.request_key,
      i.qualifier_key as requested_qualifier,
      e.*,
      coalesce(w.property_count, 0) as property_count,
      count(*) over (partition by i.ord) as candidate_count,
      case when e.qualifier_key = i.qualifier_key then 0 else 1 end as priority
    from input i
    join public.sr1a_subject_evidence e
      on e.district_code = i.district_code
     and e.block_key = i.compact_block_key
     and e.lot_key = i.compact_lot_key
    left join warehouse_keys w
      on w.district_code = i.district_code
     and w.compact_block_key = i.compact_block_key
     and w.compact_lot_key = i.compact_lot_key
    where not exists (
      select 1 from exact_candidates x where x.ord = i.ord
    )
  ),
  compact_eligible as (
    select *,
      row_number() over (
        partition by ord
        order by priority, sale_year desc nulls last, sale_month desc nulls last, qualifier_key
      ) as rn
    from compact_candidates
    where priority = 0 or (candidate_count = 1 and property_count = 1)
  ),
  selected as (
    select
      ord, request_key, district_code, block_key, lot_key, qualifier_key,
      living_space, sale_year, sale_month, year_built, assessed_value, sale_price,
      sale_ratio, sale_ppsf,
      case when qualifier_key = requested_qualifier then 'exact' else 'unique_parcel_fallback' end as match_quality
    from exact_eligible
    where rn = 1
    union all
    select
      ord, request_key, district_code, block_key, lot_key, qualifier_key,
      living_space, sale_year, sale_month, year_built, assessed_value, sale_price,
      sale_ratio, sale_ppsf,
      case when qualifier_key = requested_qualifier then 'compact_exact' else 'compact_unique_parcel_fallback' end as match_quality
    from compact_eligible
    where rn = 1
  )
  select
    request_key,
    district_code,
    block_key,
    lot_key,
    qualifier_key,
    living_space,
    sale_year,
    sale_month,
    year_built,
    assessed_value,
    sale_price,
    sale_ratio,
    sale_ppsf,
    match_quality
  from selected
  order by ord;
$function$;

revoke all on function public.lookup_sr1a_subject_evidence(jsonb) from public, anon, authenticated;
grant execute on function public.lookup_sr1a_subject_evidence(jsonb) to service_role;
