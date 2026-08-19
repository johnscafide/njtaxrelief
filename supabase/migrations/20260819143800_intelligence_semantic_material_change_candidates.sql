-- Governed source-fact change candidate ledger for Property Change model research.
-- This is deliberately NOT a customer notification stream. It captures only changes
-- between two available PUBLIC SOURCE FACT values in Semantic Context cache updates.
-- Watchdog-derived signals, owner names, addresses, coordinates, cache metadata and
-- source-reference-only changes are excluded to prevent circular or privacy-heavy inputs.

create table if not exists public.intelligence_material_change_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pams_pin text not null,
  marker_id text not null,
  event_type text not null check (event_type in ('assessment_change','tax_change','permit_change','deed_change','environment_change','market_change','municipal_change','evidence_change')),
  materiality text not null check (materiality in ('low','medium','high')),
  old_value jsonb not null,
  new_value jsonb not null,
  old_value_hash text not null,
  new_value_hash text not null,
  source_id text,
  source_ref text,
  provider_kind text,
  marker_tier text,
  old_facts_hash text,
  new_facts_hash text,
  candidate_key text not null,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, candidate_key)
);

alter table public.intelligence_material_change_candidates enable row level security;
revoke all on table public.intelligence_material_change_candidates from anon, authenticated;
grant select, insert, update, delete on table public.intelligence_material_change_candidates to service_role;

create index if not exists intelligence_material_change_candidates_user_time_idx
  on public.intelligence_material_change_candidates (user_id, detected_at desc);
create index if not exists intelligence_material_change_candidates_pin_time_idx
  on public.intelligence_material_change_candidates (user_id, pams_pin, detected_at desc);
create index if not exists intelligence_material_change_candidates_type_time_idx
  on public.intelligence_material_change_candidates (event_type, detected_at desc);

