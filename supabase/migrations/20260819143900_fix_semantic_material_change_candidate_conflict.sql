-- Fix PL/pgSQL identifier ambiguity in the source-fact material-change candidate projector.
-- The original trigger function used a local variable named candidate_key, which collided
-- with the table column referenced by ON CONFLICT. This patch changes only the local name.

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
  v_candidate_key text;
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

    v_candidate_key := 'semantic:' || new.pams_pin || ':' || marker_id || ':' || md5(old_value::text || '>' || new_value::text);

    insert into public.intelligence_material_change_candidates(
      user_id,pams_pin,marker_id,event_type,materiality,old_value,new_value,
      old_value_hash,new_value_hash,source_id,source_ref,provider_kind,marker_tier,
      old_facts_hash,new_facts_hash,candidate_key,detected_at
    ) values (
      new.user_id,new.pams_pin,marker_id,event_type,materiality,old_value,new_value,
      md5(old_value::text),md5(new_value::text),nullif(n->>'source_id',''),
      nullif(coalesce(n->>'resolved_source',n->>'source'),''),nullif(n->>'provider_kind',''),nullif(n->>'tier',''),
      old.facts_hash,new.facts_hash,v_candidate_key,coalesce(new.checked_at,now())
    ) on conflict (user_id,candidate_key) do nothing;
  end loop;

  return new;
end $$;

revoke all on function public.project_semantic_source_fact_change_candidates() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.intelligence_semantic_snapshot_cache'::regclass
      and tgname='semantic_source_fact_change_candidate_projection'
      and not tgisinternal
  ) then
    raise exception 'Semantic source-fact change candidate trigger missing after ambiguity fix';
  end if;
end $$;