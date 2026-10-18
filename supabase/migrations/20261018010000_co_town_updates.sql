-- CO town page "Get updates": email me when this town's CO requirements change.
--
-- Flow
--   1. api/co-updates.js (service key) calls subscribe_co_updates(): the email,
--      the town and whether they're a homeowner or an agent/pro. No confirm step;
--      every email has an unsubscribe link.
--   2. pg_cron calls invoke_co_updates_scan() hourly. It POSTs to
--      /api/co-updates?action=scan on www.watchdogindex.com with the worker token.
--      The scan compares each published town on the live site with the last
--      snapshot here and calls record_co_town_changes() for the towns that moved.
--      That queues one email per active subscriber of a changed town.
--   3. The co-update-sender edge function, invoked every 5 minutes by pg_cron,
--      claims queued emails and sends them through EmailJS (the same "Watchdog
--      notice" template as property alerts: to_email, subject, message_html).
--
-- Signups work right away. Emails only queue once co_update_settings.enabled is
-- turned on; until then the scan only keeps the snapshots current, so turning it
-- on never sends a backlog. All tables are server-only.

create table if not exists public.co_update_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.co_update_settings (singleton, enabled) values (true, false) on conflict do nothing;
alter table public.co_update_settings enable row level security;
revoke all on public.co_update_settings from anon, authenticated;

create table if not exists public.co_update_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  municipality_code text not null check (municipality_code ~ '^\d{4}$'),
  role text not null check (role in ('homeowner', 'professional')),
  status text not null default 'active' check (status in ('active', 'unsubscribed')),
  unsubscribe_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  source text,
  client_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  last_notified_at timestamptz,
  unique (email, municipality_code)
);
create index if not exists co_update_subscriptions_town_idx on public.co_update_subscriptions (municipality_code) where status = 'active';
create index if not exists co_update_subscriptions_role_idx on public.co_update_subscriptions (role, created_at desc);
create index if not exists co_update_subscriptions_client_idx on public.co_update_subscriptions (client_hash, updated_at desc);
create unique index if not exists co_update_subscriptions_unsub_idx on public.co_update_subscriptions (unsubscribe_token);
alter table public.co_update_subscriptions enable row level security;
revoke all on public.co_update_subscriptions from anon, authenticated;

