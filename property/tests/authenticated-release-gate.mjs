#!/usr/bin/env node
/* Remote authenticated authorization gate. Run only against a non-production Supabase project. */
import { writeFile } from 'node:fs/promises';

const url = (process.env.STAGING_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.STAGING_SUPABASE_PUBLISHABLE_KEY || '';
const evidencePath = process.env.RELEASE_GATE_EVIDENCE_PATH || 'release-gate-evidence.json';
if (!url || !key) throw new Error('STAGING_SUPABASE_URL and STAGING_SUPABASE_PUBLISHABLE_KEY are required.');
if (/uvkvaxljhhngydvlrzom/i.test(url) && process.env.ALLOW_PRODUCTION_AUTH_GATE !== 'true') {
  throw new Error('Refusing to run authenticated mutation tests against production.');
}

const roles = ['standard', 'pro', 'pro_plus'];
const creds = Object.fromEntries(roles.map((role) => [role, {
  email: process.env[`WATCHDOG_TEST_${role.toUpperCase()}_EMAIL`],
  password: process.env[`WATCHDOG_TEST_${role.toUpperCase()}_PASSWORD`]
}]));
for (const [role, value] of Object.entries(creds)) {
  if (!value.email || !value.password) throw new Error(`Missing staging credentials for ${role}.`);
}

const evidence = {
  release_version: process.env.RELEASE_VERSION || process.env.GITHUB_SHA || 'unknown',
  environment: 'staging',
  provider_mode: 'sandbox',
  project_host: new URL(url).host,
  checked_at: new Date().toISOString(),
  role_results: {},
  passed: false
};

async function request(path, options = {}) {
  const response = await fetch(url + path, {
    ...options,
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

async function signIn({ email, password }) {
  const { response, body } = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  if (!response.ok || !body.access_token) {
    throw new Error(`Could not sign in staging ${email}: ${body?.msg || body?.error_description || response.status}`);
  }
  return body.access_token;
}

async function rpc(token, name, body = {}) {
  return request(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body)
  });
}

// Anonymous is part of the release contract. Entitlement RPC access and paid writes must remain unavailable.
const anonymousEntitlement = await rpc(null, 'get_my_entitlement');
const anonymousEntitlementDenied = [401, 403].includes(anonymousEntitlement.response.status) ||
  (anonymousEntitlement.response.ok && (anonymousEntitlement.body == null || (Array.isArray(anonymousEntitlement.body) && anonymousEntitlement.body.length === 0)));
if (!anonymousEntitlementDenied) {
  throw new Error(`Anonymous entitlement boundary failed: ${anonymousEntitlement.response.status} ${JSON.stringify(anonymousEntitlement.body)}`);
}
const anonymousWrite = await request('/rest/v1/saved_data_center_views?select=id', {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify({ name: `release-gate-anon-${Date.now()}`, scope: 'property', marker_ids: [] })
});
if (anonymousWrite.response.ok) throw new Error('Anonymous unexpectedly created a Pro+ Data Center view.');
evidence.role_results.anonymous = {
  entitlement_rpc: 'denied',
  pro_plus_write: 'denied'
};

const tokens = {};
for (const role of roles) tokens[role] = await signIn(creds[role]);

const expected = { standard: 'standard', pro: 'pro', pro_plus: 'pro_plus' };
for (const role of roles) {
  const entitlement = await rpc(tokens[role], 'get_my_entitlement');
  if (!entitlement.response.ok || entitlement.body?.[0]?.plan_tier !== expected[role]) {
    throw new Error(`${role} entitlement mismatch: ${JSON.stringify(entitlement.body)}`);
  }
  const developer = await rpc(tokens[role], 'is_watchdog_developer');
  if (!developer.response.ok || Boolean(developer.body) !== false) {
    throw new Error(`${role} unexpectedly crossed the developer boundary.`);
  }
  evidence.role_results[role] = {
    entitlement: expected[role],
    developer: false
  };
}

async function insertView(role) {
  return request('/rest/v1/saved_data_center_views?select=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens[role]}`,
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ name: `release-gate-${role}-${Date.now()}`, scope: 'property', marker_ids: [] })
  });
}

for (const role of ['standard', 'pro']) {
  const denied = await insertView(role);
  if (denied.response.ok) throw new Error(`${role} unexpectedly created a Pro+ Data Center view.`);
  evidence.role_results[role].pro_plus_write = 'denied';
}

const allowed = await insertView('pro_plus');
if (!allowed.response.ok || !allowed.body?.[0]?.id) {
  throw new Error(`Pro+ Data Center write failed: ${JSON.stringify(allowed.body)}`);
}
await request(`/rest/v1/saved_data_center_views?id=eq.${allowed.body[0].id}`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${tokens.pro_plus}` }
});
evidence.role_results.pro_plus.pro_plus_write = 'allowed';
evidence.passed = true;
evidence.completed_at = new Date().toISOString();

await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
console.log('Authenticated release gate passed: anonymous, Standard, Pro and Pro+ boundaries.');
console.log(`Sanitized evidence written to ${evidencePath}.`);
