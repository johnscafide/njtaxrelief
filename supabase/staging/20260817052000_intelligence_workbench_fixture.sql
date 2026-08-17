-- STAGING ONLY. Do not run in production.
-- Small public-record fixture used to exercise the Workbench payload contract and cohort logic.

create table if not exists public.property_lookups (
  pams_pin text primary key,
  address text,
  town text,
  county text,
  zip text,
  block text,
  lot text,
  qualifier text,
  prop_class text,
  year_built integer,
  acres numeric,
  dwelling_units integer,
  building_desc text,
  land_value numeric,
  improvement_value numeric,
  assessed_value numeric,
  last_year_tax numeric,
  effective_rate numeric,
  last_sale_price numeric,
  last_sale_year integer,
  lat numeric,
  lon numeric,
  history jsonb not null default '{}'::jsonb,
  last_seen timestamptz not null default now()
);

create table if not exists public.score_observations (
  pams_pin text not null,
  marker_id text not null,
  score numeric,
  observed_at timestamptz not null default now(),
  model_version text,
  primary key (pams_pin, marker_id, observed_at)
);

alter table public.property_lookups enable row level security;
alter table public.score_observations enable row level security;
revoke all on public.property_lookups from anon, authenticated;
revoke all on public.score_observations from anon, authenticated;
create policy property_lookups_fixture_deny on public.property_lookups for all to authenticated using (false) with check (false);
create policy score_observations_fixture_deny on public.score_observations for all to authenticated using (false) with check (false);

