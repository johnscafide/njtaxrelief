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
  if not exists (
    select 1 from public.integration_connections
    where id = p_connection_id and user_id = p_user_id and status <> 'revoked'
  ) then
    raise exception 'integration connection unavailable';
  end if;

  with src as (
    select
      left(trim(x->>'external_contact_id'),180) as external_contact_id,
      nullif(left(trim(x->>'property_ref'),180),'') as property_ref,
      nullif(left(trim(x->>'property_address'),220),'') as property_address,
      nullif(left(trim(x->>'contact_name'),180),'') as contact_name,
      nullif(left(lower(trim(x->>'contact_email')),254),'') as contact_email,
      nullif(left(trim(x->>'contact_phone'),40),'') as contact_phone,
      nullif(left(trim(x->>'lead_stage'),100),'') as lead_stage,
      nullif(left(trim(x->>'relationship'),100),'') as relationship,
      case when coalesce(x->>'last_activity_at','') ~ '^\d{4}-\d{2}-\d{2}T' then (x->>'last_activity_at')::timestamptz else null end as last_activity_at,
      coalesce(array(select left(value,80) from jsonb_array_elements_text(coalesce(x->'tags','[]'::jsonb)) value limit 30),'{}'::text[]) as tags,
      case when jsonb_typeof(x->'context')='object' then x->'context' else '{}'::jsonb end as context,
      case when coalesce(x->>'source_updated_at','') ~ '^\d{4}-\d{2}-\d{2}T' then (x->>'source_updated_at')::timestamptz else null end as source_updated_at
    from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) x
    where nullif(trim(x->>'external_contact_id'),'') is not null
  ), ins as (
    insert into public.integration_crm_context(
      user_id,connection_id,external_contact_id,property_ref,property_address,
      contact_name,contact_email,contact_phone,lead_stage,relationship,last_activity_at,
      tags,context,source_updated_at,updated_at
    )
    select p_user_id,p_connection_id,external_contact_id,property_ref,property_address,
      contact_name,contact_email,contact_phone,lead_stage,relationship,last_activity_at,
      tags,context,source_updated_at,now()
    from src
    on conflict (user_id, connection_id, external_contact_id, (coalesce(property_ref,'')))
    do update set
      property_address = excluded.property_address,
      contact_name = excluded.contact_name,
      contact_email = excluded.contact_email,
      contact_phone = coalesce(excluded.contact_phone, integration_crm_context.contact_phone),
      lead_stage = excluded.lead_stage,
      relationship = excluded.relationship,
      last_activity_at = coalesce(excluded.last_activity_at, integration_crm_context.last_activity_at),
      tags = case when cardinality(excluded.tags)>0 then excluded.tags else integration_crm_context.tags end,
      context = integration_crm_context.context || excluded.context,
      source_updated_at = coalesce(excluded.source_updated_at, integration_crm_context.source_updated_at),
      updated_at = now()
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end;
$$;
revoke all on function public.integration_upsert_crm_context_batch(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.integration_upsert_crm_context_batch(uuid,uuid,jsonb) to service_role;

create or replace function private.integration_kick_provider_worker(p_connection_id uuid default null, p_trigger text default 'schedule')
returns bigint
language plpgsql
security definer
set search_path = public, private, vault, net, pg_temp
as $$
declare
  v_url text;
  v_token text;
  v_request_id bigint;
  v_trigger text;
begin
  v_trigger := case when p_trigger in ('connect','manual','schedule','retry') then p_trigger else 'schedule' end;
  select project_url into v_url from public.integration_runtime_config where id=true limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name='integration_provider_worker_token' order by updated_at desc limit 1;
  if v_url is null or v_token is null then return null; end if;
  select net.http_post(
    url := rtrim(v_url,'/') || '/functions/v1/integration-provider-sync-worker',
    headers := jsonb_build_object('Content-Type','application/json','x-watchdog-provider-worker-token',v_token),
    body := jsonb_strip_nulls(jsonb_build_object('connection_id',p_connection_id,'trigger',v_trigger)),
    timeout_milliseconds := 10000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function private.integration_kick_provider_worker(uuid,text) from public, anon, authenticated;
grant execute on function private.integration_kick_provider_worker(uuid,text) to service_role;
