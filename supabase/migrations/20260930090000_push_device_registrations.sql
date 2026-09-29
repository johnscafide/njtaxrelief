-- Mobile push notifications: device registrations, outbox, and the hook that
-- turns a Property Pulse event into a queued push.
--
-- Flow
--   1. The app signs in with Supabase and calls the push-device-register edge
--      function (verify_jwt = true), which writes push_device_registrations
--      with the service key. Raw FCM tokens are credentials: browser roles get
--      no grants on the table, and the only user-callable read is the
--      token-free get_my_push_devices() RPC.
--   2. trg_push_property_event fires after every property_update_events insert
--      (all producers converge there) and queues one push_outbox row per
--      active device that has alerts switched on. It respects the same
--      per-property pause the email producers honor, the event's minimum_plan,
--      and the device's quiet hours (a push inside quiet hours is deferred to
--      the end of the window, never dropped).
--   3. invoke_push_sender() runs every minute from pg_cron and, when the
--      outbox has due rows, posts to the push-sender edge function with the
--      private.push_runtime worker token. The sender claims rows, sends them
--      through FCM HTTP v1 and completes them; tokens FCM reports as
--      UNREGISTERED disable the registration.
--
-- Push stays off (push_settings.enabled = false) until the edge functions are
-- deployed, FCM secrets are set, and the inventory is recorded. Until then the
-- trigger returns immediately and nothing is queued.
--
-- Privacy: a push payload is built only from privacy-reviewed columns of
-- property_update_events (title, summary, pams_pin, event_type, severity,
-- minimum_plan, id). No owner field, no mailing-address field, no CRM contact
-- field, and no parcel ZIP is ever copied into push_outbox or sent to FCM.
--
-- Idempotent: every statement uses if not exists / or replace / on conflict.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Kill switch
-- ---------------------------------------------------------------------------
create table if not exists public.push_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.push_settings (singleton, enabled) values (true, false) on conflict do nothing;
alter table public.push_settings enable row level security;
revoke all on public.push_settings from anon, authenticated;
comment on table public.push_settings is
  'Push notification kill switch. enabled defaults to false; flip it only after the push-sender deployment checklist is complete. Server-only.';

-- ---------------------------------------------------------------------------
-- Device registrations (raw FCM tokens; service role only)
-- ---------------------------------------------------------------------------
create table if not exists public.push_device_registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'fcm' check (provider in ('fcm')),
  platform text not null check (platform in ('android', 'ios', 'web')),
  -- app-generated, stable per install
  installation_id text not null check (length(installation_id) between 8 and 128),
  -- raw FCM registration token; service role only
  token text not null check (length(token) between 32 and 4096),
  -- sha256 hex of token, same shape as watchdog_extension_sessions.token_hash
  token_hash text not null check (length(token_hash) = 64),
  app_version text check (app_version is null or length(app_version) <= 40),
  device_label text check (device_label is null or length(device_label) <= 80),
  locale text check (locale is null or length(locale) <= 35),
  timezone text not null default 'America/New_York' check (length(timezone) between 1 and 64),
  quiet_hours_start smallint check (quiet_hours_start is null or quiet_hours_start between 0 and 23),
  quiet_hours_end smallint check (quiet_hours_end is null or quiet_hours_end between 0 and 23),
  -- property_update_events pushes
  alerts_enabled boolean not null default true,
  -- weekly digest push
  digest_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_sent_at timestamptz,
  disabled_at timestamptz,
  disabled_reason text check (disabled_reason is null or disabled_reason in ('unregistered', 'invalid_token', 'signed_out', 'replaced')),
  unique (user_id, installation_id)
);
create index if not exists push_device_registrations_user_active_idx
  on public.push_device_registrations (user_id) where disabled_at is null;
-- A token is unique among active registrations. Disabled rows keep their hash
-- so a device that re-signs in as another user can be marked 'replaced'
-- without violating uniqueness.
create unique index if not exists push_device_registrations_token_hash_active_idx
  on public.push_device_registrations (token_hash) where disabled_at is null;

