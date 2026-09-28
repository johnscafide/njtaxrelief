import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Watchdog Intelligence in plain English: the "Why Watchdog flagged this" drawer
// leads with a readable finding built only from the finding's own data, and keeps
// governed signal ids and lineage in "Technical details".
const plainSrc = fs.readFileSync('property/js/watchdog-plain-language.js', 'utf8');
const why = fs.readFileSync('property/js/watchdog-why.js', 'utf8');

const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(plainSrc, ctx);
const P = ctx.window.WatchdogPlain;
const finding = {
  score: 28, confidence: 49, evidence_coverage: 30,
  why_now: [{ signal_id: 'watchdog.tax_to_assessment_rate' }],
  evidence: [
    { signal_id: 'watchdog.source_authority_coverage', score: 100, value: 100 },
    { signal_id: 'watchdog.tax_to_assessment_rate', score: 27.8, value: 3.902 }
  ],
  missing_evidence: [{ signal_id: 'watchdog.assessment_to_sale_ratio_review_window', reason: 'guard_failed', normalization: { detail: { reason: 'Recorded sale age is missing, future-dated, or outside the current eight-year professional review window' } } }]
};
assert.equal(P.signal({ signal_id: 'watchdog.tax_to_assessment_rate', value: 3.902 }).value, 'The yearly tax bill is 3.90% of the assessed value');
const s = P.summary(finding);
assert.match(s.text, /main reason: the yearly tax bill is 3\.90% of the assessed value/, 'leads with the why_now reason, not a coverage check');
assert.doesNotMatch(s.text, /core public records/, 'record-coverage checks are never the main reason');
assert.match(s.text, /could not check assessment vs\. a recent sale/);
assert.match(s.text, /Confidence is low \(49%\), with 30% of the evidence/);
assert.match(P.missing({ signal_id: 'watchdog.assessment_to_sale_ratio_review_window', reason: 'guard_failed', normalization: { detail: { reason: 'Recorded sale age is missing, future-dated, or outside the current eight-year professional review window', guard_value: 14 } } }).reason, /about 14 years ago, older than the eight-year window/);
assert.equal(P.order(finding)[0].signal_id, 'watchdog.tax_to_assessment_rate');
assert.doesNotMatch(P.signal({ signal_id: 'watchdog.made_up_signal', value: 1 }).label, /watchdog\./, 'unknown ids still read as words');
// Every signal Intelligence emits today has a plain label.
for (const id of ['watchdog.sale_recency_confidence','watchdog.assessment_to_sale_ratio_review_window','watchdog.tax_to_assessment_rate','watchdog.source_authority_coverage','watchdog.transaction_diligence_completion','watchdog.closing_exception_priority','watchdog.due_diligence_signal_count','watchdog.permit_closure_confidence','watchdog.title_constraint_stack','watchdog.property_story_confidence','event.type_priority','event.recency','event.materiality','event.change_count_30d','watchdog.assessment_to_sale_ratio']) {
  assert.equal(P.signal({ signal_id: id }).known, true, `${id} has a plain label`);
}

assert.match(why, /The short version/);
assert.match(why, /<details class="wdwhy-tech"><summary>Technical details<\/summary>/, 'signal ids and lineage stay available, folded away');
assert.match(why, /not a valuation, legal opinion or guaranteed outcome/);

console.log('Intelligence plain-language contract passed.');
