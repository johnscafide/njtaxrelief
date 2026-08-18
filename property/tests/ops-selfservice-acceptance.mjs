#!/usr/bin/env node
import process from 'node:process';

const supabaseUrl = String(process.env.STAGING_SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey = String(process.env.STAGING_SUPABASE_PUBLISHABLE_KEY || '');
const email = String(process.env.WATCHDOG_TEST_DEVELOPER_EMAIL || '');
const password = String(process.env.WATCHDOG_TEST_DEVELOPER_PASSWORD || '');
const productionRef = ['uvkva', 'xljhhng', 'ydvlrzom'].join('');

if (!supabaseUrl || !supabaseKey || !email || !password) throw new Error('Staging credentials are required.');
if (supabaseUrl.includes(productionRef)) throw new Error('Refusing operations acceptance against production Supabase.');

async function login() {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: supabaseKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.access_token || body?.user?.email !== email) {
    throw new Error(`Staging login failed with ${response.status}`);
  }
  return body.access_token;
}

async function callFunction(name, { method = 'POST', token, body } = {}) {
  const headers = { apikey: supabaseKey };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

const token = await login();
const checks = [];

const status = await callFunction('public-platform-status', { method: 'GET' });
checks.push({ name: 'public platform status', passed: status.response.ok && ['operational', 'degraded', 'major_outage', 'unknown'].includes(status.data?.status) && Array.isArray(status.data?.components), status: status.response.status });

const exportResult = await callFunction('export-my-data', { token, body: {} });
checks.push({ name: 'authenticated data export', passed: exportResult.response.ok && exportResult.data?.account?.email === email && exportResult.data?.data && Object.prototype.hasOwnProperty.call(exportResult.data.data, 'profile'), status: exportResult.response.status });

// Customer self-service functions validate the bearer token with Supabase Auth
// inside the function. This test requires deterministic fail-closed 401s for
// anonymous requests rather than relying on gateway-specific error behavior.
// Exercise support authentication + payload validation without leaving a
// synthetic support row behind in staging.
const supportValidation = await callFunction('submit-support-request', {
  token,
  body: { category: 'technical', priority: 'normal', subject: 'x', message: 'too short' }
});
checks.push({ name: 'support auth + validation boundary', passed: supportValidation.response.status === 400 && /subject|detail/i.test(String(supportValidation.data?.error || '')), status: supportValidation.response.status });

const anonymousExport = await callFunction('export-my-data', { body: {} });
checks.push({ name: 'anonymous export denied', passed: anonymousExport.response.status === 401, status: anonymousExport.response.status });

const anonymousSupport = await callFunction('submit-support-request', { body: { category: 'other', priority: 'normal', subject: 'Anonymous test', message: 'This must never create a support row.' } });
checks.push({ name: 'anonymous support denied', passed: anonymousSupport.response.status === 401, status: anonymousSupport.response.status });

const failed = checks.filter(check => !check.passed);
console.log(JSON.stringify({ environment: 'staging', checked_at: new Date().toISOString(), checks, passed: failed.length === 0 }, null, 2));
if (failed.length) process.exit(1);
