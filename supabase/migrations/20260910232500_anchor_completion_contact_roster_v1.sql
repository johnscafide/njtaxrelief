-- NJW-322: developer-only roster for users who generated an ANCHOR/PAS-1 application.
create or replace function public.get_anchor_completion_contact_roster()
returns table (
  email text,
  first_completed_at timestamptz,
  generated_applications bigint,
  contact_permission text,
  auth_provider text,
  source_category text,
  source_detail text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.account_role='developer'
  ) then
    raise exception 'developer_access_required';
  end if;

  return query
  with completed as (
    select aa.user_id, min(aa.generated_at) as first_completed_at, count(*)::bigint as generated_applications
    from public.anchor_applications aa
    where aa.status='generated'
    group by aa.user_id
  ), latest_feedback as (
    select distinct on (acf.user_id) acf.user_id, acf.source_category, acf.source_detail
    from public.anchor_completion_feedback acf
    order by acf.user_id, acf.updated_at desc
  )
  select l.email, c.first_completed_at, c.generated_applications, l.contact_permission,
         l.first_auth_provider, f.source_category, f.source_detail
  from completed c
  join public.watchdog_user_lifecycle l on l.user_id=c.user_id
  left join latest_feedback f on f.user_id=c.user_id
  order by c.first_completed_at desc;
end;
$$;
revoke all on function public.get_anchor_completion_contact_roster() from public, anon;
grant execute on function public.get_anchor_completion_contact_roster() to authenticated;
