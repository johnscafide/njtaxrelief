#!/usr/bin/env node
/* Remote Developer-role authorization gate. Run only against non-production Supabase. */
import { writeFile } from 'node:fs/promises';

const url = (process.env.STAGING_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.STAGING_SUPABASE_PUBLISHABLE_KEY || '';
const email = process.env.WATCHDOG_TEST_DEVELOPER_EMAIL || '';
const password = process.env.WATCHDOG_TEST_DEVELOPER_PASSWORD || '';
const evidencePath = process.env.RELEASE_GATE_EVIDENCE_PATH || 'developer-release-gate-evidence.json';

if (!url || !key) throw new Error('STAGING_SUPABASE_URL and STAGING_SUPABASE_PUBLISHABLE_KEY are required.');
if (!email || !password) throw new Error('WATCHDOG_TEST_DEVELOPER_EMAIL and WATCHDOG_TEST_DEVELOPER_PASSWORD are required.');
if (/uvkvaxljhhngydvlrzom/i.test(url) && process.env.ALLOW_PRODUCTION_AUTH_GATE !== 'true') {
  throw new Error('Refusing to run Developer mutation tests against production.');
}

const evidence = {
  release_version: process.env.RELEASE_VERSION || process.env.GITHUB_SHA || 'unknown',
  environment: 'staging',
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

async function rpc(token, name, body = {}) {
  return request(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
}

const signIn = await request('/auth/v1/token?grant_type=password', {
  method: 'POST',
  body: JSON.stringify({ email, password })
});
if (!signIn.response.ok || !signIn.body?.access_token) {
  throw new Error(`Could not sign in staging Developer account: ${signIn.body?.msg || signIn.body?.error_description || signIn.response.status}`);
}
const token = signIn.body.access_token;

const entitlement = await rpc(token, 'get_my_entitlement');
const row = entitlement.body?.[0];
if (!entitlement.response.ok || row?.plan_tier !== 'pro_plus' || row?.subscription_status !== 'active' || row?.account_role !== 'developer') {
  throw new Error(`Developer entitlement mismatch: ${JSON.stringify(entitlement.body)}`);
}

const developer = await rpc(token, 'is_watchdog_developer');
if (!developer.response.ok || Boolean(developer.body) !== true) {
  throw new Error(`Developer boundary failed: ${developer.response.status} ${JSON.stringify(developer.body)}`);
}

const createView = await request('/rest/v1/saved_data_center_views?select=id', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    Prefer: 'return=representation'
  },
  body: JSON.stringify({
    name: `release-gate-developer-${Date.now()}`,
    scope: 'property',
    marker_ids: []
  })
});
if (!createView.response.ok || !createView.body?.[0]?.id) {
  throw new Error(`Developer Pro+ RLS write failed: ${JSON.stringify(createView.body)}`);
}

const createdId = createView.body[0].id;
const cleanup = await request(`/rest/v1/saved_data_center_views?id=eq.${createdId}`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${token}` }
});
if (!cleanup.response.ok) {
  throw new Error(`Developer test-row cleanup failed: ${cleanup.response.status} ${JSON.stringify(cleanup.body)}`);
}

evidence.role_results.developer = {
  entitlement: 'pro_plus',
  subscription_status: 'active',
  developer: true,
  pro_plus_write: 'allowed',
  cleanup: 'passed'
};
evidence.passed = true;
evidence.completed_at = new Date().toISOString();

await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
console.log('Developer release gate passed: Developer identity, entitlement bypass and Pro+ RLS boundary verified.');
console.log(`Sanitized evidence written to ${evidencePath}.`);
