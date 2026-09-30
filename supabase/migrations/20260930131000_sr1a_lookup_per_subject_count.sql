-- SR-1A subject evidence: count matching parcels per subject, not per state.
--
-- lookup_sr1a_subject_evidence (20260823143628) grouped the whole of
-- property_lookups (three regexp_replace keys plus count(distinct pams_pin))
-- on every call, just to learn how many parcels share a subject's compact
-- block/lot key. That was cheap at ~11k rows. After the statewide parcel load
-- (3.48M rows, Sep 28) every call hit the 8 s statement timeout: 1,941 of the
-- 2,174 statement timeouts on Sep 29-30, and a large part of the IO that took
-- the database down on Sep 30.
--
-- This keeps the function's inputs, outputs and matching rules identical and
-- only changes how property_count is found: a LATERAL count for each compact
-- candidate, served by an expression index on the same three keys.
--
-- Deploy: build the index first without blocking writes, from the SQL editor
-- (CONCURRENTLY cannot run inside a migration transaction):
--
--   create index concurrently if not exists property_lookups_compact_parcel_key_idx
--     on public.property_lookups (
--       (left(regexp_replace(coalesce(pams_pin,''),'\D','','g'), 4)),
--       (replace(upper(regexp_replace(regexp_replace(coalesce(block,''),'\s+','','g'),'^0+','','g')), '.', '')),
--       (replace(upper(regexp_replace(regexp_replace(coalesce(lot,''),'\s+','','g'),'^0+','','g')), '.', ''))
--     );
--
-- then apply this migration; its create index if not exists is then a no-op.
-- If the index was not built first, this migration builds it (blocking writes
-- to property_lookups while it runs), so the new function never runs without it.
-- Safe to re-run.

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
    -- Count only this subject's parcels, through
    -- property_lookups_compact_parcel_key_idx (same three expressions).
    left join lateral (
      select count(distinct pl.pams_pin)::int as property_count
      from public.property_lookups pl
      where left(regexp_replace(coalesce(pl.pams_pin,''),'\D','','g'), 4) = i.district_code
        and replace(upper(regexp_replace(regexp_replace(coalesce(pl.block,''),'\s+','','g'),'^0+','','g')), '.', '') = i.compact_block_key
        and replace(upper(regexp_replace(regexp_replace(coalesce(pl.lot,''),'\s+','','g'),'^0+','','g')), '.', '') = i.compact_lot_key
    ) w on true
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
