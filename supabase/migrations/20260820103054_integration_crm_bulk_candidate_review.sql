create or replace function public.integration_bulk_decide_crm_candidates(
  p_user_id uuid,
  p_link_ids uuid[],
  p_decision text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_decision text:=lower(trim(coalesce(p_decision,'')));
  v_now timestamptz:=now();
  v_requested int:=coalesce(cardinality(p_link_ids),0);
  v_decided int:=0;
  v_ambiguous int:=0;
  v_unavailable int:=0;
  v_decided_ids uuid[]:='{}'::uuid[];
  v_ambiguous_ids uuid[]:='{}'::uuid[];
  v_unavailable_ids uuid[]:='{}'::uuid[];
begin
  if p_user_id is null then raise exception 'user_id is required' using errcode='23514'; end if;
  if v_decision not in ('verify','reject') then raise exception 'decision must be verify or reject' using errcode='23514'; end if;
  if v_requested<1 or v_requested>100 then raise exception 'Select between 1 and 100 candidates' using errcode='23514'; end if;
  if p_note is not null and length(p_note)>300 then raise exception 'Review note is limited to 300 characters' using errcode='23514'; end if;

  select coalesce(array_agg(r.id order by r.id),'{}'::uuid[])
    into v_unavailable_ids
  from (select distinct unnest(p_link_ids) id) r
  left join public.integration_crm_property_links l on l.id=r.id and l.user_id=p_user_id and l.status='candidate'
  where l.id is null;
  v_unavailable:=coalesce(cardinality(v_unavailable_ids),0);

  if v_decision='verify' then
    select coalesce(array_agg(l.id order by l.id),'{}'::uuid[])
      into v_ambiguous_ids
    from public.integration_crm_property_links l
    where l.user_id=p_user_id and l.status='candidate' and l.id=any(p_link_ids) and l.candidate_count>1;
    v_ambiguous:=coalesce(cardinality(v_ambiguous_ids),0);
  end if;

  with updated as (
    update public.integration_crm_property_links l
       set status=case when v_decision='verify' then 'verified' else 'rejected' end,
           link_method=case when v_decision='verify' then 'verified_address' else l.link_method end,
           confidence=case when v_decision='verify' then 1 else l.confidence end,
           reviewed_by_user_id=p_user_id,
           reviewed_at=v_now,
           review_note=nullif(trim(p_note),''),
           verified_at=case when v_decision='verify' then v_now else l.verified_at end,
           evidence=coalesce(l.evidence,'{}'::jsonb)||jsonb_build_object(
             'user_reviewed',true,
             'user_decision',case when v_decision='verify' then 'verified' else 'rejected' end,
             'user_reviewed_at',v_now,
             'reviewer_user_id',p_user_id,
             'review_mode','bulk',
             'match_tier',case when v_decision='verify' then 'human_verified_gold' else 'human_rejected_gold' end,
             'reviewed_match_policy',coalesce(l.evidence->>'match_policy',l.link_method)
           ),
           updated_at=v_now
     where l.user_id=p_user_id
       and l.status='candidate'
       and l.id=any(p_link_ids)
       and (v_decision='reject' or l.candidate_count<=1)
     returning l.id,l.connection_id,l.crm_context_id,l.pams_pin,l.link_method,l.evidence,l.status
  )
  select count(*)::int,coalesce(array_agg(id order by id),'{}'::uuid[])
    into v_decided,v_decided_ids
  from updated;

  update public.integration_crm_resolution_state s
     set detail_status='enriched',candidate_count=0,updated_at=v_now
   where s.user_id=p_user_id
     and s.crm_context_id in (
       select distinct l.crm_context_id
       from public.integration_crm_property_links l
       where l.user_id=p_user_id and l.id=any(v_decided_ids)
     )
     and not exists (
       select 1 from public.integration_crm_property_links pending
       where pending.user_id=p_user_id and pending.crm_context_id=s.crm_context_id and pending.status='candidate'
     );

  insert into public.integration_audit_log(user_id,connection_id,action,actor,details)
  select p_user_id,l.connection_id,
         case when v_decision='verify' then 'crm.property_link.bulk_verified' else 'crm.property_link.bulk_rejected' end,
         'user',
         jsonb_build_object(
           'link_id',l.id,'crm_context_id',l.crm_context_id,'pams_pin',l.pams_pin,
           'method',case when v_decision='verify' then 'verified_address' else l.link_method end,
           'match_policy',l.evidence->>'match_policy',
           'match_tier',case when v_decision='verify' then 'human_verified_gold' else 'human_rejected_gold' end,
           'review_mode','bulk','name_match_used',false,'ownership_inferred',false
         )
  from public.integration_crm_property_links l
  where l.user_id=p_user_id and l.id=any(v_decided_ids);

  return jsonb_build_object(
    'ok',true,
    'decision',v_decision,
    'requested',v_requested,
    'decided',v_decided,
    'decided_ids',to_jsonb(v_decided_ids),
    'ambiguous_skipped',v_ambiguous,
    'ambiguous_ids',to_jsonb(v_ambiguous_ids),
    'unavailable_skipped',v_unavailable,
    'unavailable_ids',to_jsonb(v_unavailable_ids),
    'ownership_inferred',false,
    'name_match_used',false
  );
end;
$$;

revoke execute on function public.integration_bulk_decide_crm_candidates(uuid,uuid[],text,text) from public,anon,authenticated;
grant execute on function public.integration_bulk_decide_crm_candidates(uuid,uuid[],text,text) to service_role;
