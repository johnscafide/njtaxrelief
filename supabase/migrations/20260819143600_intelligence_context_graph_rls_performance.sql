-- Context Graph performance hardening without changing access semantics.
-- 1) Wrap auth.uid() in a scalar SELECT so Postgres can initialize it once per statement.
-- 2) Add a covering index for the optional intent_state_id foreign key on append-only events.

create index if not exists intelligence_intent_events_intent_state_idx
  on public.intelligence_intent_events (intent_state_id)
  where intent_state_id is not null;

drop policy if exists intent_states_owner_select on public.intelligence_intent_states;
create policy intent_states_owner_select
on public.intelligence_intent_states
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists intent_states_owner_insert on public.intelligence_intent_states;
create policy intent_states_owner_insert
on public.intelligence_intent_states
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists intent_states_owner_update on public.intelligence_intent_states;
create policy intent_states_owner_update
on public.intelligence_intent_states
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists intent_events_owner_select on public.intelligence_intent_events;
create policy intent_events_owner_select
on public.intelligence_intent_events
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists intent_events_owner_insert on public.intelligence_intent_events;
create policy intent_events_owner_insert
on public.intelligence_intent_events
for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- Preserve the append-only contract. Authenticated users must not receive UPDATE or DELETE.
revoke update, delete, truncate on public.intelligence_intent_events from authenticated;

-- Installation assertions: all five owner policies exist and the event FK is indexed.
do $$
declare
  policy_count integer;
  indexed boolean;
begin
  select count(*) into policy_count
  from pg_policies
  where schemaname='public'
    and ((tablename='intelligence_intent_states' and policyname in ('intent_states_owner_select','intent_states_owner_insert','intent_states_owner_update'))
      or (tablename='intelligence_intent_events' and policyname in ('intent_events_owner_select','intent_events_owner_insert')));
  if policy_count <> 5 then
    raise exception 'Context Graph RLS performance migration expected 5 owner policies, found %', policy_count;
  end if;

  select exists (
    select 1 from pg_indexes
    where schemaname='public'
      and tablename='intelligence_intent_events'
      and indexname='intelligence_intent_events_intent_state_idx'
  ) into indexed;
  if not indexed then
    raise exception 'Context Graph intent_state_id covering index was not created';
  end if;
end $$;