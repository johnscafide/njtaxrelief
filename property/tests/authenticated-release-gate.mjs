#!/usr/bin/env node
/* Remote authenticated authorization gate. Run only against a non-production Supabase project. */
const url = (process.env.STAGING_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.STAGING_SUPABASE_PUBLISHABLE_KEY || '';
if (!url || !key) throw new Error('STAGING_SUPABASE_URL and STAGING_SUPABASE_PUBLISHABLE_KEY are required.');
if (/uvkvaxljhhngydvlrzom/i.test(url) && process.env.ALLOW_PRODUCTION_AUTH_GATE !== 'true') {
  throw new Error('Refusing to run authenticated mutation tests against production.');
}
const roles = ['standard', 'pro', 'pro_plus', 'developer'];
const creds = Object.fromEntries(roles.map((role) => [role, {
  email: process.env[`WATCHDOG_TEST_${role.toUpperCase()}_EMAIL`],
  password: process.env[`WATCHDOG_TEST_${role.toUpperCase()}_PASSWORD`]
}]));
for (const [role, value] of Object.entries(creds)) if (!value.email || !value.password) throw new Error(`Missing staging credentials for ${role}.`);

async function request(path, options = {}) {
  const response = await fetch(url + path, { ...options, headers: { apikey: key, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const text = await response.text();
  let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}
async function signIn({ email, password }) {
  const { response, body } = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (!response.ok || !body.access_token) throw new Error(`Could not sign in ${email}: ${body?.msg || body?.error_description || response.status}`);
  return body.access_token;
}
async function rpc(token, name, body = {}) {
  return request(`/rest/v1/rpc/${name}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
}
const tokens = {};
for (const role of roles) tokens[role] = await signIn(creds[role]);
const expected = { standard: 'standard', pro: 'pro', pro_plus: 'pro_plus', developer: 'pro_plus' };
for (const role of roles) {
  const entitlement = await rpc(tokens[role], 'get_my_entitlement');
  if (!entitlement.response.ok || entitlement.body?.[0]?.plan_tier !== expected[role]) throw new Error(`${role} entitlement mismatch: ${JSON.stringify(entitlement.body)}`);
  const developer = await rpc(tokens[role], 'is_watchdog_developer');
  if (!developer.response.ok || Boolean(developer.body) !== (role === 'developer')) throw new Error(`${role} developer boundary failed.`);
}

// RLS plan gate: Standard cannot persist Data Center views; Pro+ can.
async function insertView(role) {
  return request('/rest/v1/saved_data_center_views?select=id', { method: 'POST', headers: { Authorization: `Bearer ${tokens[role]}`, Prefer: 'return=representation' }, body: JSON.stringify({ name: `release-gate-${Date.now()}`, scope: 'property', marker_ids: [] }) });
}
const denied = await insertView('standard');
if (denied.response.ok) throw new Error('Standard unexpectedly created a Pro+ Data Center view.');
const allowed = await insertView('pro_plus');
if (!allowed.response.ok || !allowed.body?.[0]?.id) throw new Error(`Pro+ Data Center write failed: ${JSON.stringify(allowed.body)}`);
await request(`/rest/v1/saved_data_center_views?id=eq.${allowed.body[0].id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tokens.pro_plus}` } });

console.log('Authenticated release gate passed: plan entitlements, developer boundary and Pro+ RLS write.');
