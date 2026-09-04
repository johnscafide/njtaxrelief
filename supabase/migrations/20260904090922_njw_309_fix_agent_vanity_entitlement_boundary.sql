-- NJW-309: keep the server-owned entitlement table private while allowing
-- eligible customers to reserve an Agent portal vanity slug through profiles RLS.
-- The browser-facing authorization decision is delegated to has_watchdog_plan(),
-- which is the existing SECURITY DEFINER entitlement boundary.

create or replace function public.guard_agent_vanity_slug()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  eligible boolean := false;
begin
  eligible := coalesce(new.account_role = 'developer', false);

  if not eligible and auth.uid() = new.id then
    eligible := public.has_watchdog_plan('agent');
  end if;

  if new.vanity_slug is distinct from old.vanity_slug then
    if new.vanity_slug is not null then
      new.vanity_slug := lower(trim(new.vanity_slug));
      if not eligible then
        raise exception 'Agent vanity slugs require an Agent-or-higher entitlement';
      end if;
      new.vanity_slug_reserved_at := now();
      new.vanity_slug_release_after := null;
    else
      new.vanity_slug_reserved_at := null;
      new.vanity_slug_release_after := null;
    end if;
  end if;

  return new;
end;
$$;
