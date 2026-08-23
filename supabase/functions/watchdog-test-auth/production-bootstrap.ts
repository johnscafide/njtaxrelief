// Git-pinned production bootstrap for Watchdog sandbox authentication.
// The imported implementation keeps the existing custom one-time-token auth flows.
// This wrapper adds one bounded New Home Warranty release-canary mode and otherwise
// delegates requests unchanged to the certified sandbox-auth implementation.

import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const nativeServe = Deno.serve.bind(Deno);

const MODE = 'new_home_warranty_release_canary';
const CONTROL_PIN = '0101_25.01_10';
const PREFIX = 'njplus.nj-dca-new-home-warranty.';
const PROVIDER_VERSION = 'nj-dca-new-home-warranty-q4-2025-v1';
const DIRECT_SOURCE = `NJ DCA New Home Warranties Q4 2025 preliminary county table · ${PROVIDER_VERSION}`;
const DERIVED_SOURCE = `Watchdog exact Q3-to-Q4 2025 derivation over NJ DCA New Home Warranties · ${PROVIDER_VERSION}`;
const EXPECTED: Record<string, unknown> = {
  [`${PREFIX}new_home_warranty_enrollments`]: 43,
  [`${PREFIX}new_home_warranty_average_price`]: 1123566,
  [`${PREFIX}new_home_warranty_median_price`]: 879424,
  [`${PREFIX}new_home_warranty_sales_count`]: 43,
  [`${PREFIX}new_home_warranty_quarter`]: 4,
  [`${PREFIX}new_home_warranty_year`]: 2025,
  [`${PREFIX}new_home_warranty_price_change`]: 27.82,
  [`${PREFIX}new_home_warranty_enrollment_change`]: -49.41,
  [`${PREFIX}new_home_warranty_county_rank`]: 13,
};
const MUNICIPAL_RANK = `${PREFIX}new_home_warranty_municipal_rank`;
const DIRECT_IDS = new Set([
  `${PREFIX}new_home_warranty_enrollments`,
  `${PREFIX}new_home_warranty_average_price`,
  `${PREFIX}new_home_warranty_median_price`,
  `${PREFIX}new_home_warranty_sales_count`,
  `${PREFIX}new_home_warranty_quarter`,
  `${PREFIX}new_home_warranty_year`,
]);
const DERIVED_IDS = new Set([
  `${PREFIX}new_home_warranty_price_change`,
  `${PREFIX}new_home_warranty_enrollment_change`,
  `${PREFIX}new_home_warranty_county_rank`,
]);
const ALL_IDS = [...Object.keys(EXPECTED), MUNICIPAL_RANK];

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
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

function assertions(payload: any, responseOk: boolean) {
  const mismatched_values: string[] = [];
  const provider_kind_mismatched: string[] = [];
  const source_mismatched: string[] = [];
  const scope_mismatched: string[] = [];

  for (const [id, expected] of Object.entries(EXPECTED)) {
    const got = payload?.markers?.[CONTROL_PIN]?.[id];
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      mismatched_values.push(`${id}:expected=${JSON.stringify(expected)}:got=${JSON.stringify(got)}`);
    }
    const meta = payload?.meta?.[CONTROL_PIN]?.[id] || {};
    const expectedKind = DERIVED_IDS.has(id) ? 'derived_governed' : 'authoritative_reference';
    const expectedSource = DERIVED_IDS.has(id) ? DERIVED_SOURCE : DIRECT_SOURCE;
    if (String(meta?.status || '') !== 'available') provider_kind_mismatched.push(`${id}:status=${String(meta?.status || '')}`);
    if (String(meta?.provider_kind || '') !== expectedKind) provider_kind_mismatched.push(`${id}:kind=${String(meta?.provider_kind || '')}`);
    if (String(meta?.source || '') !== expectedSource) source_mismatched.push(`${id}:source=${String(meta?.source || '')}`);
    if (String(meta?.scope || '') !== 'county') scope_mismatched.push(`${id}:scope=${String(meta?.scope || '')}`);
    if (String(meta?.provider_version || '') !== PROVIDER_VERSION) provider_kind_mismatched.push(`${id}:provider_version=${String(meta?.provider_version || '')}`);
  }

  const municipalValue = payload?.markers?.[CONTROL_PIN]?.[MUNICIPAL_RANK];
  const municipalMeta = payload?.meta?.[CONTROL_PIN]?.[MUNICIPAL_RANK] || {};
  const municipal_rank_contract = {
    no_value: municipalValue === null || municipalValue === undefined,
    checked_status: String(municipalMeta?.status || '') === 'source_checked_no_value',
    county_scope: String(municipalMeta?.scope || '') === 'county',
    reason: String(municipalMeta?.reason || '').includes('no municipality-level warranty enrollment rank is published'),
  };

  return {
    http_ok: responseOk,
    plan_is_developer: String(payload?.plan || '') === 'developer',
    provider_version: String(payload?.provider_versions?.new_home_warranty || '') === PROVIDER_VERSION,
    exact_values: mismatched_values.length === 0,
    provider_kinds: provider_kind_mismatched.length === 0,
    provenance: source_mismatched.length === 0,
    county_scope: scope_mismatched.length === 0,
    municipal_rank_contract: Object.values(municipal_rank_contract).every(Boolean),
    mismatched_values,
    provider_kind_mismatched,
    source_mismatched,
    scope_mismatched,
    municipal_rank_detail: municipal_rank_contract,
  };
}

