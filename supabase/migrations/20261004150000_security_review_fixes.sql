-- Security review fixes (2026-10-04).

-- The investor-screen canary dispatcher is meant for service_role only.
-- Revoking from "public" alone left Supabase's direct grants to anon and
-- authenticated in place, so anyone could call it over /rest/v1/rpc.
revoke execute on function public.dispatch_investor_screen_alias_canary() from anon, authenticated;

-- Pin search_path on small helper functions flagged by the Supabase advisor.
-- parcel_search_norm is left alone on purpose: setting search_path on a SQL
-- function stops Postgres from inlining it, which would slow parcel search.
alter function public.watchdog_sales_plan_int(jsonb, text, integer) set search_path = pg_catalog, public;
alter function public.watchdog_sales_catalog_cents(text, text) set search_path = pg_catalog, public;
alter function public.watchdog_sales_touch_updated_at() set search_path = pg_catalog, public;
