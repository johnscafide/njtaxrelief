-- SR-1A subject evidence: count each compact parcel key once per call.
--
-- 20260930131000 counts a subject's parcels with a LATERAL count, but the
-- LATERAL sat on the subject x evidence join, so it ran once per (subject,
-- evidence row) pair. On a large condominium lot that multiplies: on Oct 1 the
-- score pass stopped at Hoboken block 261.03 lot 1 (755 units, 34 SR-1A sales).
-- A 400-subject call there ran about 13,600 counts of the same 755 parcels and
-- hit the 8 s statement timeout three times in a row.
--
-- The count depends only on (district, compact block, compact lot), so it now
-- runs once for each distinct key among the subjects that take the compact
-- path, in a MATERIALIZED CTE, and is joined back. Inputs, outputs and matching
-- rules are unchanged; only the number of counts changes.
--
-- The index from 20260930131000 already exists in production; the statement
-- below is a no-op there and keeps this file self-contained.
set local lock_timeout = '5s';
set local statement_timeout = '30min';

create index if not exists property_lookups_compact_parcel_key_idx
  on public.property_lookups (
    (left(regexp_replace(coalesce(pams_pin,''),'\D','','g'), 4)),
    (replace(upper(regexp_replace(regexp_replace(coalesce(block,''),'\s+','','g'),'^0+','','g')), '.', '')),
    (replace(upper(regexp_replace(regexp_replace(coalesce(lot,''),'\s+','','g'),'^0+','','g')), '.', ''))
  );

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
  compact_input as (
    select i.*
    from input i
    where not exists (
      select 1 from exact_candidates x where x.ord = i.ord
    )
  ),
  -- One row per compact parcel key that has SR-1A evidence, however many
  -- subjects or evidence rows share it.
  compact_keys as (
    select distinct ci.district_code, ci.compact_block_key, ci.compact_lot_key
    from compact_input ci
    where exists (
      select 1 from public.sr1a_subject_evidence e
      where e.district_code = ci.district_code
        and e.block_key = ci.compact_block_key
        and e.lot_key = ci.compact_lot_key
    )
  ),
  -- Count each key's parcels once, through
  -- property_lookups_compact_parcel_key_idx (same three expressions).
  compact_counts as materialized (
    select k.district_code, k.compact_block_key, k.compact_lot_key, w.property_count
    from compact_keys k
    left join lateral (
      select count(distinct pl.pams_pin)::int as property_count
      from public.property_lookups pl
      where left(regexp_replace(coalesce(pl.pams_pin,''),'\D','','g'), 4) = k.district_code
        and replace(upper(regexp_replace(regexp_replace(coalesce(pl.block,''),'\s+','','g'),'^0+','','g')), '.', '') = k.compact_block_key
        and replace(upper(regexp_replace(regexp_replace(coalesce(pl.lot,''),'\s+','','g'),'^0+','','g')), '.', '') = k.compact_lot_key
    ) w on true
  ),
  compact_candidates as (
    select
      i.ord,
      i.request_key,
      i.qualifier_key as requested_qualifier,
      e.*,
      coalesce(c.property_count, 0) as property_count,
      count(*) over (partition by i.ord) as candidate_count,
      case when e.qualifier_key = i.qualifier_key then 0 else 1 end as priority
    from compact_input i
    join public.sr1a_subject_evidence e
      on e.district_code = i.district_code
     and e.block_key = i.compact_block_key
     and e.lot_key = i.compact_lot_key
    left join compact_counts c
      on c.district_code = i.district_code
     and c.compact_block_key = i.compact_block_key
     and c.compact_lot_key = i.compact_lot_key
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
