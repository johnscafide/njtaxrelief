// In the NJ Parcels and MOD-IV Composite, ZIP5 / ZIP_CODE belong to the owner's
// mailing address, not the property. Watchdog never stores owner mailing data,
// so the statewide loader must not request them and the public search and
// property-page functions must not return a parcel ZIP.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const loader = read('property/scripts/sync_parcel_composite.py');
const fix = read('supabase/migrations/20260928231000_parcel_mailing_zip_privacy.sql');
const page = read('supabase/migrations/20260928230000_public_property_page.sql');

const outFields = loader.slice(loader.indexOf('OUT_FIELDS = ['), loader.indexOf(']', loader.indexOf('OUT_FIELDS = [')));
assert.doesNotMatch(outFields, /ZIP5|ZIP_CODE|ZIP_PLUS4|ST_ADDRESS|CITY_STATE|OWNER_NAME/, 'loader never requests owner name or mailing fields');
assert.match(loader, /FORBIDDEN_FIELDS = \{[^}]*"ZIP5"[^}]*"ZIP_CODE"[^}]*\}/, 'loader refuses pages that return mailing ZIP fields');
assert.doesNotMatch(loader, /"zip":/, 'loader rows carry no zip');

const search = fix.slice(fix.indexOf('create or replace function public.search_parcels'), fix.indexOf('create or replace function public.sync_parcel_batch'));
assert.match(search, /null::text as zip/, 'search_parcels returns no parcel ZIP');
assert.doesNotMatch(search, /p\.zip|c\.zip/, 'search_parcels never reads property_lookups.zip');

const sync = fix.slice(fix.indexOf('create or replace function public.sync_parcel_batch'));
assert.doesNotMatch(sync.slice(0, sync.indexOf('$$;')), /\bzip\b/, 'sync_parcel_batch neither accepts nor writes zip');
assert.match(fix, /update public\.property_lookups\s+set zip = null\s+where source_synced_at is not null and zip is not null;/, 'mailing ZIPs copied by the loader are cleared');

// After the clear, property_lookups.zip only holds address-derived ZIPs written
// by the popup lookup ledger (guarded by property-mailing-zip-contract.mjs), and
// the loader never writes it again, so the property page may show it.
assert.match(page, /'zip', v_row\.zip/, 'property page shows an address-derived ZIP when one exists');

console.log('Parcel mailing ZIP privacy contract passed.');
