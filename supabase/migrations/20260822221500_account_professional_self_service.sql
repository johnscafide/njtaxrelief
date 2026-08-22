-- NJW account audit 2026-08-22: profile avatars + customer-controlled export/data deletion/account deletion.
-- Provider credentials remain in Vault and are cleaned before customer workspace deletion.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_avatars_select on storage.objects;
drop policy if exists profile_avatars_insert on storage.objects;
drop policy if exists profile_avatars_update on storage.objects;
drop policy if exists profile_avatars_delete on storage.objects;

create policy profile_avatars_select on storage.objects
  for select to public
  using (bucket_id = 'profile-avatars');

create policy profile_avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = 'user'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy profile_avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = 'user'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = 'user'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy profile_avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = 'user'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create or replace function public.get_my_account_billing_state()
returns table(
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  cancel_at_period_end boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.provider, e.provider_customer_id, e.provider_subscription_id, coalesce(e.cancel_at_period_end,false)
  from public.account_entitlements e
  where e.user_id = auth.uid();
$$;
revoke all on function public.get_my_account_billing_state() from public, anon;
grant execute on function public.get_my_account_billing_state() to authenticated;

create or replace function private.account_export_rows(
  p_table text,
  p_column text,
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  out_rows jsonb := '[]'::jsonb;
begin
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where %I = $1',
    p_table, p_column
  ) into out_rows using p_user_id;
  return coalesce(out_rows, '[]'::jsonb);
exception
  when undefined_table or undefined_column then
    return '[]'::jsonb;
end;
$$;
revoke all on function private.account_export_rows(text,text,uuid) from public, anon, authenticated;
grant execute on function private.account_export_rows(text,text,uuid) to service_role;

create or replace function public.account_export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_data jsonb := '{}'::jsonb;
  r record;
  v_rows jsonb;
  v_identity jsonb;
  v_connections jsonb := '[]'::jsonb;
  v_email_connections jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at
  ) into v_identity
  from auth.users u
  where u.id = v_uid;

  for r in
    select * from (values
      ('profiles','id','profile'),
      ('professional_preferences','user_id','professional_preferences'),
      ('watchdog_onboarding_profiles','user_id','onboarding_profile'),
      ('saved_properties','user_id','saved_properties'),
      ('professional_cases','user_id','professional_cases'),
      ('professional_reports','user_id','professional_reports'),
      ('professional_report_versions','user_id','professional_report_versions'),
      ('data_workbench_views','user_id','data_workbench_views'),
      ('data_workbench_campaigns','user_id','data_workbench_campaigns'),
      ('agent_dynamic_lists','user_id','agent_dynamic_lists'),
      ('agent_dynamic_list_properties','user_id','agent_dynamic_list_properties'),
      ('marketing_campaigns','user_id','marketing_campaigns'),
      ('marketing_audiences','user_id','marketing_audiences'),
      ('marketing_brand_kits','user_id','marketing_brand_kits'),
      ('marketing_email_sender_identities','user_id','marketing_email_sender_identities'),
      ('marketing_email_contact_links','user_id','marketing_email_contact_links'),
      ('marketing_email_broadcasts','user_id','marketing_email_broadcasts'),
      ('support_requests','user_id','support_requests'),
      ('intelligence_analyst_messages','user_id','intelligence_analyst_messages'),
      ('intelligence_analyst_sessions','user_id','intelligence_analyst_sessions'),
      ('intelligence_assumptions','user_id','intelligence_assumptions'),
      ('intelligence_daily_digests','user_id','intelligence_daily_digests'),
      ('intelligence_feedback','user_id','intelligence_feedback'),
      ('intelligence_findings','user_id','intelligence_findings'),
      ('intelligence_jobs','user_id','intelligence_jobs'),
      ('intelligence_outcome_events','user_id','intelligence_outcome_events'),
      ('intelligence_preference_profiles','user_id','intelligence_preference_profiles'),
      ('intelligence_runs','user_id','intelligence_runs'),
      ('intelligence_scopes','user_id','intelligence_scopes'),
      ('intelligence_usage_events','user_id','intelligence_usage_events'),
      ('intelligence_value_snapshots','user_id','intelligence_value_snapshots')
    ) as x(table_name,column_name,export_key)
  loop
    v_rows := private.account_export_rows(r.table_name, r.column_name, v_uid);
    v_data := v_data || jsonb_build_object(r.export_key, v_rows);
  end loop;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'provider', c.provider,
      'name', c.name,
      'status', c.status,
      'direction', c.direction,
      'scopes', c.scopes,
      'intelligence_access', c.intelligence_access,
      'external_account_label', c.external_account_label,
      'created_at', c.created_at,
      'updated_at', c.updated_at
    )), '[]'::jsonb)
    into v_connections
    from public.integration_connections c
    where c.user_id = v_uid;
  exception when undefined_table then v_connections := '[]'::jsonb; end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'provider_key', c.provider_key,
      'status', c.status,
      'mode', c.mode,
      'external_account_ref', c.external_account_ref,
      'public_config', c.public_config,
      'last_health_at', c.last_health_at,
      'last_error', c.last_error,
      'created_at', c.created_at,
      'updated_at', c.updated_at
    )), '[]'::jsonb)
    into v_email_connections
    from public.marketing_provider_connections c
    where c.user_id = v_uid;
  exception when undefined_table then v_email_connections := '[]'::jsonb; end;

  v_data := v_data || jsonb_build_object(
    'integration_connections', v_connections,
    'marketing_provider_connections', v_email_connections
  );

  return jsonb_build_object(
    'schema_version', 2,
    'generated_at', now(),
    'account', coalesce(v_identity,'{}'::jsonb),
    'data', v_data,
    'note', 'This export contains Watchdog customer workspace data associated with the signed-in account. Provider credentials, Vault secrets, internal security logs, payment-provider payloads and raw statewide source datasets are intentionally excluded.'
  );
