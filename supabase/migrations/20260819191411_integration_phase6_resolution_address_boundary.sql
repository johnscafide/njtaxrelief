create or replace function public.integration_set_crm_resolution_address(
  p_user_id uuid,
  p_connection_id uuid,
  p_crm_context_id uuid,
  p_property_address text,
  p_address_source text,
  p_city text,
  p_state text,
  p_zip text
) returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  update public.integration_crm_context c
  set property_address = nullif(left(btrim(coalesce(p_property_address,'')),500),''),
      context = coalesce(c.context,'{}'::jsonb)
        || jsonb_build_object(
          'address_source', nullif(left(btrim(coalesce(p_address_source,'')),80),''),
          'address_city', nullif(left(btrim(coalesce(p_city,'')),120),''),
          'address_state', nullif(left(upper(btrim(coalesce(p_state,''))),20),''),
          'address_zip', nullif(left(btrim(coalesce(p_zip,'')),10),'')
        ),
      updated_at = now()
  where c.id=p_crm_context_id
    and c.user_id=p_user_id
    and c.connection_id=p_connection_id;
  if not found then raise exception 'crm_context_not_found'; end if;
end;
$$;

revoke all on function public.integration_set_crm_resolution_address(uuid,uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.integration_set_crm_resolution_address(uuid,uuid,uuid,text,text,text,text,text) to service_role;

comment on function public.integration_set_crm_resolution_address(uuid,uuid,uuid,text,text,text,text,text) is
  'Service-only allowlisted CRM address enrichment boundary for Phase 6; cannot write arbitrary CRM context keys.';