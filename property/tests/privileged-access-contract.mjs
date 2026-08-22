import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));

const baseline = 'property/docs/compliance/PRIVILEGED-ACCESS-BASELINE-2026-08-22.md';
const template = 'property/docs/compliance/PRIVILEGED-ACCESS-REVIEW-TEMPLATE.md';
const serviceInventory = 'property/docs/compliance/SERVICE-ROLE-PRIVILEGE-INVENTORY-2026-08-22.md';
for (const file of [baseline, template, serviceInventory]) assert.equal(exists(file), true, `Missing privileged access artifact: ${file}`);

const migration = read('supabase/migrations/20260805235900_billing_saved_views_rls.sql');
assert.match(migration, /create or replace function public\.protect_profile_entitlement_fields\(\)/i,
  'Profile entitlement protection trigger must remain defined.');
assert.match(migration, /new\.account_role is distinct from old\.account_role/i,
  'Authenticated profile updates must not be allowed to self-promote account_role.');
assert.match(migration, /new\.plan_tier is distinct from old\.plan_tier/i,
  'Authenticated profile updates must not be allowed to self-promote plan_tier.');
assert.match(migration, /create or replace function public\.is_watchdog_developer\(\)/i,
  'Server-side developer-role RPC must remain present.');
assert.match(migration, /where p\.id = auth\.uid\(\) and p\.account_role = 'developer'/i,
  'Developer role must be evaluated against the authenticated user server-side.');
assert.match(migration, /revoke all on function public\.is_watchdog_developer\(\) from public/i,
  'Developer-role function must not be executable by public/anonymous callers.');
assert.match(migration, /grant execute on function public\.is_watchdog_developer\(\) to authenticated/i,
  'Developer-role RPC should be limited to authenticated callers.');

const guard = read('property/js/access-guard.js');
assert.match(guard, /rpc\(['"]is_watchdog_developer['"]\)/,
  'Frontend access guard must use the server-side developer check.');
assert.doesNotMatch(guard, /localStorage[^\n]*(?:developer|account_role)|(?:developer|account_role)[^\n]*localStorage/i,
  'Developer authority must never be derived from localStorage.');
assert.doesNotMatch(guard, /URLSearchParams[^\n]*(?:developer|account_role)|(?:developer|account_role)[^\n]*URLSearchParams/i,
  'Developer authority must never be derived from query parameters.');

const complianceApi = read('api/compliance-log.js');
assert.match(complianceApi, /is_watchdog_developer/,
  'Developer-only compliance API must independently verify developer status server-side.');

const backoffice = read('supabase/functions/backoffice-api/index.ts');
assert.match(backoffice, /verifyDeveloperToken/,
  'Backoffice first-time setup must retain a developer-token verification path.');
assert.match(backoffice, /rpc\(["']is_watchdog_developer["']\)/,
  'Backoffice developer verification must use the server-side developer RPC.');
assert.match(backoffice, /token_hash/i,
  'Backoffice privileged sessions must retain hashed token storage semantics.');
assert.match(backoffice, /revoked_at/i,
  'Backoffice privileged sessions must retain revocation state.');
assert.match(backoffice, /12 \* 60 \* 60 \* 1000/,
  'Backoffice privileged sessions must retain a bounded expiry unless deliberately re-reviewed.');

function walk(dir) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(rel) : [rel];
  });
}
const browserAssets = [
  ...walk('property/js').filter((file) => /\.m?js$/i.test(file)),
  ...walk('property').filter((file) => /\.html$/i.test(file))
];
for (const file of browserAssets) {
  const source = read(file);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|service_role\s*[:=]\s*["'][A-Za-z0-9._-]{12,}/i,
    `Privileged service-role material/reference must not appear in browser-delivered asset: ${file}`);
}

const baselineText = read(baseline);
for (const phrase of ['No self-promotion from browser clients', 'Server-side developer evaluation', 'Service-role isolation', 'Least privilege', 'Review cadence']) {
  assert.match(baselineText, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `Privileged baseline missing governance rule: ${phrase}`);
}

const templateText = read(template);
for (const phrase of ['Human privileged access summary', 'Machine privilege summary', 'Joiner / mover / leaver check', 'Application authorization evidence', 'Residual risk']) {
  assert.match(templateText, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `Privileged review template missing: ${phrase}`);
}

const serviceInventoryText = read(serviceInventory);
for (const phrase of ['Provider-authenticated webhook', 'Authenticated end-user action', 'Developer/admin action', 'Internal scheduled/system job', 'Public ingestion with constrained privilege']) {
  assert.match(serviceInventoryText, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `Service-role inventory missing classification: ${phrase}`);
}

console.log('Watchdog privileged access contracts passed.');
