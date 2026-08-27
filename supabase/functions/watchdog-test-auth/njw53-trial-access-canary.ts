import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const nativeServe = Deno.serve.bind(Deno);
const MODE = 'njw53_trial_access_canary';

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private' } });
}
async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function record(tokenId: string, userId: string | null, eventType: string, metadata: Record<string, unknown>) {
  await admin.from('watchdog_test_auth_events').insert({ token_id: tokenId, user_id: userId, event_type: eventType, metadata });
}
async function run(body: any) {
  const rawToken = String(body?.token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(rawToken)) return json(401, { error: 'Invalid release canary request' });
  const now = new Date().toISOString();
  const { data: gate, error: gateError } = await admin.from('watchdog_test_bootstrap_tokens')
    .update({ used_at: now })
    .eq('token_hash', await sha256Hex(rawToken)).is('used_at', null).gt('expires_at', now)
    .contains('metadata', { purpose: MODE, no_real_spend: true, owner_approved: true })
    .select('id,desired_email,metadata').maybeSingle();
  if (gateError || !gate) return json(401, { error: 'Invalid or expired release canary token' });

  const email = String(gate.desired_email || '').trim().toLowerCase();
  const expectedUserId = String(gate.metadata?.target_user_id || '').trim();
  let userId = '';
  try {
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const hashed = String(link?.properties?.hashed_token || '');
    userId = String(link?.user?.id || '');
    if (linkError || !hashed || !userId || userId !== expectedUserId) throw new Error('owner_session_generation_failed');

    const [{ data: profile }, { data: isTest }] = await Promise.all([
      admin.from('profiles').select('account_role').eq('id', userId).maybeSingle(),
      admin.rpc('is_watchdog_test_account', { p_user_id: userId }),
    ]);
    if (profile?.account_role === 'developer' || isTest === true) throw new Error('owner_canary_must_not_use_test_or_developer_account');

    const authClient = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: verified, error: verifyError } = await authClient.auth.verifyOtp({ token_hash: hashed, type: 'email' });
    const accessToken = String(verified?.session?.access_token || '');
    if (verifyError || !accessToken) throw new Error('owner_session_verification_failed');

    const session = createClient(SUPABASE_URL, ANON, {
      global: { headers: { authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [entitlementRead, agentRead, proRead] = await Promise.all([
      session.rpc('get_my_entitlement'),
      session.rpc('has_watchdog_plan', { required_plan: 'agent' }),
      session.rpc('has_watchdog_plan', { required_plan: 'pro' }),
    ]);
    const entitlement = Array.isArray(entitlementRead.data) ? entitlementRead.data[0] : entitlementRead.data;
    const contract = {
      real_authenticated_owner_session: true,
      plan_agent: String(entitlement?.plan_tier || '') === 'agent',
      billing_tier_agent: String(entitlement?.billing_tier || '') === 'agent',
      status_trialing: String(entitlement?.subscription_status || '') === 'trialing',
      capacity_25: Number(entitlement?.property_capacity) === 25,
      agent_authorized: agentRead.data === true,
      pro_denied: proRead.data === false,
      no_rpc_errors: !entitlementRead.error && !agentRead.error && !proRead.error,
    };
    const ok = Object.values(contract).every(Boolean);
    const result = { ok, mode: MODE, contract };
    await record(gate.id, userId, ok ? 'njw53_trial_access_canary' : 'njw53_trial_access_canary_failed', result);
    return json(ok ? 200 : 502, result);
  } catch (error) {
    const result = { ok: false, mode: MODE, error: String((error as Error)?.message || error) };
    await record(gate.id, userId || null, 'njw53_trial_access_canary_failed', result);
    return json(500, result);
  }
}

function wrap(handler: Deno.ServeHandler): Deno.ServeHandler {
  return async (request, info) => {
    if (request.method === 'GET') {
      const url = new URL(request.url);
      if (url.searchParams.get('mode') === MODE) return run({ token: url.searchParams.get('token') || '' });
    }
    if (request.method === 'POST') {
      try {
        const body = await request.clone().json();
        if (String(body?.mode || '') === MODE) return run(body);
      } catch {}
    }
    return handler(request, info);
  };
}
const wrappedServe = ((first: unknown, second?: unknown) => {
  if (typeof first === 'function') return nativeServe(wrap(first as Deno.ServeHandler));
  if (typeof second === 'function') return nativeServe(first as Deno.ServeOptions, wrap(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;
Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: wrappedServe });
await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/685c8b8d82f72fed1c997f4b077b668e6240ea45/supabase/functions/watchdog-test-auth/njw62-production-bootstrap-v2.ts');
