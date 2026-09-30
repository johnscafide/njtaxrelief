-- Property Home "Town CO & fire certificate" card.
-- transaction_municipal_requirements stays service-only. This function returns only the
-- person-checked rows (curated_override with metadata.checked) for one town, and only to a
-- signed-in Pro+ account, the same plan the Transactions page requires for this data.
create or replace function public.watchdog_town_certificates(p_municipality_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not public.has_watchdog_plan('pro_plus') then
    return jsonb_build_object('status', 'locked');
  end if;
  if coalesce(p_municipality_code, '') !~ '^\d{4}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  return coalesce((
    select jsonb_build_object(
      'status', 'ok',
      'municipality_code', p_municipality_code,
      'municipality_name', max(r.municipality_name),
      'rows', jsonb_agg(jsonb_build_object(
        'requirement_key', r.requirement_key,
        'requirement_state', r.requirement_state,
        'title', r.title,
        'requirements', r.requirements,
        'fees', r.fees,
        'application_url', r.application_url,
        'department_url', r.department_url,
        'source_urls', r.source_urls,
        'last_verified_at', r.last_verified_at,
        'needs_lookup', coalesce((r.metadata -> 'checked' ->> 'needs_lookup')::boolean, false)
      ) order by r.requirement_key))
    from public.transaction_municipal_requirements r
    where r.municipality_code = p_municipality_code
      and r.curated_override
      and r.metadata ? 'checked'
    having count(*) > 0
  ), jsonb_build_object('status', 'not_checked', 'municipality_code', p_municipality_code));
end;
$function$;

revoke all on function public.watchdog_town_certificates(text) from public, anon;
grant execute on function public.watchdog_town_certificates(text) to authenticated;

comment on function public.watchdog_town_certificates(text) is
  'Person-checked town resale certificate and smoke/CO alarm certificate rules for one municipality code. Pro+ only.';
