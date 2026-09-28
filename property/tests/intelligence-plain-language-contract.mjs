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

// Professional brief: server-loaded finding, template always, AI only as a grounded rewrite.
const brief = fs.readFileSync('supabase/functions/intelligence-brief/index.ts', 'utf8');
assert.match(brief, /\.from\("intelligence_findings"\)[^;]*\.eq\("user_id", user\.id\)\.eq\("pams_pin", pin\)/, 'the brief loads the caller\'s own finding server-side');
assert.match(brief, /const template = templateBrief\(f\);/);
assert.match(brief, /numbersIn\(candidate\)\.every\(\(n\) => allowed\.has\(n\)\)/, 'every AI number must already be a verified fact');
assert.match(brief, /should appeal/, 'advice and outcome language is rejected');
assert.match(brief, /const brief = useAi \? ai\.text! : template;/, 'falls back to the template brief');
assert.match(why, /loadBrief\(sb,pin\)/);

// The Intelligence chat sends the properties it is asked about (selected one, or the user's saved properties).
const consoleJs = fs.readFileSync('property/js/intelligence-console.js', 'utf8');
assert.match(consoleJs, /var pins=requestedPin\?\[requestedPin\]:await savedPins\(\);/);
assert.match(consoleJs, /WatchdogContextualAnalyst\.open\(\{surface:'intelligence_console',pams_pins:pins,/, 'pins go where the analyst panel reads them');

// Zero-padded saved PINs resolve to the short form Watchdog records use.
const analystJs = fs.readFileSync('property/js/watchdog-contextual-analyst.js', 'utf8');
for (const src of [why, analystJs]) {
  const fn = src.match(/function canonicalPin[\s\S]*?\n}\n/)[0];
  const c = {}; vm.createContext(c); vm.runInContext(fn, c);
  assert.equal(c.canonicalPin('0904_00009_00020'), '0904_9_20');
  assert.equal(c.canonicalPin('0818_018.02_2_C0105'), '0818_18.02_2_C0105');
  assert.equal(c.canonicalPin('0508_70.03_19_C2'), '0508_70.03_19_C2');
}
assert.match(why, /pin=canonicalPin\(await resolvePin\(sb,pin,address\)\);/);
assert.match(analystJs, /options\.pams_pins:\[\]\)\.map\(canonicalPin\)/);
// Errors read in plain words, never "non-2xx".
assert.match(why, /does not have enough public records for this property/);
assert.doesNotMatch(why, /r\.error\?\.message\|\|/);

console.log('Intelligence plain-language contract passed.');