alter table public.push_device_registrations enable row level security;
-- Same posture as integration_api_keys: no browser-role grants, no policies.
revoke all on public.push_device_registrations from anon, authenticated;
grant select, insert, update, delete on public.push_device_registrations to service_role;
comment on table public.push_device_registrations is
  'Mobile push registrations (FCM). Raw tokens are service-role only; the app manages rows through the push-device-register Edge Function.';
comment on column public.push_device_registrations.token is
  'Raw FCM registration token. Never returned to clients; read only by push-sender with the service key.';

-- Token-free device list for the signed-in user. Returns the same column set
-- the push-device-register function returns (its SAFE_COLUMNS); the contract
-- test keeps the two lists identical. Dropped first because "or replace"
-- cannot change a function's result columns.
drop function if exists public.get_my_push_devices();
create function public.get_my_push_devices()
returns table (
  id uuid, platform text, device_label text, app_version text,
  alerts_enabled boolean, digest_enabled boolean,
  quiet_hours_start smallint, quiet_hours_end smallint, timezone text, locale text,
  created_at timestamptz, last_seen_at timestamptz, disabled_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.platform, r.device_label, r.app_version,
         r.alerts_enabled, r.digest_enabled,
         r.quiet_hours_start, r.quiet_hours_end, r.timezone, r.locale,
         r.created_at, r.last_seen_at, r.disabled_at
  from public.push_device_registrations r
  where r.user_id = auth.uid()
  order by r.created_at desc;
$$;
revoke all on function public.get_my_push_devices() from public, anon;
grant execute on function public.get_my_push_devices() to authenticated;
comment on function public.get_my_push_devices() is
  'Signed-in user''s push registrations without the token column.';

-- ---------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------
create table if not exists public.push_outbox (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- null = fan out to every active device of the user at claim time
  registration_id uuid references public.push_device_registrations(id) on delete cascade,
  kind text not null check (kind in ('property_event', 'digest', 'test')),
  -- e.g. 'property:<pams_pin>' or 'digest'
  collapse_key text check (collapse_key is null or length(collapse_key) <= 120),
  title text not null check (char_length(title) <= 180),
  body text not null check (char_length(body) <= 700),
  -- {route, pams_pin, event_id, event_type, severity, minimum_plan}
  data jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  error text,
  -- quiet hours: a row is not claimed before this time
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz
);
create index if not exists push_outbox_queued_idx
  on public.push_outbox (next_attempt_at, created_at) where status in ('queued', 'sending');
create index if not exists push_outbox_registration_idx
  on public.push_outbox (registration_id) where status in ('queued', 'sending');
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from anon, authenticated;
comment on table public.push_outbox is
  'Queued push notifications. Rows carry only title, body and a small data map built from privacy-reviewed event columns. Server-only.';

-- ---------------------------------------------------------------------------
-- Worker runtime (URL + shared token), same pattern as property alerts.
-- ---------------------------------------------------------------------------
create table if not exists private.push_runtime (
  singleton boolean primary key default true check (singleton),
  worker_url text not null,
  worker_token text not null default encode(extensions.gen_random_bytes(32), 'hex')
);
insert into private.push_runtime (singleton, worker_url)
values (true, 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/push-sender')
on conflict do nothing;
revoke all on private.push_runtime from public, anon, authenticated;

create or replace function public.verify_push_worker(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select coalesce(length(p_token) >= 32 and p_token = (select worker_token from private.push_runtime where singleton), false);
$$;

-- ---------------------------------------------------------------------------
-- Helpers (private schema, never granted to browser roles)
-- ---------------------------------------------------------------------------

-- True while the local clock in p_timezone is inside [p_start, p_end).
-- A window may wrap midnight (22 -> 7). Null or equal bounds mean no window.
-- An unknown time zone name is treated as "not quiet" so a bad value can
-- never silence a device.
create or replace function private.push_in_quiet_hours(
  p_start smallint, p_end smallint, p_timezone text, p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_hour integer;
begin
  if p_start is null or p_end is null or p_start = p_end then return false; end if;
  begin
    v_hour := extract(hour from (p_at at time zone coalesce(nullif(p_timezone, ''), 'America/New_York')))::integer;
  exception when others then
    return false;
  end;
  if p_start < p_end then
    return v_hour >= p_start and v_hour < p_end;
  end if;
  return v_hour >= p_start or v_hour < p_end;
end;
$$;
revoke all on function private.push_in_quiet_hours(smallint, smallint, text, timestamptz) from public;

-- The next moment the quiet-hours window ends, in the device's time zone.
create or replace function private.push_quiet_hours_end(
  p_end smallint, p_timezone text, p_at timestamptz default now()
)
returns timestamptz
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_tz text := coalesce(nullif(p_timezone, ''), 'America/New_York');
  v_local timestamp;
  v_candidate timestamp;
begin
  begin
    v_local := p_at at time zone v_tz;
    v_candidate := date_trunc('day', v_local) + make_interval(hours => coalesce(p_end, 0));
    if v_candidate <= v_local then v_candidate := v_candidate + interval '1 day'; end if;
    return v_candidate at time zone v_tz;
  exception when others then
    return p_at;
  end;
end;
$$;
revoke all on function private.push_quiet_hours_end(smallint, text, timestamptz) from public;

-- Service-role plan check for a specific user. Mirrors the rule in
-- public.has_watchdog_plan (which is auth.uid()-scoped and therefore unusable
-- from a trigger fired by service-role producers): developers pass, standard
-- always passes, paid tiers need an active-like subscription and a tier rank
-- at or above the requirement, unknown requirements fail closed.
-- The two tier maps below are copied from
-- supabase/migrations/20260818214500_watchdog_standard_entitlement_access_fix.sql
-- and property/tests/push-notifications-contract.mjs asserts they stay
-- identical to that source. Change them there first.
create or replace function private.push_plan_allows(p_user_id uuid, p_minimum_plan text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_required text := lower(coalesce(p_minimum_plan, 'standard'));
  v_ok boolean;
begin
  if v_required = 'standard' then return true; end if;
  select exists (
    select 1
    from public.profiles p
    left join public.account_entitlements e on e.user_id = p.id
    where p.id = p_user_id
      and (
        p.account_role = 'developer'
        or (
          e.subscription_status in ('active', 'trialing', 'past_due')
          and case lower(coalesce(e.billing_tier,e.plan_tier,'standard'))
                when 'teams' then 4
                when 'pro_plus' then 3
                when 'pro+' then 3
                when 'pro' then 2
                when 'agent' then 1
                else 0
              end >=
              case v_required
                when 'teams' then 4
                when 'pro_plus' then 3
                when 'pro+' then 3
                when 'pro' then 2
                when 'agent' then 1
                else 999
              end
        )
      )
  ) into v_ok;
  return coalesce(v_ok, false);
end;
$$;
revoke all on function private.push_plan_allows(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- Primary hook: property_update_events -> push_outbox
-- ---------------------------------------------------------------------------
-- The payload is built ONLY from these privacy-reviewed event columns:
-- title, summary, pams_pin, event_type, severity, minimum_plan, id.
-- No owner field, no mailing-address field, no CRM contact field and no
-- parcel ZIP is ever read here or copied into the outbox.
create or replace function private.push_enqueue_property_event()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  r record;
  v_title text;
  v_body text;
  v_data jsonb;
  v_collapse text;
begin
  if not coalesce((select enabled from public.push_settings where singleton), false) then return new; end if;
  -- Cheapest check first: most members have no registered device.
  if not exists (
    select 1 from public.push_device_registrations d
    where d.user_id = new.user_id and d.disabled_at is null and d.alerts_enabled
  ) then return new; end if;
  if new.title is null or new.summary is null then return new; end if;
  -- Respect the per-property preference the email producers already honor.
  if new.pams_pin is not null and exists (
    select 1 from public.property_alert_preferences p
    where p.user_id = new.user_id and p.pams_pin = new.pams_pin and p.paused
  ) then return new; end if;
  -- Content gating stays where it is today: minimum_plan on the event.
  if not private.push_plan_allows(new.user_id, new.minimum_plan) then return new; end if;

  v_title := left(new.title, 180);
  v_body := left(new.summary, 700);
  v_collapse := 'property:' || coalesce(new.pams_pin, 'system');
  v_data := jsonb_strip_nulls(jsonb_build_object(
    'route', 'pulse',
    'pams_pin', new.pams_pin,
    'event_id', new.id,
    'event_type', new.event_type,
    'severity', new.severity,
    'minimum_plan', new.minimum_plan
  ));

  -- One row per active device with alerts switched on. A device inside its
  -- quiet hours gets the row deferred to the end of the window, not dropped.
  -- push-device-register keeps at most 10 active devices per member; the
  -- limit here is a defensive cap on trigger and FCM cost.
  for r in
    select d.id, d.quiet_hours_start, d.quiet_hours_end, d.timezone
    from public.push_device_registrations d
    where d.user_id = new.user_id and d.disabled_at is null and d.alerts_enabled
    order by d.last_seen_at desc
    limit 20
  loop
    insert into public.push_outbox (user_id, registration_id, kind, collapse_key, title, body, data, next_attempt_at)
    values (
      new.user_id, r.id, 'property_event', v_collapse, v_title, v_body, v_data,
      case when private.push_in_quiet_hours(r.quiet_hours_start, r.quiet_hours_end, r.timezone)
           then private.push_quiet_hours_end(r.quiet_hours_end, r.timezone)
           else now() end
    );
  end loop;
  return new;
exception when others then
  -- A push problem must never block the producer's insert, but it must not
  -- disappear either.
  raise warning 'push_enqueue_property_event: %', sqlerrm;
  return new;
end;
$$;
revoke all on function private.push_enqueue_property_event() from public;

drop trigger if exists trg_push_property_event on public.property_update_events;
create trigger trg_push_property_event
after insert on public.property_update_events
for each row execute function private.push_enqueue_property_event();

-- ---------------------------------------------------------------------------
-- Claim / complete / defer (service role only)
-- ---------------------------------------------------------------------------

-- Sender claims due rows. Rows with registration_id null are first fanned out
-- to one row per active device (alerts_enabled for property events,
-- digest_enabled for digests). Claimed rows older than 15 minutes (a crashed
-- run) are retried, up to 5 attempts. Rows whose device was disabled are
-- skipped. Each returned row is exactly one device delivery.
create or replace function public.claim_push_outbox(p_limit integer default 25)
returns table (
  id bigint, kind text, token text, registration_id uuid, user_id uuid,
  collapse_key text, title text, body text, data jsonb,
  timezone text, quiet_hours_start smallint, quiet_hours_end smallint, platform text
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  -- Fan out user-wide rows into per-device rows. Lock, mark and expand the
  -- parents in one statement so two concurrent worker runs can never fan out
  -- the same parent twice.
  with parents as (
    select o.id from public.push_outbox o
    where o.status = 'queued' and o.registration_id is null
    order by o.id
    limit 200
    for update skip locked
  ),
  done as (
    update public.push_outbox o
    set status = 'skipped', error = 'fanned_out'
    from parents
    where o.id = parents.id
    returning o.user_id, o.kind, o.collapse_key, o.title, o.body, o.data
  )
  insert into public.push_outbox (user_id, registration_id, kind, collapse_key, title, body, data, next_attempt_at)
  select done.user_id, d.id, done.kind, done.collapse_key, done.title, done.body, done.data,
         case when private.push_in_quiet_hours(d.quiet_hours_start, d.quiet_hours_end, d.timezone)
              then private.push_quiet_hours_end(d.quiet_hours_end, d.timezone)
              else now() end
  from done
  join public.push_device_registrations d
    on d.user_id = done.user_id and d.disabled_at is null
   and case done.kind when 'property_event' then d.alerts_enabled when 'digest' then d.digest_enabled else true end;

  -- Devices that were disabled after the row was queued.
  update public.push_outbox o
  set status = 'skipped', error = 'registration_disabled'
  from public.push_device_registrations d
  where o.status in ('queued', 'sending') and o.registration_id = d.id and d.disabled_at is not null;

  return query
  with c as (
    select o.id from public.push_outbox o
    join public.push_device_registrations d on d.id = o.registration_id and d.disabled_at is null
    where (o.status = 'queued' or (o.status = 'sending' and o.claimed_at < now() - interval '15 minutes'))
      and o.attempts < 5
      and o.next_attempt_at <= now()
    order by o.next_attempt_at, o.created_at
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
    for update of o skip locked
  )
  update public.push_outbox o
  set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
  from c, public.push_device_registrations d
  where o.id = c.id and d.id = o.registration_id
  returning o.id, o.kind, d.token, d.id, o.user_id,
            o.collapse_key, o.title, o.body, o.data,
            d.timezone, d.quiet_hours_start, d.quiet_hours_end, d.platform;
end;
$$;

-- Marks a row sent / queued for retry / failed after 5 attempts. A retry
-- backs off (2, 4, 8, 16 minutes, capped at 60) so a short FCM outage does
-- not burn the whole budget while the cron runs every minute. When FCM
-- reports the token as permanently unusable (UNREGISTERED / 404,
-- SENDER_ID_MISMATCH, an INVALID_ARGUMENT naming the token) the sender passes
-- the registration id: the device is disabled with reason 'invalid_token'
-- and the row is skipped instead of retried.
create or replace function public.complete_push_outbox(
  p_id bigint, p_sent boolean, p_error text, p_invalid_registration uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_registration uuid;
begin
  if p_invalid_registration is not null then
    update public.push_device_registrations
    set disabled_at = coalesce(disabled_at, now()), disabled_reason = coalesce(disabled_reason, 'invalid_token'), updated_at = now()
    where id = p_invalid_registration;
    update public.push_outbox
    set status = 'skipped', error = left(coalesce(p_error, 'invalid_token'), 200)
    where id = p_id;
    return;
  end if;
  update public.push_outbox
  set status = case when p_sent then 'sent' when attempts >= 5 then 'failed' else 'queued' end,
      sent_at = case when p_sent then now() else sent_at end,
      next_attempt_at = case when p_sent then next_attempt_at
                             else now() + make_interval(mins => least(60, 2 ^ attempts)::integer) end,
      error = left(p_error, 200)
  where id = p_id
  returning registration_id into v_registration;
  if p_sent and v_registration is not null then
    update public.push_device_registrations set last_sent_at = now() where id = v_registration;
  end if;
end;
$$;

-- Puts a claimed row back in the queue WITHOUT counting an attempt, to be
-- picked up at p_until. The sender uses it when the run cannot continue for
-- reasons unrelated to the row (OAuth token minting failed, FCM answered
-- 429 / 5xx), honouring Retry-After through p_until.
create or replace function public.release_push_outbox(p_id bigint, p_until timestamptz, p_error text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.push_outbox
  set status = 'queued',
      attempts = greatest(attempts - 1, 0),
      claimed_at = null,
      next_attempt_at = greatest(coalesce(p_until, now()), now()),
      error = left(p_error, 200)
  where id = p_id and status = 'sending';
$$;

-- Same, for a device inside its quiet hours.
create or replace function public.defer_push_outbox(p_id bigint, p_until timestamptz)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.release_push_outbox(p_id, p_until, 'deferred_quiet_hours');
$$;

create or replace function public.invoke_push_sender()
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
  if not coalesce((select enabled from public.push_settings where singleton), false) then return null; end if;
  if not exists (
    select 1 from public.push_outbox
    where status in ('queued', 'sending') and next_attempt_at <= now()
  ) then return null; end if;
  select worker_url, worker_token into v_url, v_token from private.push_runtime where singleton;
  if v_url is null or v_url = '' then return null; end if;
  select net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-worker-token', v_token),
    body := jsonb_build_object('limit', 25)
  ) into v_request;
  return v_request;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'verify_push_worker(text)', 'claim_push_outbox(integer)',
    'complete_push_outbox(bigint,boolean,text,uuid)', 'release_push_outbox(bigint,timestamptz,text)',
    'defer_push_outbox(bigint,timestamptz)', 'invoke_push_sender()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Every minute; returns immediately when push is off or nothing is due.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'watchdog-push-sender';
    perform cron.schedule('watchdog-push-sender', '* * * * *', 'select public.invoke_push_sender();');
  end if;
end $$;
