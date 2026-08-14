alter table public.marketing_provider_jobs
  add column if not exists requires_funding boolean not null default true;

create or replace function public.enforce_marketing_provider_funding() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.requires_funding and new.status in ('submitting','submitted','processing','live','mailed','completed') then
    if not exists(
      select 1 from public.marketing_payments p
      where p.campaign_id=new.campaign_id
        and p.user_id=new.user_id
        and p.status='paid'
        and coalesce(p.refunded_cents,0)<p.amount_cents
    ) then
      raise exception 'Provider spend is blocked until campaign funding is captured';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_marketing_provider_funding on public.marketing_provider_jobs;
create trigger trg_marketing_provider_funding
before insert or update of status,requires_funding,campaign_id,user_id on public.marketing_provider_jobs
for each row execute function public.enforce_marketing_provider_funding();
revoke all on function public.enforce_marketing_provider_funding() from public,anon,authenticated;
