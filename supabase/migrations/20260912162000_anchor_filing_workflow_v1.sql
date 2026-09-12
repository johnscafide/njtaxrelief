-- NJW-332: privacy-minimized post-PDF filing workflow and governed deadline reminders.
-- This table intentionally stores no SSNs, income, disability answers, addresses,
-- PDF contents, recovery keys, or decrypted Private Vault payload fields.

create table if not exists public.anchor_filing_deadlines (
  tax_year integer primary key check (tax_year between 2020 and 2100),
  filing_deadline date not null,
  source_name text not null check (length(source_name) between 3 and 160),
  source_url text not null check (source_url ~ '^https://'),
  source_checked_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.anchor_filing_deadlines is
  'Governed, source-backed filing deadlines shared by the Watchdog ANCHOR/PAS-1 workflow. No customer data.';

insert into public.anchor_filing_deadlines(
  tax_year, filing_deadline, source_name, source_url, source_checked_at, active
) values (
  2025,
  date '2026-11-02',
  'New Jersey Division of Taxation — ANCHOR Program',
  'https://www.nj.gov/treasury/taxation/anchor/',
  timestamptz '2026-09-12 16:10:00+00',
  true
)
on conflict (tax_year) do update
set filing_deadline = excluded.filing_deadline,
    source_name = excluded.source_name,
    source_url = excluded.source_url,
    source_checked_at = excluded.source_checked_at,
    active = excluded.active,
    updated_at = now();

create table if not exists public.anchor_application_workflows (
  application_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  filing_status text not null default 'not_filed' check (filing_status in (
    'not_filed','ready_to_file','mailed','filed_another_way'
  )),
  filing_status_date date,
  reminder_offsets integer[] not null default '{}'::integer[],
  last_reminder_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (application_id, user_id),
  constraint anchor_application_workflows_application_owner_fk
    foreign key (application_id, user_id)
    references public.anchor_applications(id, user_id)
    on delete cascade,
  constraint anchor_application_workflows_status_date_check
    check ((filing_status = 'not_filed') or filing_status_date is not null),
  constraint anchor_application_workflows_reminders_check
    check (reminder_offsets <@ array[1,7,14]::integer[])
);

comment on table public.anchor_application_workflows is
  'Privacy-minimized customer filing state and in-product deadline reminder preferences. Sensitive application answers remain encrypted in the Private Vault.';

create index if not exists anchor_application_workflows_user_idx
  on public.anchor_application_workflows(user_id, updated_at desc);

alter table public.anchor_filing_deadlines enable row level security;
alter table public.anchor_application_workflows enable row level security;

revoke all on public.anchor_filing_deadlines from anon, authenticated;
revoke all on public.anchor_application_workflows from anon, authenticated;
grant select on public.anchor_filing_deadlines to authenticated;
grant select on public.anchor_application_workflows to authenticated;

drop policy if exists anchor_filing_deadlines_authenticated_select on public.anchor_filing_deadlines;
create policy anchor_filing_deadlines_authenticated_select
on public.anchor_filing_deadlines for select to authenticated
using (active = true);

drop policy if exists anchor_application_workflows_owner_select on public.anchor_application_workflows;
create policy anchor_application_workflows_owner_select
on public.anchor_application_workflows for select to authenticated
using ((select auth.uid()) = user_id);

drop trigger if exists anchor_filing_deadlines_touch_updated_at on public.anchor_filing_deadlines;
create trigger anchor_filing_deadlines_touch_updated_at
before update on public.anchor_filing_deadlines
for each row execute function public.touch_updated_at();

drop trigger if exists anchor_application_workflows_touch_updated_at on public.anchor_application_workflows;
create trigger anchor_application_workflows_touch_updated_at
before update on public.anchor_application_workflows
for each row execute function public.touch_updated_at();

create or replace function public.anchor_workflow_json_v1(
  p_application_id uuid,
  p_user_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  with app as (
    select a.id, a.user_id, a.tax_year, a.status as document_status
    from public.anchor_applications a
    where a.id = p_application_id and a.user_id = p_user_id
  ), workflow as (
    select w.*
    from public.anchor_application_workflows w
    where w.application_id = p_application_id and w.user_id = p_user_id
  ), deadline as (
    select d.*
    from public.anchor_filing_deadlines d
    join app on app.tax_year = d.tax_year
    where d.active = true
    limit 1
  ), base as (
    select
      app.id,
      app.tax_year,
      app.document_status,
      coalesce(workflow.filing_status, 'not_filed') as filing_status,
      workflow.filing_status_date,
      coalesce(workflow.reminder_offsets, '{}'::integer[]) as reminder_offsets,
      workflow.last_reminder_seen_at,
      deadline.filing_deadline,
      deadline.source_name,
      deadline.source_url,
      deadline.source_checked_at
    from app
    left join workflow on true
    left join deadline on true
  ), due as (
    select base.*,
      case when filing_deadline is null then null
           else (filing_deadline - current_date)::integer end as days_remaining,
      (
        select min(filing_deadline - offset_days)
        from unnest(reminder_offsets) as offset_days
        where filing_deadline is not null
          and filing_deadline - offset_days >= current_date
      ) as next_reminder_date,
      (
        select max(filing_deadline - offset_days)
        from unnest(reminder_offsets) as offset_days
        where filing_deadline is not null
          and filing_deadline - offset_days <= current_date
      ) as latest_due_reminder_date
    from base
  )
  select case when not exists(select 1 from due) then null else jsonb_build_object(
    'application_id', id,
    'tax_year', tax_year,
    'document_status', document_status,
    'filing_status', filing_status,
    'filing_status_date', filing_status_date,
    'reminder_offsets', to_jsonb(reminder_offsets),
    'last_reminder_seen_at', last_reminder_seen_at,
    'deadline', case when filing_deadline is null then null else jsonb_build_object(
      'date', filing_deadline,
      'source_name', source_name,
      'source_url', source_url,
      'source_checked_at', source_checked_at
    ) end,
    'days_remaining', days_remaining,
    'next_reminder_date', next_reminder_date,
    'reminder_due', (
      filing_status in ('not_filed','ready_to_file')
      and latest_due_reminder_date is not null
      and (last_reminder_seen_at is null or last_reminder_seen_at::date < latest_due_reminder_date)
    )
  ) end
  from due
  limit 1
$$;

revoke all on function public.anchor_workflow_json_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.anchor_workflow_json_v1(uuid,uuid) to service_role;

create or replace function public.get_my_anchor_filing_workflow(
  p_application_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'authentication required'; end if;
  return public.anchor_workflow_json_v1(p_application_id, v_user);
end;
$$;

revoke all on function public.get_my_anchor_filing_workflow(uuid) from public, anon;
grant execute on function public.get_my_anchor_filing_workflow(uuid) to authenticated;

create or replace function public.get_my_anchor_filing_workflows()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select coalesce(jsonb_agg(public.anchor_workflow_json_v1(a.id, v_user) order by a.updated_at desc), '[]'::jsonb)
    into v_result
  from public.anchor_applications a
  where a.user_id = v_user;
  return v_result;
end;
$$;

revoke all on function public.get_my_anchor_filing_workflows() from public, anon;
grant execute on function public.get_my_anchor_filing_workflows() to authenticated;

create or replace function public.set_my_anchor_filing_workflow(
  p_application_id uuid,
  p_filing_status text default null,
  p_filing_status_date date default null,
  p_reminder_offsets integer[] default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_status text;
  v_date date;
  v_offsets integer[];
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.anchor_applications
    where id = p_application_id and user_id = v_user
  ) then raise exception 'application unavailable'; end if;

  select coalesce(w.filing_status,'not_filed'), w.filing_status_date, coalesce(w.reminder_offsets,'{}'::integer[])
    into v_status, v_date, v_offsets
  from (select 1) seed
  left join public.anchor_application_workflows w
    on w.application_id = p_application_id and w.user_id = v_user;

  if p_filing_status is not null then
    if p_filing_status not in ('not_filed','ready_to_file','mailed','filed_another_way') then
      raise exception 'invalid filing status';
    end if;
    v_status := p_filing_status;
    v_date := case
      when p_filing_status = 'not_filed' then null
      else coalesce(p_filing_status_date, current_date)
    end;
  elsif p_filing_status_date is not null then
    v_date := p_filing_status_date;
  end if;

  if p_reminder_offsets is not null then
    select coalesce(array_agg(distinct x order by x desc), '{}'::integer[])
      into v_offsets
    from unnest(p_reminder_offsets) x
    where x in (1,7,14);
  end if;

  insert into public.anchor_application_workflows(
    application_id,user_id,filing_status,filing_status_date,reminder_offsets
  ) values (
    p_application_id,v_user,v_status,v_date,v_offsets
  )
  on conflict (application_id,user_id) do update
    set filing_status = excluded.filing_status,
        filing_status_date = excluded.filing_status_date,
        reminder_offsets = excluded.reminder_offsets,
        updated_at = now();

  return public.anchor_workflow_json_v1(p_application_id, v_user);
end;
$$;

revoke all on function public.set_my_anchor_filing_workflow(uuid,text,date,integer[]) from public, anon;
grant execute on function public.set_my_anchor_filing_workflow(uuid,text,date,integer[]) to authenticated;

create or replace function public.acknowledge_my_anchor_deadline_reminder(
  p_application_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.anchor_applications
    where id = p_application_id and user_id = v_user
  ) then raise exception 'application unavailable'; end if;

  insert into public.anchor_application_workflows(
    application_id,user_id,last_reminder_seen_at
  ) values (p_application_id,v_user,now())
  on conflict (application_id,user_id) do update
    set last_reminder_seen_at = now(), updated_at = now();

  return public.anchor_workflow_json_v1(p_application_id, v_user);
end;
$$;

revoke all on function public.acknowledge_my_anchor_deadline_reminder(uuid) from public, anon;
grant execute on function public.acknowledge_my_anchor_deadline_reminder(uuid) to authenticated;