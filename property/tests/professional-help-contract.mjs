import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const professionalGuide = readFileSync(
  new URL('../help/professional-tools/index.html', import.meta.url),
  'utf8',
);
const untestableGuide = readFileSync(
  new URL('../help/why-property-cannot-be-tested/index.html', import.meta.url),
  'utf8',
);

// NJW-32 / NJW-314: keep the core professional workflows documented in one
// self-serve surface while protecting the safety meaning, not backend jargon.
assert.match(professionalGuide, /Appeal Prospect Scanner/);
assert.match(professionalGuide, /Watchdog Score/);
assert.match(professionalGuide, /ROBUST Framework v1/);
assert.match(professionalGuide, /appeal packet/i);

// Scanner guidance must remain screening-only without exposing implementation details.
assert.match(professionalGuide, /screening candidate/i);
assert.match(professionalGuide, /not a filing recommendation, appraisal, legal conclusion, or guarantee of a tax reduction/i);
assert.match(professionalGuide, /Verify before filing/i);

// Watchdog Score / ROBUST must never drift into a desirability or outcome score.
assert.match(professionalGuide, /not a desirability score/i);
assert.match(professionalGuide, /does not determine an appeal, appraisal, loan, insurance decision, legal outcome/i);

// Appeal packet remains a working evidence document, not filing automation.
assert.match(professionalGuide, /The packet does not file an appeal/i);
assert.match(professionalGuide, /verify current filing deadlines and procedures/i);

// Missing evidence must remain explicit without asking users to understand fail-closed architecture.
assert.match(professionalGuide, /Do not fill gaps with guesses/i);
assert.match(professionalGuide, /not enough evidence/i);
assert.match(professionalGuide, /check the source record, gather independent market evidence, or try again/i);
assert.match(professionalGuide, /public-record data/i);

// The most common Chapter 123 support path must continue linking to the guide.
assert.match(untestableGuide, /\/property\/help\/professional-tools\//);
assert.match(untestableGuide, /unavailable automated test is not a conclusion|does not mean the property has no appeal rights/i);

console.log('Professional help contract passed.');
