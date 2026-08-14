alter table public.marketing_provider_jobs
  add column if not exists quote_id uuid references public.marketing_price_quotes(id) on delete restrict,
  add column if not exists payment_id uuid references public.marketing_payments(id) on delete restrict;

create index if not exists marketing_jobs_quote_idx on public.marketing_provider_jobs(quote_id) where quote_id is not null;
create index if not exists marketing_jobs_payment_idx on public.marketing_provider_jobs(payment_id) where payment_id is not null;

create or replace function public.enforce_marketing_provider_funding() returns trigger
language plpgsql security definer set search_path=public as $$
declare q public.marketing_price_quotes%rowtype; p public.marketing_payments%rowtype;
begin
  if new.requires_funding and new.status in ('submitting','submitted','processing','live','mailed','completed') then
    if new.quote_id is null or new.payment_id is null then
      raise exception 'Provider spend requires linked quote and captured payment';
    end if;
    select * into q from public.marketing_price_quotes
      where id=new.quote_id and campaign_id=new.campaign_id and user_id=new.user_id;
    if q.id is null then raise exception 'Provider spend quote does not match campaign'; end if;
    select * into p from public.marketing_payments
      where id=new.payment_id and quote_id=new.quote_id and campaign_id=new.campaign_id and user_id=new.user_id and status='paid';
    if p.id is null then raise exception 'Provider spend is blocked until linked campaign funding is captured'; end if;
    if coalesce(p.refunded_cents,0)>0 then raise exception 'Provider spend is blocked while linked payment has refunds'; end if;
    if p.amount_cents<q.retail_cents then raise exception 'Captured payment is below the linked campaign quote'; end if;
  end if;
  return new;
end $$;

revoke all on function public.enforce_marketing_provider_funding() from public,anon,authenticated;
