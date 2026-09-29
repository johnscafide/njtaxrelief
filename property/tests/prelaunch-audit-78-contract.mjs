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
// Since commit 95ea3788 the public adapter no longer computes the score in the browser: it renders
// the governed ROBUST-v1 observation that supabase/functions/workbench-score computes server-side.
// The audit finding therefore has to hold where the canonical score is now computed.
ok(score.includes('get_public_property_watchdog_score_details') && !/latestOfficial|officialData|equalization-ratios/.test(score), 'Public property score must render the governed server-side ROBUST observation, not a client-side static-table recomputation.');
const scorer = fs.readFileSync('supabase/functions/workbench-score/index.ts', 'utf8');
const marketValue = (scorer.match(/function marketValue\([\s\S]*?\n\}/) || [''])[0];
const certifiedAt = marketValue.search(/chapter123|certified/i);
const staticAt = marketValue.indexOf('src.equalization');
ok(marketValue && certifiedAt >= 0 && (staticAt < 0 || certifiedAt < staticAt), 'Canonical ROBUST score must consume the certified statewide district ratio before the legacy static table.');
ok(!s.includes('DEFAULT_APPRECIATION'), 'No hardcoded default appreciation constant may remain.');
ok(!s.includes(': 0.05;\n    var thisYear'), 'Appeal sale carry must not default to 5 percent.');
ok(s.includes("appreciationSource = (apprHint != null) ? 'verified-sr1a-trend'"), 'Appreciation must expose measured-source provenance.');
ok(s.includes("appreciationSource === 'none' ? ' — no trend adjustment because evidence was insufficient'"), 'Diagnostics must disclose no-evidence neutral fallback.');
if (failures.length) { console.error(JSON.stringify({passed:false, failures}, null, 2)); process.exit(1); }
console.log(JSON.stringify({passed:true, contract:'prelaunch-audit-7-8', checks:10}, null, 2));
