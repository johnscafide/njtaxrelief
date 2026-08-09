-- Watchdog v0.45 control plane
-- Private municipal delivery, Agent Control territories/conversion ledger, and
-- a least-privilege cleanup for the legacy record lookup RPC.

alter table public.agent_farm_properties
  add column if not exists zip text;

create table if not exists public.agent_territories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 2 and 80),
  scope_type text not null check (scope_type in ('municipality','county','zip')),
  scope_value text not null check (char_length(scope_value) between 2 and 80),
  property_classes text[] not null default array['2']::text[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, scope_type, scope_value)
);
alter table public.agent_territories enable row level security;
revoke all on table public.agent_territories from anon;
grant select, insert, update, delete on table public.agent_territories to authenticated;
create index if not exists agent_territories_user_active_idx on public.agent_territories (user_id, active, updated_at desc);
create policy "agent territories select own pro" on public.agent_territories for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')));
create policy "agent territories insert own pro" on public.agent_territories for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')));
create policy "agent territories update own pro" on public.agent_territories for update to authenticated
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')))
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')));
create policy "agent territories delete own pro" on public.agent_territories for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')));

create table if not exists public.agent_funnel_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  territory_id uuid references public.agent_territories(id) on delete set null,
  opportunity_key text not null check (char_length(opportunity_key) between 3 and 240),
  pams_pin text,
  event_name text not null check (event_name in (
    'signal_viewed','evidence_opened','property_opened','watched',
    'conversation_started','reply','valuation_request','appointment',
    'listing','dismissed'
  )),
  metadata jsonb not null default '{}'::jsonb check (pg_column_size(metadata) <= 8192),
  occurred_at timestamptz not null default now()
);
alter table public.agent_funnel_events enable row level security;
revoke all on table public.agent_funnel_events from anon;
grant select, insert on table public.agent_funnel_events to authenticated;
create index if not exists agent_funnel_user_time_idx on public.agent_funnel_events (user_id, occurred_at desc);
create index if not exists agent_funnel_user_event_idx on public.agent_funnel_events (user_id, event_name, occurred_at desc);
create policy "agent funnel select own pro" on public.agent_funnel_events for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')));
create policy "agent funnel insert own pro" on public.agent_funnel_events for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')));

-- Internal delivery ledger. It is intentionally inaccessible through the
-- browser API; only service-role Edge Functions may consume quota or inspect it.
create table if not exists public.municipal_data_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  bucket_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  rows_served bigint not null default 0 check (rows_served >= 0),
  last_delivery_id uuid,
  last_requested_at timestamptz not null default now(),
  primary key (user_id, endpoint, bucket_start)
);
alter table public.municipal_data_requests enable row level security;
revoke all on table public.municipal_data_requests from public, anon, authenticated;
grant select, insert, update on table public.municipal_data_requests to service_role;

create or replace function public.consume_municipal_quota(
  p_user_id uuid,
  p_endpoint text,
  p_limit integer,
  p_rows integer default 0,
  p_delivery_id uuid default gen_random_uuid()
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bucket timestamptz := date_trunc('hour', now()) + floor(extract(minute from now()) / 5) * interval '5 minutes';
  v_count integer;
begin
  if p_user_id is null or p_limit < 1 or p_limit > 5000 or p_endpoint !~ '^[a-z0-9_-]{2,40}$' then
    raise exception 'invalid quota request';
  end if;
  insert into public.municipal_data_requests(user_id, endpoint, bucket_start, request_count, rows_served, last_delivery_id)
  values (p_user_id, p_endpoint, v_bucket, 1, greatest(p_rows, 0), p_delivery_id)
  on conflict (user_id, endpoint, bucket_start) do update
    set request_count = public.municipal_data_requests.request_count + 1,
        rows_served = public.municipal_data_requests.rows_served + greatest(p_rows, 0),
        last_delivery_id = p_delivery_id,
        last_requested_at = now()
  returning request_count into v_count;
  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'remaining', greatest(p_limit - v_count, 0),
    'limit', p_limit,
    'reset_at', v_bucket + interval '5 minutes',
    'delivery_id', p_delivery_id
  );
end;
$$;
revoke all on function public.consume_municipal_quota(uuid,text,integer,integer,uuid) from public, anon, authenticated;
grant execute on function public.consume_municipal_quota(uuid,text,integer,integer,uuid) to service_role;

create or replace function public.record_municipal_delivery(p_user_id uuid, p_delivery_id uuid, p_rows integer)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.municipal_data_requests
     set rows_served = rows_served + greatest(p_rows, 0), last_requested_at = now()
   where user_id = p_user_id and endpoint = 'municipal-data' and last_delivery_id = p_delivery_id;
$$;
revoke all on function public.record_municipal_delivery(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.record_municipal_delivery(uuid,uuid,integer) to service_role;

-- The browser record RPC remains available to signed-in customers for current
-- product flows, but must never be callable anonymously.
revoke execute on function public.record_lookup(jsonb) from public, anon;

comment on table public.agent_territories is 'Private agent-owned territory filters for Agent Control.';
comment on table public.agent_funnel_events is 'Privacy-minimized Agent Control conversion events; contains property references, never owner identity enrichment.';
comment on table public.municipal_data_requests is 'Service-only five-minute delivery quota and trace ledger.';
