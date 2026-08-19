create or replace function public.integration_upsert_crm_context_batch(
  p_user_id uuid,
  p_connection_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  if not exists (select 1 from public.integration_connections where id=p_connection_id and user_id=p_user_id and status<>'revoked') then raise exception 'integration connection unavailable'; end if;
  with src as (
    select left(trim(x->>'external_contact_id'),180) external_contact_id,
      nullif(left(trim(x->>'property_ref'),180),'') property_ref,
      nullif(left(trim(x->>'property_address'),220),'') property_address,
      nullif(left(trim(x->>'contact_name'),180),'') contact_name,
      case when lower(trim(x->>'contact_email')) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then left(lower(trim(x->>'contact_email')),254) else null end contact_email,
      case when trim(x->>'contact_phone') ~ '^[+()0-9 .-]{7,40}$' then left(trim(x->>'contact_phone'),40) else null end contact_phone,
      nullif(left(trim(x->>'lead_stage'),100),'') lead_stage,
      nullif(left(trim(x->>'relationship'),100),'') relationship,
      case when coalesce(x->>'last_activity_at','') ~ '^\d{4}-\d{2}-\d{2}T' then (x->>'last_activity_at')::timestamptz else null end last_activity_at,
      coalesce(array(select left(value,80) from jsonb_array_elements_text(coalesce(x->'tags','[]'::jsonb)) value limit 30),'{}'::text[]) tags,
      jsonb_strip_nulls(jsonb_build_object(
        'provider',nullif(left(trim(x#>>'{context,provider}'),60),''),
        'crm_authoritative',case when jsonb_typeof(x#>'{context,crm_authoritative}')='boolean' then (x#>>'{context,crm_authoritative}')::boolean else null end,
        'intelligence_eligible',case when jsonb_typeof(x#>'{context,intelligence_eligible}')='boolean' then (x#>>'{context,intelligence_eligible}')::boolean else null end,
        'source',nullif(left(trim(x#>>'{context,source}'),120),''),
        'system_source',nullif(left(trim(x#>>'{context,system_source}'),120),''),
        'deal_type',nullif(left(trim(x#>>'{context,deal_type}'),100),''),
        'provider_status_code',case when coalesce(x#>>'{context,provider_status_code}','') ~ '^-?[0-9]+$' then (x#>>'{context,provider_status_code}')::integer else null end,
        'assigned_agent_id',nullif(left(trim(x#>>'{context,assigned_agent_id}'),80),''),
        'assigned_agent_external_id',nullif(left(trim(x#>>'{context,assigned_agent_external_id}'),120),''),
        'external_vendor_id',nullif(left(trim(x#>>'{context,external_vendor_id}'),120),'')
      )) context,
      case when coalesce(x->>'source_updated_at','') ~ '^\d{4}-\d{2}-\d{2}T' then (x->>'source_updated_at')::timestamptz else null end source_updated_at
    from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) x where nullif(trim(x->>'external_contact_id'),'') is not null
  ), ins as (
    insert into public.integration_crm_context(user_id,connection_id,external_contact_id,property_ref,property_address,contact_name,contact_email,contact_phone,lead_stage,relationship,last_activity_at,tags,context,source_updated_at,updated_at)
    select p_user_id,p_connection_id,external_contact_id,property_ref,property_address,contact_name,contact_email,contact_phone,lead_stage,relationship,last_activity_at,tags,context,source_updated_at,now() from src
    on conflict (user_id,connection_id,external_contact_id,(coalesce(property_ref,''))) do update set
      property_address=excluded.property_address,contact_name=excluded.contact_name,contact_email=excluded.contact_email,contact_phone=coalesce(excluded.contact_phone,integration_crm_context.contact_phone),lead_stage=excluded.lead_stage,relationship=excluded.relationship,last_activity_at=coalesce(excluded.last_activity_at,integration_crm_context.last_activity_at),tags=case when cardinality(excluded.tags)>0 then excluded.tags else integration_crm_context.tags end,context=integration_crm_context.context||excluded.context,source_updated_at=coalesce(excluded.source_updated_at,integration_crm_context.source_updated_at),updated_at=now()
    returning 1
  ) select count(*) into v_count from ins;
  return v_count;
end;
$$;
revoke all on function public.integration_upsert_crm_context_batch(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.integration_upsert_crm_context_batch(uuid,uuid,jsonb) to service_role;
