alter table public.marketing_payments
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists paid_at timestamptz,
  add column if not exists refunded_cents bigint not null default 0;
create index if not exists marketing_payments_processor_idx
  on public.marketing_payments(processor,processor_payment_id)
  where processor_payment_id is not null;
