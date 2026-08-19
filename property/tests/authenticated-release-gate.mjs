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

// Agent and Teams intentionally reuse the hosted Standard staging identity. A
// staging-only, UID-allowlisted RPC changes only its entitlement rows, and this
// test restores that identity to Standard in a finally block. No production
// helper exists and no permanent Agent/Teams credentials are required.
const credentialRoles = ['standard', 'pro', 'pro_plus'];
const creds = Object.fromEntries(credentialRoles.map((role) => [role, {
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

function bearer(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function setHostedStandardPlan(token, plan) {
  const changed = await rpc(token, 'staging_set_release_test_plan', { target_plan: plan });
  if (!changed.response.ok || changed.body !== plan) {
    throw new Error(`Could not switch hosted staging identity to ${plan}: ${JSON.stringify(changed.body)}`);
  }
}

const commercialOrder = ['standard', 'agent', 'pro', 'pro_plus', 'teams'];
async function assertTier(role, token) {
  const entitlement = await rpc(token, 'get_my_entitlement');
  if (!entitlement.response.ok || entitlement.body?.[0]?.plan_tier !== role) {
    throw new Error(`${role} entitlement mismatch: ${JSON.stringify(entitlement.body)}`);
  }

  const developer = await rpc(token, 'is_watchdog_developer');
  if (!developer.response.ok || Boolean(developer.body) !== false) {
    throw new Error(`${role} unexpectedly crossed the developer boundary.`);
  }

  const index = commercialOrder.indexOf(role);
  const planChecks = {};
  for (let i = 0; i < commercialOrder.length; i += 1) {
    const required = commercialOrder[i];
    const result = await rpc(token, 'has_watchdog_plan', { required_plan: required });
    const expected = i <= index;
    if (!result.response.ok || Boolean(result.body) !== expected) {
      throw new Error(`${role} → ${required} plan boundary mismatch: ${JSON.stringify(result.body)}`);
    }
    planChecks[required] = expected ? 'allowed' : 'denied';
  }

  evidence.role_results[role] = {
    entitlement: role,
    developer: false,
    plan_checks: planChecks
  };
}

async function insertDataWorkbenchView(token, role) {
  return request('/rest/v1/data_workbench_views?select=id', {
    method: 'POST',
    headers: bearer(token, { Prefer: 'return=representation' }),
    body: JSON.stringify({
      name: `release-gate-workbench-${role}-${Date.now()}`,
      source_type: 'saved',
      marker_ids: [],
      filters: {},
      sort_config: {}
    })
  });
}

async function deleteDataWorkbenchView(token, id) {
  return request(`/rest/v1/data_workbench_views?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: bearer(token)
  });
}

async function insertDataCenterView(token, role) {
  return request('/rest/v1/saved_data_center_views?select=id', {
    method: 'POST',
    headers: bearer(token, { Prefer: 'return=representation' }),
    body: JSON.stringify({ name: `release-gate-datacenter-${role}-${Date.now()}`, scope: 'property', marker_ids: [] })
  });
}

async function deleteDataCenterView(token, id) {
  return request(`/rest/v1/saved_data_center_views?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: bearer(token)
  });
}

async function insertOrganization(token, role) {
  return request('/rest/v1/watchdog_organizations?select=id', {
    method: 'POST',
    headers: bearer(token, { Prefer: 'return=representation' }),
    body: JSON.stringify({ name: `release-gate-team-${role}-${Date.now()}` })
  });
}

async function deleteOrganization(token, id) {
  return request(`/rest/v1/watchdog_organizations?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: bearer(token)
  });
}

async function expectDenied(result, message) {
  if (result.response.ok) throw new Error(message);
}

async function expectCreated(result, message) {
  if (!result.response.ok || !result.body?.[0]?.id) {
    throw new Error(`${message}: ${JSON.stringify(result.body)}`);
  }
  return result.body[0].id;
}

// Anonymous is part of the release contract. Entitlement RPC access and paid
// writes must remain unavailable.
const anonymousEntitlement = await rpc(null, 'get_my_entitlement');
const anonymousEntitlementDenied = [401, 403].includes(anonymousEntitlement.response.status) ||
  (anonymousEntitlement.response.ok && (anonymousEntitlement.body == null || (Array.isArray(anonymousEntitlement.body) && anonymousEntitlement.body.length === 0)));
if (!anonymousEntitlementDenied) {
  throw new Error(`Anonymous entitlement boundary failed: ${anonymousEntitlement.response.status} ${JSON.stringify(anonymousEntitlement.body)}`);
}
const anonymousWrite = await request('/rest/v1/data_workbench_views?select=id', {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify({ name: `release-gate-anon-${Date.now()}`, source_type: 'saved', marker_ids: [] })
});
if (anonymousWrite.response.ok) throw new Error('Anonymous unexpectedly created an Agent Data Workbench view.');
evidence.role_results.anonymous = { entitlement_rpc: 'denied', agent_write: 'denied' };

const tokens = {};
for (const role of credentialRoles) tokens[role] = await signIn(creds[role]);

let standardIdentityPlan = 'standard';
try {
  // Standard ----------------------------------------------------------------
  await setHostedStandardPlan(tokens.standard, 'standard');
  standardIdentityPlan = 'standard';
  await assertTier('standard', tokens.standard);
  await expectDenied(
    await insertDataWorkbenchView(tokens.standard, 'standard'),
    'Standard unexpectedly created an Agent Data Workbench view.'
  );
  await expectDenied(
    await insertDataCenterView(tokens.standard, 'standard'),
    'Standard unexpectedly created a Pro+ Data Center view.'
  );
  await expectDenied(
    await insertOrganization(tokens.standard, 'standard'),
    'Standard unexpectedly created a Teams organization.'
  );
  evidence.role_results.standard.agent_workbench_write = 'denied';
  evidence.role_results.standard.pro_plus_write = 'denied';
  evidence.role_results.standard.teams_workspace_write = 'denied';

  // Agent -------------------------------------------------------------------
  await setHostedStandardPlan(tokens.standard, 'agent');
  standardIdentityPlan = 'agent';
  await assertTier('agent', tokens.standard);
  const agentViewId = await expectCreated(
    await insertDataWorkbenchView(tokens.standard, 'agent'),
    'Agent Data Workbench write failed'
  );
  await deleteDataWorkbenchView(tokens.standard, agentViewId);
  await expectDenied(
    await insertDataCenterView(tokens.standard, 'agent'),
    'Agent unexpectedly created a Pro+ Data Center view.'
  );
  await expectDenied(
    await insertOrganization(tokens.standard, 'agent'),
    'Agent unexpectedly created a Teams organization.'
  );
  evidence.role_results.agent.agent_workbench_write = 'allowed';
  evidence.role_results.agent.pro_plus_write = 'denied';
  evidence.role_results.agent.teams_workspace_write = 'denied';

  // Pro ---------------------------------------------------------------------
  await assertTier('pro', tokens.pro);
  const proViewId = await expectCreated(
    await insertDataWorkbenchView(tokens.pro, 'pro'),
    'Pro Data Workbench write failed'
  );
  await deleteDataWorkbenchView(tokens.pro, proViewId);
  await expectDenied(
    await insertDataCenterView(tokens.pro, 'pro'),
    'Pro unexpectedly created a Pro+ Data Center view.'
  );
  await expectDenied(
    await insertOrganization(tokens.pro, 'pro'),
    'Pro unexpectedly created a Teams organization.'
  );
  evidence.role_results.pro.agent_workbench_write = 'allowed';
  evidence.role_results.pro.pro_plus_write = 'denied';
  evidence.role_results.pro.teams_workspace_write = 'denied';

  // Pro+ --------------------------------------------------------------------
  await assertTier('pro_plus', tokens.pro_plus);
  const proPlusWorkbenchId = await expectCreated(
    await insertDataWorkbenchView(tokens.pro_plus, 'pro_plus'),
    'Pro+ Data Workbench write failed'
  );
  await deleteDataWorkbenchView(tokens.pro_plus, proPlusWorkbenchId);
  const proPlusDataCenterId = await expectCreated(
    await insertDataCenterView(tokens.pro_plus, 'pro_plus'),
    'Pro+ Data Center write failed'
  );
  await deleteDataCenterView(tokens.pro_plus, proPlusDataCenterId);
  await expectDenied(
    await insertOrganization(tokens.pro_plus, 'pro_plus'),
    'Pro+ unexpectedly created a Teams organization.'
  );
  evidence.role_results.pro_plus.agent_workbench_write = 'allowed';
  evidence.role_results.pro_plus.pro_plus_write = 'allowed';
  evidence.role_results.pro_plus.teams_workspace_write = 'denied';

  // Teams -------------------------------------------------------------------
  await setHostedStandardPlan(tokens.standard, 'teams');
  standardIdentityPlan = 'teams';
  await assertTier('teams', tokens.standard);
  const teamsWorkbenchId = await expectCreated(
    await insertDataWorkbenchView(tokens.standard, 'teams'),
    'Teams Data Workbench write failed'
  );
  await deleteDataWorkbenchView(tokens.standard, teamsWorkbenchId);
  const teamsDataCenterId = await expectCreated(
    await insertDataCenterView(tokens.standard, 'teams'),
    'Teams Data Center write failed'
  );
  await deleteDataCenterView(tokens.standard, teamsDataCenterId);
  const teamsOrgId = await expectCreated(
    await insertOrganization(tokens.standard, 'teams'),
    'Teams organization write failed'
  );
  await deleteOrganization(tokens.standard, teamsOrgId);
  evidence.role_results.teams.agent_workbench_write = 'allowed';
  evidence.role_results.teams.pro_plus_write = 'allowed';
  evidence.role_results.teams.teams_workspace_write = 'allowed';

  evidence.passed = true;
  evidence.completed_at = new Date().toISOString();
} finally {
  // Always put the reusable hosted identity back at Standard even when a
  // boundary assertion fails midway through the run.
  if (tokens.standard && standardIdentityPlan !== 'standard') {
    try {
      await setHostedStandardPlan(tokens.standard, 'standard');
      evidence.standard_identity_restored = true;
    } catch (restoreError) {
      evidence.standard_identity_restored = false;
      evidence.restore_error = String(restoreError?.message || restoreError);
      if (evidence.passed) throw restoreError;
    }
  } else {
    evidence.standard_identity_restored = true;
  }
}

await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
console.log('Authenticated release gate passed: anonymous + Standard, Agent, Pro, Pro+ and Teams boundaries.');
console.log(`Sanitized evidence written to ${evidencePath}.`);
