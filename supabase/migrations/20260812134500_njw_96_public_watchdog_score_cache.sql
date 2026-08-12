create table if not exists public.public_watchdog_score_cache (
  pams_pin text primary key,
  watchdog_score numeric not null check (watchdog_score between 0 and 100),
  town text,
  county text,
  peer_count integer,
  peer_median numeric,
  assessed_value numeric,
  model_version text not null default 'peer-gap-v1',
  computed_at timestamptz not null default now()
);

alter table public.public_watchdog_score_cache enable row level security;
revoke all on table public.public_watchdog_score_cache from anon, authenticated;

create or replace function public.get_public_watchdog_score_cache(p_pins text[])
returns table(pams_pin text, watchdog_score numeric, model_version text, computed_at timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $$
  select c.pams_pin, c.watchdog_score, c.model_version, c.computed_at
  from public.public_watchdog_score_cache c
  where c.pams_pin = any(p_pins);
$$;

create or replace function public.save_public_watchdog_score_cache(p_rows jsonb)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r jsonb; n integer := 0; v_pin text; v_score numeric; v_peer_count integer; v_peer_median numeric; v_assessed numeric;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 100 then raise exception 'invalid payload'; end if;
  for r in select value from jsonb_array_elements(p_rows)
  loop
    v_pin := left(coalesce(r->>'pams_pin',''),40);
    v_score := nullif(r->>'watchdog_score','')::numeric;
    v_peer_count := nullif(r->>'peer_count','')::integer;
    v_peer_median := nullif(r->>'peer_median','')::numeric;
    v_assessed := nullif(r->>'assessed_value','')::numeric;
    if v_pin ~ '^[0-9A-Za-z_.-]{5,40}$'
       and v_score between 0 and 100
       and coalesce(v_peer_count,0) between 8 and 5000
       and coalesce(v_peer_median,0) between 10000 and 5000000000
       and coalesce(v_assessed,0) between 10000 and 5000000000 then
      insert into public.public_watchdog_score_cache
        (pams_pin,watchdog_score,town,county,peer_count,peer_median,assessed_value,model_version,computed_at)
      values
        (v_pin,round(v_score,0),left(r->>'town',80),left(r->>'county',40),v_peer_count,v_peer_median,v_assessed,'peer-gap-v1',now())
      on conflict (pams_pin) do update set
        watchdog_score=excluded.watchdog_score,town=excluded.town,county=excluded.county,
        peer_count=excluded.peer_count,peer_median=excluded.peer_median,assessed_value=excluded.assessed_value,
        model_version=excluded.model_version,computed_at=excluded.computed_at;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

grant execute on function public.get_public_watchdog_score_cache(text[]) to anon, authenticated;
grant execute on function public.save_public_watchdog_score_cache(jsonb) to anon, authenticated;
