-- NJW-264: private, user-scoped Kit broadcast analytics for Watchdog Broadcasts.
-- Provider credentials remain server-side and are never returned to the browser.

create extension if not exists http with schema extensions;

create or replace function public.marketing_email_broadcast_analytics(p_broadcast_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_conn_id uuid;
  v_conn_status text;
  v_key text;
  v_row record;
  v_resp extensions.http_response;
  v_json jsonb;
  v_stats jsonb := '{}'::jsonb;
  v_clicks jsonb := '[]'::jsonb;
  v_recent jsonb := '[]'::jsonb;
  v_url text;
  v_after text;
  v_has_next boolean := false;
  v_pages integer := 0;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;

  if not exists (
    select 1
    from public.marketing_email_beta_access b
    where b.user_id = v_uid
      and (b.expires_at is null or b.expires_at > now())
  ) then
    raise exception 'Broadcasts is currently a private beta';
  end if;

  select c.id, c.status
    into v_conn_id, v_conn_status
  from public.marketing_provider_connections c
  where c.user_id = v_uid
    and c.provider_key = 'kit'
    and c.connection_scope = 'user'
  order by c.updated_at desc
  limit 1;

  if v_conn_id is null or v_conn_status <> 'connected' then
    raise exception 'Kit is not connected';
  end if;

  select public.marketing_get_provider_secret(v_conn_id, 'api_key') into v_key;
  if coalesce(length(v_key), 0) < 16 then
    raise exception 'Kit credential is unavailable; reconnect Kit';
  end if;

  if p_broadcast_id is null then
    for v_row in
      select b.id, b.external_broadcast_id, b.status, b.subject, b.from_email,
             b.target_definition, b.send_at, b.provider_snapshot, b.created_at, b.updated_at
      from public.marketing_email_broadcasts b
      where b.user_id = v_uid
        and b.provider_key = 'kit'
      order by b.updated_at desc
      limit 12
    loop
      v_stats := coalesce(v_row.provider_snapshot -> 'analytics', '{}'::jsonb);
      begin
        v_url := 'https://api.kit.com/v4/broadcasts/' || extensions.urlencode(v_row.external_broadcast_id::varchar) || '/stats';
        select * into v_resp
        from extensions.http((row(
          'GET'::extensions.http_method,
          v_url::varchar,
          array[
            extensions.http_header('X-Kit-Api-Key', v_key),
            extensions.http_header('Accept', 'application/json')
          ]::extensions.http_header[],
          null::varchar,
          null::varchar
        ))::extensions.http_request);

        if v_resp.status between 200 and 299 then
          v_json := v_resp.content::jsonb;
          v_stats := coalesce(v_json #> '{broadcast,stats}', '{}'::jsonb);
        end if;
      exception when others then
        null;
      end;

      v_recent := v_recent || jsonb_build_array(
        to_jsonb(v_row) || jsonb_build_object('stats', v_stats)
      );
    end loop;

    return jsonb_build_object(
      'recent_broadcasts', v_recent,
      'analytics_synced_at', v_now
    );
  end if;

  select b.id, b.external_broadcast_id, b.status, b.subject, b.from_email,
         b.target_definition, b.send_at, b.provider_snapshot, b.created_at, b.updated_at
    into v_row
  from public.marketing_email_broadcasts b
  where b.id = p_broadcast_id
    and b.user_id = v_uid
    and b.provider_key = 'kit'
  limit 1;

  if v_row.id is null then
    raise exception 'Broadcast was not found for this Watchdog account';
  end if;

  v_url := 'https://api.kit.com/v4/broadcasts/' || extensions.urlencode(v_row.external_broadcast_id::varchar) || '/stats';
  select * into v_resp
  from extensions.http((row(
    'GET'::extensions.http_method,
    v_url::varchar,
    array[
      extensions.http_header('X-Kit-Api-Key', v_key),
      extensions.http_header('Accept', 'application/json')
    ]::extensions.http_header[],
    null::varchar,
    null::varchar
  ))::extensions.http_request);

  if v_resp.status not between 200 and 299 then
    raise exception 'Kit analytics request failed with status %', v_resp.status;
  end if;

  v_json := v_resp.content::jsonb;
  v_stats := coalesce(v_json #> '{broadcast,stats}', '{}'::jsonb);
  v_after := null;
  v_pages := 0;

  loop
    v_url := 'https://api.kit.com/v4/broadcasts/' || extensions.urlencode(v_row.external_broadcast_id::varchar) || '/clicks?per_page=100';
    if v_after is not null then
      v_url := v_url || '&after=' || extensions.urlencode(v_after::varchar);
    end if;

    select * into v_resp
    from extensions.http((row(
      'GET'::extensions.http_method,
      v_url::varchar,
      array[
        extensions.http_header('X-Kit-Api-Key', v_key),
        extensions.http_header('Accept', 'application/json')
      ]::extensions.http_header[],
      null::varchar,
      null::varchar
    ))::extensions.http_request);

    exit when v_resp.status not between 200 and 299;

    v_json := v_resp.content::jsonb;
    v_clicks := v_clicks || coalesce(v_json #> '{broadcast,clicks}', '[]'::jsonb);
    v_after := coalesce(
      v_json #>> '{pagination,end_cursor}',
      v_json #>> '{broadcast,pagination,end_cursor}'
    );
    v_has_next := coalesce(
      (v_json #>> '{pagination,has_next_page}')::boolean,
      (v_json #>> '{broadcast,pagination,has_next_page}')::boolean,
      false
    );
    v_pages := v_pages + 1;
    exit when not v_has_next or v_after is null or v_pages >= 20;
  end loop;

  update public.marketing_email_broadcasts b
  set status = case lower(coalesce(v_stats ->> 'status', ''))
        when 'completed' then 'sent'
        when 'complete' then 'sent'
        when 'failed' then 'error'
        when 'cancelled' then 'canceled'
        when 'queued' then 'sending'
        when 'processing' then 'sending'
        when 'draft' then 'draft'
        when 'scheduled' then 'scheduled'
        when 'sending' then 'sending'
        when 'sent' then 'sent'
        when 'canceled' then 'canceled'
        when 'error' then 'error'
        else b.status
      end,
      provider_snapshot = coalesce(b.provider_snapshot, '{}'::jsonb) || jsonb_build_object(
        'analytics', v_stats,
        'analytics_synced_at', v_now
      ),
      updated_at = v_now
  where b.id = v_row.id
    and b.user_id = v_uid;

  return jsonb_build_object(
    'broadcast', to_jsonb(v_row),
    'stats', v_stats,
    'clicks', v_clicks,
    'provider_details', jsonb_build_object('send_at', v_row.send_at),
    'analytics_synced_at', v_now
  );
end;
$$;

revoke all on function public.marketing_email_broadcast_analytics(uuid) from public, anon;
grant execute on function public.marketing_email_broadcast_analytics(uuid) to authenticated;

comment on function public.marketing_email_broadcast_analytics(uuid) is
'Private-beta, user-scoped Kit broadcast analytics. Reads the server-side Kit credential and returns engagement metrics only; never returns provider secrets.';
