-- NJW-331: owner-only filing workflow metadata and governed deadline reminders.
-- Application answers and PDFs remain encrypted in the existing zero-knowledge vault.

create schema if not exists private;

create table if not exists public.anchor_program_deadlines (
  id uuid primary key default gen_random_uuid(),
  tax_year smallint not null,
  form_type text not null check (form_type in ('all','anc-1','pas-1')),
  deadline_date date not null,
  source_url text not null,
  source_title text not null,
  verified_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tax_year, form_type)
);

alter table public.anchor_program_deadlines enable row level security;
drop policy if exists "Public may read active anchor deadlines" on public.anchor_program_deadlines;
create policy "Public may read active anchor deadlines"
  on public.anchor_program_deadlines for select
  using (active = true);

grant select on public.anchor_program_deadlines to anon, authenticated;

insert into public.anchor_program_deadlines
  (tax_year, form_type, deadline_date, source_url, source_title, verified_at, active, updated_at)
values
  (2025, 'all', date '2026-11-02', 'https://www.nj.gov/treasury/taxation/relief.shtml', 'NJ Division of Taxation - Property Tax Relief Programs', timestamptz '2026-09-12 15:45:00+00', true, now())
on conflict (tax_year, form_type) do update set
  deadline_date = excluded.deadline_date,
  source_url = excluded.source_url,
  source_title = excluded.source_title,
  verified_at = excluded.verified_at,
  active = excluded.active,
  updated_at = now();

create table if not exists public.anchor_application_filing_state (
  application_id uuid primary key references public.anchor_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tax_year smallint not null,
  filing_status text not null default 'not_filed' check (filing_status in ('not_filed','ready_to_file','mailed','filed_other')),
  filed_on date,
  filing_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists anchor_application_filing_state_user_idx
  on public.anchor_application_filing_state(user_id, updated_at desc);

alter table public.anchor_application_filing_state enable row level security;
drop policy if exists "Owners read anchor filing state" on public.anchor_application_filing_state;
create policy "Owners read anchor filing state"
  on public.anchor_application_filing_state for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Owners insert anchor filing state" on public.anchor_application_filing_state;
create policy "Owners insert anchor filing state"
  on public.anchor_application_filing_state for insert to authenticated
  with check (auth.uid() = user_id and exists (
    select 1 from public.anchor_applications a where a.id = application_id and a.user_id = auth.uid()
  ));
drop policy if exists "Owners update anchor filing state" on public.anchor_application_filing_state;
create policy "Owners update anchor filing state"
  on public.anchor_application_filing_state for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.anchor_application_filing_state to authenticated;

create table if not exists public.anchor_application_reminders (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.anchor_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tax_year smallint not null,
  offset_days smallint not null check (offset_days in (7,14)),
  channel text not null default 'email' check (channel = 'email'),
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','processing','sent','cancelled','failed')),
  attempts integer not null default 0,
  lease_until timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, offset_days, channel)
);

create index if not exists anchor_application_reminders_due_idx
  on public.anchor_application_reminders(status, scheduled_for)
  where status in ('scheduled','processing');
create index if not exists anchor_application_reminders_user_idx
  on public.anchor_application_reminders(user_id, application_id);

alter table public.anchor_application_reminders enable row level security;
drop policy if exists "Owners read anchor reminders" on public.anchor_application_reminders;
create policy "Owners read anchor reminders"
  on public.anchor_application_reminders for select to authenticated
  using (auth.uid() = user_id);

grant select on public.anchor_application_reminders to authenticated;

create or replace function public.set_my_anchor_filing_state(
  p_application_id uuid,
  p_status text,
  p_filed_on date default null,
  p_method text default null
) returns public.anchor_application_filing_state
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_app public.anchor_applications%rowtype;
  v_row public.anchor_application_filing_state%rowtype;
  v_date date;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_status not in ('not_filed','ready_to_file','mailed','filed_other') then raise exception 'invalid_filing_status'; end if;
  select * into v_app from public.anchor_applications where id = p_application_id and user_id = v_uid;
  if not found then raise exception 'application_not_found'; end if;
  v_date := case when p_status in ('mailed','filed_other') then coalesce(p_filed_on, current_date) else null end;
  insert into public.anchor_application_filing_state(application_id,user_id,tax_year,filing_status,filed_on,filing_method,updated_at)
  values (v_app.id,v_uid,v_app.tax_year,p_status,v_date,nullif(left(trim(coalesce(p_method,'')),80),''),now())
  on conflict (application_id) do update set
    filing_status=excluded.filing_status,
    filed_on=excluded.filed_on,
    filing_method=excluded.filing_method,
    updated_at=now()
  returning * into v_row;
  if p_status in ('mailed','filed_other') then
    update public.anchor_application_reminders set status='cancelled', lease_until=null, updated_at=now()
      where application_id=p_application_id and user_id=v_uid and status in ('scheduled','processing','failed');
  end if;
  return v_row;
end $$;

grant execute on function public.set_my_anchor_filing_state(uuid,text,date,text) to authenticated;

