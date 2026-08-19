create or replace function public.intelligence_kick_closing_v7_sanity(p_calibration_set_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_token text;
  v_request_id bigint;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name='watchdog_closing_shadow_token' limit 1;
  if coalesce(v_token,'')='' then raise exception 'closing shadow token unavailable'; end if;
  select net.http_post(
    url := 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/intelligence-closing-v7-sanity-seed',
    headers := jsonb_build_object('content-type','application/json','x-watchdog-shadow-token',v_token),
    body := jsonb_build_object('calibration_set_id',p_calibration_set_id)
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.intelligence_kick_closing_v7_sanity(uuid) from public, anon, authenticated;
comment on function public.intelligence_kick_closing_v7_sanity(uuid) is 'Internal one-shot dispatcher for Closing Review v7 development sanity seeding. Labels are development-only and cannot validate or promote the model.';