end;
$$;
revoke all on function public.account_export_my_data() from public, anon;
grant execute on function public.account_export_my_data() to authenticated;

create or replace function private.account_cleanup_provider_secrets(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare r record;
begin
  for r in
    select credential_secret_id as secret_id
    from public.integration_provider_connections
    where user_id = p_user_id and credential_secret_id is not null
  loop
    begin perform public.integration_delete_secret(r.secret_id); exception when others then null; end;
  end loop;

  for r in
    select outbound_secret_id as secret_id
    from public.integration_connections
    where user_id = p_user_id and outbound_secret_id is not null
  loop
    begin perform public.integration_delete_secret(r.secret_id); exception when others then null; end;
  end loop;

  for r in
    select id
    from public.marketing_provider_connections
    where user_id = p_user_id
  loop
    begin perform public.marketing_delete_provider_secrets(r.id); exception when others then null; end;
  end loop;
end;
$$;
revoke all on function private.account_cleanup_provider_secrets(uuid) from public, anon, authenticated;
grant execute on function private.account_cleanup_provider_secrets(uuid) to service_role;

create or replace function private.account_purge_customer_rows(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, private, pg_temp
as $$
declare
  r record;
  v_pass integer;
  v_deleted bigint := 0;
  v_count bigint := 0;
  v_failures jsonb := '[]'::jsonb;
begin
  perform private.account_cleanup_provider_secrets(p_user_id);

  -- Repeated passes let child tables clear before parents without disabling constraints.
  for v_pass in 1..6 loop
    for r in
      select distinct c.table_name
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.column_name = 'user_id'
        and c.table_name not in ('account_entitlements','account_feature_entitlements','marketing_email_beta_access')
        and c.table_name not like 'billing\_%' escape '\'
        and c.table_name not ilike '%audit%'
      order by c.table_name
    loop
      begin
        execute format('delete from public.%I where user_id = $1', r.table_name) using p_user_id;
        get diagnostics v_count = row_count;
        v_deleted := v_deleted + v_count;
      exception
        when foreign_key_violation then
          if v_pass = 6 then v_failures := v_failures || jsonb_build_array(r.table_name); end if;
        when insufficient_privilege then
          if v_pass = 6 then v_failures := v_failures || jsonb_build_array(r.table_name); end if;
      end;
    end loop;
  end loop;

  begin delete from public.organizations where owner_user_id = p_user_id; exception when undefined_table or foreign_key_violation then null; end;
  begin delete from public.profiles where id = p_user_id; exception when undefined_table then null; end;

  update auth.users
  set raw_user_meta_data = '{}'::jsonb,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('rows_deleted',v_deleted,'deferred_tables',v_failures);
end;
$$;
revoke all on function private.account_purge_customer_rows(uuid) from public, anon, authenticated;
grant execute on function private.account_purge_customer_rows(uuid) to service_role;

create or replace function public.account_delete_my_data(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_email text;
  v_role text := 'user';
  v_plan text := 'standard';
begin
  if v_uid is null then raise exception 'Sign in required' using errcode='28000'; end if;
  if coalesce(p_confirmation,'') <> 'DELETE MY DATA' then raise exception 'Typed confirmation is required' using errcode='22023'; end if;

  select u.email into v_email from auth.users u where u.id = v_uid;
  select coalesce(p.account_role,'user'), coalesce(p.plan_tier,'standard')
  into v_role, v_plan
  from public.profiles p where p.id = v_uid;

  v_result := private.account_purge_customer_rows(v_uid);

  -- Keep only the minimum profile row required for Watchdog authentication/access resolution.
  insert into public.profiles(id,email,account_role,plan_tier)
  values(v_uid,v_email,coalesce(v_role,'user'),coalesce(v_plan,'standard'))
  on conflict(id) do update set
    email=excluded.email,
    full_name=null,
    avatar_url=null,
    phone=null,
    display_name=null,
    photo_url=null,
    headline=null,
    city=null,
    zip=null,
    role=null,
    roles=null,
    pro_agent=null,
    pro_lender=null,
    pro_attorney=null,
    pro_accountant=null,
    pro_insurance=null,
    custom='{}'::jsonb,
    account_role=excluded.account_role,
    plan_tier=excluded.plan_tier,
    last_seen=now();

  update public.account_entitlements
  set profession='homeowner', updated_at=now()
  where user_id=v_uid;

  return jsonb_build_object('ok',true,'account_removed',false,'result',v_result);
end;
$$;
revoke all on function public.account_delete_my_data(text) from public, anon;
grant execute on function public.account_delete_my_data(text) to authenticated;

create or replace function public.account_remove_my_account(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_provider text;
  v_subscription_id text;
  v_period_end timestamptz;
begin
  if v_uid is null then raise exception 'Sign in required' using errcode='28000'; end if;
  if coalesce(p_confirmation,'') <> 'DELETE MY ACCOUNT' then raise exception 'Typed confirmation is required' using errcode='22023'; end if;

  select subscription_status, provider, provider_subscription_id, current_period_end
  into v_status, v_provider, v_subscription_id, v_period_end
  from public.account_entitlements
  where user_id = v_uid;

  if v_subscription_id is not null and (
    coalesce(v_status,'') in ('active','trialing','past_due','cancel_scheduled')
    or (v_period_end is not null and v_period_end > now())
  ) then
    raise exception 'End the active % membership before removing this account', coalesce(v_provider,'paid') using errcode='P0001';
  end if;

  perform private.account_purge_customer_rows(v_uid);
  delete from public.account_feature_entitlements where user_id = v_uid;
  delete from public.account_entitlements where user_id = v_uid;
  delete from auth.users where id = v_uid;

  return jsonb_build_object('ok',true,'account_removed',true);
end;
$$;
revoke all on function public.account_remove_my_account(text) from public, anon;
grant execute on function public.account_remove_my_account(text) to authenticated;

comment on function public.account_export_my_data() is 'Authenticated self-service Watchdog customer data export. Never returns provider secrets, Vault material, billing payloads, or internal security logs.';
comment on function public.account_delete_my_data(text) is 'Authenticated typed-confirmation purge of customer workspace data while preserving the login and billing entitlement records.';
comment on function public.account_remove_my_account(text) is 'Authenticated typed-confirmation account deletion. Fails closed while a paid subscription is still active.';
