import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const nativeServe = Deno.serve.bind(Deno);

const MODE = 'njw53_controlled_trial_checkout_canary';
const OFFER = 'controlled_agent_7d_v1';

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, private',
    },
  });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function record(tokenId: string, userId: string | null, eventType: string, metadata: Record<string, unknown>) {
  await admin.from('watchdog_test_auth_events').insert({
    token_id: tokenId,
    user_id: userId,
    event_type: eventType,
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
    .contains('metadata', { purpose: MODE, no_real_spend: true, owner_approved: true })
    .select('id,desired_email,metadata')
    .maybeSingle();
  if (gateError || !gate) return json(401, { error: 'Invalid or expired release canary token' });

  const email = String(gate.desired_email || '').trim().toLowerCase();
  const expectedUserId = String(gate.metadata?.target_user_id || '').trim();
  let userId = '';
  try {
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const hashed = String(link?.properties?.hashed_token || '');
    userId = String(link?.user?.id || '');
    if (linkError || !hashed || !userId) throw new Error('owner_session_link_generation_failed');
    if (!expectedUserId || userId !== expectedUserId) throw new Error('owner_session_target_mismatch');

    const [{ data: profile, error: profileError }, { data: entitlement, error: entitlementError }, { data: isTest, error: testError }, { data: releaseGate, error: releaseError }] = await Promise.all([
      admin.from('profiles').select('account_role').eq('id', userId).maybeSingle(),
      admin.from('account_entitlements').select('subscription_status,provider_subscription_id').eq('user_id', userId).maybeSingle(),
      admin.rpc('is_watchdog_test_account', { p_user_id: userId }),
      admin.from('platform_release_gates').select('status,evidence').eq('gate_key', 'live_billing_lifecycle').maybeSingle(),
    ]);
    if (profileError || entitlementError || testError || releaseError) throw new Error('owner_canary_precondition_read_failed');
    if (profile?.account_role === 'developer' || isTest === true) throw new Error('owner_canary_must_not_use_test_or_developer_account');
    if (entitlement?.provider_subscription_id || ['active', 'trialing', 'past_due', 'paused'].includes(String(entitlement?.subscription_status || ''))) {
      throw new Error('owner_canary_requires_standard_account_without_subscription_history');
    }
    const evidence = releaseGate?.evidence && typeof releaseGate.evidence === 'object' ? releaseGate.evidence : {};
    const controlledUsers = Array.isArray((evidence as any).controlled_user_ids) ? (evidence as any).controlled_user_ids.map(String) : [];
    if (releaseGate?.status !== 'passed' || String((evidence as any).checkout_mode || '') !== 'controlled' || !controlledUsers.includes(userId)) {
      throw new Error('owner_canary_not_in_controlled_release_gate');
    }

    const authClient = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: verified, error: verifyError } = await authClient.auth.verifyOtp({ token_hash: hashed, type: 'email' });
    const accessToken = String(verified?.session?.access_token || '');
    if (verifyError || !accessToken) throw new Error('owner_session_verification_failed');

    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout-session`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, apikey: ANON, 'content-type': 'application/json' },
      body: JSON.stringify({ tier: 'agent', plan: 'agent', cadence: 'monthly', offer: OFFER }),
    });
    const text = await response.text();
    let payload: any = {};
    try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 500) }; }

    const contract = {
      authenticated_owner_session: true,
      owner_standard_precondition: true,
      release_gate_controlled: true,
      checkout_http_ok: response.ok,
      checkout_destination: payload?.destination === 'checkout',
      provider_stripe: payload?.provider === 'stripe',
      agent_monthly: payload?.tier === 'agent' && payload?.cadence === 'monthly',
      seven_day_trial: payload?.trial === true && Number(payload?.trial_days) === 7,
      auto_cancel_without_payment_method: payload?.auto_cancel_without_payment_method === true,
      checkout_session_created: typeof payload?.session_id === 'string' && payload.session_id.startsWith('cs_'),
      checkout_url_created: typeof payload?.url === 'string' && payload.url.startsWith('https://checkout.stripe.com/'),
    };
    const ok = Object.values(contract).every(Boolean);
    const result = {
      ok,
      mode: MODE,
      status_code: response.status,
      contract,
      provider: payload?.provider || null,
      stripe_mode: payload?.stripe_mode || null,
      session_id: payload?.session_id || null,
      checkout_url: payload?.url || null,
      error_code: payload?.code || null,
      error: payload?.error || null,
    };
    await record(gate.id, userId, ok ? 'njw53_controlled_trial_checkout_canary' : 'njw53_controlled_trial_checkout_canary_failed', result);
    return json(ok ? 200 : response.status || 502, result);
  } catch (error) {
    const result = { ok: false, mode: MODE, error: String((error as Error)?.message || error) };
    await record(gate.id, userId || null, 'njw53_controlled_trial_checkout_canary_failed', result);
    return json(500, result);
  }
}

function withNjw53Canary(handler: Deno.ServeHandler): Deno.ServeHandler {
  return async (request, info) => {
    if (request.method === 'GET') {
      const url = new URL(request.url);
      if (url.searchParams.get('mode') === MODE) {
        return runCanary({ mode: MODE, token: url.searchParams.get('token') || '' });
      }
    }
    if (request.method === 'POST') {
      try {
        const body = await request.clone().json();
        if (String(body?.mode || '') === MODE) return runCanary(body);
      } catch {
        // Preserve the imported implementation's behavior for unrelated requests.
      }
    }
    return handler(request, info);
  };
}

const wrappedServe = ((first: unknown, second?: unknown) => {
  if (typeof first === 'function') return nativeServe(withNjw53Canary(first as Deno.ServeHandler));
  if (typeof second === 'function') return nativeServe(first as Deno.ServeOptions, withNjw53Canary(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;

Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: wrappedServe });

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/48ee315ed9b6a6d24f1836ac83c2ee1bb78195eb/supabase/functions/watchdog-test-auth/njw62-production-bootstrap-v2.ts');
