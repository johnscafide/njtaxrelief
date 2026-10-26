-- Team listings: link each listing to its Watchdog parcel so the public page can show the home's
-- Watchdog Score, taxes and the town's CO rules. tax_id is as Bright prints it; pams_pin is the
-- state parcel ID the API works out from it (or from the street address).
alter table public.team_listings add column if not exists tax_id text check (tax_id is null or length(tax_id) <= 40);
alter table public.team_listings add column if not exists pams_pin text check (pams_pin is null or pams_pin ~ '^\d{4}_[0-9A-Za-z.&_-]{1,70}$');

-- The listings already added, matched by street address and town.
update public.team_listings t set pams_pin = v.pin from (values
  ('108-briarwood-rd-mullica-hill-08062', '0808_45.02_3'),
  ('121-spire-pl-sewell-08080', '0818_48.01_73'),
  ('91-stoneshire-dr-glassboro-08028', '0806_411.11_58'),
  ('323-whittier-ct-sewell-08080', '0818_53_4.02_C0323'),
  ('6-killington-ct-sicklerville-08081', '0415_19803_17'),
  ('2-broadview-ave-berlin-08009', '0405_1204_1'),
  ('18-e-6th-ave-runnemede-08078', '0430_47_15')
) as v(slug, pin) where t.slug = v.slug and t.pams_pin is null;
update public.team_listings set tax_id = '18-00048 01-00073' where slug = '121-spire-pl-sewell-08080' and tax_id is null;
