alter table public.profiles
  add column if not exists vanity_slug text,
  add column if not exists vanity_slug_reserved_at timestamptz,
  add column if not exists vanity_slug_release_after timestamptz;

alter table public.profiles
  drop constraint if exists profiles_vanity_slug_format;

alter table public.profiles
  add constraint profiles_vanity_slug_format check (
    vanity_slug is null or (
      vanity_slug = lower(vanity_slug)
      and vanity_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$'
      and vanity_slug not in (
        'admin','api','app','auth','billing','dashboard','developer','help','login','logout','pricing','property','signup','support','watchdog','www',
        'fuck','shit','bitch','cunt','dick','pussy','asshole'
      )
    )
  );

create unique index if not exists profiles_vanity_slug_unique
  on public.profiles (lower(vanity_slug))
  where vanity_slug is not null;

create or replace function public.guard_agent_vanity_slug()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  eligible boolean;
begin
  eligible := coalesce(new.account_role = 'developer', false)
    or new.plan_tier in ('agent','pro','pro_plus','teams');

  if new.vanity_slug is distinct from old.vanity_slug then
    if new.vanity_slug is not null then
      new.vanity_slug := lower(trim(new.vanity_slug));
      if not eligible then
        raise exception 'Agent vanity slugs require an Agent-or-higher plan';
      end if;
      new.vanity_slug_reserved_at := now();
      new.vanity_slug_release_after := null;
    else
      new.vanity_slug_reserved_at := null;
      new.vanity_slug_release_after := null;
    end if;
  end if;

  if old.vanity_slug is not null
     and old.plan_tier in ('agent','pro','pro_plus','teams')
     and new.plan_tier not in ('agent','pro','pro_plus','teams')
     and coalesce(new.account_role,'user') <> 'developer' then
    new.vanity_slug_release_after := coalesce(old.vanity_slug_release_after, now() + interval '30 days');
  end if;

  if new.vanity_slug is not null and eligible then
    new.vanity_slug_release_after := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_agent_vanity_slug on public.profiles;
create trigger trg_guard_agent_vanity_slug
before update of vanity_slug, plan_tier, account_role on public.profiles
for each row execute function public.guard_agent_vanity_slug();

create or replace function public.release_expired_agent_vanity_slugs()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  released integer;
begin
  update public.profiles
     set vanity_slug = null,
         vanity_slug_reserved_at = null,
         vanity_slug_release_after = null
   where vanity_slug is not null
     and vanity_slug_release_after is not null
     and vanity_slug_release_after <= now()
     and plan_tier not in ('agent','pro','pro_plus','teams')
     and account_role <> 'developer';
  get diagnostics released = row_count;
  return released;
end;
$$;

revoke execute on function public.release_expired_agent_vanity_slugs() from public, anon, authenticated;
grant execute on function public.release_expired_agent_vanity_slugs() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'release-expired-agent-vanity-slugs';
    perform cron.schedule(
      'release-expired-agent-vanity-slugs',
      '17 3 * * *',
      'select public.release_expired_agent_vanity_slugs();'
    );
  end if;
end $$;
