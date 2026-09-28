import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Assessment vs. a recent sale is measured against the district's official
// Chapter 123 range, only flags assessments above it, and never uses nominal
// transfers ($1 deeds) as market evidence.
const engine = fs.readFileSync('supabase/functions/workbench-derived/index.ts', 'utf8');
const line = engine.split('\n').find((l) => l.includes("def.operation === 'sale_chapter123_position'"));
assert.ok(line, 'workbench-derived implements sale_chapter123_position');
const body = line.trim().replace(/^else\s+/, '');

function run({ assessed, sale, upper = 57.5, ratio = 50 }) {
  const ctx = {
    def: { operation: 'sale_chapter123_position' },
    cfg: { assessed_dep: 'a', sale_dep: 's', min_sale: 1000, min_ratio_pct: 10, max_ratio_pct: 300 },
    value: (k) => (k === 'a' ? assessed : sale),
    num: (x) => (x === null || x === undefined || x === '' ? null : (Number.isFinite(Number(x)) ? Number(x) : null)),
    round: (x, p = 2) => Math.round(x * 10 ** p) / 10 ** p,
    chapterDistricts: { 2122: { upper, ratio, lower: ratio * 0.85 } },
    districtCode: () => '2122', pin: '2122_57_13', CHAPTER123_PROVIDER: 'test',
    auxMeta: new Map(), id: 'x', v: null,
  };
  vm.createContext(ctx);
  vm.runInContext(body, ctx);
  return ctx.v;
}

assert.equal(run({ assessed: 169700, sale: 1 }), null, '$1 deed is not market evidence');
assert.equal(run({ assessed: 169700, sale: 500 }), null, 'sales under $1,000 are not used');
assert.equal(run({ assessed: 166700, sale: 350000 }), 0, '6 Mozart Ave: 47.6% is inside a 57.5% upper bound, so no attention');
assert.equal(run({ assessed: 400000, sale: 500000 }), 0.391, '80% vs a 57.5% upper bound is 39.1% above the range');
assert.equal(run({ assessed: 400000, sale: 100000 }), null, 'assessment 4x the price is treated as a non-market transfer');

const migration = fs.readFileSync('supabase/migrations/20260928180000_assessment_above_chapter123_range.sql', 'utf8');
assert.match(migration, /'sale_chapter123_position'\n  \]\)\);/, 'operation is allowed by the registry check');
assert.match(migration, /"target":0,"full_attention_delta":0\.25,"guard_min":0,"guard_max":8/, 'feature v2 scores only the excess and keeps the eight-year guard');
assert.match(migration, /'watchdog\.assessment_to_sale_ratio_review_window',\n   2,\n   'watchdog\.assessment_above_chapter123_range'/);

console.log('Assessment Chapter 123 range contract passed.');