create or replace function public.watchdog_effective_plan(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce((select account_role from public.profiles where id = p_user_id), 'user') = 'developer' then 'developer'
    else coalesce((select plan_tier from public.account_entitlements where user_id = p_user_id), 'standard')
  end;
$$;
revoke all on function public.watchdog_effective_plan(uuid) from public, anon, authenticated;
grant execute on function public.watchdog_effective_plan(uuid) to service_role;

insert into public.property_lookups
(pams_pin,address,town,county,zip,block,lot,qualifier,prop_class,year_built,acres,dwelling_units,building_desc,land_value,improvement_value,assessed_value,last_year_tax,last_sale_price,last_sale_year,last_seen)
values
('0818_100_1','207 EVERGREEN AVE','WASHINGTON TWP','GLOUCESTER','08080','100','1','','2',1920,0.5739,1,'2SF2G',49300,131000,180300,6669.30,88000,2024,'2026-08-10T21:48:46.925Z'),
('0818_100_12','201 EVERGREEN AVE','WASHINGTON TWP','GLOUCESTER','08080','100','12','','2',1965,0.3587,1,'1SF2G',43000,159200,202200,7479.38,180000,2001,'2026-08-10T21:48:46.925Z'),
('0818_100_14','202 SYCAMORE AVE','WASHINGTON TWP','GLOUCESTER','08080','100','14','','2',1965,0.2152,1,'2SF',34000,160400,194400,7190.85,140000,2023,'2026-08-10T21:48:46.925Z'),
('0818_100_3','603 TUCKAHOE RD','WASHINGTON TWP','GLOUCESTER','08080','100','3','','2',1985,0.3587,1,'1SF1G',32600,129600,162200,5999.78,188000,2013,'2026-08-10T21:48:46.925Z'),
('0818_100_6.01','204 SYCAMORE AVE','WASHINGTON TWP','GLOUCESTER','08080','100','6.01','','2',1959,0.3587,1,'1SF',40800,138400,179200,6628.61,240000,2022,'2026-08-10T21:48:46.925Z'),
('0818_100_8','200 SYCAMORE AVE','WASHINGTON TWP','GLOUCESTER','08080','100','8','','2',1965,0.2870,1,'2SF',35400,144900,180300,6550.93,250000,2019,'2026-08-10T21:48:46.925Z'),
('0818_100_9','205 EVERGREEN AVE','WASHINGTON TWP','GLOUCESTER','08080','100','9','','2',1960,0.2870,1,'1SF',39400,179400,218800,8093.41,220000,2021,'2026-08-10T21:48:46.925Z'),
('0818_103_2','207 WOODLAWN AVE','WASHINGTON TWP','GLOUCESTER','08080','103','2','','2',1930,0.2870,1,'2SF',39400,117900,157300,5818.53,200000,2022,'2026-08-10T21:48:46.925Z'),
('0818_103_4.03','200 EVERGREEN AVE','WASHINGTON TWP','GLOUCESTER','08080','103','4.03','','2',1955,0.3587,1,'1SF1G',38700,119300,158000,5844.42,52500,2015,'2026-08-10T21:48:46.925Z'),
('0818_103_5','201 WOODLAWN AVE','WASHINGTON TWP','GLOUCESTER','08051','103','5','','2',1960,0.2870,2,'2SF',37400,146200,183600,6791.37,183000,2007,'2026-08-10T21:48:46.925Z'),
('0818_104_1.01','208 WOODLAWN AVE','WASHINGTON TWP','GLOUCESTER','08080','104','1.01','','2',1965,0.2583,2,'2SF',37900,171300,209200,7738.31,239000,2021,'2026-08-10T21:48:46.925Z'),
('0818_104_3.01','209 NARBERTH AVE','WASHINGTON TWP','GLOUCESTER','08080','104','3.01','','2',1965,0.2870,2,'2SCB',33400,135100,168500,6232.82,260000,2005,'2026-08-10T21:48:46.925Z'),
('0818_104_4.01','212 WOODLAWN AVE','WASHINGTON TWP','GLOUCESTER','19147','104','4.01','','2',1965,0.2870,2,'2SF',31500,157800,189300,7002.21,175000,2001,'2026-08-10T21:48:46.925Z'),
('0818_109.04_10','6 RITTENHOUSE SQ','WASHINGTON TWP','GLOUCESTER','08081','109.04','10','','2',1991,0.2603,1,'BRIARWOOD',41700,244000,285700,10568.04,166015,2018,'2026-08-10T21:30:35.819Z'),
('0818_109.06_20','5 RITTENHOUSE SQUARE','WASHINGTON TWP','GLOUCESTER','08081','109.06','20','','2',1991,null,1,'FAIRVIEW',44000,268100,312100,11544.58,400000,2011,'2026-08-10T21:30:13.141Z'),
('0818_109.06_6','21 FAIRMOUNT DR','WASHINGTON TWP','GLOUCESTER','08081','109.06','6','','2',1991,null,1,'2SF1G',45200,145900,191100,7068.79,219000,2012,'2026-08-10T21:30:13.141Z'),
('0818_109.06_8','17 FAIRMOUNT DR','WASHINGTON TWP','GLOUCESTER','08081','109.06','8','','2',1992,null,1,'CUSTOM 2 STORY',42100,289500,331600,12265.89,315000,2020,'2026-08-10T21:30:13.141Z'),
('0818_109.07_7','3 LONGWOOD DR','WASHINGTON TWP','GLOUCESTER','08081','109.07','7','','2',1991,null,1,'CANTERBURY',47100,240400,287500,10634.63,308000,2018,'2026-08-10T21:30:35.819Z')
on conflict (pams_pin) do update set
  address=excluded.address,town=excluded.town,county=excluded.county,zip=excluded.zip,block=excluded.block,lot=excluded.lot,qualifier=excluded.qualifier,
  prop_class=excluded.prop_class,year_built=excluded.year_built,acres=excluded.acres,dwelling_units=excluded.dwelling_units,building_desc=excluded.building_desc,
  land_value=excluded.land_value,improvement_value=excluded.improvement_value,assessed_value=excluded.assessed_value,last_year_tax=excluded.last_year_tax,
  last_sale_price=excluded.last_sale_price,last_sale_year=excluded.last_sale_year,last_seen=excluded.last_seen;

insert into public.score_observations(pams_pin,marker_id,score,observed_at,model_version)
select pams_pin,'watchdog.assessment_to_sale_ratio',round((assessed_value/nullif(last_sale_price,0))::numeric,6),last_seen,'staging-fixture-v1'
from public.property_lookups where last_sale_price > 0
union all
select pams_pin,'watchdog.sale_to_assessment_ratio',round((last_sale_price/nullif(assessed_value,0))::numeric,6),last_seen,'staging-fixture-v1'
from public.property_lookups where last_sale_price > 0
union all
select pams_pin,'watchdog.source_authority_coverage',90,last_seen,'staging-fixture-v1'
from public.property_lookups
on conflict do nothing;
