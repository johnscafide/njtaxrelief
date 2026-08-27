import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const SCENARIO = 'v036_sources_v1';
const PIN = '0101_25.01_10';
const FOURTH_PREFIX = 'njplus.nj-dca-fourth-round-affordable.';
const WALK_ID = 'njplus.nj-dca-neighborhood-trends.walking_to_work_share';
const FOURTH_VERSION = 'nj-dca-fourth-round-2025-2035-v1';
const WALK_VERSION = 'nj-dca-neighborhood-trends-walk-2020-24-v1';
const FOURTH_SOURCE = `NJ DCA Fourth Round (2025–2035) non-binding affordable housing calculations · published Methodology Appendix A · ${FOURTH_VERSION}`;
const WALK_SOURCE = `NJ DCA 2026 Neighborhood Trends Database · % Walking to Work, 2020-24 Estimate · ${WALK_VERSION}`;

const EXPECTED: Record<string, unknown> = {
  [`${FOURTH_PREFIX}present_need`]: 39,
  [`${FOURTH_PREFIX}prospective_need`]: 22,
  [`${FOURTH_PREFIX}prospective_need_capped`]: 22,
  [`${FOURTH_PREFIX}qualified_urban_aid`]: 'No',
  [`${FOURTH_PREFIX}nonresidential_value_factor_pct`]: 0.97,
  [`${FOURTH_PREFIX}land_capacity_factor_pct`]: 1.11,
  [`${FOURTH_PREFIX}income_capacity_factor_pct`]: 1.44,
  [`${FOURTH_PREFIX}average_allocation_factor_pct`]: 1.17,
  [`${FOURTH_PREFIX}cap_1000_20pct`]: 723,
  [WALK_ID]: 1.4275,
};
const IDS = Object.keys(EXPECTED);

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private' },
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

export async function handleV036Canary(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
  const token = String(body?.token || '').trim();
  const scenario = String(body?.scenario || '').trim();
  if (scenario !== SCENARIO || !/^[A-Za-z0-9_-]{40,160}$/.test(token)) {
    return json(401, { error: 'Invalid release canary request' });
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
    const accessToken = verified?.session?.access_token || '';
    if (verifyError || !accessToken) throw new Error('sandbox_session_verification_failed');

    const profile = await admin.from('profiles').upsert({
      id: userId,
      email,
      full_name: 'Watchdog v0.36 Provider Release Canary',
      display_name: 'Watchdog v0.36 Provider Release Canary',
      account_role: 'developer',
      plan_tier: 'standard',
      plan: 'free',
      profile_complete: true,
      custom: { watchdog_test_account: true, no_real_spend: true, release_canary: true, scenario: SCENARIO },
    }, { onConflict: 'id' });
    if (profile.error) throw new Error('sandbox_profile_failed');

    const acct = await admin.from('watchdog_test_accounts').upsert({
      user_id: userId,
      label: 'v0.36 Provider Release Canary',
      last_bootstrap_at: now,
      metadata: { email, no_real_spend: true, scenario: SCENARIO },
    }, { onConflict: 'user_id' });
    if (acct.error) throw new Error('sandbox_account_failed');

    const started = Date.now();
    const response = await fetch(`${URL}/functions/v1/workbench-hydrate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pams_pins: [PIN], marker_ids: IDS }),
    });
    const text = await response.text();
    let payload: any = null;
    try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 500) }; }

    const observed: Record<string, unknown> = {};
    const statuses: Record<string, string> = {};
    const kinds: Record<string, string | null> = {};
    const sources: Record<string, string | null> = {};
    const versions: Record<string, string | null> = {};
    const mismatches: string[] = [];

    for (const id of IDS) {
      const value = payload?.markers?.[PIN]?.[id];
      const meta = payload?.meta?.[PIN]?.[id] || {};
      observed[id] = value;
      statuses[id] = String(meta.status || '');
      kinds[id] = meta.provider_kind || null;
      sources[id] = meta.source || null;
      versions[id] = meta.provider_version || null;
      if (value !== EXPECTED[id]) mismatches.push(`${id}:value`);
      if (String(meta.status || '') !== 'available') mismatches.push(`${id}:status`);
      if (String(meta.provider_kind || '') !== 'authoritative_reference') mismatches.push(`${id}:kind`);
      const expectedSource = id === WALK_ID ? WALK_SOURCE : FOURTH_SOURCE;
      const expectedVersion = id === WALK_ID ? WALK_VERSION : FOURTH_VERSION;
      if (String(meta.source || '') !== expectedSource) mismatches.push(`${id}:source`);
      if (String(meta.provider_version || '') !== expectedVersion) mismatches.push(`${id}:version`);
      if (String(meta.scope || '') !== 'municipality') mismatches.push(`${id}:scope`);
    }

    const providerVersionsOk = payload?.provider_versions?.fourth_round_affordable === FOURTH_VERSION &&
      payload?.provider_versions?.walking_to_work === WALK_VERSION;
    if (!providerVersionsOk) mismatches.push('provider_versions');
    const assertionOk = response.ok && mismatches.length === 0;
    const evidence = {
      scenario: SCENARIO,
      target_function: 'workbench-hydrate',
      status_code: response.status,
      duration_ms: Date.now() - started,
      plan: payload?.plan || null,
      assertion_ok: assertionOk,
      mismatches,
      observed,
      statuses,
      kinds,
      sources,
      versions,
      provider_versions: payload?.provider_versions || {},
    };

    await admin.from('watchdog_test_auth_events').insert({
      token_id: gate.id,
      user_id: userId,
      event_type: 'provider_release_canary',
      metadata: { scenario: SCENARIO, status_code: response.status, duration_ms: evidence.duration_ms, assertion_ok: assertionOk, mismatches },
    });
    return json(assertionOk ? 200 : 502, { ok: assertionOk, ...evidence });
  } catch (error) {
    return json(500, { ok: false, scenario: SCENARIO, error: String((error as Error)?.message || error) });
  } finally {
    if (userId) await cleanup(userId);
  }
}
