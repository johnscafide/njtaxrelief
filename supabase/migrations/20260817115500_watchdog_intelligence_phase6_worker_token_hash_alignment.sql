-- Align database-created one-time worker-token hashes with the worker's canonical JSON SHA-256 helper.
do $$
declare
  ddl text;
begin
  select pg_get_functiondef('public.dispatch_due_intelligence(text,integer)'::regprocedure) into ddl;
  if ddl is null then raise exception 'dispatch_due_intelligence function not found'; end if;
  ddl := replace(
    ddl,
    'worker_token_hash=encode(digest(v_token,''sha256''),''hex'')',
    'worker_token_hash=encode(digest(to_json(v_token)::text,''sha256''),''hex'')'
  );
  if position('digest(to_json(v_token)::text,''sha256'')' in ddl)=0 then
    raise exception 'worker token hash expression was not replaced';
  end if;
  execute ddl;
end $$;
