alter table public.intelligence_jobs add column if not exists worker_token_hash text;
alter table public.intelligence_jobs add column if not exists worker_token_expires_at timestamptz;

create or replace function public.dispatch_due_intelligence(p_worker_url text, p_max_dispatch integer default 5)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  s record;
  m text;
  v_model record;
  v_limit record;
  v_pins text[];
  v_idempotency text;
  v_job uuid;
  v_token text;
  v_request bigint;
  v_dispatched integer := 0;
  v_enqueued integer := 0;
begin
  if p_worker_url is null or p_worker_url !~ '^https://[a-zA-Z0-9.-]+/functions/v1/intelligence-job-worker$' then
    raise exception 'A valid Supabase Intelligence worker URL is required';
  end if;

  for s in
    select sc.* from public.intelligence_scopes sc
    where sc.is_active and sc.is_scheduled and sc.next_run_at is not null and sc.next_run_at <= now()
    order by sc.next_run_at
    limit 50
  loop
    select l.* into v_limit
    from public.account_entitlements e
    join public.intelligence_plan_limits l on l.plan_tier=e.plan_tier
    where e.user_id=s.user_id;
    if not found then continue; end if;

    if s.scope_type='farm' then
      select coalesce(array_agg(x.pams_pin order by x.pams_pin),'{}'::text[]) into v_pins
      from (select distinct pams_pin from public.agent_farm_properties where user_id=s.user_id and relationship='farm' and pams_pin is not null limit v_limit.max_scope_properties) x;
    elsif s.scope_type='municipality' then
      select coalesce(array_agg(x.pams_pin order by x.pams_pin),'{}'::text[]) into v_pins
      from (select pams_pin from public.property_lookups where town=coalesce(s.scope_value->>'value',s.scope_value->>'town') order by pams_pin limit v_limit.max_scope_properties) x;
    elsif s.scope_type='county' then
      select coalesce(array_agg(x.pams_pin order by x.pams_pin),'{}'::text[]) into v_pins
      from (select pams_pin from public.property_lookups where county=coalesce(s.scope_value->>'value',s.scope_value->>'county') order by pams_pin limit v_limit.max_scope_properties) x;
    else
      v_pins := s.resolved_pams_pins;
    end if;
    if coalesce(array_length(v_pins,1),0)=0 then continue; end if;

    foreach m in array s.model_keys loop
      if m not in ('assessment_anomaly','property_change_priority') then continue; end if;
      select model_key,version into v_model from public.intelligence_models where model_key=m;
      if not found then continue; end if;
      v_idempotency := encode(digest(s.user_id::text||':'||s.id::text||':'||m||':'||coalesce(s.next_run_at::date::text,current_date::text),'sha256'),'hex');
      insert into public.intelligence_jobs(user_id,organization_id,scope_id,model_key,model_version,scope_type,scope_value,scope_fingerprint,pams_pins,idempotency_key,trigger_type,status,candidate_count,batch_size)
      values(s.user_id,s.organization_id,s.id,m,v_model.version,s.scope_type,s.scope_value,coalesce(s.scope_fingerprint,encode(digest(array_to_string(v_pins,','),'sha256'),'hex')),v_pins,v_idempotency,'scheduled','queued',array_length(v_pins,1),least(500,greatest(100,coalesce(v_limit.max_scope_properties,250)/20)))
      on conflict(user_id,idempotency_key) do nothing
      returning id into v_job;
      if v_job is not null then
        v_enqueued := v_enqueued + 1;
        insert into public.intelligence_job_events(job_id,user_id,event_type,message,payload) values(v_job,s.user_id,'scheduled','Scheduled population Intelligence job queued.',jsonb_build_object('scope_id',s.id,'model_key',m));
      end if;
      v_job := null;
    end loop;
  end loop;

  for v_job in
    select id from public.intelligence_jobs
    where status in ('queued','partial') and available_at<=now() and (worker_token_expires_at is null or worker_token_expires_at<now())
    order by available_at,created_at
    limit greatest(1,least(p_max_dispatch,25))
  loop
    v_token := encode(gen_random_bytes(32),'hex');
    update public.intelligence_jobs set worker_token_hash=encode(digest(v_token,'sha256'),'hex'),worker_token_expires_at=now()+interval '5 minutes',updated_at=now() where id=v_job;
    select net.http_post(url:=p_worker_url,headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('job_id',v_job,'worker_token',v_token),timeout_milliseconds:=55000) into v_request;
    insert into public.intelligence_job_events(job_id,user_id,event_type,message,payload)
      select v_job,user_id,'dispatch_requested','Server-side worker dispatch requested.',jsonb_build_object('request_id',v_request) from public.intelligence_jobs where id=v_job;
    v_dispatched := v_dispatched + 1;
  end loop;
  return jsonb_build_object('enqueued',v_enqueued,'dispatched',v_dispatched,'checked_at',now());
end;
$$;
revoke all on function public.dispatch_due_intelligence(text,integer) from public,anon,authenticated;
grant execute on function public.dispatch_due_intelligence(text,integer) to service_role,postgres;
