import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  canonicalTown,
  buildCertifiedIndex,
  findCertified,
  buildTaxRateIndex,
  findTaxRate,
  chapter123Screen,
  monthsBeforeValuationDate,
  marketAtValuationDate,
  appealDeadlineContext,
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

assert.equal(monthsBeforeValuationDate(2025, 9, 2026), 1);
assert.equal(monthsBeforeValuationDate(2025, 10, 2026), null);
assert.equal(monthsBeforeValuationDate(2026, 1, 2026), null);
assert.equal(monthsBeforeValuationDate(2024, 10, 2026), 12);
assert.equal(Math.round(marketAtValuationDate(300000, 12, 0.05)), 315000);
assert.equal(marketAtValuationDate(300000, null, 0.05), null);

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

const deadlineRules = JSON.parse(fs.readFileSync(new URL('../appeal-deadline-rules.json', import.meta.url), 'utf8'));
assert.deepEqual(deadlineRules.alternate_calendar_counties.sort(), ['BURLINGTON', 'GLOUCESTER', 'MONMOUTH']);

const traditional = appealDeadlineContext({
  countyName: 'Atlantic', assessed: 900000, revaluationOrReassessment: false, taxYear: 2026, deadlineRules,
});
assert.equal(traditional.calendar, 'traditional');
assert.equal(traditional.county_board.statutory_baseline, '2026-04-01');
assert.equal(traditional.direct_tax_court.eligible_by_assessment_amount, false);
assert.equal(traditional.exact_deadline, null);
assert.equal(traditional.status, 'verify_current_notice');

const traditionalReval = appealDeadlineContext({
  countyName: 'Atlantic', assessed: 1500000, revaluationOrReassessment: true, taxYear: 2026, deadlineRules,
});
assert.equal(traditionalReval.county_board.statutory_baseline, '2026-05-01');
assert.equal(traditionalReval.direct_tax_court.statutory_baseline, '2026-05-01');

const alternateAtThreshold = appealDeadlineContext({
  countyName: 'Gloucester', assessed: 1000000, revaluationOrReassessment: false, taxYear: 2026, deadlineRules,
});
assert.equal(alternateAtThreshold.calendar, 'alternate');
assert.equal(alternateAtThreshold.county_board.statutory_baseline, '2026-01-15');
assert.equal(alternateAtThreshold.direct_tax_court.eligible_by_assessment_amount, false);

const alternateAboveThreshold = appealDeadlineContext({
  countyName: 'Gloucester', assessed: 1000001, revaluationOrReassessment: false, taxYear: 2026, deadlineRules,
});
assert.equal(alternateAboveThreshold.direct_tax_court.eligible_by_assessment_amount, true);
assert.equal(alternateAboveThreshold.direct_tax_court.statutory_baseline, '2026-04-01');
assert.equal(alternateAboveThreshold.county_board.choose_later_of_baseline_or_bulk_mailing, true);
assert.equal(alternateAboveThreshold.change_of_assessment_notice_days, 45);

const server = fs.readFileSync(new URL('../../supabase/functions/appeal-prospect-scan/index.ts', import.meta.url), 'utf8');
assert.match(server, /equalization-ratios\.json/);
assert.match(server, /appeal-deadline-rules\.json/);
assert.match(server, /appealDeadlineContext/);
assert.match(server, /required_plan:\s*'pro_plus'/);
assert.match(server, /Access-Control-Allow-Headers[\s\S]*x-client-info/);
assert.match(server, /SCOPED_SALES_ENDPOINT[\s\S]*api\/sales-by-district/);
assert.match(server, /scopedSales\(countySlug,\s*district\)/);
assert.doesNotMatch(server, /sourceJson\(`\/property\/sales-/);
assert.doesNotMatch(server, /\.filter\(county\s*=>\s*county\.towns\.length\s*>\s*0\)/);
assert.match(server, /manual_review_required/);
assert.match(server, /monthsBeforeValuationDate/);
assert.match(server, /valuationDate/);
assert.match(server, /saleCutoff/);
assert.doesNotMatch(server, /fair\s*\*\s*1\.15/);
assert.doesNotMatch(server, /return\s+0\.033/);
assert.doesNotMatch(server, /currentYear\s*-\s*Number\(sale\?\.y\)/);

const deadlineUi = fs.readFileSync(new URL('../js/scan-deadline-ui.js', import.meta.url), 'utf8');
assert.match(deadlineUi, /deadline_context/);
assert.match(deadlineUi, /This is not a final filing deadline/);
assert.match(deadlineUi, /does not show days remaining/);
assert.doesNotMatch(deadlineUi, /appealDeadlineContext/);
assert.doesNotMatch(deadlineUi, /setInterval\s*\(/);
assert.doesNotMatch(deadlineUi, /Date\.now\s*\(\)\s*[-+]/);

const evidenceUi = fs.readFileSync(new URL('../js/scan-evidence-ui.js', import.meta.url), 'utf8');
assert.match(evidenceUi, /server-authoritative appeal-prospect-scan/);
assert.match(evidenceUi, /payload\.run\.hits/);
assert.match(evidenceUi, /Screening evidence only/);
assert.match(evidenceUi, /does not determine parcel-specific forum eligibility|not a deadline/);
assert.match(evidenceUi, /__watchdogCaseValueAssumptions/);
assert.match(evidenceUi, /Watchdog supplied no default fee percentage/);
assert.match(evidenceUi, /Annual tax at stake × fee-share assumption × value horizon/);
assert.match(evidenceUi, /Any case-value section appears only when the attorney entered working assumptions/);
assert.doesNotMatch(evidenceUi, /chapter123\s*\(/);
assert.doesNotMatch(evidenceUi, /appealDeadlineContext\s*\(/);
assert.doesNotMatch(evidenceUi, /setInterval\s*\(/);
assert.doesNotMatch(evidenceUi, /has_watchdog_plan/);
assert.doesNotMatch(evidenceUi, /localStorage|sessionStorage/);

const caseValueUi = fs.readFileSync(new URL('../js/scan-case-value-ui.js', import.meta.url), 'utf8');
assert.match(caseValueUi, /never supplies a default fee assumption/);
assert.match(caseValueUi, /server-returned annual tax at stake/);
assert.match(caseValueUi, /does not save or send these inputs/);
assert.match(caseValueUi, /annual \* \(assumptions\.feePct \/ 100\) \* assumptions\.years/);
assert.match(caseValueUi, /__watchdogCaseValueAssumptions\s*=\s*assumptions\.ready/);
assert.doesNotMatch(caseValueUi, /localStorage|sessionStorage/);
assert.doesNotMatch(caseValueUi, /\.functions\.invoke/);
assert.doesNotMatch(caseValueUi, /has_watchdog_plan/);
assert.doesNotMatch(caseValueUi, /id=\\?"sc-fee-share\\?"[^>]*\svalue=/);
assert.doesNotMatch(caseValueUi, /id=\\?"sc-value-horizon\\?"[^>]*\svalue=/);

const scanPage = fs.readFileSync(new URL('../scan/index.html', import.meta.url), 'utf8');
assert.match(scanPage, /data-access-require="pro_plus"/);
assert.match(scanPage, /scan-deadline-ui\.js/);
assert.match(scanPage, /scan-evidence-ui\.js/);
assert.match(scanPage, /scan-case-value-ui\.js/);
assert.doesNotMatch(scanPage, /appeal-packet\.js/);

console.log('appeal-prospect-scan certified Chapter 123, deadline-rule, evidence, user-supplied case-value, browser CORS, scoped-sales, and statewide catalog boundaries passed');