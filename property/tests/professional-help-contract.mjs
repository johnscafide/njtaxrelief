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

// NJW-32 low-touch onboarding/support contract: keep all three core professional
// workflows documented in one self-serve surface with their evidence boundaries.
assert.match(professionalGuide, /Appeal Prospect Scanner/);
assert.match(professionalGuide, /Watchdog Score/);
assert.match(professionalGuide, /ROBUST Framework v1/);
assert.match(professionalGuide, /appeal packet/i);

// Scanner guidance must preserve server-authoritative, screening-only semantics.
assert.match(professionalGuide, /ranking and Chapter 123 screening run server-side/i);
assert.match(professionalGuide, /not a filing recommendation, legal conclusion, appraisal, or guarantee of a tax reduction/i);
assert.match(professionalGuide, /Always verify before filing/i);

// Watchdog Score / ROBUST must never drift into a desirability or outcome score.
assert.match(professionalGuide, /not a desirability score/i);
assert.match(professionalGuide, /does not by itself determine an appeal, appraisal, loan, insurance decision, legal outcome/i);

// Appeal packet remains a working evidence document, not filing automation.
assert.match(professionalGuide, /The packet does not file an appeal/i);
assert.match(professionalGuide, /verify the current official instructions before filing/i);

// Missing evidence stays fail-closed and public-record provenance stays explicit.
assert.match(professionalGuide, /Fail closed instead of filling the blank with a guess/i);
assert.match(professionalGuide, /Public records are not secret/i);
assert.match(professionalGuide, /friction, entitlement enforcement, and abuse detection/i);

// The most common Chapter 123 support path must continue linking to the guide.
assert.match(untestableGuide, /\/property\/help\/professional-tools\//);
assert.match(untestableGuide, /unavailable automated test is not a conclusion|does not mean the property has no appeal rights/i);

console.log('Professional help contract passed.');
