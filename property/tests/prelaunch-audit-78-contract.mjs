#!/usr/bin/env node
import fs from 'node:fs';
const s = fs.readFileSync('property/js/lookup.js', 'utf8');
const score = fs.readFileSync('property/js/watchdog-score-public.js', 'utf8');
const failures = [];
const ok = (x, m) => { if (!x) failures.push(m); };
ok(s.includes("'/functions/v1/chapter123-provider?district=' + encodeURIComponent(code)"), 'Lookup must use statewide Chapter 123 provider by district code.');
ok(s.includes('current.certifiedRatio = certified'), 'Lookup must retain certified district ratio for statutory appeal screen.');
ok(s.includes('current.certifiedRatio || officialRatio'), 'Appeal screen must prefer statewide certified ratio over legacy static lookup.');
ok(s.includes("providerVersion: j.provider_version"), 'Provider provenance must be retained.');
ok(score.includes('record.certifiedRatio || latestOfficial(record, officialData)'), 'Canonical ROBUST score must consume the certified statewide district ratio before the legacy static table.');
ok(!s.includes('DEFAULT_APPRECIATION'), 'No hardcoded default appreciation constant may remain.');
ok(!s.includes(': 0.05;\n    var thisYear'), 'Appeal sale carry must not default to 5 percent.');
ok(s.includes("appreciationSource = (apprHint != null) ? 'verified-sr1a-trend'"), 'Appreciation must expose measured-source provenance.');
ok(s.includes("appreciationSource === 'none' ? ' — no trend adjustment because evidence was insufficient'"), 'Diagnostics must disclose no-evidence neutral fallback.');
if (failures.length) { console.error(JSON.stringify({passed:false, failures}, null, 2)); process.exit(1); }
console.log(JSON.stringify({passed:true, contract:'prelaunch-audit-7-8', checks:9}, null, 2));