create or replace function public.semantic_source_fact_event_type(p_marker_id text, p_category text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  marker text := lower(coalesce(p_marker_id,''));
  category text := lower(coalesce(p_category,''));
begin
  -- Explicit privacy/noise exclusions.
  if marker in ('property.address','property.owner_name','property.lat','property.lon','property.pams_pin') then return null; end if;

  if marker in ('property.land_assessment','property.improvement_assessment','property.assessed_value')
     or marker like '%assessment%' then return 'assessment_change'; end if;
  if marker='property.annual_tax' or marker like 'tax.%' then return 'tax_change'; end if;
  if marker like 'preflight.permit_%' or category='permits' then return 'permit_change'; end if;
  if marker in ('property.sale_price','property.sale_date','property.deed_book','property.deed_page') then return 'deed_change'; end if;
  if category in ('environment','flood','wetlands')
     or marker like 'preflight.contaminated_%'
     or marker like 'preflight.deed_notice_%'
     or marker like 'preflight.cea_%'
     or marker like 'preflight.ust_%'
     or marker like 'preflight.fema_%'
     or marker like 'preflight.tidal_%'
     or marker like 'preflight.wetlands_%'
     or marker like 'preflight.epa_priority_%' then return 'environment_change'; end if;
  if marker like 'sales.%' then return 'market_change'; end if;
  if marker like 'uniformity.%' or marker like 'budget.%' or marker like 'exemption.%' or marker like 'abatement.%' then return 'municipal_change'; end if;
  if category in ('title & land','development') then return 'evidence_change'; end if;
  return null;
end $$;

create or replace function public.project_semantic_source_fact_change_candidates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n jsonb;
  o jsonb;
  marker_id text;
  event_type text;
  old_value jsonb;
  new_value jsonb;
  materiality text;
  old_num numeric;
  new_num numeric;
  pct numeric;
  candidate_key text;
begin
  if new.user_id is null or new.pams_pin is null or new.facts_hash is not distinct from old.facts_hash then
    return new;
  end if;

  for n in select value from jsonb_array_elements(coalesce(new.payload->'markers','[]'::jsonb))
  loop
    if coalesce(n->>'truth_class','') <> 'source_fact'
       or coalesce(n->>'origin','') <> 'public'
       or coalesce(n->>'state','') <> 'available' then
      continue;
    end if;

    marker_id := n->>'id';
    event_type := public.semantic_source_fact_event_type(marker_id,n->>'category');
    if event_type is null then continue; end if;

    select value into o
    from jsonb_array_elements(coalesce(old.payload->'markers','[]'::jsonb)) value
    where value->>'id'=marker_id
      and value->>'truth_class'='source_fact'
      and value->>'origin'='public'
      and value->>'state'='available'
    limit 1;

    if o is null then continue; end if;
    old_value := o->'resolved_value';
    new_value := n->'resolved_value';
    if old_value is null or new_value is null or old_value = new_value then continue; end if;

    -- Materiality describes the size/type of the factual change, not urgency or outcome.
    materiality := case
      when event_type in ('assessment_change','tax_change','permit_change','deed_change','environment_change') then 'medium'
      else 'low'
    end;

    begin
      old_num := case
        when jsonb_typeof(old_value)='number' then (old_value::text)::numeric
        when jsonb_typeof(old_value)='string' and trim(both '"' from old_value::text) ~ '^-?[0-9]+(\.[0-9]+)?$' then trim(both '"' from old_value::text)::numeric
        else null end;
      new_num := case
        when jsonb_typeof(new_value)='number' then (new_value::text)::numeric
        when jsonb_typeof(new_value)='string' and trim(both '"' from new_value::text) ~ '^-?[0-9]+(\.[0-9]+)?$' then trim(both '"' from new_value::text)::numeric
        else null end;
      if old_num is not null and new_num is not null then
        pct := case when abs(old_num)>0 then abs(new_num-old_num)/abs(old_num) else null end;
        if pct is not null and pct >= 0.05 and event_type in ('assessment_change','tax_change','market_change') then materiality := 'high';
        elsif pct is not null and pct >= 0.01 and materiality='low' then materiality := 'medium';
        end if;
      end if;
    exception when others then
      old_num := null; new_num := null; pct := null;
    end;

    -- Include property identity in the dedupe material so identical value changes
    -- on different properties remain distinct candidates without exposing the key publicly.
    candidate_key := 'semantic:' || new.pams_pin || ':' || marker_id || ':' || md5(old_value::text || '>' || new_value::text);

    insert into public.intelligence_material_change_candidates(
      user_id,pams_pin,marker_id,event_type,materiality,old_value,new_value,
      old_value_hash,new_value_hash,source_id,source_ref,provider_kind,marker_tier,
      old_facts_hash,new_facts_hash,candidate_key,detected_at
    ) values (
      new.user_id,new.pams_pin,marker_id,event_type,materiality,old_value,new_value,
      md5(old_value::text),md5(new_value::text),nullif(n->>'source_id',''),
      nullif(coalesce(n->>'resolved_source',n->>'source'),'') ,nullif(n->>'provider_kind',''),nullif(n->>'tier',''),
      old.facts_hash,new.facts_hash,candidate_key,coalesce(new.checked_at,now())
    ) on conflict (user_id,candidate_key) do nothing;
  end loop;

  return new;
end $$;

revoke all on function public.semantic_source_fact_event_type(text,text) from public, anon, authenticated;
revoke all on function public.project_semantic_source_fact_change_candidates() from public, anon, authenticated;

drop trigger if exists semantic_source_fact_change_candidate_projection on public.intelligence_semantic_snapshot_cache;
create trigger semantic_source_fact_change_candidate_projection
after update of facts_hash,payload on public.intelligence_semantic_snapshot_cache
for each row
when (new.facts_hash is distinct from old.facts_hash)
execute function public.project_semantic_source_fact_change_candidates();

comment on table public.intelligence_material_change_candidates is
'Service-only candidate ledger of factual public-source marker changes observed across Semantic Context cache versions. Not customer notifications and not calibration proof.';
comment on function public.project_semantic_source_fact_change_candidates() is
'Projects only changed available public source facts into a service-only research candidate ledger; excludes Watchdog-derived feedback loops and sensitive/static identity markers.';

-- Installation assertions: fail closed to browser roles and require the trigger.
do $$
declare
  has_trigger boolean;
begin
  if has_table_privilege('authenticated','public.intelligence_material_change_candidates','SELECT')
     or has_table_privilege('anon','public.intelligence_material_change_candidates','SELECT') then
    raise exception 'Material change candidate ledger must not be browser-readable';
  end if;
  select exists(select 1 from pg_trigger where tgrelid='public.intelligence_semantic_snapshot_cache'::regclass and tgname='semantic_source_fact_change_candidate_projection' and not tgisinternal) into has_trigger;
  if not has_trigger then raise exception 'Semantic source-fact change candidate trigger missing'; end if;
end $$;