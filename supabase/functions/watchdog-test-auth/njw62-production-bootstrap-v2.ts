import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const nativeServe = Deno.serve.bind(Deno);

const MODE = 'njw62_report_release_canary';
const CONTROL_PIN = '0415_18506_9';
const HOMEOWNER = 'homeowner_one_pager';
const SELLER = 'seller_net_sheet';

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private' },
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

async function postJson(accessToken: string, body: unknown) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/report-share`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload: any = {};
  try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 500) }; }
  return { response, payload };
}

async function recordEvent(tokenId: string, userId: string | null, metadata: any) {
  await admin.from('watchdog_test_auth_events').insert({
    token_id: tokenId,
    user_id: userId,
    event_type: MODE,
    metadata,
  });
}

async function runCanary(body: any) {
  const rawToken = String(body?.token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(rawToken)) return json(401, { error: 'Invalid release canary request' });

  const now = new Date().toISOString();
  const { data: gate, error: gateError } = await admin
    .from('watchdog_test_bootstrap_tokens')
    .update({ used_at: now })
    .eq('token_hash', await sha256Hex(rawToken))
    .is('used_at', null)
    .gt('expires_at', now)
    .contains('metadata', { purpose: MODE, no_real_spend: true })
    .select('id,desired_email')
    .maybeSingle();
  if (gateError || !gate) return json(401, { error: 'Invalid or expired release canary token' });

  const email = String(gate.desired_email || '').trim().toLowerCase();
  const started = Date.now();
  let userId = '';
  try {
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    userId = String(link?.user?.id || '');
    const hashed = String(link?.properties?.hashed_token || '');
    if (linkError || !userId || !hashed) throw new Error('sandbox_link_generation_failed');

    const authClient = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: verified, error: verifyError } = await authClient.auth.verifyOtp({ token_hash: hashed, type: 'email' });
    const accessToken = String(verified?.session?.access_token || '');
    if (verifyError || !accessToken) throw new Error('sandbox_session_verification_failed');

    const profile = await admin.from('profiles').upsert({
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
    if (profile.error) throw new Error(`sandbox_profile_failed:${profile.error.message}`);

    const entitlementWrite = await admin.from('account_entitlements').upsert({
      user_id: userId,
      plan_tier: 'agent',
      billing_tier: 'agent',
      subscription_status: 'active',
      provider: 'manual',
      source: 'njw62-release-canary',
      property_capacity: 25,
      updated_at: now,
    }, { onConflict: 'user_id' });
    if (entitlementWrite.error) throw new Error(`sandbox_entitlement_failed:${entitlementWrite.error.message}`);

    const testAccount = await admin.from('watchdog_test_accounts').upsert({
      user_id: userId,
      label: 'NJW-62 Report Release Canary',
      last_bootstrap_at: now,
      metadata: { email, no_real_spend: true, purpose: MODE, plan_tier: 'agent' },
    }, { onConflict: 'user_id' });
    if (testAccount.error) throw new Error(`sandbox_account_failed:${testAccount.error.message}`);

    const { data: property, error: propertyError } = await admin.from('property_lookups')
      .select('pams_pin,address,town,county,block,lot,assessed_value,last_year_tax')
      .eq('pams_pin', CONTROL_PIN).single();
    if (propertyError || !property) throw new Error('control_property_unavailable');

    const session = createClient(SUPABASE_URL, ANON, {
      global: { headers: { authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const entitlementRead = await session.rpc('get_my_entitlement');
    const entitlement = Array.isArray(entitlementRead.data) ? entitlementRead.data[0] : entitlementRead.data;
    if (entitlementRead.error || String(entitlement?.plan_tier || '') !== 'agent') throw new Error('agent_entitlement_not_effective');

    const saved = await session.from('saved_properties').insert({
      user_id: userId,
      pams_pin: property.pams_pin,
      kind: 'watch',
      address: property.address,
      town: property.town,
      county: property.county,
      block: property.block,
      lot: property.lot,
      assessed: property.assessed_value,
      last_year_tax: property.last_year_tax,
      nickname: 'NJW-62 release canary',
      notes: 'Controlled test account. No customer financial inputs.',
    });
    if (saved.error) throw new Error(`saved_property_rls_failed:${saved.error.message}`);

    const sellerInsert = await session.from('professional_reports').insert({
      user_id: userId,
      pams_pin: CONTROL_PIN,
      preset: SELLER,
      profession: 'real_estate_agent',
      title: 'NJW-62 seller entitlement denial canary',
      selected_marker_ids: ['modiv_intel.median_annual_tax'],
      source_manifest: [],
    }).select('id').maybeSingle();
    const sellerReportDenied = !!sellerInsert.error && !sellerInsert.data;
    if (sellerInsert.data?.id) await admin.from('professional_reports').delete().eq('id', sellerInsert.data.id);

    const sellerEvidence = await postJson(accessToken, { action: 'evidence', purpose: SELLER, pams_pin: CONTROL_PIN });
    const sellerEvidenceDenied = sellerEvidence.response.status === 403 && /Pro plan required/i.test(String(sellerEvidence.payload?.error || ''));

    const markers = ['watchdog.watchdog_score', 'watchdog.chapter123_upper_bound', 'watchdog.appeal_opportunity_index'];
    const reportInsert = await session.from('professional_reports').insert({
      user_id: userId,
      pams_pin: CONTROL_PIN,
      preset: HOMEOWNER,
      profession: 'real_estate_agent',
      title: 'NJW-62 governed homeowner release canary',
      selected_marker_ids: markers,
      source_manifest: [],
    }).select('*').single();
    if (reportInsert.error || !reportInsert.data) throw new Error(`homeowner_report_create_failed:${reportInsert.error?.message || 'missing row'}`);
    const report = reportInsert.data;

    const evidenceResult = await postJson(accessToken, { action: 'evidence', purpose: HOMEOWNER, pams_pin: CONTROL_PIN });
    if (!evidenceResult.response.ok) throw new Error(`homeowner_evidence_http_${evidenceResult.response.status}`);
    const onePager = evidenceResult.payload?.homeowner_one_pager || {};
    const chapter = onePager?.chapter123 || {};
    const economics = onePager?.appeal_economics || {};
    const evidenceAvailable = onePager.status === 'available' && chapter.status === 'available' && economics.status === 'available';
    const evidenceGoverned = onePager.watchdog_score_model === 'ROBUST-v1' && chapter.source_id === 'nj-chapter123-2026' && Boolean(onePager.disclaimer) && economics.guaranteed_savings === false && economics.eligibility_determination === false;
    if (!evidenceAvailable || !evidenceGoverned) throw new Error('homeowner_evidence_contract_failed');

    const manifest = Array.isArray(evidenceResult.payload?.source_manifest) ? evidenceResult.payload.source_manifest : [];
    const content = {
      title: report.title,
      preset: HOMEOWNER,
      summary: 'Controlled NJW-62 release canary using governed New Jersey property evidence.',
      evidence_snapshot: {
        pams_pin: CONTROL_PIN,
        address: property.address,
        town: property.town,
        county: property.county,
        block: property.block,
        lot: property.lot,
        assessed: property.assessed_value,
        last_year_tax: property.last_year_tax,
        watchdog_value: chapter.independent_value_anchor || null,
      },
      homeowner_one_pager: onePager,
      agent_branding: {
        agent_name: 'Watchdog NJW-62 Release Canary',
        brokerage_name: 'Controlled test account',
        disclosure: 'Release canary only. Not a customer report.',
      },
    };

    const versionInsert = await session.from('professional_report_versions').insert({
      report_id: report.id,
      user_id: userId,
      version_no: 1,
      content,
      source_manifest: manifest,
    }).select('*').single();
    if (versionInsert.error || !versionInsert.data) throw new Error(`immutable_version_save_failed:${versionInsert.error?.message || 'missing row'}`);
    const version = versionInsert.data;

    const pdfResponse = await fetch(`${SUPABASE_URL}/functions/v1/report-share`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, apikey: ANON, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'pdf', report_id: report.id, version_id: version.id }),
    });
    const pdf = new Uint8Array(await pdfResponse.arrayBuffer());
    const pdfOk = pdfResponse.ok && String(pdfResponse.headers.get('content-type') || '').toLowerCase().startsWith('application/pdf') && pdf.length > 1500 && new TextDecoder().decode(pdf.slice(0, 4)) === '%PDF';
    if (!pdfOk) throw new Error('server_pdf_contract_failed');

    const share = await postJson(accessToken, { report_id: report.id, version_id: version.id, days: 1 });
    if (share.response.status !== 201 || !share.payload?.url) throw new Error('secure_share_create_failed');
    const shareUrl = new globalThis.URL(String(share.payload.url));
    const shareToken = String(shareUrl.searchParams.get('token') || '');
    if (shareToken.length < 32) throw new Error('secure_share_token_missing');

    const readResponse = await fetch(`${SUPABASE_URL}/functions/v1/report-share?token=${encodeURIComponent(shareToken)}`, { headers: { accept: 'application/json' } });
    let readPayload: any = {};
    try { readPayload = await readResponse.json(); } catch {}
    const readBackOk = readResponse.ok && readPayload?.content?.preset === HOMEOWNER && readPayload?.content?.homeowner_one_pager?.status === 'available' && (readPayload?.version_no === 1 || readPayload?.version_number === 1);
    if (!readBackOk) throw new Error('secure_share_readback_failed');

    const deliveryQuery = await admin.from('integration_deliveries').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const noExternalDelivery = Number(deliveryQuery.count || 0) === 0;

    const contract = {
      real_authenticated_session: true,
      effective_plan_agent: String(entitlement?.plan_tier || '') === 'agent',
      seller_report_denied_for_agent: sellerReportDenied,
      seller_evidence_denied_for_agent: sellerEvidenceDenied,
      homeowner_report_created: Boolean(report.id),
      homeowner_governed_evidence_available: evidenceAvailable,
      homeowner_governance_flags: evidenceGoverned,
      immutable_version_saved: Boolean(version.id) && (version.version_no === 1 || version.version_number === 1),
      pdf_generated: pdfOk,
      pdf_bytes: pdf.length,
      secure_share_created: share.response.status === 201,
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
    await recordEvent(gate.id, userId, evidence);
    return json(ok ? 200 : 502, evidence);
  } catch (error) {
    const evidence = {
      ok: false,
      mode: MODE,
      control_pin: CONTROL_PIN,
      duration_ms: Date.now() - started,
      error: String((error as Error)?.message || error),
    };
    await recordEvent(gate.id, userId || null, evidence);
    return json(500, evidence);
  } finally {
    if (userId) await cleanup(userId);
  }
}

function withNjw62V2(handler: Deno.ServeHandler): Deno.ServeHandler {
  return async (request, info) => {
    if (request.method === 'POST') {
      try {
        const body = await request.clone().json();
        if (String(body?.mode || '') === MODE) return runCanary(body);
      } catch {
        // Preserve all existing watchdog-test-auth behavior for unrelated requests.
      }
    }
    return handler(request, info);
  };
}

const wrappedServe = ((first: unknown, second?: unknown) => {
  if (typeof first === 'function') return nativeServe(withNjw62V2(first as Deno.ServeHandler));
  if (typeof second === 'function') return nativeServe(first as Deno.ServeOptions, withNjw62V2(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;

Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: wrappedServe });

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/a6c97d146c3bd5652c1d2e584c1110954a2469a1/supabase/functions/watchdog-test-auth/production-bootstrap.ts');
