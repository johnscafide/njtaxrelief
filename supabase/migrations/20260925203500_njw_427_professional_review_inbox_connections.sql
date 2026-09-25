-- NJW-427: Professional review inbox, notification outbox, and provider connection foundation.
-- REALTOR® verification remains a trust signal only and never changes Watchdog plan entitlements.

-- Allow the reviewer to request more information without incorrectly marking a submission rejected.
alter table public.professional_realtor_verifications
  drop constraint if exists professional_realtor_verifications_verification_status_check;

alter table public.professional_realtor_verifications
  add constraint professional_realtor_verifications_verification_status_check
  check (verification_status in ('pending','needs_info','verified','rejected','expired'));

-- Internal audit stream for professional verification and provider-connection actions.
create table if not exists public.professional_review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('realtor_verification','professional_connection')),
  entity_key text not null,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_label text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists professional_review_events_user_idx
  on public.professional_review_events(user_id, created_at desc);
create index if not exists professional_review_events_type_idx
  on public.professional_review_events(entity_type, event_type, created_at desc);

alter table public.professional_review_events enable row level security;
revoke all on table public.professional_review_events from public, anon, authenticated;
grant select, insert, update, delete on table public.professional_review_events to service_role;

-- Outbox keeps notification delivery independent from the review queue.
create table if not exists public.professional_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending','sent','failed','skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists professional_notification_outbox_status_idx
  on public.professional_notification_outbox(delivery_status, created_at);

alter table public.professional_notification_outbox enable row level security;
revoke all on table public.professional_notification_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.professional_notification_outbox to service_role;

-- Provider connection model. These rows represent user requests and authorized provider state.
-- They do not imply that Watchdog has access to an MLS or Realtor.com unless connection_status=connected.
create table if not exists public.professional_provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_key text not null check (provider_key in ('bright_mls','reso_mls','realtor_com')),
  provider_label text not null,
  connection_status text not null default 'requested'
    check (connection_status in ('requested','needs_action','connected','error','disconnected')),
  external_member_id text,
  external_profile_url text,
  auth_method text,
  scopes jsonb not null default '[]'::jsonb,
  profile_data jsonb not null default '{}'::jsonb,
  sync_capabilities jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  connected_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider_key),
  constraint professional_provider_connections_profile_url_chk
    check (external_profile_url is null or external_profile_url ~ '^https://')
);

create index if not exists professional_provider_connections_status_idx
  on public.professional_provider_connections(connection_status, requested_at desc);

alter table public.professional_provider_connections enable row level security;
revoke all on table public.professional_provider_connections from public, anon;
grant select on table public.professional_provider_connections to authenticated, service_role;
grant insert, update, delete on table public.professional_provider_connections to service_role;

