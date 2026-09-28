import assert from 'node:assert/strict';
import fs from 'node:fs';

// Instant statewide address search: Watchdog's own parcel list answers first
// in one indexed query; Google is only a fallback; no owner data exists to leak.
const sql = fs.readFileSync('supabase/migrations/20260928210000_instant_parcel_search.sql', 'utf8');
assert.match(sql, /create index if not exists property_lookups_address_prefix_idx\s+on public\.property_lookups \(address text_pattern_ops\)/);
assert.match(sql, /and p\.address like \(v_house \|\| ' ' \|\| v_word \|\| '%'\)/, 'prefix search uses the index');
assert.match(sql, /v_limit integer := least\(greatest\(coalesce\(p_limit, 8\), 1\), 20\);/, 'at most 20 results per call');
assert.match(sql, /where p\.county is not null and p\.county <> ''/, 'map-only parcels are excluded');
assert.match(sql, /returns table \(\s*pams_pin text, address text, town text, county text, zip text,\s*prop_class text, assessed_value bigint, last_year_tax numeric\s*\)/, 'only public-record fields are returned');
assert.doesNotMatch(sql, /owner_name|st_address/i, 'no owner fields anywhere');
for (const [from, to] of [['AVENUE', 'AVE'], ['STREET', 'ST'], ['DRIVE', 'DR'], ['BOULEVARD', 'BLVD']]) {
  assert.ok(sql.includes(`' ${from} ', ' ${to} '`), `${from} and ${to} match each other`);
}

const js = fs.readFileSync('property/js/nj-address-autocomplete.js', 'utf8');
assert.match(js, /sb\.rpc\('search_parcels',\{p_query:value,p_limit:8\}\)/);
assert.match(js, /if\(found\.length\)\{renderWatchdogRows\(input,found,value,thisSeq\);return;\}\s*googleRequest\(value,thisSeq\);/, 'Watchdog first, Google only when there is no match');
assert.match(js, /if\(input\.__wdPredictionKind==='watchdog'\)openProperty\(input,rows\[idx\]\);/, 'Enter opens a Watchdog result directly');
assert.match(js, /script\.onerror=function\(\)\{\['pl-addr','ss-addr','wdd-command-input'\]\.forEach\(function\(id\)\{bindCustom\(q\(id\),null\);\}\);\};/, 'search still works if Google fails to load');
console.log('Instant parcel search contract passed.');
