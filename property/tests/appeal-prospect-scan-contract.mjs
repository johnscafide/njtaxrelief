import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  canonicalTown,
  buildCertifiedIndex,
  findCertified,
  buildTaxRateIndex,
  findTaxRate,
  chapter123Screen,
} from '../../supabase/functions/appeal-prospect-scan/formula.mjs';

assert.equal(canonicalTown('Atlantic City City'), 'ATLANTIC CITY');
assert.equal(canonicalTown('Washington Township'), 'WASHINGTON TWP');

const certified = buildCertifiedIndex({ ratios: {
  'ATLANTIC CITY CITY (ATLANTIC)': { '2026': { ratio: 57.95, lower: 49.26, upper: 66.64 } },
  'WASHINGTON TWP (GLOUCESTER)': { '2026': { ratio: 63.4, lower: 53.89, upper: 72.91 } },
  'TEST TWP (GLOUCESTER)': { '2026': { ratio: 101.2, lower: 86.02, upper: 116.38 } },
} });
assert.equal(findCertified(certified, 'Atlantic City', 'Atlantic')?.ratio, 57.95);
assert.equal(findCertified(certified, 'Washington Twp', 'Gloucester')?.upper, 72.91);

const rates = buildTaxRateIndex({ rates: {
  'ATLANTIC CITY CITY (ATLANTIC)': { '2025': 3.38 },
  'WASHINGTON TWP (GLOUCESTER)': { '2025': 3.25 },
} });
assert.equal(findTaxRate(rates, 'Atlantic City', 'Atlantic')?.multiplier, 0.0338);
assert.equal(findTaxRate(rates, 'No Such Town', 'Atlantic'), null);

const hit = chapter123Screen({
  market: 300000,
  assessed: 230000,
  certified: findCertified(certified, 'Atlantic City', 'Atlantic'),
  taxRate: findTaxRate(rates, 'Atlantic City', 'Atlantic'),
});
assert.equal(hit.above, true);
assert.equal(Math.round(hit.threshold_assessment), 199920);
assert.equal(Math.round(hit.supported_assessment), 173850);
assert.equal(Math.round(hit.annual_tax_at_stake), 1898);

const noHit = chapter123Screen({
  market: 300000,
  assessed: 190000,
  certified: findCertified(certified, 'Atlantic City', 'Atlantic'),
  taxRate: findTaxRate(rates, 'Atlantic City', 'Atlantic'),
});
assert.equal(noHit.above, false);

const capped = chapter123Screen({
  market: 500000,
  assessed: 550000,
  certified: findCertified(certified, 'Test Twp', 'Gloucester'),
  taxRate: { multiplier: 0.03 },
});
assert.equal(capped.upper_ratio, 1);
assert.equal(capped.relief_ratio, 1);
assert.equal(capped.supported_assessment, 500000);
assert.equal(chapter123Screen({ market: 300000, assessed: 250000, certified: findCertified(certified, 'Atlantic City', 'Atlantic'), taxRate: null }), null);

const server = fs.readFileSync(new URL('../../supabase/functions/appeal-prospect-scan/index.ts', import.meta.url), 'utf8');
assert.match(server, /equalization-ratios\.json/);
assert.match(server, /required_plan:\s*'pro_plus'/);
assert.match(server, /manual_review_required/);
assert.doesNotMatch(server, /fair\s*\*\s*1\.15/);
assert.doesNotMatch(server, /return\s+0\.033/);

console.log('appeal-prospect-scan certified Chapter 123 contract passed');
