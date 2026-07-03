/* Run with: node --test tests/*.test.js
 * These tests lock in the FY2027 budget math. If a test fails after you
 * edit NJ_PROGRAM_DATA, either the edit is wrong or the expected values
 * here need to change with it (deliberately, in the same commit). */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const RP = require('../js/relief-programs.js');

// ── Stay NJ income tiers (FY2027) ─────────────────────────────

test('Stay NJ cap: income under $100K gets the $6,500 cap', () => {
  assert.equal(RP.stayNJCap(0), 6500);
  assert.equal(RP.stayNJCap(45000), 6500);
  assert.equal(RP.stayNJCap(99999), 6500);
});

test('Stay NJ cap: boundary incomes are inclusive of their tier', () => {
  assert.equal(RP.stayNJCap(100000), 6500); // exactly $100K keeps top cap
  assert.equal(RP.stayNJCap(100001), 5000);
  assert.equal(RP.stayNJCap(150000), 5000); // exactly $150K keeps middle cap
  assert.equal(RP.stayNJCap(150001), 4000);
  assert.equal(RP.stayNJCap(200000), 4000); // exactly $200K still qualifies
});

test('Stay NJ cap: over the income limit is not eligible', () => {
  assert.equal(RP.stayNJCap(200001), 0);
  assert.equal(RP.stayNJCap(500000), 0);
});

test('Stay NJ cap: garbage input is treated as not eligible, never crashes', () => {
  assert.equal(RP.stayNJCap(undefined), 0);
  assert.equal(RP.stayNJCap(null), 0);
  assert.equal(RP.stayNJCap(''), 0);
  assert.equal(RP.stayNJCap('abc'), 0);
  assert.equal(RP.stayNJCap(-1), 0);
});

// ── Stay NJ credit math ───────────────────────────────────────

test('Stay NJ credit is 50% of the bill when under the cap', () => {
  const r = RP.stayNJCredit(8000, 75000);
  assert.equal(r.valid, true);
  assert.equal(r.eligible, true);
  assert.equal(r.credit, 4000);
  assert.equal(r.quarterly, 1000);
  assert.equal(r.remaining, 4000);
});

test('Stay NJ credit is capped by the income tier', () => {
  // $20,000 bill: 50% = $10,000, capped at $6,500 for low income
  assert.equal(RP.stayNJCredit(20000, 90000).credit, 6500);
  // same bill, middle tier: capped at $5,000
  assert.equal(RP.stayNJCredit(20000, 120000).credit, 5000);
  // same bill, top tier: capped at $4,000
  assert.equal(RP.stayNJCredit(20000, 180000).credit, 4000);
});

test('Stay NJ credit at exactly the cap threshold bill', () => {
  // $13,000 bill at low income: 50% = exactly the $6,500 cap
  const r = RP.stayNJCredit(13000, 50000);
  assert.equal(r.credit, 6500);
  assert.equal(r.remaining, 6500);
});

test('Stay NJ credit: over-limit income is valid input but not eligible', () => {
  const r = RP.stayNJCredit(9000, 250000);
  assert.equal(r.valid, true);
  assert.equal(r.eligible, false);
  assert.equal(r.credit, 0);
});

test('Stay NJ credit: missing or zero inputs are not valid (empty state)', () => {
  assert.equal(RP.stayNJCredit('', '').valid, false);
  assert.equal(RP.stayNJCredit(0, 50000).valid, false);
  assert.equal(RP.stayNJCredit(9000, undefined).valid, false);
  assert.equal(RP.stayNJCredit(-5000, 50000).valid, false);
});

test('Stay NJ credit accepts formatted strings like "$8,000"', () => {
  const r = RP.stayNJCredit('$8,000', '75,000');
  assert.equal(r.eligible, true);
  assert.equal(r.credit, 4000);
});

// ── ANCHOR ────────────────────────────────────────────────────

test('ANCHOR homeowner: low income gets $1,500', () => {
  const r = RP.anchorBenefit({ tenure: 'own', primary: 'yes', income: 'low', age: 'no', taxes: 'yes' });
  assert.equal(r.status, 'qualified');
  assert.equal(r.amount, 1500);
});

test('ANCHOR homeowner: mid income ($150,001-$250,000) gets $1,000', () => {
  const r = RP.anchorBenefit({ tenure: 'own', primary: 'yes', income: 'mid', age: 'no', taxes: 'yes' });
  assert.equal(r.status, 'qualified');
  assert.equal(r.amount, 1000);
});

test('ANCHOR renter: under 65 gets $450, senior gets $700', () => {
  const base = { tenure: 'rent', primary: 'yes', income: 'low', taxes: 'yes' };
  assert.equal(RP.anchorBenefit({ ...base, age: 'no' }).amount, 450);
  assert.equal(RP.anchorBenefit({ ...base, age: 'yes' }).amount, 700);
});

test('ANCHOR: not primary residence disqualifies regardless of everything else', () => {
  const r = RP.anchorBenefit({ tenure: 'own', primary: 'no', income: 'low', age: 'yes', taxes: 'yes' });
  assert.equal(r.status, 'not_qualified');
  assert.equal(r.reason, 'not_primary_residence');
});

test('ANCHOR: income over $250K disqualifies', () => {
  const r = RP.anchorBenefit({ tenure: 'own', primary: 'yes', income: 'high', age: 'no', taxes: 'yes' });
  assert.equal(r.status, 'not_qualified');
  assert.equal(r.reason, 'income_over_limit');
});

test('ANCHOR: renter in the mid bracket is over the renter limit', () => {
  const r = RP.anchorBenefit({ tenure: 'rent', primary: 'yes', income: 'mid', age: 'no', taxes: 'yes' });
  assert.equal(r.status, 'not_qualified');
  assert.equal(r.reason, 'renter_income_over_limit');
});

test('ANCHOR: delinquent homeowner is a verify case, not a hard no', () => {
  const r = RP.anchorBenefit({ tenure: 'own', primary: 'yes', income: 'low', age: 'no', taxes: 'no' });
  assert.equal(r.status, 'verify');
});

test('ANCHOR: delinquency question does not apply to renters', () => {
  const r = RP.anchorBenefit({ tenure: 'rent', primary: 'yes', income: 'low', age: 'no', taxes: 'no' });
  assert.equal(r.status, 'qualified');
  assert.equal(r.amount, 450);
});

test('ANCHOR: missing answers report incomplete, never a false qualification', () => {
  assert.equal(RP.anchorBenefit({}).status, 'incomplete');
  assert.equal(RP.anchorBenefit(undefined).status, 'incomplete');
  assert.equal(RP.anchorBenefit({ tenure: 'own' }).status, 'incomplete');
});

// ── Facts used for data-nj text injection ─────────────────────

test('facts resolve to display-ready strings', () => {
  assert.equal(RP.fact('stayNJ.maxCap'), '$6,500');
  assert.equal(RP.fact('stayNJ.incomeLimit'), 'about $200,000');
  assert.equal(RP.fact('anchor.homeowner.max'), '$1,500');
  assert.equal(RP.fact('anchor.renter.senior'), '$700');
  assert.equal(RP.fact('pas1.deadline'), 'November 2, 2026');
  assert.equal(RP.fact('seniorFreeze.limit2025'), '$172,475');
});

test('unknown fact paths return null so bad markup is visible in review', () => {
  assert.equal(RP.fact('nope.nothing'), null);
});
