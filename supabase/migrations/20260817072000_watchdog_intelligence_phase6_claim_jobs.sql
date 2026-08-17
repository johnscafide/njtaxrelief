create or replace function public.claim_intelligence_job(p_worker_id text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  select id into v_id from public.intelligence_jobs
  where (
    (status in ('queued','partial') and available_at<=now())
    or (status='running' and locked_at<now()-interval '10 minutes' and retry_count<max_retries)
  )
  order by case when status='running' then 0 else 1 end, available_at, created_at
  for update skip locked limit 1;
  if v_id is null then return null; end if;
  update public.intelligence_jobs
    set status='running', worker_id=p_worker_id, locked_at=now(), started_at=coalesce(started_at,now()), retry_count=case when status='running' then retry_count+1 else retry_count end, updated_at=now()
    where id=v_id;
  return v_id;
end;
$$;
revoke all on function public.claim_intelligence_job(text) from public,anon,authenticated;
grant execute on function public.claim_intelligence_job(text) to service_role;
