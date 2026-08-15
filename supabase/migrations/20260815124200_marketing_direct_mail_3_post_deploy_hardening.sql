-- Post-deploy Direct Mail 3.0 hardening from Supabase advisor audit.
create or replace function public.marketing_annual_direct_mail_credit_amount(p_tier text) returns bigint language sql immutable set search_path='public' as $$
 select case lower(regexp_replace(coalesce(p_tier,''),'[^a-z0-9]+','_','g')) when 'agent' then 5000 when 'pro' then 10000 when 'professional' then 10000 when 'pro_plus' then 30000 when 'proplus' then 30000 else 0 end::bigint
$$;
revoke all on function public.marketing_town_options(text,integer) from public,anon;
grant execute on function public.marketing_town_options(text,integer) to authenticated,service_role;
create index if not exists marketing_credit_ledger_quote_idx on public.marketing_credit_ledger(quote_id) where quote_id is not null;
create index if not exists marketing_credit_reservations_campaign_idx on public.marketing_credit_reservations(campaign_id);
create index if not exists marketing_credit_reservations_quote_idx on public.marketing_credit_reservations(quote_id);
create index if not exists marketing_campaign_recipient_sources_campaign_idx on public.marketing_campaign_recipient_sources(campaign_id);