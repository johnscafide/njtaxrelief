-- Keep unchecked town scan text out of what agents see.
--
-- The statewide scan copies raw page and PDF text into requirements and fees, so agents
-- saw website menus and blank form lines as "official requirements", and grant amounts,
-- fines and garbled PDF bytes as "fees". 98 "application" links were website account
-- sign-up pages. Until a person checks a town (curated_override), that text moves to
-- metadata.unchecked and agents get the official links instead. The weekly publisher
-- (publish_transaction_municipal_requirements.py) applies the same rule from now on.

-- 1. The town table. Idempotent: a re-run keeps the first saved copy of the raw text.
with cleaned as (
  select t.id,
    coalesce((
      select jsonb_agg(s order by o)
      from jsonb_array_elements(case when jsonb_typeof(t.source_urls) = 'array' then t.source_urls else '[]'::jsonb end) with ordinality e(s, o)
      where coalesce(s->>'url', '') ~* '^https?://'
        and not coalesce(s->>'url', '') ~* '/MyAccount(/|$|\?)|/Identity/Account/|cpauthentication\.civicplus\.com|ForgotPassword|/newsflash/'
    ), '[]'::jsonb) as sources,
    case when t.application_url ~* '^https?://'
          and not t.application_url ~* '/MyAccount(/|$|\?)|/Identity/Account/|cpauthentication\.civicplus\.com|ForgotPassword|/newsflash/'
         then t.application_url end as form_url
  from public.transaction_municipal_requirements t
  where not t.curated_override
)
update public.transaction_municipal_requirements t
set metadata = t.metadata || jsonb_build_object('unchecked', coalesce(t.metadata->'unchecked', jsonb_build_object(
      'requirements', t.requirements,
      'fees', t.fees,
      'application_url', t.application_url))),
    requirements = '[]'::jsonb,
    fees = '[]'::jsonb,
    application_url = null,
    source_urls = case
      when c.form_url is not null and not exists (select 1 from jsonb_array_elements(c.sources) x where x->>'url' = c.form_url)
        then jsonb_build_array(jsonb_build_object('url', c.form_url, 'label', 'Form found by the automatic scan (not checked yet)')) || c.sources
      else c.sources end,
    department_url = case when t.department_url ~* '/MyAccount(/|$|\?)|/Identity/Account/|cpauthentication\.civicplus\.com|ForgotPassword' then null else t.department_url end,
    updated_at = now()
from cleaned c
where c.id = t.id;

-- 2. Checklist items already saved on agents' transactions from those rows. Items from
-- hand-checked evidence (no requirement_state) and person-checked towns are untouched.
update public.transaction_items i
set payload = i.payload || jsonb_build_object(
      'details_checked', false,
      'requirements', '[]'::jsonb,
      'fees', '[]'::jsonb,
      'application_url', null,
      'department_url', r.department_url,
      'official_sources', r.source_urls),
    source_url = coalesce(r.department_url, r.ordinance_url, r.source_urls->0->>'url'),
    description = case
      when i.item_key = 'resale_cco' and r.requirement_state = 'explicit_required' then
        format('Official municipal source material contains affirmative resale/occupancy requirement language for %s. Watchdog has not checked the exact requirements and fees yet, so open the official links below before quoting anything.', r.municipality_name)
      when i.item_key = 'resale_cco' and r.requirement_state = 'official_process_found' then
        format('Watchdog found an official municipal resale/occupancy process for %s, but the source parser did not promote it to an unconditional requirement. Verify applicability for this transaction with the enforcing office. Watchdog has not checked the exact requirements and fees yet, so open the official links below before quoting anything.', r.municipality_name)
      when i.item_key = 'smoke_fire_cert' and r.requirement_state = 'explicit_required' then
        format('Official local material contains affirmative smoke/CO/fire compliance language tied to sale or change of occupancy in %s. Track the applicable inspection/certificate process before closing. Watchdog has not checked the exact requirements and fees yet, so open the official links below before quoting anything.', r.municipality_name)
      when i.item_key = 'smoke_fire_cert' and r.requirement_state = 'official_process_found' then
        format('Watchdog found an official local smoke/CO/fire process for %s. Confirm how it applies to this property and whether it is handled separately or through the municipal occupancy process. Watchdog has not checked the exact requirements and fees yet, so open the official links below before quoting anything.', r.municipality_name)
      else i.description end,
    updated_at = now()
from public.transaction_municipal_requirements r
where i.item_key in ('resale_cco', 'smoke_fire_cert')
  and i.payload ? 'requirement_state'
  and r.municipality_code = i.payload->>'municipality_code'
  and r.requirement_key = i.item_key
  and not r.curated_override;