drop policy if exists "professional provider connection owner read" on public.professional_provider_connections;
create policy "professional provider connection owner read"
on public.professional_provider_connections
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Queue audit + admin notification whenever a REALTOR® review is submitted/resubmitted.
create or replace function public.professional_realtor_submission_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
begin
  if new.verification_status = 'pending'
     and (tg_op = 'INSERT' or old.submitted_at is distinct from new.submitted_at or old.verification_status is distinct from new.verification_status) then
    v_key := 'realtor_submission:' || new.user_id::text || ':' || extract(epoch from new.submitted_at)::bigint::text;

    insert into public.professional_review_events(
      user_id, entity_type, entity_key, event_type, details
    ) values (
      new.user_id,
      'realtor_verification',
      new.user_id::text,
      'realtor_verification.submitted',
      jsonb_build_object(
        'nar_member_id', new.nar_member_id,
        'local_association', new.local_association,
        'submitted_at', new.submitted_at
      )
    );

    insert into public.professional_notification_outbox(
      user_id, event_type, idempotency_key, payload
    ) values (
      new.user_id,
      'realtor_verification.submitted',
      v_key,
      jsonb_build_object(
        'nar_member_id', new.nar_member_id,
        'local_association', new.local_association,
        'submitted_at', new.submitted_at
      )
    )
    on conflict (idempotency_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists professional_realtor_submission_event_trigger
  on public.professional_realtor_verifications;

create trigger professional_realtor_submission_event_trigger
after insert or update on public.professional_realtor_verifications
for each row execute function public.professional_realtor_submission_event_v1();

-- Keep the existing user submit contract, now with audit/outbox emission through the trigger above.
create or replace function public.submit_my_realtor_verification_v1(
  p_nar_member_id text,
  p_local_association text default null,
  p_proof_url text default null,
  p_user_note text default null
)
returns table(
  verification_status text,
  verified_realtor boolean,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id text := upper(regexp_replace(coalesce(p_nar_member_id,''), '[[:space:]]', '', 'g'));
  v_assoc text := nullif(left(btrim(coalesce(p_local_association,'')),160),'');
  v_proof text := nullif(left(btrim(coalesce(p_proof_url,'')),700),'');
  v_note text := nullif(left(btrim(coalesce(p_user_note,'')),1000),'');
  v_now timestamptz := now();
  v_profession text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select primary_profession into v_profession
  from public.watchdog_onboarding_profiles
  where user_id = v_uid
  limit 1;

  if v_profession is distinct from 'real_estate' then
    raise exception 'REALTOR verification is available to real-estate professional profiles';
  end if;

  if v_member_id !~ '^[A-Z0-9-]{4,32}$' then
    raise exception 'Enter a valid NAR Member ID';
  end if;

  if v_proof is not null and v_proof !~ '^https://' then
    raise exception 'Proof URL must use HTTPS';
  end if;

  insert into public.professional_realtor_verifications (
    user_id, nar_member_id, local_association, proof_url, user_note,
    verification_status, verified_realtor, member_name, verified_at,
    verification_due_at, submitted_at, reviewed_at, reviewer_id,
    review_note, updated_at
  ) values (
    v_uid, v_member_id, v_assoc, v_proof, v_note,
    'pending', false, null, null,
    null, v_now, null, null,
    null, v_now
  )
  on conflict (user_id) do update set
    nar_member_id = excluded.nar_member_id,
    local_association = excluded.local_association,
    proof_url = excluded.proof_url,
    user_note = excluded.user_note,
    verification_status = 'pending',
    verified_realtor = false,
    member_name = null,
    verified_at = null,
    verification_due_at = null,
    submitted_at = v_now,
    reviewed_at = null,
    reviewer_id = null,
    review_note = null,
    updated_at = v_now;

  return query select 'pending'::text, false, v_now;
end;
$$;

revoke all on function public.submit_my_realtor_verification_v1(text,text,text,text) from public, anon;
grant execute on function public.submit_my_realtor_verification_v1(text,text,text,text) to authenticated;

-- Service-owned review action used by Backoffice.
create or replace function public.review_realtor_verification_v1(
  p_user_id uuid,
  p_status text,
  p_member_name text default null,
  p_local_association text default null,
  p_review_note text default null,
  p_verification_due_at timestamptz default null
)
returns table(
  verification_status text,
  verified_realtor boolean,
  verified_at timestamptz,
  verification_due_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text := lower(btrim(coalesce(p_status,'')));
  v_now timestamptz := now();
  v_verified boolean;
  v_due timestamptz;
begin
  if v_status not in ('verified','needs_info','rejected','expired') then
    raise exception 'Invalid REALTOR verification review status';
  end if;

  v_verified := (v_status = 'verified');
  v_due := case when v_verified then coalesce(p_verification_due_at, v_now + interval '1 year') else null end;

  update public.professional_realtor_verifications
  set verification_status = v_status,
      verified_realtor = v_verified,
      member_name = case when v_verified then nullif(left(btrim(coalesce(p_member_name,'')),160),'') else member_name end,
      local_association = coalesce(nullif(left(btrim(coalesce(p_local_association,'')),160),''), local_association),
      verified_at = case when v_verified then v_now else null end,
      verification_due_at = v_due,
      reviewed_at = v_now,
      review_note = nullif(left(btrim(coalesce(p_review_note,'')),1000),''),
      updated_at = v_now
  where user_id = p_user_id;

  if not found then raise exception 'REALTOR verification submission not found'; end if;

  return query select v_status, v_verified, case when v_verified then v_now else null end, v_due;
end;
$$;

revoke all on function public.review_realtor_verification_v1(uuid,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.review_realtor_verification_v1(uuid,text,text,text,text,timestamptz) to service_role;

-- User-facing connection request.
create or replace function public.request_my_professional_connection_v1(
  p_provider_key text,
  p_external_profile_url text default null
)
returns table(
  provider_key text,
  provider_label text,
  connection_status text,
  requested_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_key text := lower(btrim(coalesce(p_provider_key,'')));
  v_url text := nullif(left(btrim(coalesce(p_external_profile_url,'')),700),'');
  v_label text;
  v_profession text;
  v_now timestamptz := now();
  v_row public.professional_provider_connections%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select primary_profession into v_profession
  from public.watchdog_onboarding_profiles
  where user_id = v_uid
  limit 1;

  if v_profession is distinct from 'real_estate' then
    raise exception 'Professional connections are available to real-estate professional profiles';
  end if;

  v_label := case v_key
    when 'bright_mls' then 'Bright MLS'
    when 'reso_mls' then 'Other RESO MLS'
    when 'realtor_com' then 'Realtor.com'
    else null
  end;

  if v_label is null then raise exception 'Unsupported professional connection provider'; end if;
  if v_url is not null and v_url !~ '^https://' then raise exception 'Profile URL must use HTTPS'; end if;

  insert into public.professional_provider_connections(
    user_id, provider_key, provider_label, connection_status,
    external_profile_url, requested_at, updated_at
  ) values (
    v_uid, v_key, v_label, 'requested',
    v_url, v_now, v_now
  )
  on conflict (user_id,provider_key) do update set
    external_profile_url = coalesce(excluded.external_profile_url, public.professional_provider_connections.external_profile_url),
    connection_status = case
      when public.professional_provider_connections.connection_status = 'connected' then 'connected'
      else 'requested'
    end,
    requested_at = case
      when public.professional_provider_connections.connection_status = 'connected' then public.professional_provider_connections.requested_at
      else v_now
    end,
    last_error = null,
    updated_at = v_now
  returning * into v_row;

  insert into public.professional_review_events(
    user_id, entity_type, entity_key, event_type, details
  ) values (
    v_uid,
    'professional_connection',
    v_key,
    'professional_connection.requested',
    jsonb_build_object(
      'provider_key', v_key,
      'provider_label', v_label,
      'external_profile_url', v_url,
      'connection_status', v_row.connection_status
    )
  );

  return query select v_row.provider_key, v_row.provider_label, v_row.connection_status, v_row.requested_at;
end;
$$;

revoke all on function public.request_my_professional_connection_v1(text,text) from public, anon;
grant execute on function public.request_my_professional_connection_v1(text,text) to authenticated;

create or replace function public.my_professional_connections_v1()
returns table(
  id uuid,
  provider_key text,
  provider_label text,
  connection_status text,
  external_member_id text,
  external_profile_url text,
  auth_method text,
  sync_capabilities jsonb,
  requested_at timestamptz,
  connected_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select
    c.id, c.provider_key, c.provider_label, c.connection_status,
    c.external_member_id, c.external_profile_url, c.auth_method,
    c.sync_capabilities, c.requested_at, c.connected_at,
    c.last_synced_at, c.last_error, c.updated_at
  from public.professional_provider_connections c
  where c.user_id = (select auth.uid())
  order by c.provider_key;
$$;

revoke all on function public.my_professional_connections_v1() from public, anon;
grant execute on function public.my_professional_connections_v1() to authenticated, service_role;

-- Service-owned provider status setter. Does not perform OAuth or claim external authorization.
create or replace function public.review_professional_connection_v1(
  p_user_id uuid,
  p_provider_key text,
  p_status text,
  p_external_member_id text default null,
  p_auth_method text default null,
  p_sync_capabilities jsonb default null,
  p_profile_data jsonb default null,
  p_last_error text default null
)
returns table(
  provider_key text,
  connection_status text,
  connected_at timestamptz,
  last_synced_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := lower(btrim(coalesce(p_provider_key,'')));
  v_status text := lower(btrim(coalesce(p_status,'')));
  v_now timestamptz := now();
  v_row public.professional_provider_connections%rowtype;
begin
  if v_key not in ('bright_mls','reso_mls','realtor_com') then
    raise exception 'Unsupported professional connection provider';
  end if;
  if v_status not in ('requested','needs_action','connected','error','disconnected') then
    raise exception 'Invalid professional connection status';
  end if;

  update public.professional_provider_connections
  set connection_status = v_status,
      external_member_id = coalesce(nullif(left(btrim(coalesce(p_external_member_id,'')),160),''), external_member_id),
      auth_method = coalesce(nullif(left(btrim(coalesce(p_auth_method,'')),80),''), auth_method),
      sync_capabilities = coalesce(p_sync_capabilities, sync_capabilities),
      profile_data = coalesce(p_profile_data, profile_data),
      connected_at = case when v_status = 'connected' then coalesce(connected_at,v_now) when v_status = 'disconnected' then null else connected_at end,
      last_synced_at = case when v_status = 'connected' and p_profile_data is not null then v_now else last_synced_at end,
      last_error = nullif(left(btrim(coalesce(p_last_error,'')),1000),''),
      updated_at = v_now
  where user_id = p_user_id and provider_key = v_key
  returning * into v_row;

  if v_row.id is null then raise exception 'Professional connection request not found'; end if;

  return query select v_row.provider_key, v_row.connection_status, v_row.connected_at, v_row.last_synced_at;
end;
$$;

revoke all on function public.review_professional_connection_v1(uuid,text,text,text,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.review_professional_connection_v1(uuid,text,text,text,text,jsonb,jsonb,text) to service_role;

comment on table public.professional_notification_outbox is
  'Server-only notification outbox. The Backoffice review queue is authoritative even if email delivery fails.';
comment on table public.professional_provider_connections is
  'Professional provider connection/request state. A row is not proof of provider authorization unless connection_status=connected.';
comment on function public.request_my_professional_connection_v1(text,text) is
  'Requests a Bright MLS, RESO MLS, or Realtor.com professional connection. It does not claim provider access or scrape provider data.';
