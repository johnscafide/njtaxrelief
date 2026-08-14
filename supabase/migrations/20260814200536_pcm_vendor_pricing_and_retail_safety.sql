-- NJW-157: PCM vendor pricing received 2026-08-14.
-- Keep provider cost separate from Watchdog retail pricing and disable stale retail rates that are below cost.
create table if not exists public.marketing_provider_cost_catalog (
  id uuid primary key default gen_random_uuid(), provider_key text not null, product_type text not null,
  size_label text not null, mail_class text not null, base_cost_micros bigint not null check(base_cost_micros>0),
  currency text not null default 'USD', source text not null, effective_from timestamptz not null default now(),
  active boolean not null default true, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(provider_key,product_type,size_label,mail_class,effective_from)
);
alter table public.marketing_provider_cost_catalog enable row level security;
revoke all on public.marketing_provider_cost_catalog from anon,authenticated;
grant all on public.marketing_provider_cost_catalog to service_role;

update public.marketing_rate_cards set active=false,
 metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('disabled_reason','PCM vendor pricing exceeds placeholder retail price; retail rates require reconfiguration'),updated_at=now()
where provider_key='pcm' and channel='direct_mail' and active=true;

update public.marketing_provider_cost_catalog set active=false,updated_at=now() where provider_key='pcm' and active=true;
insert into public.marketing_provider_cost_catalog(provider_key,product_type,size_label,mail_class,base_cost_micros,source,metadata) values
('pcm','postcard','4 x 6','FirstClass',969000,'PCM account pricing 2026-08-14','{"price_type":"from"}'),
('pcm','postcard','4.25 x 6','FirstClass',969000,'PCM account pricing 2026-08-14','{"price_type":"from"}'),
('pcm','postcard','5 x 7','FirstClass',1005000,'PCM account pricing 2026-08-14','{"price_type":"from"}'),
('pcm','postcard','5.5 x 8.5','FirstClass',1077000,'PCM account pricing 2026-08-14','{"price_type":"from"}'),
('pcm','postcard','5.5 x 8.5','Standard',1028000,'PCM account pricing 2026-08-14','{"price_type":"from"}'),
('pcm','postcard','6 x 8.5','FirstClass',1077000,'PCM account pricing 2026-08-14','{"price_type":"from"}'),
('pcm','postcard','6 x 8.5','Standard',1028000,'PCM account pricing 2026-08-14','{"price_type":"from"}'),
('pcm','postcard','6 x 9','FirstClass',1077000,'PCM account pricing 2026-08-14','{"price_type":"from"}'),
('pcm','postcard','6 x 9','Standard',1028000,'PCM account pricing 2026-08-14','{"price_type":"from"}'),
('pcm','postcard','6 x 11','FirstClass',1546000,'PCM account pricing 2026-08-14','{"price_type":"from"}'),
('pcm','postcard','6 x 11','Standard',1106000,'PCM account pricing 2026-08-14','{"price_type":"from"}');
