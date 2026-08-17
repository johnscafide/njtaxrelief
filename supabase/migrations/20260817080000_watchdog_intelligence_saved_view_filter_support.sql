-- Watchdog Intelligence: reproduce durable Data Workbench saved-view filters in staging/production-compatible schema.
-- Production already has these columns; IF NOT EXISTS keeps this migration safe there while bringing the Intelligence staging fixture up to parity.

alter table public.saved_properties
  add column if not exists county text,
  add column if not exists zip text,
  add column if not exists assessed bigint,
  add column if not exists last_year_tax numeric,
  add column if not exists effective_rate numeric,
  add column if not exists watchdog_value bigint,
  add column if not exists has_appeal_case boolean default false,
  add column if not exists lat numeric,
  add column if not exists lon numeric,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists saved_properties_user_pin_intelligence_idx
  on public.saved_properties(user_id, pams_pin);