-- What each town looked like at the last scan.
create table if not exists public.co_town_snapshots (
  municipality_code text primary key check (municipality_code ~ '^\d{4}$'),
  fingerprint text not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.co_town_snapshots enable row level security;
revoke all on public.co_town_snapshots from anon, authenticated;

create table if not exists public.co_update_outbox (
  id bigserial primary key,
  subscription_id uuid not null references public.co_update_subscriptions(id) on delete cascade,
  municipality_code text not null,
  subject text not null,
  html text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz
);
create index if not exists co_update_outbox_queued_idx on public.co_update_outbox (created_at) where status in ('queued', 'sending');
alter table public.co_update_outbox enable row level security;
revoke all on public.co_update_outbox from anon, authenticated;

create or replace function public.subscribe_co_updates(p_code text, p_email text, p_role text, p_source text, p_client_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if coalesce(p_code, '') !~ '^\d{4}$' then
    return jsonb_build_object('ok', false, 'error', 'unknown_town');
  end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;
  if coalesce(p_role, '') not in ('homeowner', 'professional') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;
  if p_client_hash is not null and (select count(*) from public.co_update_subscriptions
      where client_hash = p_client_hash and updated_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.co_update_subscriptions (email, municipality_code, role, source, client_hash)
  values (v_email, p_code, p_role, left(p_source, 40), p_client_hash)
  on conflict (email, municipality_code) do update set
    role = excluded.role, status = 'active', unsubscribed_at = null,
    source = coalesce(excluded.source, co_update_subscriptions.source),
    client_hash = excluded.client_hash, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.unsubscribe_co_updates(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub public.co_update_subscriptions%rowtype;
begin
  update public.co_update_subscriptions
  set status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now()), updated_at = now()
  where unsubscribe_token = coalesce(p_token, '') and length(coalesce(p_token, '')) >= 32
  returning * into v_sub;
  if not found then return jsonb_build_object('ok', false); end if;
  delete from public.co_update_outbox where subscription_id = v_sub.id and status = 'queued';
  return jsonb_build_object('ok', true, 'municipality_code', v_sub.municipality_code);
end;
$$;

create or replace function public.co_town_fingerprints()
returns table (municipality_code text, fingerprint text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.municipality_code, s.fingerprint from public.co_town_snapshots s;
$$;

create or replace function public.co_town_snapshots_for(p_codes text[])
returns table (municipality_code text, snapshot jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.municipality_code, s.snapshot from public.co_town_snapshots s where s.municipality_code = any(coalesce(p_codes, '{}'));
$$;

-- p_rows: [{ code, fingerprint, snapshot, subject, html, notify }]. html carries
-- {{unsubscribe_url}}, filled in per subscriber. notify is false for the very
-- first scan, so seeding the snapshots sends nothing.
create or replace function public.record_co_town_changes(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r jsonb;
  v_enabled boolean := coalesce((select enabled from public.co_update_settings where singleton), false);
  v_towns integer := 0;
  v_queued integer := 0;
  v_count integer;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    continue when coalesce(r ->> 'code', '') !~ '^\d{4}$' or coalesce(r ->> 'fingerprint', '') = '';
    insert into public.co_town_snapshots (municipality_code, fingerprint, snapshot, updated_at)
    values (r ->> 'code', r ->> 'fingerprint', coalesce(r -> 'snapshot', '{}'::jsonb), now())
    on conflict (municipality_code) do update set fingerprint = excluded.fingerprint, snapshot = excluded.snapshot, updated_at = now();
    v_towns := v_towns + 1;
    continue when not v_enabled or coalesce((r ->> 'notify')::boolean, false) is not true
      or coalesce(r ->> 'subject', '') = '' or coalesce(r ->> 'html', '') = '';
    insert into public.co_update_outbox (subscription_id, municipality_code, subject, html)
    select s.id, s.municipality_code, left(r ->> 'subject', 200), r ->> 'html'
    from public.co_update_subscriptions s
    where s.municipality_code = r ->> 'code' and s.status = 'active';
    get diagnostics v_count = row_count;
    if v_count > 0 then
      update public.co_update_subscriptions set last_notified_at = now()
      where municipality_code = r ->> 'code' and status = 'active';
    end if;
    v_queued := v_queued + v_count;
  end loop;
  return jsonb_build_object('ok', true, 'towns', v_towns, 'queued', v_queued, 'enabled', v_enabled);
end;
$$;

-- Sender claims and completes outbox rows. Claimed rows older than 15 minutes
-- (a crashed run) are retried, up to 5 attempts.
create or replace function public.claim_co_update_outbox(p_limit integer default 25)
returns table (id bigint, email text, subject text, html text, unsubscribe_token text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with c as (
    select o.id from public.co_update_outbox o
    where (o.status = 'queued' or (o.status = 'sending' and o.claimed_at < now() - interval '15 minutes')) and o.attempts < 5
    order by o.created_at
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
    for update skip locked
  )
  update public.co_update_outbox o set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
  from c, public.co_update_subscriptions s
  where o.id = c.id and s.id = o.subscription_id and s.status = 'active'
  returning o.id, s.email, o.subject, o.html, s.unsubscribe_token;
end;
$$;

create or replace function public.complete_co_update_outbox(p_id bigint, p_sent boolean, p_error text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.co_update_outbox
  set status = case when p_sent then 'sent' when attempts >= 5 then 'failed' else 'queued' end,
      sent_at = case when p_sent then now() else sent_at end,
      error = left(p_error, 200)
  where id = p_id;
$$;

-- Worker runtime (URLs + shared token), same pattern as property alerts.
create table if not exists private.co_update_runtime (
  singleton boolean primary key default true check (singleton),
  scan_url text not null,
  sender_url text not null,
  worker_token text not null default encode(extensions.gen_random_bytes(32), 'hex')
);
insert into private.co_update_runtime (singleton, scan_url, sender_url)
values (true, 'https://www.watchdogindex.com/api/co-updates?action=scan', 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/co-update-sender')
on conflict do nothing;

create or replace function public.verify_co_updates_worker(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select coalesce(length(p_token) >= 32 and p_token = (select worker_token from private.co_update_runtime where singleton), false);
$$;

create or replace function public.invoke_co_updates_scan()
returns bigint
language plpgsql
security definer
set search_path = public, private, net, pg_temp
as $$
declare
  v_url text;
  v_token text;
  v_request bigint;
begin
  select scan_url, worker_token into v_url, v_token from private.co_update_runtime where singleton;
  if v_url is null or v_url = '' then return null; end if;
  select net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-co-updates-token', v_token), body := '{}'::jsonb, timeout_milliseconds := 30000) into v_request;
  return v_request;
end;
$$;

create or replace function public.invoke_co_update_sender()
returns bigint
language plpgsql
security definer
set search_path = public, private, net, pg_temp
as $$
declare
  v_url text;
  v_token text;
  v_request bigint;
begin
  if not (select enabled from public.co_update_settings where singleton) then return null; end if;
  if not exists (select 1 from public.co_update_outbox where status in ('queued', 'sending')) then return null; end if;
  select sender_url, worker_token into v_url, v_token from private.co_update_runtime where singleton;
  if v_url is null or v_url = '' then return null; end if;
  select net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-co-updates-token', v_token), body := jsonb_build_object('limit', 25)) into v_request;
  return v_request;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'subscribe_co_updates(text,text,text,text,text)', 'unsubscribe_co_updates(text)', 'co_town_fingerprints()',
    'co_town_snapshots_for(text[])', 'record_co_town_changes(jsonb)', 'claim_co_update_outbox(integer)',
    'complete_co_update_outbox(bigint,boolean,text)', 'verify_co_updates_worker(text)',
    'invoke_co_updates_scan()', 'invoke_co_update_sender()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

select cron.schedule('watchdog-co-updates-scan', '17 * * * *', 'select public.invoke_co_updates_scan();');
select cron.schedule('watchdog-co-updates-sender', '*/5 * * * *', 'select public.invoke_co_update_sender();');
