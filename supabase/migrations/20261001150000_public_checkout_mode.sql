-- Public read of the paid checkout mode, used by /agents/trial and /pro to
-- decide whether to show "Start your free trial" or the invite request.
--
-- Returns only 'open', 'controlled' or 'closed' and nothing else from the gate.
-- It mirrors the release control in create-checkout-session: the
-- live_billing_lifecycle evidence checkout_mode (or public_checkout), and
-- 'open' only while that gate has passed. The checkout function stays the
-- authority (it also honors the BILLING_CHECKOUT_MODE environment override,
-- which this read cannot see), so a page that gets a rejection still falls
-- back to the invite request.
create or replace function public.get_public_checkout_mode()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when lower(coalesce(g.evidence->>'checkout_mode', g.evidence->>'public_checkout', '')) = 'open'
        and g.status = 'passed' then 'open'
      when lower(coalesce(g.evidence->>'checkout_mode', g.evidence->>'public_checkout', '')) = 'controlled' then 'controlled'
      else 'closed'
    end
    from public.platform_release_gates g
    where g.gate_key = 'live_billing_lifecycle'
  ), 'closed');
$$;

revoke all on function public.get_public_checkout_mode() from public;
grant execute on function public.get_public_checkout_mode() to anon, authenticated;

comment on function public.get_public_checkout_mode() is
  'Public read: open, controlled or closed for paid checkout. Display only; create-checkout-session is the authority.';
