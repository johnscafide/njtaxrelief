-- Service-only control/dispatcher for the aggregate Closing Review v4 structural shadow.
-- No cron is installed. No property-level shadow output is persisted.

create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.intelligence_closing_shadow_control (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  project_url text,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  per_county integer not null default 3 check (per_county between 2 and 4),
  updated_at timestamptz not null default now()
);

alter table public.intelligence_closing_shadow_control enable row level security;
revoke all on public.intelligence_closing_shadow_control from anon, authenticated;
grant select,insert,update,delete on public.intelligence_closing_shadow_control to service_role;

do $$
declare
  v_token text;
  v_hash text;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name='watchdog_closing_shadow_token'
  order by updated_at desc
  limit 1;

  if v_token is null then
    v_token := encode(gen_random_bytes(32),'hex');
    perform vault.create_secret(v_token,'watchdog_closing_shadow_token','Internal token for aggregate Closing Review structural shadows',null);
  end if;

  v_hash := encode(digest(v_token,'sha256'),'hex');
  insert into public.intelligence_closing_shadow_control(id,enabled,project_url,token_hash,per_county,updated_at)
  values(true,false,null,v_hash,3,now())
  on conflict (id) do update set token_hash=excluded.token_hash,updated_at=now();
end $$;

create or replace function private.intelligence_kick_closing_v4_shadow()
returns bigint
language plpgsql
security definer
set search_path = public, private, vault, net, pg_temp
as $$
declare
  v_enabled boolean;
  v_url text;
  v_token text;
  v_per_county integer;
  v_request_id bigint;
begin
  select enabled,project_url,per_county
    into v_enabled,v_url,v_per_county
  from public.intelligence_closing_shadow_control
  where id=true;

  if not coalesce(v_enabled,false) or v_url is null then
    return null;
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name='watchdog_closing_shadow_token'
  order by updated_at desc
  limit 1;

  if v_token is null then
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_url,'/') || '/functions/v1/intelligence-closing-v4-structural-shadow',
    headers := jsonb_build_object('Content-Type','application/json','x-watchdog-shadow-token',v_token),
    body := jsonb_build_object('per_county',coalesce(v_per_county,3),'thresholds',jsonb_build_array(15,20,25,30,35,40,45,50,55,60)),
    timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end $$;

revoke all on function private.intelligence_kick_closing_v4_shadow() from public, anon, authenticated;

comment on table public.intelligence_closing_shadow_control is
'Service-only control for non-persisting statewide Closing Review structural shadows. No browser role may read or change it.';
comment on function private.intelligence_kick_closing_v4_shadow() is
'Manual service-only dispatcher for the aggregate Closing v4 shadow harness. No cron is installed.';

do $$
begin
  if has_table_privilege('anon','public.intelligence_closing_shadow_control','SELECT')
     or has_table_privilege('authenticated','public.intelligence_closing_shadow_control','SELECT') then
    raise exception 'Closing shadow control must not be browser-readable';
  end if;
end $$;
