import assert from 'node:assert/strict';
import fs from 'node:fs';

// NJ MOD-IV DEED_DATE is YYMMDD. workbench-derived once read "230509" as the
// year 230509, making every years-since-sale about -228,000 and blocking the
// assessment-vs-sale check for nearly every property.
const src = fs.readFileSync('supabase/functions/workbench-derived/index.ts', 'utf8');
const i = src.indexOf('function recordedYear'), j = src.indexOf('\n}\n', i) + 3;
assert.ok(i > 0, 'recordedYear parser exists');
const js = src.slice(i, j).replace('(x: unknown): number | null', '(x)').replace('(y: number, m: number, day: number)', '(y, m, day)').replace('(yy: number)', '(yy)');
const recordedYear = new Function(`${js}; return recordedYear;`)();
const cases = [['230509', 2023], ['231021', 2023], ['991231', 1999], ['20230509', 2023], ['05092023', 2023], ['2023-05-09', 2023], ['2023', 2023], [2023, 2023], ['', null], [null, null], ['000000', null], ['301399', null], ['1799', null]];
for (const [x, want] of cases) assert.equal(recordedYear(x), want, `recordedYear(${JSON.stringify(x)})`);
assert.match(src, /if \(def\.operation === 'year_delta'\) \{ const x = value\(cfg\.dep\); const year = cfg\.date_year \? recordedYear\(x\) : num\(x\);/, 'year_delta uses the date parser for date fields');
assert.match(src, /same rule as workbench-hydrate saleYear\(\)/, 'century rule matches the hydrate sale-year parser');
console.log('Sale year parse contract passed.');
