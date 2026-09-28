-- Property alerts: email me when this property's assessment, tax bill or
-- Watchdog Score changes.
--
-- Flow
--   1. api/watchdog-property-alerts.js (service key) calls
--      subscribe_property_alert(): a pending subscription plus one
--      confirmation email in the outbox. Nothing else is sent until the
--      address is confirmed (double opt-in).
--   2. The confirmation link opens a page with a button that calls
--      confirm_property_alert(); the current values become the baseline.
--   3. detect_property_alert_changes() runs monthly after the parcel sync
--      and queues one email per changed property, then moves the baseline.
--   4. The property-alert-sender edge function, invoked every 5 minutes by
--      pg_cron, claims queued emails and sends them through EmailJS.
--   5. Every email carries an unsubscribe link (unsubscribe_property_alert).
--
-- Alerts stay off (property_alert_settings.enabled = false) until the
-- EmailJS template is in place. All tables are server-only.

create table if not exists public.property_alert_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.property_alert_settings (singleton, enabled) values (true, false) on conflict do nothing;
alter table public.property_alert_settings enable row level security;
revoke all on public.property_alert_settings from anon, authenticated;

create table if not exists public.property_alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  pams_pin text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed')),
  confirm_token_hash text,
  unsubscribe_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  baseline jsonb,
  client_hash text,
  created_at timestamptz not null default now(),
  confirm_sent_at timestamptz,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  last_notified_at timestamptz,
  unique (email, pams_pin)
);
create index if not exists property_alert_subscriptions_active_idx on public.property_alert_subscriptions (status) where status = 'active';
create index if not exists property_alert_subscriptions_client_idx on public.property_alert_subscriptions (client_hash, created_at desc);
create unique index if not exists property_alert_subscriptions_unsub_idx on public.property_alert_subscriptions (unsubscribe_token);
alter table public.property_alert_subscriptions enable row level security;
revoke all on public.property_alert_subscriptions from anon, authenticated;

create table if not exists public.property_alert_outbox (
  id bigserial primary key,
  subscription_id uuid not null references public.property_alert_subscriptions(id) on delete cascade,
  kind text not null check (kind in ('confirm', 'change')),
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz
);
create index if not exists property_alert_outbox_queued_idx on public.property_alert_outbox (created_at) where status in ('queued', 'sending');
alter table public.property_alert_outbox enable row level security;
revoke all on public.property_alert_outbox from anon, authenticated;

-- Current values a subscriber is alerted about.
create or replace function public.property_alert_snapshot(p_pin text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'address', p.address, 'town', p.town, 'county', p.county,
    'assessed_value', p.assessed_value, 'last_year_tax', p.last_year_tax,
    'score', (select round(c.score) from public.public_watchdog_score_cache_v1 c where c.pams_pin = p.pams_pin and c.model_version = 'ROBUST-v1'))
  from public.property_lookups p
  where p.pams_pin = p_pin and p.county is not null and p.county <> '';
$$;

