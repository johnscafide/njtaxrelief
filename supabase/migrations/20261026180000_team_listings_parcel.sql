-- Team listings: link each listing to its Watchdog parcel so the public page can show the home's
-- Watchdog Score, taxes and the town's CO rules. tax_id is as Bright prints it; pams_pin is the
-- state parcel ID the API works out from it (or from the street address).
alter table public.team_listings add column if not exists tax_id text check (tax_id is null or length(tax_id) <= 40);
alter table public.team_listings add column if not exists pams_pin text check (pams_pin is null or pams_pin ~ '^\d{4}_[0-9A-Za-z.&_-]{1,70}$');

-- The two listings already added.
update public.team_listings set pams_pin = '0808_45.02_3' where slug = '108-briarwood-rd-mullica-hill-08062' and pams_pin is null;
update public.team_listings set pams_pin = '0818_48.01_73', tax_id = '18-00048 01-00073' where slug = '121-spire-pl-sewell-08080' and pams_pin is null;
