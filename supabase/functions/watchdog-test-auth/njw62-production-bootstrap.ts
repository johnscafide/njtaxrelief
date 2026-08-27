import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const nativeServe = Deno.serve.bind(Deno);

const MODE = 'njw62_report_release_canary';
const CONTROL_PIN = '0415_18506_9';
const HOMEOWNER_PRESET = 'homeowner_one_pager';
const SELLER_PRESET = 'seller_net_sheet';
const SCORE_ID = 'watchdog.watchdog_score';
const EXPECTED_SCORE_MODEL = 'ROBUST-v1';
const EXPECTED_CHAPTER_SOURCE = 'nj-chapter123-2026';

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
  if (!userId) return;
  await admin.from('integration_deliveries').delete().eq('user_id', userId);
  await admin.from('integration_events').delete().eq('user_id', userId);
  await admin.from('professional_report_shares').delete().eq('user_id', userId);
  await admin.from('professional_report_versions').delete().eq('user_id', userId);
  await admin.from('professional_reports').delete().eq('user_id', userId);
  await admin.from('saved_properties').delete().eq('user_id', userId);
  await admin.from('score_observations').delete().eq('user_id', userId);
  await admin.from('watchdog_test_accounts').delete().eq('user_id', userId);
  await admin.from('account_entitlements').delete().eq('user_id', userId);
  await admin.from('profiles').delete().eq('id', userId);
  await admin.auth.admin.deleteUser(userId);
}

async function callJson(url: string, accessToken: string, body: any) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload: any = null;
  try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 500) }; }
  return { response, payload };
}

