create table if not exists public.integration_runtime_config (
  id boolean primary key default true check (id),
  project_url text not null,
  updated_at timestamptz not null default now()
);
alter table public.integration_runtime_config enable row level security;
revoke all on public.integration_runtime_config from anon, authenticated;
grant select,insert,update,delete on public.integration_runtime_config to service_role;

create or replace function public.integration_get_named_secret(p_name text)
returns text
language sql
security definer
set search_path = public, vault, pg_temp
as $$ select decrypted_secret from vault.decrypted_secrets where name = p_name order by updated_at desc limit 1; $$;
revoke all on function public.integration_get_named_secret(text) from public, anon, authenticated;
grant execute on function public.integration_get_named_secret(text) to service_role;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name='integration_delivery_worker_token') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'integration_delivery_worker_token','Internal token for Watchdog integration delivery worker',null);
  end if;
end;
$$;

create or replace function private.integration_kick_delivery_worker()
returns bigint
language plpgsql
security definer
set search_path = public, private, vault, net, pg_temp
as $$
declare
  v_url text;
  v_token text;
  v_request_id bigint;
begin
  select project_url into v_url from public.integration_runtime_config where id=true limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name='integration_delivery_worker_token' order by updated_at desc limit 1;
  if v_url is null or v_token is null then return null; end if;
  select net.http_post(
    url := rtrim(v_url,'/') || '/functions/v1/integration-delivery-worker',
    headers := jsonb_build_object('Content-Type','application/json','x-watchdog-worker-token',v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function private.integration_kick_delivery_worker() from public;

select cron.unschedule(jobid) from cron.job where jobname='watchdog-integration-delivery-worker';
select cron.schedule('watchdog-integration-delivery-worker','* * * * *','select private.integration_kick_delivery_worker();');
