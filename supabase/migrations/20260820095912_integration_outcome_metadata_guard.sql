create or replace function public.intelligence_outcome_metadata_guard()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if coalesce(new.metadata->>'outcome_source','')='user_reported' then
    new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
      'outcome_source','user_reported',
      'verification_status','attested',
      'trust_tier',1,
      'authority','contextual',
      'property_fact_authority',false,
      'does_not_mutate_property_facts',true,
      'execution_allowed',false
    );
  end if;
  return new;
end; $$;
revoke execute on function public.intelligence_outcome_metadata_guard() from public,anon,authenticated;
drop trigger if exists intelligence_outcome_metadata_guard_trg on public.intelligence_outcome_events;
create trigger intelligence_outcome_metadata_guard_trg before insert or update on public.intelligence_outcome_events for each row execute function public.intelligence_outcome_metadata_guard();