create or replace function public.set_my_anchor_reminder(
  p_application_id uuid,
  p_offset_days smallint,
  p_enabled boolean default true
) returns public.anchor_application_reminders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_app public.anchor_applications%rowtype;
  v_deadline public.anchor_program_deadlines%rowtype;
  v_when timestamptz;
  v_row public.anchor_application_reminders%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_offset_days not in (7,14) then raise exception 'invalid_reminder_offset'; end if;
  select * into v_app from public.anchor_applications where id=p_application_id and user_id=v_uid;
  if not found then raise exception 'application_not_found'; end if;
  select * into v_deadline from public.anchor_program_deadlines
    where tax_year=v_app.tax_year and active=true and form_type in ('all','anc-1','pas-1')
    order by case when form_type='all' then 1 else 0 end desc limit 1;
  if not found then raise exception 'verified_deadline_unavailable'; end if;
  v_when := make_timestamptz(extract(year from v_deadline.deadline_date)::int, extract(month from v_deadline.deadline_date)::int, extract(day from v_deadline.deadline_date)::int, 9, 0, 0, 'America/New_York') - make_interval(days => p_offset_days);
  if not p_enabled then
    update public.anchor_application_reminders set status='cancelled', lease_until=null, updated_at=now()
      where application_id=p_application_id and user_id=v_uid and offset_days=p_offset_days and channel='email'
      returning * into v_row;
    return v_row;
  end if;
  if v_when <= now() then v_when := now() + interval '5 minutes'; end if;
  insert into public.anchor_application_reminders(application_id,user_id,tax_year,offset_days,channel,scheduled_for,status,attempts,lease_until,sent_at,last_error,updated_at)
  values(v_app.id,v_uid,v_app.tax_year,p_offset_days,'email',v_when,'scheduled',0,null,null,null,now())
  on conflict(application_id,offset_days,channel) do update set
    scheduled_for=excluded.scheduled_for,status='scheduled',attempts=0,lease_until=null,sent_at=null,last_error=null,updated_at=now()
  returning * into v_row;
  return v_row;
end $$;

grant execute on function public.set_my_anchor_reminder(uuid,smallint,boolean) to authenticated;

create table if not exists private.anchor_reminder_runtime (
  singleton boolean primary key default true check (singleton),
  worker_url text,
  worker_token text not null default encode(gen_random_bytes(32),'hex'),
  updated_at timestamptz not null default now()
);
insert into private.anchor_reminder_runtime(singleton) values(true) on conflict(singleton) do nothing;
revoke all on private.anchor_reminder_runtime from public, anon, authenticated;

create or replace function public.verify_anchor_reminder_worker_token_v1(p_token text)
returns boolean language sql security definer set search_path = private, pg_temp as $$
  select exists(select 1 from private.anchor_reminder_runtime where singleton=true and worker_token = p_token);
$$;
revoke all on function public.verify_anchor_reminder_worker_token_v1(text) from public, anon, authenticated;
grant execute on function public.verify_anchor_reminder_worker_token_v1(text) to service_role;

create or replace function public.claim_due_anchor_filing_reminders_v1(p_limit integer default 25)
returns table(id uuid, application_id uuid, user_id uuid, tax_year smallint, offset_days smallint, scheduled_for timestamptz, deadline_date date, source_url text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  return query
  with due as (
    select r.id
    from public.anchor_application_reminders r
    left join public.anchor_application_filing_state f on f.application_id=r.application_id
    where r.status in ('scheduled','processing')
      and r.scheduled_for <= now()
      and (r.lease_until is null or r.lease_until < now())
      and coalesce(f.filing_status,'not_filed') not in ('mailed','filed_other')
    order by r.scheduled_for
    for update of r skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  ), claimed as (
    update public.anchor_application_reminders r
      set status='processing', attempts=r.attempts+1, lease_until=now()+interval '10 minutes', updated_at=now()
    from due where r.id=due.id
    returning r.*
  )
  select c.id,c.application_id,c.user_id,c.tax_year,c.offset_days,c.scheduled_for,d.deadline_date,d.source_url
  from claimed c
  join lateral (
    select x.deadline_date,x.source_url from public.anchor_program_deadlines x
    where x.tax_year=c.tax_year and x.active=true and x.form_type in ('all','anc-1','pas-1')
    order by case when x.form_type='all' then 1 else 0 end desc limit 1
  ) d on true;
end $$;
revoke all on function public.claim_due_anchor_filing_reminders_v1(integer) from public, anon, authenticated;
grant execute on function public.claim_due_anchor_filing_reminders_v1(integer) to service_role;

create or replace function public.complete_anchor_filing_reminder_v1(p_id uuid,p_sent boolean,p_error text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  update public.anchor_application_reminders
  set status=case when p_sent then 'sent' else case when attempts >= 3 then 'failed' else 'scheduled' end end,
      sent_at=case when p_sent then now() else sent_at end,
      scheduled_for=case when p_sent or attempts >= 3 then scheduled_for else now()+interval '1 hour' end,
      lease_until=null,
      last_error=case when p_sent then null else left(coalesce(p_error,'delivery_failed'),240) end,
      updated_at=now()
  where id=p_id;
end $$;
revoke all on function public.complete_anchor_filing_reminder_v1(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.complete_anchor_filing_reminder_v1(uuid,boolean,text) to service_role;

create or replace function public.invoke_anchor_filing_reminder_worker()
returns bigint language plpgsql security definer set search_path = public, private, net, pg_temp as $$
declare
  v_url text;
  v_token text;
  v_request bigint;
begin
  select worker_url,worker_token into v_url,v_token from private.anchor_reminder_runtime where singleton=true;
  if v_url is null or v_url='' then return null; end if;
  select net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-anchor-reminder-token',v_token),
    body := jsonb_build_object('limit',50)
  ) into v_request;
  return v_request;
end $$;
revoke all on function public.invoke_anchor_filing_reminder_worker() from public, anon, authenticated;

comment on table public.anchor_application_filing_state is 'Minimal owner-only filing workflow metadata. No application answers or document contents.';
comment on table public.anchor_application_reminders is 'Owner-selected deadline reminders. No sensitive application answers are stored.';
