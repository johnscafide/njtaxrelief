create or replace function public.integration_get_secret(p_secret_id uuid)
returns text
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select decrypted_secret from vault.decrypted_secrets where id = p_secret_id limit 1;
$$;
revoke all on function public.integration_get_secret(uuid) from public, anon, authenticated;
grant execute on function public.integration_get_secret(uuid) to service_role;
