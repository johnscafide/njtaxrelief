import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const ORIGINS = new Set([
  'https://njpropertytaxrelief.com',
  'https://www.njpropertytaxrelief.com',
  'https://watchdogindex.com',
  'https://www.watchdogindex.com',
]);
const SCENARIO = 'pilot_observed_v1';
const PIN = '0102_139_15';
const COUNT_ID = 'njplus.nj-dca-pilot-forecast.pilot_project_count';
const ASSESSMENT_ID = 'njplus.nj-dca-pilot-forecast.pilot_project_assessment';
const NEGATIVE_ID = 'njplus.nj-dca-pilot-forecast.pilot_revenue_projection';
const SOURCE = 'NJ DCA PILOT Database and Viewer 2026 · 2025 UFB municipal summary · nj-dca-pilot-observed-2026-v1';

function cors(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.has(origin) ? origin : 'https://www.watchdogindex.com',
    'Access-Control-Allow-Headers': 'content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private' },
  });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function cleanup(userId: string) {
  await admin.from('watchdog_test_accounts').delete().eq('user_id', userId);
  await admin.from('account_entitlements').delete().eq('user_id', userId);
  await admin.from('profiles').delete().eq('id', userId);
  await admin.auth.admin.deleteUser(userId);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'POST required' });

  let body: any = {};
  try { body = await req.json(); } catch { return json(req, 400, { error: 'Invalid JSON' }); }
  const token = String(body?.token || '').trim();
  const scenario = String(body?.scenario || '').trim();
  if (scenario !== SCENARIO || !/^[A-Za-z0-9_-]{40,160}$/.test(token)) {
    return json(req, 401, { error: 'Invalid release canary request' });
  }

  const hash = await sha256Hex(token);
  const now = new Date().toISOString();
  const { data: gate, error: gateError } = await admin
    .from('watchdog_test_bootstrap_tokens')
    .update({ used_at: now })
    .eq('token_hash', hash)
    .is('used_at', null)
    .gt('expires_at', now)
    .contains('metadata', { purpose: 'provider_release_canary', scenario: SCENARIO })
    .select('id,desired_email,metadata')
    .maybeSingle();
  if (gateError || !gate) return json(req, 401, { error: 'Invalid or expired release canary token' });

  const email = String(gate.desired_email || '').trim().toLowerCase();
  let userId = '';
  try {
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const hashed = String(link?.properties?.hashed_token || '');
    userId = String(link?.user?.id || '');
    if (linkError || !hashed || !userId) throw new Error('sandbox_link_generation_failed');

    const authClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: verified, error: verifyError } = await authClient.auth.verifyOtp({ token_hash: hashed, type: 'email' });
    const accessToken = verified?.session?.access_token || '';
    if (verifyError || !accessToken) throw new Error('sandbox_session_verification_failed');

    const profile = await admin.from('profiles').upsert({
      id: userId,
      email,
      full_name: 'Watchdog PILOT Provider Release Canary',
      display_name: 'Watchdog PILOT Provider Release Canary',
      account_role: 'developer',
      plan_tier: 'standard',
      plan: 'free',
      profile_complete: true,
      custom: { watchdog_test_account: true, no_real_spend: true, release_canary: true, scenario: SCENARIO },
    }, { onConflict: 'id' });
    if (profile.error) throw new Error('sandbox_profile_failed');

    const acct = await admin.from('watchdog_test_accounts').upsert({
      user_id: userId,
      label: 'PILOT Provider Release Canary',
      last_bootstrap_at: now,
      metadata: { email, no_real_spend: true, scenario: SCENARIO },
    }, { onConflict: 'user_id' });
    if (acct.error) throw new Error('sandbox_account_failed');

    const started = Date.now();
    const response = await fetch(`${URL}/functions/v1/workbench-hydrate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pams_pins: [PIN], marker_ids: [COUNT_ID, ASSESSMENT_ID, NEGATIVE_ID] }),
    });
    const text = await response.text();
    let payload: any = null;
    try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 500) }; }

    const count = payload?.markers?.[PIN]?.[COUNT_ID];
    const assessment = payload?.markers?.[PIN]?.[ASSESSMENT_ID];
    const countMeta = payload?.meta?.[PIN]?.[COUNT_ID] || {};
    const assessmentMeta = payload?.meta?.[PIN]?.[ASSESSMENT_ID] || {};
    const negativeMeta = payload?.meta?.[PIN]?.[NEGATIVE_ID] || {};
    const negativeValue = payload?.markers?.[PIN]?.[NEGATIVE_ID];
    const assertion = {
      exact_values: count === 26 && assessment === 277093300,
      provider_kinds: countMeta.provider_kind === 'authoritative_reference' && assessmentMeta.provider_kind === 'authoritative_reference',
      provenance: countMeta.source === SOURCE && assessmentMeta.source === SOURCE,
      scopes: countMeta.scope === 'municipality' && assessmentMeta.scope === 'municipality',
      negative_control: negativeValue === undefined && String(negativeMeta.status || '') !== 'available',
      observed: { count, assessment },
      negative_status: String(negativeMeta.status || ''),
      sources: { count: countMeta.source || null, assessment: assessmentMeta.source || null },
      kinds: { count: countMeta.provider_kind || null, assessment: assessmentMeta.provider_kind || null },
    };
    const assertionOk = assertion.exact_values && assertion.provider_kinds && assertion.provenance && assertion.scopes && assertion.negative_control;
    const ok = response.ok && assertionOk;
    const evidence = {
      scenario: SCENARIO,
      target_function: 'workbench-hydrate',
      status_code: response.status,
      duration_ms: Date.now() - started,
      assertion,
      provider_version: payload?.provider_versions?.dca_pilot_observed || null,
      plan: payload?.plan || null,
    };

    await admin.from('watchdog_test_auth_events').insert({
      token_id: gate.id,
      user_id: userId,
      event_type: 'provider_release_canary',
      metadata: { scenario: SCENARIO, status_code: response.status, duration_ms: evidence.duration_ms, assertion_ok: assertionOk, assertion },
    });
    return json(req, ok ? 200 : 502, { ok, ...evidence });
  } catch (error) {
    return json(req, 500, { ok: false, scenario: SCENARIO, error: String((error as Error)?.message || error) });
  } finally {
    if (userId) await cleanup(userId);
  }
});
