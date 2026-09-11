begin;

alter table public.account_entitlements
  drop constraint if exists account_entitlements_billing_interval_check;

alter table public.account_entitlements
  add constraint account_entitlements_billing_interval_check
  check (billing_interval is null or billing_interval = any (array['monthly'::text,'yearly'::text,'lifetime'::text]));

create table if not exists public.billing_lifetime_purchases (
  checkout_session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_intent_id text unique,
  stripe_customer_id text,
  tier text not null check (tier = any (array['agent'::text,'pro'::text,'pro_plus'::text])),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  status text not null default 'paid' check (status = any (array['paid'::text,'partially_refunded'::text,'refunded'::text])),
  purchased_at timestamptz not null default now(),
  refunded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_lifetime_purchases_user_idx
  on public.billing_lifetime_purchases(user_id, purchased_at desc);
create index if not exists billing_lifetime_purchases_customer_idx
  on public.billing_lifetime_purchases(stripe_customer_id);

alter table public.billing_lifetime_purchases enable row level security;
revoke all on table public.billing_lifetime_purchases from anon, authenticated;
grant all on table public.billing_lifetime_purchases to service_role;

create or replace function public.watchdog_reconcile_lifetime_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pi text;
  v_purchase public.billing_lifetime_purchases%rowtype;
  v_full boolean;
  v_refunded integer;
begin
  if new.event_type <> 'billing.subscription_refund_observed' then
    return new;
  end if;

  v_pi := nullif(new.metadata->>'payment_intent_id','');
  if v_pi is null then return new; end if;

  select * into v_purchase
  from public.billing_lifetime_purchases
  where payment_intent_id = v_pi
  limit 1;

  if not found then return new; end if;

  v_full := coalesce((new.metadata->>'fully_refunded')::boolean, false);
  v_refunded := coalesce((new.metadata->>'amount_refunded')::integer, 0);

  update public.billing_lifetime_purchases
     set status = case when v_full then 'refunded' else 'partially_refunded' end,
         refunded_at = case when v_full then now() else refunded_at end,
         metadata = metadata || jsonb_build_object(
           'latest_refund_charge_id', new.metadata->>'charge_id',
           'latest_refunded_cents', v_refunded,
           'fully_refunded', v_full
         ),
         updated_at = now()
   where checkout_session_id = v_purchase.checkout_session_id;

  if v_full then
    update public.account_entitlements
       set plan_tier = 'standard',
           billing_tier = null,
           billing_interval = null,
           property_capacity = null,
           subscription_status = 'none',
           provider_subscription_id = null,
           provider_price_id = null,
           current_period_end = null,
           cancel_at_period_end = false,
           provider_event_at = now(),
           source = 'stripe-lifetime-refund',
           updated_at = now()
     where user_id = v_purchase.user_id
       and source = 'stripe-lifetime'
       and provider_price_id = 'lifetime:' || v_purchase.checkout_session_id;
  end if;

  return new;
end;
$$;

revoke all on function public.watchdog_reconcile_lifetime_refund() from public, anon, authenticated;

drop trigger if exists trg_watchdog_reconcile_lifetime_refund on public.access_audit_log;
create trigger trg_watchdog_reconcile_lifetime_refund
after insert on public.access_audit_log
for each row
when (new.event_type = 'billing.subscription_refund_observed')
execute function public.watchdog_reconcile_lifetime_refund();

commit;
