#!/usr/bin/env node
// Builds property/data/town-tax/bills.json for the /property-tax town pages.
//
// Input is the residential (class 2) rows of public.public_town_class_stats in production
// Supabase, as "COUNTY|TOWN|homes|median_tax|median_assessed" joined with ";":
//   select string_agg(county||'|'||town||'|'||peers||'|'||median_tax||'|'||median_assessed, ';' order by county, town)
//   from public.public_town_class_stats where prop_class = '2';
// Usage: node scripts/build-town-tax-bills.mjs rows.txt
// Rows for towns already in bills.json are replaced; other towns are kept.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'property/data/town-tax/bills.json');
const input = process.argv[2];
if (!input) { console.error('Usage: node scripts/build-town-tax-bills.mjs rows.txt'); process.exit(1); }

const feed = JSON.parse(fs.readFileSync(path.join(root, 'property/data/home-feed-towns.json'), 'utf8')).towns;
const byName = new Map(Object.entries(feed).map(([code, t]) => [`${t.c.toUpperCase()}|${t.m}`, code]));
const current = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { towns: {} };
const towns = { ...current.towns };
const missed = [];
fs.readFileSync(input, 'utf8').trim().split(';').filter(Boolean).forEach((row) => {
  const [county, town, homes, tax, assessed] = row.split('|');
  const code = byName.get(`${county}|${town}`);
  if (!code) { missed.push(`${county}|${town}`); return; }
  towns[code] = { homes: Number(homes), tax: Number(tax), assessed: Number(assessed) };
});

const sorted = Object.fromEntries(Object.keys(towns).sort().map((k) => [k, towns[k]]));
fs.writeFileSync(out, JSON.stringify({
  _readme: [
    'Typical residential (MOD-IV property class 2) property tax bill and assessment per town, keyed by Treasury taxing-district code.',
    'homes = residential parcels with a positive bill, tax = median annual tax bill, assessed = median assessed value.',
    'The bills are calendar-year 2024 bills: bill / assessment matches each town\'s 2024 general tax rate in tax-rates.json.',
    'Built by scripts/build-town-tax-bills.mjs from public.public_town_class_stats (production Supabase).'
  ],
  bill_year: 2024,
  built: new Date().toISOString().slice(0, 10),
  towns: sorted
}, null, 1) + '\n');
console.log(`${Object.keys(sorted).length} towns written${missed.length ? `; not matched: ${missed.join(', ')}` : ''}`);
