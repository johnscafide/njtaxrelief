drop function if exists public.record_anchor_calculator_use();
drop function if exists public.anchor_calculator_weekly_count();
revoke all on table public.anchor_calculator_uses from public, anon, authenticated;
grant all on table public.anchor_calculator_uses to service_role;
