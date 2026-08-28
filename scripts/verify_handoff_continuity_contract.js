const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const handoffPath = path.join(root, 'HANDOFF.md');

function fail(message) {
  console.error(`HANDOFF continuity contract: FAIL — ${message}`);
  process.exit(1);
}

if (!fs.existsSync(handoffPath)) fail('HANDOFF.md is missing');
const handoff = fs.readFileSync(handoffPath, 'utf8');

const required = [
  ['canonical production host', /https:\/\/www\.watchdogindex\.com/i],
  ['production Supabase project boundary', /uvkvaxljhhngydvlrzom/],
  ['Stripe authority', /Stripe is the authority for new paid subscriptions/i],
  ['controlled public paid launch posture', /Public paid enrollment remains \*\*controlled \/ not yet open\*\*/i],
  ['ROBUST-v1 governance', /ROBUST-v1 remains the canonical Watchdog Score model/i],
  ['Supabase boundary runbook', /property\/docs\/supabase-project-boundary\.md/],
  ['external launch controls', /property\/docs\/public-paid-launch-external-controls\.md/],
  ['continuity and restore runbook', /property\/docs\/continuity-and-restore\.md/],
  ['state refresh runbook', /property\/docs\/refresh\.md/],
  ['private anti-scrape telemetry boundary', /Supabase `watchdog_security` schema/i],
  ['public-record security distinction', /extraction friction and detection around public-record-derived information/i],
  ['raw IP prohibition', /Do not expose raw IP addresses/i],
  ['main refetch-before-write rule', /Fetch current GitHub `main` and current target-file SHA immediately before every write/i],
  ['credential storage boundary', /Credentials belong in an approved password manager, not GitHub, Linear, Supabase rows, or this handoff/i]
];

for (const [label, pattern] of required) {
  if (!pattern.test(handoff)) fail(`missing ${label}`);
}

const prohibited = [
  ['unsafe public launch assertion', /public paid enrollment (?:is|=) open/i],
  ['unsafe checkout assertion', /checkout (?:is|=) open/i],
  ['manual entitlement override instruction', /manually (?:grant|set|promote).{0,40}(?:Agent|Pro\+?|paid plan|entitlement)/i],
  ['stored raw IP field', /(?:raw_?ip|ip_address)\s*[:=]/i],
  ['secret-looking bearer token', /Bearer\s+[A-Za-z0-9._-]{20,}/i]
];

for (const [label, pattern] of prohibited) {
  if (pattern.test(handoff)) fail(`contains ${label}`);
}

for (const relative of [
  'property/docs/supabase-project-boundary.md',
  'property/docs/public-paid-launch-external-controls.md',
  'property/docs/public-paid-launch-counsel-insurance-checklist.md',
  'property/docs/public-paid-launch-cutover-state.json',
  'property/docs/billing-support-runbook.md',
  'property/docs/refresh.md',
  'property/docs/continuity-and-restore.md',
  '.github/workflows/production-uptime-check.yml',
  '.github/workflows/state-data-refresh.yml',
  '.github/workflows/billing-support-contract.yml',
  '.github/workflows/njw37-anti-scrape-contract.yml'
]) {
  if (!fs.existsSync(path.join(root, relative))) fail(`referenced artifact is missing: ${relative}`);
}

console.log('HANDOFF continuity contract: PASS');
