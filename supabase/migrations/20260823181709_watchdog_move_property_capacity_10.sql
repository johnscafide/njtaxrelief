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
    case when exists(select 1 from current_grant) then 10 else 0 end;
$$;

revoke all on function public.watchdog_move_current_access(uuid) from public, anon, authenticated;
grant execute on function public.watchdog_move_current_access(uuid) to service_role;
