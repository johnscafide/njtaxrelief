-- Block new external spend, but do not block reconciliation of provider work that was already submitted.
create or replace function public.enforce_marketing_provider_funding() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  q public.marketing_price_quotes%rowtype;
  p public.marketing_payments%rowtype;
  c public.marketing_campaigns%rowtype;
  spend_transition boolean:=false;
begin
  select * into c from public.marketing_campaigns where id=new.campaign_id and user_id=new.user_id;
  if c.id is null then raise exception 'Provider job campaign does not exist'; end if;

  spend_transition :=
    (new.status='submitting' and (tg_op='INSERT' or old.status is distinct from 'submitting'))
    or (new.status='submitted' and (tg_op='INSERT' or old.status not in ('submitting','submitted')));

  if spend_transition then
    if c.kill_switch or c.automation_state in ('paused','stopped') then
      raise exception 'Provider spend is blocked by campaign automation controls';
    end if;
    if new.requires_funding then
      if new.quote_id is null or new.payment_id is null then raise exception 'Provider spend requires linked quote and captured payment'; end if;
      select * into q from public.marketing_price_quotes where id=new.quote_id and campaign_id=new.campaign_id and user_id=new.user_id;
      if q.id is null then raise exception 'Provider spend quote does not match campaign'; end if;
      select * into p from public.marketing_payments where id=new.payment_id and quote_id=new.quote_id and campaign_id=new.campaign_id and user_id=new.user_id and status='paid';
      if p.id is null then raise exception 'Provider spend is blocked until linked campaign funding is captured'; end if;
      if coalesce(p.refunded_cents,0)>0 then raise exception 'Provider spend is blocked while linked payment has refunds'; end if;
      if p.amount_cents<q.retail_cents then raise exception 'Captured payment is below the linked campaign quote'; end if;
      if c.spend_cap_cents is not null and p.amount_cents>c.spend_cap_cents then raise exception 'Provider spend exceeds the campaign hard cap'; end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.enforce_marketing_provider_funding() from public,anon,authenticated;
