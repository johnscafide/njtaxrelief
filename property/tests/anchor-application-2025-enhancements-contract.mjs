import fs from 'node:fs';
import assert from 'node:assert/strict';

const enhancements = fs.readFileSync('property/js/anchor-application-2025-enhancements.js','utf8');
const enhancementCopy = fs.readFileSync('property/partials/anchor-application-2025-enhancements.html','utf8');
const guard = fs.readFileSync('property/js/anchor-application-2025-guard.js','utf8');
const profileVault = fs.readFileSync('supabase/migrations/20260903143000_anchor_relief_profile_vault_v1.sql','utf8');
const profileSync = fs.readFileSync('supabase/migrations/20260903144500_anchor_relief_profile_source_sync_v1.sql','utf8');

assert.match(enhancementCopy,/Watchdog will determine whether the 2025 ANC-1 or PAS-1 applies/);
assert.match(enhancementCopy,/data-readiness/);
assert.match(enhancementCopy,/Official PDF preview/);
assert.match(enhancementCopy,/Property Relief Profile/);
assert.match(enhancements,/anchor-application-2025-enhancements\.html/);
assert.match(enhancements,/boxes\.some\(function\(box\)\{return!box\.checked;\}\)/);
assert.match(enhancements,/WatchdogAnchorPdf2025\.generate\(collectState\(\)\)/);
assert.match(enhancements,/URL\.createObjectURL/);
assert.doesNotMatch(enhancements,/Watchdog will determine whether/);
assert.doesNotMatch(enhancements,/Social Security number\(s\)/);
assert.doesNotMatch(enhancements,/localStorage/);
assert.doesNotMatch(enhancements,/console\.(?:log|info|debug)\s*\(/);
assert.match(guard,/anchor-application-2025-enhancements\.js/);

assert.match(profileVault,/create table if not exists public\.anchor_relief_profiles/);
assert.match(profileVault,/enable row level security/);
assert.match(profileVault,/revoke all on table public\.anchor_relief_profiles from anon/);
assert.match(profileVault,/AES-256-GCM/);
assert.match(profileSync,/source_application_id/);
assert.match(profileSync,/sync_anchor_relief_profile_from_application/);
assert.match(profileSync,/new\.answers_ciphertext_b64/);
assert.match(profileSync,/after insert or update/);
assert.doesNotMatch(profileSync,/ssn|social_security|gross_income/i);

console.log('ANCHOR 2025 live preview and reusable profile contract passed');
