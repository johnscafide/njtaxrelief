import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
const page = read('property/anchor/application/2025/index.html');
const js = read('property/js/anchor-application-easy-mode.js');
const css = read('property/css/anchor-application-easy-mode.css');
const lifecycle = read('property/js/anchor-application-lifecycle.js');
const migration = read('supabase/migrations/20260929230000_anchor_funnel_easy_mode_events.sql');

// Loaded on the application page, after the core app and its validation guard.
assert.match(page, /\/property\/css\/anchor-application-easy-mode\.css/);
const guardAt = page.indexOf('/property/js/anchor-application-2025-guard.js');
const easyAt = page.indexOf('/property/js/anchor-application-easy-mode.js');
assert.ok(guardAt > 0 && easyAt > guardAt, 'Easy mode loads after the application guard');

// Presentation layer only: it hands off to the step's own Continue and never saves or generates.
assert.match(js, /native\.click\(\)/);
assert.doesNotMatch(js, /saveApplication|WatchdogAnchorPdf2025\.generate|answers_ciphertext/);
assert.doesNotMatch(js, /native\.disabled\s*=\s*false/, 'never bypasses a disabled Continue button');

// The mode is a per-device preference; storage access is guarded.
assert.match(js, /wd_anchor_2025_mode/);
assert.match(js, /try \{ return window\[store\]\.getItem\(key\) \|\| ''; \} catch/);
assert.match(js, /try \{ window\[store\]\.setItem\(key, value\); \} catch/);

// Accessible controls and motion.
assert.match(js, /setAttribute\('role', 'switch'\)/);
assert.match(js, /aria-checked/);
assert.match(js, /createElement\('fieldset'|el\('fieldset'/);
assert.match(js, /prefers-reduced-motion: reduce/);
assert.match(css, /prefers-reduced-motion: no-preference/);

// Plain-language help for the steps where people stop.
for (const step of ['profile', 'address', 'ssn', 'housing', "'pas-history'", 'property', "'pas-income'", 'finish']) {
  assert.match(js, new RegExp(`\\n    ${step}: \\[`), `Easy mode questions for ${step}`);
}
assert.match(js, /Why we ask/);
assert.match(js, /Where to find it/);
assert.match(js, /Find code from address/);
assert.match(js, /Look up with Watchdog/);
assert.match(js, /box 5 of your SSA-1099/);

// Per-question checks mirror the application guard so problems surface on the right question.
for (const rule of ["'property.block', 'property.lot'", "'property.tax_2024', 'property.tax_2025'", "'income_2024.e', 'income_2025.e'", 'pas.schedule1.home2.start_date', 'oct1.municipality_code', 'preparer.firm_ein']) {
  assert.ok(js.includes(rule), `Easy mode checks ${rule}`);
}

// Validation messages are repeated beside the buttons, and a new step starts without errors.
assert.match(js, /wd-easy-step-error/);
assert.match(lifecycle, /var from=activeId\(\);.*setTimeout\(function\(\)\{if\(activeId\(\)===from\)validateActive\(\)\},10\)/);

// Every funnel event the page sends is allowed by the migration, in both the check and the function.
const events = ['easy_mode_used', 'standard_mode_used', 'easy_mode_nudge_shown', 'easy_mode_nudge_accepted'];
for (const e of events) assert.ok(js.includes(`'${e}'`), `page sends ${e}`);
const steps = [...js.matchAll(/\n    '?([a-z-]+)'?: \[/g)].map((m) => m[1]).concat(['complete']);
for (const id of steps) events.push('step_' + id.replace(/-/g, '_'));
for (const e of events) {
  const count = migration.split(`'${e}'`).length - 1;
  assert.equal(count, 2, `migration allows ${e} in the table check and the function`);
}
for (const old of ['application_started', 'progress_three_quarters', 'monitoring_enabled']) {
  assert.equal(migration.split(`'${old}'`).length - 1, 2, `migration keeps ${old}`);
}

console.log('ANCHOR 2025 Easy mode contract passed.');