create or replace function public.subscribe_property_alert(p_pin text, p_email text, p_client_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_snap jsonb;
  v_sub public.property_alert_subscriptions%rowtype;
  v_token text;
begin
  if not (select enabled from public.property_alert_settings where singleton) then
    return jsonb_build_object('ok', false, 'error', 'disabled');
  end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;
  v_snap := public.property_alert_snapshot(left(coalesce(p_pin, ''), 80));
  if v_snap is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_property');
  end if;
  if p_client_hash is not null and (select count(*) from public.property_alert_subscriptions
      where client_hash = p_client_hash and created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_sub from public.property_alert_subscriptions where email = v_email and pams_pin = p_pin;
  if found and v_sub.status = 'active' then
    return jsonb_build_object('ok', true, 'state', 'already_active');
  end if;
  if found and v_sub.confirm_sent_at > now() - interval '12 hours' then
    return jsonb_build_object('ok', true, 'state', 'confirm_already_sent');
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.property_alert_subscriptions (email, pams_pin, status, confirm_token_hash, client_hash, confirm_sent_at)
  values (v_email, p_pin, 'pending', encode(extensions.digest(v_token, 'sha256'), 'hex'), p_client_hash, now())
  on conflict (email, pams_pin) do update set
    status = 'pending', confirm_token_hash = excluded.confirm_token_hash, client_hash = excluded.client_hash,
    confirm_sent_at = now(), unsubscribed_at = null
  returning * into v_sub;

  insert into public.property_alert_outbox (subscription_id, kind, payload)
  values (v_sub.id, 'confirm', v_snap || jsonb_build_object('pams_pin', p_pin, 'confirm_token', v_token, 'unsubscribe_token', v_sub.unsubscribe_token));
  return jsonb_build_object('ok', true, 'state', 'confirm_sent');
end;
$$;

create or replace function public.confirm_property_alert(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub public.property_alert_subscriptions%rowtype;
  v_snap jsonb;
begin
  select * into v_sub from public.property_alert_subscriptions
  where confirm_token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and length(coalesce(p_token, '')) >= 32;
  if not found then return jsonb_build_object('ok', false); end if;
  v_snap := public.property_alert_snapshot(v_sub.pams_pin);
  update public.property_alert_subscriptions
  set status = 'active', confirmed_at = coalesce(confirmed_at, now()), confirm_token_hash = null, baseline = v_snap
  where id = v_sub.id;
  return jsonb_build_object('ok', true, 'pams_pin', v_sub.pams_pin, 'address', v_snap ->> 'address', 'town', v_snap ->> 'town');
end;
$$;

create or replace function public.unsubscribe_property_alert(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub public.property_alert_subscriptions%rowtype;
begin
  update public.property_alert_subscriptions
  set status = 'unsubscribed', unsubscribed_at = now(), confirm_token_hash = null
  where unsubscribe_token = coalesce(p_token, '') and length(coalesce(p_token, '')) >= 32
  returning * into v_sub;
  if not found then return jsonb_build_object('ok', false); end if;
  delete from public.property_alert_outbox where subscription_id = v_sub.id and status = 'queued';
  return jsonb_build_object('ok', true, 'pams_pin', v_sub.pams_pin);
end;
$$;

-- Monthly: one email per active subscription whose values moved.
create or replace function public.detect_property_alert_changes()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '5min'
as $$
declare
  r record;
  v_now jsonb;
  v_queued integer := 0;
begin
  if not (select enabled from public.property_alert_settings where singleton) then return 0; end if;
  for r in select * from public.property_alert_subscriptions where status = 'active' loop
    v_now := public.property_alert_snapshot(r.pams_pin);
    continue when v_now is null;
    if r.baseline is null then
      update public.property_alert_subscriptions set baseline = v_now where id = r.id;
      continue;
    end if;
    if (v_now -> 'assessed_value') is distinct from (r.baseline -> 'assessed_value')
       or (v_now -> 'last_year_tax') is distinct from (r.baseline -> 'last_year_tax')
       or ((v_now -> 'score') is distinct from (r.baseline -> 'score') and v_now -> 'score' <> 'null'::jsonb) then
      insert into public.property_alert_outbox (subscription_id, kind, payload)
      values (r.id, 'change', jsonb_build_object('pams_pin', r.pams_pin, 'before', r.baseline, 'after', v_now, 'unsubscribe_token', r.unsubscribe_token));
      update public.property_alert_subscriptions set baseline = v_now, last_notified_at = now() where id = r.id;
      v_queued := v_queued + 1;
    end if;
  end loop;
  return v_queued;
end;
$$;

-- Sender claims and completes outbox rows. Claimed rows older than 15
-- minutes (a crashed run) are retried, up to 5 attempts.
create or replace function public.claim_property_alert_outbox(p_limit integer default 25)
returns table (id bigint, kind text, email text, payload jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with c as (
    select o.id from public.property_alert_outbox o
    where (o.status = 'queued' or (o.status = 'sending' and o.claimed_at < now() - interval '15 minutes')) and o.attempts < 5
    order by o.created_at
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
    for update skip locked
  )
  update public.property_alert_outbox o set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
  from c, public.property_alert_subscriptions s
  where o.id = c.id and s.id = o.subscription_id and s.status <> 'unsubscribed'
  returning o.id, o.kind, s.email, o.payload;
end;
$$;

create or replace function public.complete_property_alert_outbox(p_id bigint, p_sent boolean, p_error text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.property_alert_outbox
  set status = case when p_sent then 'sent' when attempts >= 5 then 'failed' else 'queued' end,
      sent_at = case when p_sent then now() else sent_at end,
      error = left(p_error, 200),
      -- Tokens are only needed to build the email; drop them once sent.
      payload = case when p_sent then payload - 'confirm_token' else payload end
  where id = p_id;
$$;

-- Worker runtime (URL + shared token), same pattern as the ANCHOR reminders.
create table if not exists private.property_alert_runtime (
  singleton boolean primary key default true check (singleton),
  worker_url text not null,
  worker_token text not null default encode(extensions.gen_random_bytes(32), 'hex')
);
insert into private.property_alert_runtime (singleton, worker_url)
values (true, 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/property-alert-sender')
on conflict do nothing;

create or replace function public.verify_property_alert_worker(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select coalesce(length(p_token) >= 32 and p_token = (select worker_token from private.property_alert_runtime where singleton), false);
$$;

create or replace function public.invoke_property_alert_sender()
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
  if not (select enabled from public.property_alert_settings where singleton) then return null; end if;
  if not exists (select 1 from public.property_alert_outbox where status in ('queued', 'sending')) then return null; end if;
  select worker_url, worker_token into v_url, v_token from private.property_alert_runtime where singleton;
  if v_url is null or v_url = '' then return null; end if;
  select net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-property-alert-token', v_token), body := jsonb_build_object('limit', 25)) into v_request;
  return v_request;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'property_alert_snapshot(text)', 'subscribe_property_alert(text,text,text)', 'confirm_property_alert(text)',
    'unsubscribe_property_alert(text)', 'detect_property_alert_changes()', 'claim_property_alert_outbox(integer)',
    'complete_property_alert_outbox(bigint,boolean,text)', 'verify_property_alert_worker(text)', 'invoke_property_alert_sender()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

select cron.schedule('watchdog-property-alert-sender', '*/5 * * * *', 'select public.invoke_property_alert_sender();');
select cron.schedule('watchdog-property-alert-changes', '9 7 4 * *', 'select public.detect_property_alert_changes();');
