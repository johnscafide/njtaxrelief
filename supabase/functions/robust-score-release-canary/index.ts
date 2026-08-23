import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const SCORE_ID = 'watchdog.watchdog_score';
const SCORE_MODEL = 'ROBUST-v1';
const SCORE_FRAMEWORK = 'ROBUST';
const SCORE_KIND = 'canonical_watchdog_score';
const SCORE_SOURCE = 'Watchdog Score powered by the ROBUST Framework';
const CONTROL_PIN = '0101_25.01_10';
const ORIGINS = new Set(['https://njpropertytaxrelief.com', 'https://www.njpropertytaxrelief.com', 'https://watchdogindex.com', 'https://www.watchdogindex.com']);

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
    headers: {
      ...cors(req),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, private',
    },
  });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function cleanup(userId: string) {
  await admin.from('score_observations').delete().eq('user_id', userId);
  await admin.from('watchdog_test_accounts').delete().eq('user_id', userId);
  await admin.from('account_entitlements').delete().eq('user_id', userId);
  await admin.from('profiles').delete().eq('id', userId);
  await admin.auth.admin.deleteUser(userId);
}

function exactFormulaContract(row: any) {
  const config = row?.config || {};
  const weights = config?.weights || {};
  return {
    status: row?.status === 'live',
    engine: row?.engine_version === SCORE_MODEL,
    operation: row?.operation === 'weighted_scores',
    framework: config?.framework === SCORE_FRAMEWORK,
    model_version: config?.model_version === SCORE_MODEL,
    missingness: config?.missing_component_policy === 'omit_and_renormalize',
    protected_characteristics: config?.protected_characteristics_policy === 'excluded_from_core_score',
    weights:
      Number(weights?.recourse) === 10 &&
      Number(weights?.fairness) === 20 &&
      Number(weights?.burden) === 30 &&
      Number(weights?.uniformity) === 15 &&
      Number(weights?.stability) === 15 &&
      Number(weights?.trajectory) === 10,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'POST required' });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: 'Invalid JSON' });
  }

  const token = String(body?.token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(token)) return json(req, 401, { error: 'Invalid release canary request' });

  const hash = await sha256Hex(token);
  const now = new Date().toISOString();
  const { data: gate, error: gateError } = await admin
    .from('watchdog_test_bootstrap_tokens')
    .update({ used_at: now })
    .eq('token_hash', hash)
    .is('used_at', null)
    .gt('expires_at', now)
    .contains('metadata', { purpose: 'robust_score_release_canary', no_real_spend: true })
    .select('id,desired_email')
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
      full_name: 'Watchdog ROBUST Score Release Canary',
      display_name: 'Watchdog ROBUST Score Release Canary',
      account_role: 'developer',
      plan_tier: 'standard',
      plan: 'free',
      profile_complete: true,
      custom: { watchdog_test_account: true, no_real_spend: true, release_canary: true, robust_score_canary: true },
    }, { onConflict: 'id' });
    if (profile.error) throw new Error('sandbox_profile_failed');

    const acct = await admin.from('watchdog_test_accounts').upsert({
      user_id: userId,
      label: 'ROBUST Score Release Canary',
      last_bootstrap_at: now,
      metadata: { email, no_real_spend: true, marker_id: SCORE_ID },
    }, { onConflict: 'user_id' });
    if (acct.error) throw new Error('sandbox_account_failed');

    const { data: formula, error: formulaError } = await admin
      .from('derived_formula_registry')
      .select('marker_id,engine_version,formula,dependencies,confidence,status,operation,config')
      .eq('marker_id', SCORE_ID)
      .maybeSingle();
    if (formulaError || !formula) throw new Error('robust_formula_registry_missing');
    const formulaContract = exactFormulaContract(formula);

    const started = Date.now();
    const response = await fetch(`${URL}/functions/v1/workbench-score`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pams_pins: [CONTROL_PIN] }),
    });
    const text = await response.text();
    let payload: any = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 500) };
    }

    const value = payload?.markers?.[CONTROL_PIN]?.[SCORE_ID];
    const meta = payload?.meta?.[CONTROL_PIN]?.[SCORE_ID] || {};
    const { data: observation } = await admin
      .from('score_observations')
      .select('score,model_version,evidence_coverage,observed_at,inputs,formula')
      .eq('user_id', userId)
      .eq('pams_pin', CONTROL_PIN)
      .eq('marker_id', SCORE_ID)
      .eq('model_version', SCORE_MODEL)
      .order('observed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const numericValue = Number(value);
    const runtimeContract = {
      http_ok: response.ok,
      numeric_score: Number.isFinite(numericValue) && numericValue >= 0 && numericValue <= 100,
      status: String(meta?.status || '') === 'available',
      provider_kind: String(meta?.provider_kind || '') === SCORE_KIND,
      source: String(meta?.source || '') === SCORE_SOURCE,
      framework: String(meta?.framework || '') === SCORE_FRAMEWORK,
      model_version: String(meta?.model_version || '') === SCORE_MODEL,
      evidence_coverage: Number.isFinite(Number(meta?.evidence_coverage)) && Number(meta?.evidence_coverage) > 0 && Number(meta?.evidence_coverage) <= 100,
      persisted_observation: Number(observation?.score) === numericValue,
      persisted_model_version: String(observation?.model_version || '') === SCORE_MODEL,
      persisted_coverage: Number(observation?.evidence_coverage) === Number(meta?.evidence_coverage),
    };

    const ok = Object.values(formulaContract).every(Boolean) && Object.values(runtimeContract).every(Boolean);
    const evidence = {
      ok,
      marker_id: SCORE_ID,
      control_pin: CONTROL_PIN,
      target_function: 'workbench-score',
      status_code: response.status,
      duration_ms: Date.now() - started,
      value: Number.isFinite(numericValue) ? numericValue : null,
      meta: {
        status: meta?.status ?? null,
        provider_kind: meta?.provider_kind ?? null,
        source: meta?.source ?? null,
        framework: meta?.framework ?? null,
        model_version: meta?.model_version ?? null,
        evidence_coverage: meta?.evidence_coverage ?? null,
        confidence: meta?.confidence ?? null,
      },
      formula_contract: formulaContract,
      runtime_contract: runtimeContract,
      observation: observation ? {
        score: Number(observation.score),
        model_version: observation.model_version,
        evidence_coverage: Number(observation.evidence_coverage),
        observed_at: observation.observed_at,
      } : null,
    };

    await admin.from('watchdog_test_auth_events').insert({
      token_id: gate.id,
      user_id: userId,
      event_type: 'robust_score_release_canary',
      metadata: evidence,
    });

    return json(req, ok ? 200 : 502, evidence);
  } catch (error) {
    return json(req, 500, { ok: false, marker_id: SCORE_ID, error: String((error as Error)?.message || error) });
  } finally {
    if (userId) await cleanup(userId);
  }
});
