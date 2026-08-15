create or replace function public.record_municipal_quota_rows(
  p_user_id uuid,
  p_endpoint text,
  p_rows integer,
  p_delivery_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket timestamptz := date_trunc('hour', now()) + floor(extract(minute from now()) / 5) * interval '5 minutes';
begin
  if p_user_id is null or p_endpoint !~ '^[a-z0-9_-]{2,40}$' then
    raise exception 'invalid quota row update';
  end if;

  update public.municipal_data_requests
  set rows_served = rows_served + greatest(coalesce(p_rows, 0), 0),
      last_delivery_id = coalesce(p_delivery_id, last_delivery_id),
      last_requested_at = now()
  where user_id = p_user_id
    and endpoint = p_endpoint
    and bucket_start = v_bucket;
end;
$$;

revoke all on function public.record_municipal_quota_rows(uuid,text,integer,uuid) from public, anon, authenticated;
grant execute on function public.record_municipal_quota_rows(uuid,text,integer,uuid) to service_role;
