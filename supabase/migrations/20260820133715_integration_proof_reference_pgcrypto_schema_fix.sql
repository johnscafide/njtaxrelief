-- Keep SECURITY DEFINER search paths narrow and qualify pgcrypto explicitly.

create or replace function public.integration_create_automation_proof_reference(p_proof_id uuid,p_disclosure_scope text default 'external_minimal')
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare
  v_user uuid:=auth.uid(); v_proof public.integration_automation_proofs%rowtype; v_ref public.integration_automation_proof_references%rowtype;
  v_scope text:=coalesce(nullif(trim(p_disclosure_scope),''),'external_minimal'); v_digest text; v_approval_status text; v_safe jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Automation proofs require Pro+ or Teams' using errcode='42501'; end if;
  if v_scope not in ('external_minimal','watchdog_internal') then raise exception 'Invalid proof disclosure scope' using errcode='23514'; end if;
  select * into v_proof from public.integration_automation_proofs where id=p_proof_id and user_id=v_user;
  if not found then raise exception 'Proof not found' using errcode='P0002'; end if;
  v_digest:=encode(extensions.digest(convert_to(v_proof.envelope::text,'UTF8'),'sha256'),'hex');
  insert into public.integration_automation_proof_references(user_id,proof_id,proof_reference,proof_digest,disclosure_scope)
  values(v_user,v_proof.id,'wdp_'||replace(gen_random_uuid()::text,'-',''),v_digest,v_scope)
  on conflict(user_id,proof_id,disclosure_scope) do nothing;
  select * into v_ref from public.integration_automation_proof_references where user_id=v_user and proof_id=v_proof.id and disclosure_scope=v_scope;
  select a.status into v_approval_status from public.integration_automation_approvals a where a.user_id=v_user and a.proof_id=v_proof.id order by a.requested_at desc limit 1;
  if v_scope='external_minimal' then
    v_safe:=jsonb_strip_nulls(jsonb_build_object(
      'schema_version','watchdog-proof-ref/v1','proof_reference',v_ref.proof_reference,'proof_digest',v_ref.proof_digest,
      'property',jsonb_build_object('pams_pin',v_proof.envelope#>>'{property,pams_pin}'),
      'event',jsonb_build_object('type',v_proof.envelope#>>'{event,type}','occurred_at',v_proof.envelope#>>'{event,occurred_at}'),
      'intelligence',jsonb_build_object('opportunity_type',v_proof.envelope#>>'{intelligence,opportunity_type}','score',v_proof.envelope#>>'{intelligence,score}','confidence',v_proof.envelope#>>'{intelligence,confidence}','evidence_coverage',v_proof.envelope#>>'{intelligence,evidence_coverage}','model_key',v_proof.envelope#>>'{intelligence,model_key}','model_version',v_proof.envelope#>>'{intelligence,model_version}'),
      'evidence',jsonb_build_object('count',v_proof.envelope#>>'{evidence,count}','governed_available_ratio',v_proof.envelope#>>'{evidence,governed_available_ratio}','newest_observed_at',v_proof.envelope#>>'{evidence,newest_observed_at}'),
      'policy',jsonb_build_object('policy_group_id',v_proof.envelope#>>'{policy,policy_group_id}','version',v_proof.envelope#>>'{policy,version}','result',v_proof.envelope#>>'{policy,result}','reasons',v_proof.envelope#>'{policy,reasons}','required_approval',v_proof.envelope#>>'{policy,required_approval}'),
      'relationship',jsonb_build_object('status',v_proof.envelope#>>'{relationship,status}','link_method',v_proof.envelope#>>'{relationship,link_method}','verified_at',v_proof.envelope#>>'{relationship,verified_at}'),
      'approval_status',v_approval_status,'execution_allowed',false));
  else
    v_safe:=jsonb_build_object('schema_version','watchdog-proof-ref/v1','proof_reference',v_ref.proof_reference,'proof_digest',v_ref.proof_digest,'proof_id',v_proof.id,'envelope',v_proof.envelope,'approval_status',v_approval_status,'execution_allowed',false);
  end if;
  insert into public.integration_audit_log(user_id,connection_id,action,actor,details) values(v_user,null,'automation.proof_reference.created','user',jsonb_build_object('proof_id',v_proof.id,'proof_reference',v_ref.proof_reference,'disclosure_scope',v_scope,'proof_digest',v_ref.proof_digest));
  return v_safe;
end; $$;

create or replace function public.integration_reconstruct_automation_proof(p_proof_reference text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare
  v_user uuid:=auth.uid(); v_ref public.integration_automation_proof_references%rowtype; v_proof public.integration_automation_proofs%rowtype; v_current_digest text; v_approvals jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Automation proof reconstruction requires Pro+ or Teams' using errcode='42501'; end if;
  select * into v_ref from public.integration_automation_proof_references where user_id=v_user and proof_reference=left(trim(coalesce(p_proof_reference,'')),80);
  if not found then raise exception 'Proof reference not found' using errcode='P0002'; end if;
  select * into v_proof from public.integration_automation_proofs where id=v_ref.proof_id and user_id=v_user;
  if not found then raise exception 'Proof not found' using errcode='P0002'; end if;
  v_current_digest:=encode(extensions.digest(convert_to(v_proof.envelope::text,'UTF8'),'sha256'),'hex');
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',a.id,'status',a.status,'requested_at',a.requested_at,'expires_at',a.expires_at,'decided_at',a.decided_at,'decision_note',a.decision_note,'execution_allowed',a.execution_allowed)) order by a.requested_at),'[]'::jsonb)
  into v_approvals from public.integration_automation_approvals a where a.user_id=v_user and a.proof_id=v_proof.id;
  return jsonb_build_object('schema_version','watchdog-proof-reconstruction/v1','proof_reference',v_ref.proof_reference,'proof_id',v_proof.id,'proof_digest',v_ref.proof_digest,'digest_valid',v_ref.proof_digest=v_current_digest,'disclosure_scope',v_ref.disclosure_scope,'envelope',v_proof.envelope,'approvals',v_approvals,'execution_allowed',false);
end; $$;

revoke execute on function public.integration_create_automation_proof_reference(uuid,text) from public,anon;
revoke execute on function public.integration_reconstruct_automation_proof(text) from public,anon;
grant execute on function public.integration_create_automation_proof_reference(uuid,text) to authenticated;
grant execute on function public.integration_reconstruct_automation_proof(text) to authenticated;