async function runNewHomeWarrantyCanary(request: Request, body: any) {
  const token = String(body?.token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(token)) return json(401, { error: 'Invalid release canary request' });

  const hash = await sha256Hex(token);
  const now = new Date().toISOString();
  const { data: gate, error: gateError } = await admin
    .from('watchdog_test_bootstrap_tokens')
    .update({ used_at: now })
    .eq('token_hash', hash)
    .is('used_at', null)
    .gt('expires_at', now)
    .contains('metadata', { purpose: 'new_home_warranty_release_canary', no_real_spend: true })
    .select('id,desired_email')
    .maybeSingle();
  if (gateError || !gate) return json(401, { error: 'Invalid or expired release canary token' });

  const email = String(gate.desired_email || '').trim().toLowerCase();
  let userId = '';
  try {
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const hashed = String(link?.properties?.hashed_token || '');
    userId = String(link?.user?.id || '');
    if (linkError || !hashed || !userId) throw new Error('sandbox_link_generation_failed');

    const authClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: verified, error: verifyError } = await authClient.auth.verifyOtp({ token_hash: hashed, type: 'email' });
    const accessToken = String(verified?.session?.access_token || '');
    if (verifyError || !accessToken) throw new Error('sandbox_session_verification_failed');

    const profile = await admin.from('profiles').upsert({
      id: userId,
      email,
      full_name: 'Watchdog New Home Warranty Release Canary',
      display_name: 'Watchdog New Home Warranty Release Canary',
      account_role: 'developer',
      plan_tier: 'standard',
      plan: 'free',
      profile_complete: true,
      custom: { watchdog_test_account: true, no_real_spend: true, release_canary: true, new_home_warranty_canary: true },
    }, { onConflict: 'id' });
    if (profile.error) throw new Error('sandbox_profile_failed');

    const acct = await admin.from('watchdog_test_accounts').upsert({
      user_id: userId,
      label: 'New Home Warranty Release Canary',
      last_bootstrap_at: now,
      metadata: { email, no_real_spend: true, source_id: 'nj-dca-new-home-warranty' },
    }, { onConflict: 'user_id' });
    if (acct.error) throw new Error('sandbox_account_failed');

    const started = Date.now();
    const response = await fetch(`${URL}/functions/v1/workbench-hydrate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pams_pins: [CONTROL_PIN], marker_ids: ALL_IDS }),
    });
    const text = await response.text();
    let payload: any = null;
    try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 500) }; }

    const contract = assertions(payload, response.ok);
    const ok = contract.http_ok && contract.plan_is_developer && contract.provider_version && contract.exact_values && contract.provider_kinds && contract.provenance && contract.county_scope && contract.municipal_rank_contract;
    const evidence = {
      ok,
      mode: MODE,
      source_id: 'nj-dca-new-home-warranty',
      provider_version: PROVIDER_VERSION,
      control_pin: CONTROL_PIN,
      target_function: 'workbench-hydrate',
      status_code: response.status,
      duration_ms: Date.now() - started,
      contract,
      values: payload?.markers?.[CONTROL_PIN] || {},
      meta: payload?.meta?.[CONTROL_PIN] || {},
    };

    await admin.from('watchdog_test_auth_events').insert({
      token_id: gate.id,
      user_id: userId,
      event_type: 'new_home_warranty_release_canary',
      metadata: evidence,
    });
    return json(ok ? 200 : 502, evidence);
  } catch (error) {
    return json(500, { ok: false, mode: MODE, error: String((error as Error)?.message || error) });
  } finally {
    if (userId) await cleanup(userId);
  }
}

function withNewHomeWarrantyCanary(handler: Deno.ServeHandler): Deno.ServeHandler {
  return async (request, info) => {
    if (request.method === 'POST') {
      try {
        const body = await request.clone().json();
        if (String(body?.mode || '') === MODE) return runNewHomeWarrantyCanary(request, body);
      } catch {
        // Preserve the imported implementation's existing invalid-JSON behavior.
      }
    }
    return handler(request, info);
  };
}

const wrappedServe = ((first: unknown, second?: unknown) => {
  if (typeof first === 'function') return nativeServe(withNewHomeWarrantyCanary(first as Deno.ServeHandler));
  if (typeof second === 'function') return nativeServe(first as Deno.ServeOptions, withNewHomeWarrantyCanary(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;

Object.defineProperty(Deno, 'serve', {
  configurable: true,
  writable: true,
  value: wrappedServe,
});

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/7500c97bc43faa9f830dcd5d8e704ee844fab1fa/supabase/functions/watchdog-test-auth/index-v2.ts');
