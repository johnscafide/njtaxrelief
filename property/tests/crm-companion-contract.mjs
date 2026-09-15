#!/usr/bin/env node
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('browser-extension/watchdog-crm-companion/manifest.json'));
const popup = read('browser-extension/watchdog-crm-companion/popup.js');
const content = read('browser-extension/watchdog-crm-companion/content.js');
const connect = read('agent/extension/connect/index.html');
const api = read('supabase/functions/watchdog-crm-companion/index.ts');
const analyticsApi = read('supabase/functions/watchdog-crm-companion-analytics/index.ts');
const analyticsPage = read('property/backoffice/crm-companion/index.html');
const migrationPair = read('supabase/migrations/20260915182601_njw_347_extension_pairings.sql');
const migrationSessions = read('supabase/migrations/20260915182606_njw_347_extension_sessions.sql');
const migrationEvents = read('supabase/migrations/20260915182612_njw_347_extension_analytics.sql');

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

assert(manifest.manifest_version === 3, 'CRM Companion must remain Manifest V3.');
assert(Array.isArray(manifest.permissions) && manifest.permissions.includes('storage') && manifest.permissions.includes('activeTab'), 'CRM Companion must keep its explicit storage + activeTab permission model.');
assert(!manifest.permissions.includes('tabs') && !manifest.permissions.includes('scripting') && !manifest.permissions.includes('webRequest'), 'CRM Companion must not widen to tabs/scripting/webRequest permissions without review.');
assert((manifest.host_permissions || []).some((x) => x === 'https://app.boldtrail.com/*'), 'BoldTrail must be the only CRM page origin in the first adapter.');
assert((manifest.content_scripts || []).some((x) => (x.matches || []).includes('https://app.boldtrail.com/*')), 'BoldTrail content script contract is missing.');

for (const forbidden of ['SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_', 'service_role']) {
  assert(!popup.includes(forbidden) && !content.includes(forbidden), `Browser extension must not contain ${forbidden}.`);
}
assert(popup.includes('/agent/extension/connect/'), 'Extension must pair through the Watchdog connect page.');
assert(popup.includes("chrome.storage.local"), 'Opaque extension session must remain local to extension storage.');
assert(connect.includes('data-access-require="agent"'), 'Watchdog connection page must require Agent-or-higher access.');

for (const plan of ['agent', 'pro', 'pro_plus', 'teams', 'developer']) {
  assert(api.includes(`"${plan}"`), `Server paid-plan allowlist is missing ${plan}.`);
}
assert(api.includes('PAID_STATUSES') && api.includes('subscription_status'), 'Extension API must recheck current paid entitlement server-side.');
assert(api.includes('challenge_sha256') && api.includes('token_hash'), 'Extension pairing/session secrets must be persisted only as hashes.');
assert(api.includes('30*24*60*60*1000') || api.includes('30 * 24 * 60 * 60 * 1000'), 'Extension session expiry must remain bounded to 30 days.');
assert(api.includes('watchdog_extension_events'), 'Extension API must keep first-party usage analytics.');
assert(api.includes('SAFE_META_KEYS'), 'Extension analytics metadata must remain allowlisted.');
assert(!api.includes('contact_name') && !api.includes('contact_email') && !api.includes('contact_phone'), 'Server telemetry must not add CRM identity fields.');
assert(api.includes('NJ Office of GIS statewide Parcels and MOD-IV Composite'), 'Uncached NJ property matching must retain the official statewide parcel/MOD-IV fallback.');
assert(api.includes('lookup_ambiguous') && api.includes('lookup_no_match'), 'Property resolution must preserve fail-closed ambiguous/no-match outcomes.');

assert(!/read\(\s*\[\s*['"](?:email|phone|name)/i.test(content), 'BoldTrail adapter must not read contact name/email/phone fields.');
assert(content.includes('WATCHDOG VERIFIED PROPERTY'), 'CRM write must preserve a visibly sourced Watchdog note.');
assert(content.includes("if(current&&current!==value){skipped.push"), 'CRM custom-field writes must refuse non-empty conflicting values.');
assert(content.includes("WATCHDOG_APPLY_PROPERTY"), 'CRM mutation must remain behind the explicit popup apply message.');

for (const sql of [migrationPair, migrationSessions, migrationEvents]) {
  assert(/enable row level security/i.test(sql), 'Every CRM Companion persistence table must keep RLS enabled.');
}
assert(analyticsPage.includes('data-access-require="developer"'), 'Raw aggregate extension analytics UI must remain developer-only.');
assert(analyticsApi.includes('account_role') && analyticsApi.includes('developer_required'), 'Analytics API must independently verify developer role.');

if (failures.length) {
  console.error(JSON.stringify({ passed: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  passed: true,
  contract: 'watchdog-crm-companion-v1',
  checks: 27,
  privacy: 'no-contact-identity-telemetry',
  entitlement: 'agent-or-higher-paid'
}, null, 2));
