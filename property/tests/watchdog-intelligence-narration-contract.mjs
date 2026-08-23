#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const narration = require('../js/watchdog-intelligence-narration.js');

const brief = {
  conclusion: 'CONCLUSION_SENTINEL: assessment movement deserves review.',
  evidence: [
    'EVIDENCE_ONE: assessment changed materially.',
    'EVIDENCE_TWO: tax burden moved with the assessment.',
    'EVIDENCE_THREE: comparable evidence remains relevant.',
    'EVIDENCE_FOUR: current record supports the finding.',
    'EVIDENCE_FIVE: lower-priority evidence should not enter the quick brief.',
  ],
  missing_evidence: [
    'MISSING_ONE: a newer municipal record is not yet present.',
    'MISSING_TWO: one corroborating source is unavailable.',
  ],
  caveats: [
    'CAVEAT_ONE: this is derived intelligence, not a municipal determination.',
    'CAVEAT_TWO: evidence can change as sources refresh.',
  ],
  sources: [
    { label: 'SOURCE_ONE: municipal assessment record', url: 'https://example.com/one' },
    { label: 'SOURCE_TWO: Watchdog governed source record', url: 'https://example.com/two' },
  ],
};

assert.equal(narration.VERSION, 'watchdog-narration-vnext-1');
assert.deepEqual(narration.FORMAT_ORDER, ['quick', 'professional', 'evidence', 'changes']);
for (const key of narration.FORMAT_ORDER) assert.ok(narration.FORMATS[key], `Missing narration format: ${key}`);

const quick = narration.formatBrief(brief, 'quick');
assert.equal(quick.format, 'quick');
assert.equal(quick.source, 'rendered_governed_analyst_response');
assert.match(quick.text, /CONCLUSION_SENTINEL/);
assert.match(quick.text, /EVIDENCE_ONE/);
assert.match(quick.text, /EVIDENCE_TWO/);
assert.doesNotMatch(quick.text, /EVIDENCE_THREE/);
assert.match(quick.text, /CAVEAT_ONE/);
assert.ok(quick.text.length <= narration.FORMATS.quick.maxChars);

const professional = narration.formatBrief(brief, 'professional');
assert.equal(professional.format, 'professional');
assert.match(professional.text, /EVIDENCE_FOUR/);
assert.match(professional.text, /MISSING_ONE/);
assert.match(professional.text, /MISSING_TWO/);
assert.match(professional.text, /CAVEAT_TWO/);
assert.ok(professional.text.length <= narration.FORMATS.professional.maxChars);

const evidence = narration.formatBrief(brief, 'evidence');
assert.equal(evidence.format, 'evidence');
assert.match(evidence.text, /SOURCE_ONE/);
assert.match(evidence.text, /SOURCE_TWO/);
assert.match(evidence.text, /MISSING_ONE/);
assert.match(evidence.text, /CAVEAT_ONE/);
assert.ok(evidence.text.length <= narration.FORMATS.evidence.maxChars);

const changes = narration.formatBrief(brief, 'changes');
assert.equal(changes.format, 'changes');
assert.match(changes.text, /CONCLUSION_SENTINEL/);
assert.match(changes.text, /EVIDENCE_THREE/);
assert.match(changes.text, /MISSING_ONE/);
assert.ok(changes.text.length <= narration.FORMATS.changes.maxChars);

for (const rendered of [quick, professional, evidence, changes]) {
  assert.doesNotMatch(rendered.text, /INVENTED_FACT_SENTINEL/);
  assert.equal(rendered.version, narration.VERSION);
}

assert.throws(() => narration.formatBrief({ evidence: ['no conclusion'] }, 'quick'), /governed Watchdog written response/i);
assert.equal(narration.defaultFormat({ tool: 'inspect_lineage', prompt: 'show source lineage' }), 'evidence');
assert.equal(narration.defaultFormat({ surface: 'daily', prompt: 'what changed today?' }), 'changes');
assert.equal(narration.defaultFormat({ surface: 'dashboard', prompt: 'summarize this' }), 'quick');

console.log(JSON.stringify({
  passed: true,
  contract: narration.VERSION,
  formats: narration.FORMAT_ORDER,
  deterministic_source: 'rendered_governed_analyst_response',
  raw_audio_required: false,
  model_call_required: false,
}, null, 2));
