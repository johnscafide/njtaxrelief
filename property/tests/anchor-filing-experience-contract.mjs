import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(p, 'utf8');
const core = read('property/js/anchor-application-2025.js');
const social = read('property/js/anchor-application-social-link.js');
const growth = read('property/js/anchor-application-2025-growth.js');
const experience = read('property/js/anchor-application-experience.js');
const helpRuntime = read('property/js/anchor-application-help-runtime.js');
const partial = read('property/partials/anchor-application-experience.html');
const css = read('property/css/anchor-application-experience.css');
const libraryPage = read('property/anchor/applications/index.html');
const libraryJs = read('property/js/anchor-applications-filing.js');
const libraryPartial = read('property/partials/anchor-applications-filing.html');
const migration = read('supabase/migrations/20260912162000_anchor_filing_workflow_v1.sql');

assert.match(core, /WatchdogAnchorApplication/);
assert.match(core, /watchdog:anchor-save/);
assert.match(core, /watchdog:anchor-step/);
assert.match(core, /saveNow:function\(\)\{return saveDraft\(true\)\}/);
assert.match(core, /wd_anchor_resume_step/);
assert.match(partial, /Save &amp; Exit/);
assert.match(partial, /Saved securely/);

assert.match(social, /wd_anchor_resume_step/);
assert.match(social, /returnUrl\.searchParams\.set\('application',applicationId\)/);
assert.match(social, /linkIdentity/);

assert.match(growth, /anchor-application-experience\.js/);
assert.match(growth, /anchor-application-help-runtime\.js/);
assert.match(helpRuntime, /data-anchor-help-step/);
assert.match(helpRuntime, /stopImmediatePropagation/);

assert.match(partial, /FILING CENTER/);
assert.match(partial, /Watchdog has not submitted this application to the State of New Jersey/);
assert.match(partial, /Sign where required/);
assert.match(partial, /Mark your filing status/);
assert.match(partial, /14 days before/);
assert.match(partial, /Why are you asking this\?/);
assert.match(partial, /PRE-FILING CHECK/);
assert.match(partial, /Reuse basic information from your prior application/);
assert.match(partial, /Income, disability answers, tax amounts and filing status are never carried forward automatically/);
assert.doesNotMatch(partial, /2026-11-02/);

assert.match(experience, /get_my_anchor_filing_workflow/);
assert.match(experience, /set_my_anchor_filing_workflow/);
assert.match(experience, /acknowledge_my_anchor_deadline_reminder/);
assert.match(experience, /data-anchor-reminder-alert/);
assert.match(experience, /wd-anchor-inline-error/);
assert.match(experience, /data-anchor-return-review/);

const reuseStart = experience.indexOf("var names=['applicant.first'");
assert.ok(reuseStart >= 0, 'reuse allowlist must be explicit');
const reuseSlice = experience.slice(reuseStart, reuseStart + 900);
assert.match(reuseSlice, /property\.qualifier/);
assert.doesNotMatch(reuseSlice, /ssn|income_|gross_income|disability|ssd_|railroad|tax_paid|filing_status/i);

assert.match(libraryPage, /anchor-applications-filing\.js/);
assert.match(libraryJs, /get_my_anchor_filing_workflows/);
assert.match(libraryJs, /set_my_anchor_filing_workflow/);
assert.match(libraryPartial, /Manage filing/);
assert.match(libraryPartial, /Watchdog deadline reminders/);

assert.match(migration, /create table if not exists public\.anchor_filing_deadlines/);
assert.match(migration, /create table if not exists public\.anchor_application_workflows/);
assert.match(migration, /date '2026-11-02'/);
assert.match(migration, /https:\/\/www\.nj\.gov\/treasury\/taxation\/anchor\//);
assert.match(migration, /source_checked_at/);
assert.match(migration, /reminder_offsets <@ array\[1,7,14\]/);
assert.match(migration, /enable row level security/);
assert.match(migration, /get_my_anchor_filing_workflow/);
assert.match(migration, /set_my_anchor_filing_workflow/);
assert.doesNotMatch(migration, /ssn|gross_income|disability|recovery_key|pdf_contents/i);

assert.match(css, /\.wd-anchor-filing-center/);
assert.match(css, /\.wd-anchor-help-drawer/);
assert.match(css, /@media\(max-width:640px\)/);

console.log('NJW-332 ANCHOR filing experience contract passed');