async function runCanary(body: any) {
  const rawToken = String(body?.token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(rawToken)) return json(401, { error: 'Invalid release canary request' });

  const tokenHash = await sha256Hex(rawToken);
  const now = new Date().toISOString();
  const { data: gate, error: gateError } = await admin
    .from('watchdog_test_bootstrap_tokens')
    .update({ used_at: now })
    .eq('token_hash', tokenHash)
    .is('used_at', null)
    .gt('expires_at', now)
    .contains('metadata', { purpose: MODE, no_real_spend: true })
    .select('id,desired_email')
    .maybeSingle();
  if (gateError || !gate) return json(401, { error: 'Invalid or expired release canary token' });

  const email = String(gate.desired_email || '').trim().toLowerCase();
  let userId = '';
  const started = Date.now();
  try {
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const hashed = String(link?.properties?.hashed_token || '');
    userId = String(link?.user?.id || '');
    if (linkError || !hashed || !userId) throw new Error('sandbox_link_generation_failed');

    const authClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: verified, error: verifyError } = await authClient.auth.verifyOtp({ token_hash: hashed, type: 'email' });
    const accessToken = String(verified?.session?.access_token || '');
    if (verifyError || !accessToken) throw new Error('sandbox_session_verification_failed');

    const { error: profileError } = await admin.from('profiles').upsert({
      id: userId,
      email,
      full_name: 'Watchdog NJW-62 Release Canary',
      display_name: 'Watchdog NJW-62 Release Canary',
      account_role: 'user',
      plan_tier: 'standard',
      plan: 'free',
      profile_complete: true,
      custom: { watchdog_test_account: true, no_real_spend: true, release_canary: true, njw62_report_canary: true },
    }, { onConflict: 'id' });
    if (profileError) throw new Error('sandbox_profile_failed:' + profileError.message);

    const { error: entitlementError } = await admin.from('account_entitlements').upsert({
      user_id: userId,
      plan_tier: 'agent',
      billing_tier: 'agent',
      subscription_status: 'active',
      provider: 'manual',
      source: 'njw62-release-canary',
      property_capacity: 25,
      updated_at: now,
    }, { onConflict: 'user_id' });
    if (entitlementError) throw new Error('sandbox_entitlement_failed:' + entitlementError.message);

    const { error: acctError } = await admin.from('watchdog_test_accounts').upsert({
      user_id: userId,
      label: 'NJW-62 Report Release Canary',
      last_bootstrap_at: now,
      metadata: { email, no_real_spend: true, purpose: MODE, plan_tier: 'agent' },
    }, { onConflict: 'user_id' });
    if (acctError) throw new Error('sandbox_account_failed:' + acctError.message);

    const { data: sourceProperty, error: propertyLookupError } = await admin
      .from('property_lookups')
      .select('pams_pin,address,town,county,block,lot,assessed_value,last_year_tax')
      .eq('pams_pin', CONTROL_PIN)
      .single();
    if (propertyLookupError || !sourceProperty) throw new Error('control_property_unavailable');

    const sessionClient = createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: entitlementRows, error: currentEntitlementError } = await sessionClient.rpc('get_my_entitlement');
    const entitlement = Array.isArray(entitlementRows) ? entitlementRows[0] : entitlementRows;
    if (currentEntitlementError || String(entitlement?.plan_tier || '') !== 'agent') throw new Error('agent_entitlement_not_effective');

    const { error: savedError } = await sessionClient.from('saved_properties').insert({
      user_id: userId,
      pams_pin: sourceProperty.pams_pin,
      kind: 'watch',
      address: sourceProperty.address,
      town: sourceProperty.town,
      county: sourceProperty.county,
      block: sourceProperty.block,
      lot: sourceProperty.lot,
      assessed: sourceProperty.assessed_value,
      last_year_tax: sourceProperty.last_year_tax,
      nickname: 'NJW-62 release canary',
      notes: 'Controlled test account. No customer financial inputs.',
    });
    if (savedError) throw new Error('saved_property_rls_failed:' + savedError.message);

    const sellerInsert = await sessionClient.from('professional_reports').insert({
      user_id: userId,
      pams_pin: CONTROL_PIN,
      preset: SELLER_PRESET,
      profession: 'real_estate_agent',
      title: 'NJW-62 seller entitlement denial canary',
      selected_marker_ids: ['modiv_intel.median_annual_tax'],
      source_manifest: [],
    }).select('id').maybeSingle();
    const sellerDenied = !!sellerInsert.error && !sellerInsert.data;
    if (sellerInsert.data?.id) await admin.from('professional_reports').delete().eq('id', sellerInsert.data.id);

    const sellerEvidence = await callJson(`${URL}/functions/v1/report-share`, accessToken, {
      action: 'evidence', purpose: SELLER_PRESET, pams_pin: CONTROL_PIN,
    });
    const sellerEvidenceDenied = sellerEvidence.response.status === 403 && /Pro plan required/i.test(String(sellerEvidence.payload?.error || ''));

    const markers = [SCORE_ID, 'watchdog.chapter123_upper_bound', 'watchdog.appeal_opportunity_index'];
    const { data: report, error: reportError } = await sessionClient.from('professional_reports').insert({
      user_id: userId,
      pams_pin: CONTROL_PIN,
      preset: HOMEOWNER_PRESET,
      profession: 'real_estate_agent',
      title: 'NJW-62 governed homeowner release canary',
      selected_marker_ids: markers,
      source_manifest: [],
    }).select('*').single();
    if (reportError || !report) throw new Error('homeowner_report_create_failed:' + (reportError?.message || 'missing row'));

    const homeownerEvidence = await callJson(`${URL}/functions/v1/report-share`, accessToken, {
      action: 'evidence', purpose: HOMEOWNER_PRESET, pams_pin: CONTROL_PIN,
    });
    if (!homeownerEvidence.response.ok) throw new Error('homeowner_evidence_http_' + homeownerEvidence.response.status);
    const onePager = homeownerEvidence.payload?.homeowner_one_pager || {};
    const chapter = onePager?.chapter123 || {};
    const economics = onePager?.appeal_economics || {};
    const evidenceAvailable = onePager.status === 'available' && chapter.status === 'available' && economics.status === 'available';
    const evidenceGoverned = onePager.watchdog_score_model === EXPECTED_SCORE_MODEL && chapter.source_id === EXPECTED_CHAPTER_SOURCE && onePager.disclaimer && economics.guaranteed_savings === false && economics.eligibility_determination === false;
    if (!evidenceAvailable || !evidenceGoverned) throw new Error('homeowner_evidence_contract_failed');

    const evidenceSnapshot = {
      pams_pin: CONTROL_PIN,
      address: sourceProperty.address,
      town: sourceProperty.town,
      county: sourceProperty.county,
      block: sourceProperty.block,
      lot: sourceProperty.lot,
      assessed: sourceProperty.assessed_value,
      last_year_tax: sourceProperty.last_year_tax,
      watchdog_value: onePager?.chapter123?.independent_value_anchor || null,
    };
    const content = {
      title: report.title,
      preset: HOMEOWNER_PRESET,
      summary: 'Controlled NJW-62 release canary using governed New Jersey property evidence.',
      evidence_snapshot: evidenceSnapshot,
      homeowner_one_pager: onePager,
      agent_branding: {
        agent_name: 'Watchdog NJW-62 Release Canary',
        brokerage_name: 'Controlled test account',
        disclosure: 'Release canary only. Not a customer report.',
      },
    };
    const manifest = Array.isArray(homeownerEvidence.payload?.source_manifest) ? homeownerEvidence.payload.source_manifest : [];

    const { data: version, error: versionError } = await sessionClient.from('professional_report_versions').insert({
      report_id: report.id,
      user_id: userId,
      version_no: 1,
      content,
      source_manifest: manifest,
    }).select('*').single();
    if (versionError || !version) throw new Error('immutable_version_save_failed:' + (versionError?.message || 'missing row'));

    const pdfResponse = await fetch(`${URL}/functions/v1/report-share`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pdf', report_id: report.id, version_id: version.id }),
    });
    const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
    const pdfPrefix = new TextDecoder().decode(pdfBytes.slice(0, 4));
    const pdfOk = pdfResponse.ok && String(pdfResponse.headers.get('content-type') || '').toLowerCase().startsWith('application/pdf') && pdfBytes.length > 1500 && pdfPrefix === '%PDF';
    if (!pdfOk) throw new Error('server_pdf_contract_failed');

    const shareResult = await callJson(`${URL}/functions/v1/report-share`, accessToken, {
      report_id: report.id, version_id: version.id, days: 1,
    });
    if (shareResult.response.status !== 201 || !shareResult.payload?.url) throw new Error('secure_share_create_failed');
    const shareUrl = new URL(String(shareResult.payload.url));
    const shareToken = String(shareUrl.searchParams.get('token') || '');
    if (shareToken.length < 32) throw new Error('secure_share_token_missing');

    const readResponse = await fetch(`${URL}/functions/v1/report-share?token=${encodeURIComponent(shareToken)}`, { headers: { accept: 'application/json' } });
    const readPayload = await readResponse.json().catch(() => ({}));
    const readBackOk = readResponse.ok && readPayload?.content?.preset === HOMEOWNER_PRESET && readPayload?.content?.homeowner_one_pager?.status === 'available' && (readPayload?.version_no === 1 || readPayload?.version_number === 1);
    if (!readBackOk) throw new Error('secure_share_readback_failed');

    const { count: deliveryCount } = await admin.from('integration_deliveries').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const noExternalDelivery = Number(deliveryCount || 0) === 0;

    const contract = {
      real_authenticated_session: true,
      effective_plan_agent: String(entitlement?.plan_tier || '') === 'agent',
      seller_report_denied_for_agent: sellerDenied,
      seller_evidence_denied_for_agent: sellerEvidenceDenied,
      homeowner_report_created: !!report.id,
      homeowner_governed_evidence_available: evidenceAvailable,
      homeowner_governance_flags: evidenceGoverned,
      immutable_version_saved: !!version.id && (version.version_no === 1 || version.version_number === 1),
      pdf_generated: pdfOk,
      pdf_bytes: pdfBytes.length,
      secure_share_created: shareResult.response.status === 201,
      secure_share_readback: readBackOk,
      no_external_delivery: noExternalDelivery,
    };
    const ok = Object.values(contract).every((value) => typeof value === 'number' ? value > 0 : value === true);
    const evidence = {
      ok,
      mode: MODE,
      control_pin: CONTROL_PIN,
      target_function: 'report-share',
      report_share_version: 22,
      duration_ms: Date.now() - started,
      contract,
      homeowner_evidence: {
        status: onePager.status,
        score_model: onePager.watchdog_score_model,
        score: onePager.watchdog_score,
        chapter123_source_id: chapter.source_id,
        chapter123_provider_version: chapter.provider_version,
        annual_dollars_at_stake: economics.annual_dollars_at_stake,
        source_manifest_count: manifest.length,
      },
    };

    await admin.from('watchdog_test_auth_events').insert({
      token_id: gate.id,
      user_id: userId,
      event_type: MODE,
      metadata: evidence,
    });
    return json(ok ? 200 : 502, evidence);
  } catch (error) {
    const evidence = { ok: false, mode: MODE, control_pin: CONTROL_PIN, duration_ms: Date.now() - started, error: String((error as Error)?.message || error) };
    await admin.from('watchdog_test_auth_events').insert({ token_id: gate.id, user_id: userId || null, event_type: MODE, metadata: evidence }).catch(() => null);
    return json(500, evidence);
  } finally {
    if (userId) await cleanup(userId);
  }
}

function withNjw62Canary(handler: Deno.ServeHandler): Deno.ServeHandler {
  return async (request, info) => {
    if (request.method === 'POST') {
      try {
        const body = await request.clone().json();
        if (String(body?.mode || '') === MODE) return runCanary(body);
      } catch {
        // Delegate malformed or unrelated requests to the existing implementation.
      }
    }
    return handler(request, info);
  };
}

const wrappedServe = ((first: unknown, second?: unknown) => {
  if (typeof first === 'function') return nativeServe(withNjw62Canary(first as Deno.ServeHandler));
  if (typeof second === 'function') return nativeServe(first as Deno.ServeOptions, withNjw62Canary(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;

Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: wrappedServe });

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/a6c97d146c3bd5652c1d2e584c1110954a2469a1/supabase/functions/watchdog-test-auth/production-bootstrap.ts');
