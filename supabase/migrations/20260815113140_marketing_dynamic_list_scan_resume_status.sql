create or replace function public.marketing_dynamic_list_scan_status(p_list_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  uid uuid := auth.uid();
  l public.agent_dynamic_lists%rowtype;
  r public.agent_dynamic_list_materialization_runs%rowtype;
  snapshot jsonb;
begin
  if uid is null or not public.can_use_data_workbench(uid) then
    raise exception 'Marketing Studio requires Agent or higher';
  end if;
  select * into l from public.agent_dynamic_lists where id=p_list_id and user_id=uid;
  if l.id is null then raise exception 'Saved farm not found'; end if;
  snapshot := jsonb_build_object('scope_type',l.scope_type,'scope_value',l.scope_value,'criteria',coalesce(l.criteria,'{}'::jsonb));
  select * into r
  from public.agent_dynamic_list_materialization_runs
  where dynamic_list_id=l.id and user_id=uid and status='scanning' and definition_snapshot=snapshot
  order by updated_at desc
  limit 1;
  if r.id is null then
    return jsonb_build_object('active',false);
  end if;
  return jsonb_build_object(
    'active',true,
    'run_id',r.id,
    'generation',r.generation,
    'candidate_count',r.candidate_count,
    'scanned_count',r.scanned_count,
    'matched_count',r.matched_count,
    'updated_at',r.updated_at
  );
end
$function$;
revoke all on function public.marketing_dynamic_list_scan_status(uuid) from public, anon;
grant execute on function public.marketing_dynamic_list_scan_status(uuid) to authenticated;
