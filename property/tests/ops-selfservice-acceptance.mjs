#!/usr/bin/env node
import process from 'node:process';

const supabaseUrl = String(process.env.STAGING_SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey = String(process.env.STAGING_SUPABASE_PUBLISHABLE_KEY || '');
const developerEmail = String(process.env.WATCHDOG_TEST_DEVELOPER_EMAIL || '');
const developerPassword = String(process.env.WATCHDOG_TEST_DEVELOPER_PASSWORD || '');
const standardEmail = String(process.env.WATCHDOG_TEST_STANDARD_EMAIL || '');
const standardPassword = String(process.env.WATCHDOG_TEST_STANDARD_PASSWORD || '');
const productionRef = ['uvkva', 'xljhhng', 'ydvlrzom'].join('');

if (!supabaseUrl || !supabaseKey || !developerEmail || !developerPassword || !standardEmail || !standardPassword) {
  throw new Error('Staging credentials are required.');
}
if (supabaseUrl.includes(productionRef)) throw new Error('Refusing operations acceptance against production Supabase.');

async function login(email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: supabaseKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.access_token || body?.user?.email !== email) {
    throw new Error(`Staging login failed for acceptance account with ${response.status}`);
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

const developerToken = await login(developerEmail, developerPassword);
const standardToken = await login(standardEmail, standardPassword);
const checks = [];

const status = await callFunction('public-platform-status', { method: 'GET' });
checks.push({ name: 'public platform status', passed: status.response.ok && ['operational', 'degraded', 'major_outage', 'unknown'].includes(status.data?.status) && Array.isArray(status.data?.components), status: status.response.status });

const exportResult = await callFunction('export-my-data', { token: developerToken, body: {} });
checks.push({ name: 'authenticated data export', passed: exportResult.response.ok && exportResult.data?.account?.email === developerEmail && exportResult.data?.data && Object.prototype.hasOwnProperty.call(exportResult.data.data, 'profile'), status: exportResult.response.status });

const supportValidation = await callFunction('submit-support-request', {
  token: developerToken,
  body: { category: 'technical', priority: 'normal', subject: 'x', message: 'too short' }
});
checks.push({ name: 'support auth + validation boundary', passed: supportValidation.response.status === 400 && /subject|detail/i.test(String(supportValidation.data?.error || '')), status: supportValidation.response.status });

const anonymousExport = await callFunction('export-my-data', { body: {} });
checks.push({ name: 'anonymous export denied', passed: anonymousExport.response.status === 401, status: anonymousExport.response.status });

const anonymousSupport = await callFunction('submit-support-request', { body: { category: 'other', priority: 'normal', subject: 'Anonymous test', message: 'This must never create a support row.' } });
checks.push({ name: 'anonymous support denied', passed: anonymousSupport.response.status === 401, status: anonymousSupport.response.status });

const anonymousScanner = await callFunction('appeal-prospect-scan', { body: { action: 'catalog' } });
checks.push({ name: 'anonymous Scanner denied', passed: anonymousScanner.response.status === 401, status: anonymousScanner.response.status });

const standardScanner = await callFunction('appeal-prospect-scan', { token: standardToken, body: { action: 'catalog' } });
checks.push({ name: 'Standard Scanner denied', passed: standardScanner.response.status === 403, status: standardScanner.response.status });

const catalogResult = await callFunction('appeal-prospect-scan', { token: developerToken, body: { action: 'catalog' } });
const catalogPassed = catalogResult.response.ok && Array.isArray(catalogResult.data?.counties) && catalogResult.data.counties.length >= 20 && /^appeal-prospect-scan-server-/.test(String(catalogResult.data?.formula_version || ''));
checks.push({ name: 'Developer Pro+ Scanner catalog', passed: catalogPassed, status: catalogResult.response.status });

let scanPassed = false;
let scanStatus = null;
let scanDistrict = null;
let scanHits = null;
if (catalogPassed) {
  const towns = catalogResult.data.counties.flatMap(county => (county.towns || []).map(town => ({ ...town, county: county.name })))
    .filter(town => /^\d{4}$/.test(String(town.district || '')))
    .sort((a, b) => Number(b.verified_sales || 0) - Number(a.verified_sales || 0));

  for (const town of towns.slice(0, 8)) {
    const attempt = await callFunction('appeal-prospect-scan', {
      token: developerToken,
      body: { action: 'scan', district: town.district, max_years: 6, min_saving: 0 }
    });
    scanStatus = attempt.response.status;
    if (attempt.response.ok && attempt.data?.result === 'ok' && Array.isArray(attempt.data?.run?.hits)) {
      scanPassed = /^appeal-prospect-scan-server-/.test(String(attempt.data?.formula_version || '')) &&
        attempt.data.run.d === town.district &&
        Number(attempt.data.run.pool) >= 15 &&
        !Object.prototype.hasOwnProperty.call(attempt.data, 'sales');
      scanDistrict = town.district;
      scanHits = attempt.data.run.hits.length;
      break;
    }
  }
}
checks.push({ name: 'Developer server-side municipality Scanner run', passed: scanPassed, status: scanStatus, district: scanDistrict, hits: scanHits });

const failed = checks.filter(check => !check.passed);
console.log(JSON.stringify({ environment: 'staging', checked_at: new Date().toISOString(), checks, passed: failed.length === 0 }, null, 2));
if (failed.length) process.exit(1);
