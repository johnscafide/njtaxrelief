// The Watchdog Score's Overassessment part must use the certified Chapter 123
// district ratio (the legal basis of an appeal) before Watchdog's own SR-1A
// median or the legacy static table, and the Chapter 123 upper limit is the
// ratio plus 15%, never above 100% of true value. Runs the scorer's own
// functions, extracted from the edge function source.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('supabase/functions/workbench-score/index.ts', 'utf8');
const pick = (name) => {
  const m = src.match(new RegExp('(?:^|\\n)((?:const|function) ' + name + '[\\s\\S]*?\\n)(?=(?:function |const |let |async function |Deno\\.|//))'));
  assert.ok(m, `scorer defines ${name}`);
  return m[1];
};
const code = ['num', 'district', 'norm', 'medianLatest', 'sr1aFor', 'certifiedFor', 'ratioFor', 'marketValue', 'chapter123'].map(pick).join('\n');
const f = new Function('SUBJECT_MODEL', code + '\nreturn { marketValue, chapter123 };')('test');
const certified = JSON.parse(fs.readFileSync('chapter123-ratios-2026.json', 'utf8'));
const row = { pams_pin: '0904_9_20', assessed_value: 424300, town: 'HARRISON TOWN', county: 'HUDSON', subject_living_space: 1800 };
const sr1a = { districts: { '0904': { ratio: 0.55, n: 40, ppsf: 400 } } };

const market = f.marketValue(row, { certified, sr1a, equalization: { ratios: {} } }, null);
assert.equal(market.src, 'certified', 'certified district ratio comes first');
assert.equal(market.ratio, 0.6939, 'Harrison 2026 certified ratio');
assert.equal(Math.round(market.v), 611471, 'implied value = assessed / certified ratio (matches /checkup)');

const c = f.chapter123(row, market, null, sr1a.districts['0904']);
assert.ok(Math.abs(c.upper - 0.798) < 1e-9, 'certified upper limit of the common level range');
assert.equal(Math.round(c.limit), Math.round(720000 * 0.798));
assert.equal(c.hasCase, false);

const fallback = f.marketValue(row, { certified: null, sr1a, equalization: { ratios: {} } }, null);
assert.equal(fallback.src, 'verified', 'without the certified file, scoring still works from SR-1A');
assert.equal(f.chapter123(row, { v: 1, ratio: 0.95, src: 'verified' }, null, { ppsf: 400 }).upper, 1, 'upper limit never exceeds 100%');
assert.ok(Math.abs(f.chapter123(row, { v: 1, ratio: 0.8, src: 'verified' }, null, { ppsf: 400 }).upper - 0.92) < 1e-9, 'ratio + 15% when no certified upper');

assert.match(src, /sourceCache\.certified = null;/, 'a missing certified file never breaks scoring');
console.log('Watchdog Score certified-ratio contract passed.');
