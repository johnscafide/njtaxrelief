#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const checklistPath = path.join(repoRoot, 'property/docs/public-paid-launch-counsel-insurance-checklist.md');
const controlsPath = path.join(repoRoot, 'property/docs/public-paid-launch-external-controls.md');
const taxBriefPath = path.join(repoRoot, 'property/docs/public-paid-launch-tax-advisor-brief.md');
const statePath = path.join(repoRoot, 'property/docs/public-paid-launch-cutover-state.json');
const requireCutoverReady = process.argv.includes('--require-cutover-ready');
const requirePublicOpen = process.argv.includes('--require-public-open');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function requireFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing required file ${path.relative(repoRoot, filePath)}`);
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function requireText(name, text, snippets) {
  for (const snippet of snippets) {
    if (!text.includes(snippet)) fail(`${name} is missing required contract text: ${snippet}`);
  }
}

const checklist = requireFile(checklistPath);
const controls = requireFile(controlsPath);
const taxBrief = requireFile(taxBriefPath);
const stateRaw = requireFile(statePath);

requireText('counsel/insurance checklist', checklist, [
  'Current status: **PENDING EXTERNAL REVIEW**',
  'Watchdog Property Intelligence LLC',
  'Final counsel control state: `PENDING`',
  'Final insurance/risk control state: `PENDING`',
  'A quote request alone is not a passed control.',
  'the first controlled NJ Stripe Tax calculation has passed on or after 2026-09-16',
  'Do not put EIN values'
]);

requireText('external-controls packet', controls, [
  'Public paid enrollment | CONTROLLED / NOT OPEN',
  'Counsel / final LLC operator language | PENDING',
  'Written NJ sales-tax classification | PENDING',
  'First controlled NJ tax calculation | PENDING until 2026-09-16',
  'Explicit public cutover | NO-GO'
]);

requireText('tax-advisor brief', taxBrief, [
  'written external determination still required before broad public paid enrollment',
  '2026-09-16',
  'txcd_10701400',
  'They do **not** make the tax-classification control pass by themselves.'
]);

let state;
try {
  state = JSON.parse(stateRaw);
} catch (error) {
  fail(`cutover state is not valid JSON: ${error.message}`);
}

if (state) {
  if (state.schema_version !== 1) fail('cutover state schema_version must be 1');
  if (!['closed', 'controlled', 'open'].includes(state.checkout_mode)) fail('checkout_mode must be closed, controlled, or open');
  if (state.explicit_public_cutover === false && state.checkout_mode === 'open') {
    fail('checkout cannot be open while explicit_public_cutover is false');
  }
  if (state.public_enrollment === 'open' && state.checkout_mode !== 'open') {
    fail('public_enrollment cannot be open unless checkout_mode is open');
  }
  if (state.teams_self_service !== 'closed') fail('Teams self-service must remain closed for this launch contract');

  const c = state.controls || {};
  const requiredControlKeys = [
    'billing_engineering',
    'entity_registration',
    'counsel_review',
    'insurance_risk',
    'nj_tax_registration_configuration',
    'nj_tax_classification',
    'nj_tax_live_calculation'
  ];
  for (const key of requiredControlKeys) {
    if (!c[key] || typeof c[key] !== 'object') fail(`missing control ${key}`);
  }

  if (c.billing_engineering?.status !== 'passed') fail('billing_engineering must remain passed');
  if (!['recorded_complete', 'passed'].includes(c.entity_registration?.status)) fail('entity_registration must be recorded_complete or passed');
  if (!c.entity_registration?.evidence_ref) fail('entity_registration requires a non-sensitive evidence_ref');
  if (c.entity_registration?.sensitive_identifiers_in_repo !== false) fail('sensitive entity identifiers must not be stored in the repo state');
  if (!['recorded_complete', 'passed'].includes(c.nj_tax_registration_configuration?.status)) fail('NJ tax registration/configuration must be recorded_complete or passed');
  if (c.nj_tax_registration_configuration?.effective_date !== '2026-09-16') fail('NJ tax registration effective date must remain 2026-09-16 unless real evidence changes it');
  if (c.nj_tax_live_calculation?.not_before !== '2026-09-16') fail('NJ tax live calculation not_before must remain 2026-09-16');

  const evidenceRequiredStatuses = new Set(['passed', 'accepted_risk']);
  for (const key of ['counsel_review', 'insurance_risk', 'nj_tax_classification', 'nj_tax_live_calculation']) {
    const control = c[key];
    if (evidenceRequiredStatuses.has(control?.status) && !String(control?.evidence_ref || '').trim()) {
      fail(`${key} cannot be ${control.status} without evidence_ref`);
    }
  }

  if (c.nj_tax_live_calculation?.status === 'passed') {
    const verifiedAt = Date.parse(c.nj_tax_live_calculation.verified_at || '');
    const notBefore = Date.parse(`${c.nj_tax_live_calculation.not_before}T00:00:00Z`);
    if (!Number.isFinite(verifiedAt) || verifiedAt < notBefore) {
      fail('NJ tax live calculation cannot pass without verified_at on or after the not_before date');
    }
  }

  const blockers = [];
  if (c.billing_engineering?.status !== 'passed') blockers.push('billing_engineering');
  if (!['recorded_complete', 'passed'].includes(c.entity_registration?.status)) blockers.push('entity_registration');
  if (c.counsel_review?.status !== 'passed') blockers.push('counsel_review');
  if (!['passed', 'accepted_risk'].includes(c.insurance_risk?.status)) blockers.push('insurance_risk');
  if (!['recorded_complete', 'passed'].includes(c.nj_tax_registration_configuration?.status)) blockers.push('nj_tax_registration_configuration');
  if (c.nj_tax_classification?.status !== 'passed') blockers.push('nj_tax_classification');
  if (c.nj_tax_live_calculation?.status !== 'passed') blockers.push('nj_tax_live_calculation');

  const calculatedOpenReady = blockers.length === 0;
  if (Boolean(state.open_ready) !== calculatedOpenReady) {
    fail(`open_ready=${state.open_ready} does not match calculated readiness=${calculatedOpenReady}`);
  }

  if (requireCutoverReady && blockers.length) {
    console.error(`BLOCKED: public cutover has unresolved controls: ${blockers.join(', ')}`);
    process.exitCode = 2;
  }

  if (requirePublicOpen) {
    if (blockers.length) {
      console.error(`BLOCKED: public open has unresolved controls: ${blockers.join(', ')}`);
      process.exitCode = 2;
    } else if (state.explicit_public_cutover !== true) {
      console.error('BLOCKED: explicit_public_cutover is not true');
      process.exitCode = 2;
    } else if (state.checkout_mode !== 'open' || state.public_enrollment !== 'open') {
      console.error('BLOCKED: public-open mode is not recorded as open');
      process.exitCode = 2;
    }
  }

  if (!process.exitCode) {
    console.log(`PASS: launch-control packet is internally consistent; checkout=${state.checkout_mode}; open_ready=${state.open_ready}; blockers=${blockers.join(',') || 'none'}`);
  }
}
