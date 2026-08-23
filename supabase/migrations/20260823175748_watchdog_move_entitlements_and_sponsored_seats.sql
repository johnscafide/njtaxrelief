create table public.watchdog_move_grants (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('paid','sponsored','admin')),
  sponsor_user_id uuid null references auth.users(id) on delete set null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active','revoked','refunded')),
  stripe_checkout_session_id text null unique,
  stripe_payment_intent_id text null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint watchdog_move_grants_time_check check (expires_at > starts_at),
  constraint watchdog_move_grants_sponsor_check check (source <> 'sponsored' or sponsor_user_id is not null)
);

create index watchdog_move_grants_recipient_expiry_idx
  on public.watchdog_move_grants(recipient_user_id, expires_at desc)
  where status = 'active';
create index watchdog_move_grants_sponsor_idx
  on public.watchdog_move_grants(sponsor_user_id, created_at desc)
  where sponsor_user_id is not null;

create table public.watchdog_move_sponsorships (
  id uuid primary key default gen_random_uuid(),
  sponsor_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  recipient_user_id uuid null references auth.users(id) on delete cascade,
  status text not null default 'issued' check (status in ('issued','redeemed','expired','revoked')),
  issued_at timestamptz not null default now(),
  redeemed_at timestamptz null,
  expires_at timestamptz null,
  grant_id uuid null references public.watchdog_move_grants(id) on delete set null,
  renewal_of uuid null references public.watchdog_move_sponsorships(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint watchdog_move_sponsorship_email_normalized check (recipient_email = lower(btrim(recipient_email))),
  constraint watchdog_move_sponsorship_expiry_check check (expires_at is null or expires_at > issued_at)
);

create index watchdog_move_sponsorships_sponsor_month_idx
  on public.watchdog_move_sponsorships(sponsor_user_id, issued_at desc);
create index watchdog_move_sponsorships_recipient_email_idx
  on public.watchdog_move_sponsorships(recipient_email, issued_at desc);
create index watchdog_move_sponsorships_recipient_user_idx
  on public.watchdog_move_sponsorships(recipient_user_id, issued_at desc)
  where recipient_user_id is not null;

alter table public.watchdog_move_grants enable row level security;
alter table public.watchdog_move_sponsorships enable row level security;

revoke all on public.watchdog_move_grants from anon, authenticated;
revoke all on public.watchdog_move_sponsorships from anon, authenticated;
grant select on public.watchdog_move_grants to authenticated;
grant select on public.watchdog_move_sponsorships to authenticated;

create policy watchdog_move_grants_owner_read
  on public.watchdog_move_grants
  for select
  to authenticated
  using ((select auth.uid()) = recipient_user_id);

create policy watchdog_move_sponsorships_participant_read
  on public.watchdog_move_sponsorships
  for select
  to authenticated
  using ((select auth.uid()) = sponsor_user_id or (select auth.uid()) = recipient_user_id);

create or replace function public.watchdog_move_seat_allowance(p_plan text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(p_plan,''))
    when 'agent' then 3
    when 'pro' then 6
    when 'pro_plus' then 20
    when 'pro+' then 20
    when 'teams' then 20
    when 'developer' then 20
    else 0
  end;
$$;

create or replace function public.watchdog_move_current_access(p_user_id uuid)
returns table(
  active boolean,
  expires_at timestamptz,
  source text,
  sponsor_user_id uuid,
  property_capacity integer
)
language sql
stable
security definer
set search_path = public
as $$
  with current_grant as (
    select g.expires_at, g.source, g.sponsor_user_id
    from public.watchdog_move_grants g
    where g.recipient_user_id = p_user_id
      and g.status = 'active'
      and g.expires_at > now()
    order by g.expires_at desc, g.created_at desc
    limit 1
  )
  select
    exists(select 1 from current_grant),
    (select c.expires_at from current_grant c),
    (select c.source from current_grant c),
    (select c.sponsor_user_id from current_grant c),
    case when exists(select 1 from current_grant) then 3 else 0 end;
$$;

revoke all on function public.watchdog_move_current_access(uuid) from public, anon;
grant execute on function public.watchdog_move_current_access(uuid) to authenticated, service_role;

create or replace function public.get_my_watchdog_move_access()
returns table(
  active boolean,
  expires_at timestamptz,
  source text,
  sponsor_user_id uuid,
  property_capacity integer
)
language sql
stable
security definer
set search_path = public
as $$
  select * from public.watchdog_move_current_access(auth.uid());
$$;

revoke all on function public.get_my_watchdog_move_access() from public, anon;
grant execute on function public.get_my_watchdog_move_access() to authenticated;

create or replace function public.watchdog_move_grant_paid(
  p_user_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_paid_at timestamptz default now(),
  p_provider_price_id text default null
)
returns table(grant_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.watchdog_move_grants%rowtype;
  v_base timestamptz;
  v_expires timestamptz;
  v_grant_id uuid;
begin
  if p_user_id is null or nullif(btrim(p_checkout_session_id),'') is null then
    raise exception 'Move paid grant requires user and checkout session';
  end if;

  select * into v_existing
  from public.watchdog_move_grants
  where stripe_checkout_session_id = p_checkout_session_id
  limit 1;

  if found then
    return query select v_existing.id, v_existing.expires_at;
    return;
  end if;

  select greatest(
    p_paid_at,
    coalesce(max(g.expires_at) filter (where g.status = 'active' and g.expires_at > p_paid_at), p_paid_at)
  ) into v_base
  from public.watchdog_move_grants g
  where g.recipient_user_id = p_user_id;

  v_expires := v_base + interval '90 days';

  insert into public.watchdog_move_grants(
    recipient_user_id, source, starts_at, expires_at,
    stripe_checkout_session_id, stripe_payment_intent_id, metadata
  ) values (
    p_user_id, 'paid', v_base, v_expires,
    p_checkout_session_id, nullif(btrim(p_payment_intent_id),''),
    jsonb_build_object('paid_at', p_paid_at, 'provider', 'stripe', 'duration_days', 90)
  ) returning id into v_grant_id;

  insert into public.account_feature_entitlements(
    user_id, feature_key, status, provider, provider_price_id,
    current_period_end, source, metadata, updated_at
  ) values (
    p_user_id, 'watchdog_move', 'active', 'stripe', p_provider_price_id,
    v_expires, 'watchdog-move-paid',
    jsonb_build_object('duration_days', 90, 'checkout_session_id', p_checkout_session_id), now()
  )
  on conflict (user_id, feature_key) do update set
    status = 'active',
    provider = excluded.provider,
    provider_price_id = excluded.provider_price_id,
    current_period_end = excluded.current_period_end,
    source = excluded.source,
    metadata = excluded.metadata,
    updated_at = now();

  return query select v_grant_id, v_expires;
end;
$$;

revoke all on function public.watchdog_move_grant_paid(uuid,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.watchdog_move_grant_paid(uuid,text,text,timestamptz,text) to service_role;

create or replace function public.issue_watchdog_move_seat(
  p_recipient_email text,
  p_renewal_of uuid default null
)
returns table(
  sponsorship_id uuid,
  status text,
  recipient_user_id uuid,
  expires_at timestamptz,
  seats_used integer,
  seats_total integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_sponsor uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_recipient_email,'')));
  v_sponsor_email text;
  v_plan text := 'standard';
  v_subscription_status text := 'none';
  v_account_role text := 'user';
  v_allowance integer := 0;
  v_used integer := 0;
  v_recipient uuid;
  v_existing public.watchdog_move_sponsorships%rowtype;
  v_renew public.watchdog_move_sponsorships%rowtype;
  v_sponsorship_id uuid;
  v_grant_id uuid;
  v_base timestamptz;
  v_expires timestamptz;
begin
  if v_sponsor is null then raise exception 'Authentication required'; end if;
  if v_email = '' or position('@' in v_email) <= 1 then raise exception 'Valid recipient email required'; end if;

  select lower(coalesce(u.email,'')), coalesce(p.account_role,'user'),
         coalesce(e.billing_tier,e.plan_tier,'standard'), coalesce(e.subscription_status,'none')
    into v_sponsor_email, v_account_role, v_plan, v_subscription_status
  from auth.users u
  join public.profiles p on p.id = u.id
  left join public.account_entitlements e on e.user_id = u.id
  where u.id = v_sponsor;

  if v_email = v_sponsor_email then raise exception 'A sponsored seat must be issued to a client'; end if;

  if v_account_role = 'developer' then
    v_plan := 'developer';
  elsif v_subscription_status not in ('active','trialing','past_due') then
    v_plan := 'standard';
  end if;

  v_allowance := public.watchdog_move_seat_allowance(v_plan);
  if v_allowance <= 0 then raise exception 'Your current Watchdog plan does not include Move seats'; end if;

  select count(*)::int into v_used
  from public.watchdog_move_sponsorships s
  where s.sponsor_user_id = v_sponsor
    and s.issued_at >= date_trunc('month', now())
    and s.issued_at < date_trunc('month', now()) + interval '1 month'
    and s.status <> 'revoked';

  if v_used >= v_allowance then raise exception 'Monthly Watchdog Move seat allowance reached'; end if;

  select id into v_recipient from auth.users where lower(email) = v_email limit 1;

  select * into v_existing
  from public.watchdog_move_sponsorships s
  where s.recipient_email = v_email
    and s.status in ('issued','redeemed')
    and (s.expires_at is null or s.expires_at > now())
  order by s.issued_at desc
  limit 1;

  if found then
    if p_renewal_of is null then
      raise exception 'This client already has an active or pending sponsored Move term';
    end if;
    if v_existing.sponsor_user_id <> v_sponsor or v_existing.id <> p_renewal_of then
      raise exception 'Only the current sponsor can renew this client';
    end if;
  elsif p_renewal_of is not null then
    select * into v_renew
    from public.watchdog_move_sponsorships
    where id = p_renewal_of and sponsor_user_id = v_sponsor and recipient_email = v_email;
    if not found then raise exception 'Renewal sponsorship not found'; end if;
  end if;

  insert into public.watchdog_move_sponsorships(
    sponsor_user_id, recipient_email, recipient_user_id, status, renewal_of, metadata
  ) values (
    v_sponsor, v_email, v_recipient,
    case when v_recipient is null then 'issued' else 'redeemed' end,
    p_renewal_of,
    jsonb_build_object('sponsor_plan_at_issue', v_plan, 'duration_days', 90)
  ) returning id into v_sponsorship_id;

  if v_recipient is not null then
    select greatest(
      now(),
      coalesce(max(g.expires_at) filter (where g.status = 'active' and g.expires_at > now()), now())
    ) into v_base
    from public.watchdog_move_grants g
    where g.recipient_user_id = v_recipient;

    v_expires := v_base + interval '90 days';

    insert into public.watchdog_move_grants(
      recipient_user_id, source, sponsor_user_id, starts_at, expires_at, metadata
    ) values (
      v_recipient, 'sponsored', v_sponsor, v_base, v_expires,
      jsonb_build_object('sponsorship_id', v_sponsorship_id, 'duration_days', 90)
    ) returning id into v_grant_id;

    update public.watchdog_move_sponsorships
      set grant_id = v_grant_id, redeemed_at = now(), expires_at = v_expires, updated_at = now()
    where id = v_sponsorship_id;

    insert into public.account_feature_entitlements(
      user_id, feature_key, status, provider, current_period_end, source, metadata, updated_at
    ) values (
      v_recipient, 'watchdog_move', 'active', 'watchdog_move_sponsor', v_expires,
      'watchdog-move-sponsored',
      jsonb_build_object('sponsor_user_id', v_sponsor, 'sponsorship_id', v_sponsorship_id, 'duration_days', 90), now()
    )
    on conflict (user_id, feature_key) do update set
      status = 'active', provider = excluded.provider, current_period_end = excluded.current_period_end,
      source = excluded.source, metadata = excluded.metadata, updated_at = now();
  end if;

  v_used := v_used + 1;
  return query select v_sponsorship_id,
    case when v_recipient is null then 'issued'::text else 'redeemed'::text end,
    v_recipient, v_expires, v_used, v_allowance;
end;
$$;

revoke all on function public.issue_watchdog_move_seat(text,uuid) from public, anon;
grant execute on function public.issue_watchdog_move_seat(text,uuid) to authenticated;

create or replace function public.claim_my_watchdog_move_sponsorship()
returns table(sponsorship_id uuid, grant_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_s public.watchdog_move_sponsorships%rowtype;
  v_base timestamptz;
  v_expires timestamptz;
  v_grant_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select lower(coalesce(email,'')) into v_email from auth.users where id = v_user;
  if v_email = '' then raise exception 'Verified account email required'; end if;

  select * into v_s
  from public.watchdog_move_sponsorships s
  where s.recipient_email = v_email and s.status = 'issued'
  order by s.issued_at asc
  limit 1
  for update;

  if not found then return; end if;

  select greatest(
    now(),
    coalesce(max(g.expires_at) filter (where g.status = 'active' and g.expires_at > now()), now())
  ) into v_base
  from public.watchdog_move_grants g
  where g.recipient_user_id = v_user;
  v_expires := v_base + interval '90 days';

  insert into public.watchdog_move_grants(
    recipient_user_id, source, sponsor_user_id, starts_at, expires_at, metadata
  ) values (
    v_user, 'sponsored', v_s.sponsor_user_id, v_base, v_expires,
    jsonb_build_object('sponsorship_id', v_s.id, 'duration_days', 90)
  ) returning id into v_grant_id;

  update public.watchdog_move_sponsorships
    set recipient_user_id = v_user, status = 'redeemed', grant_id = v_grant_id,
        redeemed_at = now(), expires_at = v_expires, updated_at = now()
  where id = v_s.id;

  insert into public.account_feature_entitlements(
    user_id, feature_key, status, provider, current_period_end, source, metadata, updated_at
  ) values (
    v_user, 'watchdog_move', 'active', 'watchdog_move_sponsor', v_expires,
    'watchdog-move-sponsored',
    jsonb_build_object('sponsor_user_id', v_s.sponsor_user_id, 'sponsorship_id', v_s.id, 'duration_days', 90), now()
  )
  on conflict (user_id, feature_key) do update set
    status = 'active', provider = excluded.provider, current_period_end = excluded.current_period_end,
    source = excluded.source, metadata = excluded.metadata, updated_at = now();

  return query select v_s.id, v_grant_id, v_expires;
end;
$$;

revoke all on function public.claim_my_watchdog_move_sponsorship() from public, anon;
grant execute on function public.claim_my_watchdog_move_sponsorship() to authenticated;

create or replace function public.get_my_watchdog_move_seat_summary()
returns table(seats_total integer, seats_used integer, seats_remaining integer, plan_tier text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_plan text;
  v_status text;
  v_total integer;
  v_used integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select coalesce(p.account_role,'user'), coalesce(e.billing_tier,e.plan_tier,'standard'), coalesce(e.subscription_status,'none')
    into v_role, v_plan, v_status
  from public.profiles p
  left join public.account_entitlements e on e.user_id = p.id
  where p.id = v_user;

  if v_role = 'developer' then v_plan := 'developer';
  elsif v_status not in ('active','trialing','past_due') then v_plan := 'standard';
  end if;

  v_total := public.watchdog_move_seat_allowance(v_plan);
  select count(*)::int into v_used
  from public.watchdog_move_sponsorships s
  where s.sponsor_user_id = v_user
    and s.issued_at >= date_trunc('month', now())
    and s.issued_at < date_trunc('month', now()) + interval '1 month'
    and s.status <> 'revoked';

  return query select v_total, v_used, greatest(v_total - v_used, 0), v_plan;
end;
$$;

revoke all on function public.get_my_watchdog_move_seat_summary() from public, anon;
grant execute on function public.get_my_watchdog_move_seat_summary() to authenticated;

create or replace function public.get_watchdog_move_sponsored_client_properties(p_sponsorship_id uuid)
returns table(
  property_id uuid,
  pams_pin text,
  address text,
  city text,
  town text,
  county text,
  zip text,
  nickname text,
  saved_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sponsor uuid := auth.uid();
  v_recipient uuid;
begin
  if v_sponsor is null then raise exception 'Authentication required'; end if;

  select s.recipient_user_id into v_recipient
  from public.watchdog_move_sponsorships s
  where s.id = p_sponsorship_id
    and s.sponsor_user_id = v_sponsor
    and s.status = 'redeemed'
    and s.expires_at > now();

  if v_recipient is null then raise exception 'Active sponsored client relationship not found'; end if;

  return query
    select sp.id, sp.pams_pin, sp.address, sp.city, sp.town, sp.county, sp.zip, sp.nickname, sp.created_at, sp.updated_at
    from public.saved_properties sp
    where sp.user_id = v_recipient
    order by sp.updated_at desc;
end;
$$;

revoke all on function public.get_watchdog_move_sponsored_client_properties(uuid) from public, anon;
grant execute on function public.get_watchdog_move_sponsored_client_properties(uuid) to authenticated;

insert into public.platform_release_gates(gate_key,label,status,environment,evidence,updated_at)
values (
  'watchdog_move_paid_checkout',
  'Watchdog Move paid checkout',
  'blocked',
  'production',
  jsonb_build_object(
    'checkout_mode','closed',
    'price_cents',2900,
    'currency','usd',
    'duration_days',90,
    'auto_renew',false,
    'reason','Move code may deploy dormant; real paid checkout stays closed until controlled paid lifecycle evidence is complete.'
  ),
  now()
)
on conflict (gate_key) do update set
  label = excluded.label,
  evidence = coalesce(public.platform_release_gates.evidence,'{}'::jsonb) || excluded.evidence,
  updated_at = now();
