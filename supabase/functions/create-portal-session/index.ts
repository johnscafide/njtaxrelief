import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const DEFAULT_SITE = 'https://njpropertytaxrelief.com';

function allowedOrigin(req: Request) {
  const origin = req.headers.get('origin') || '';
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (
      host === 'njpropertytaxrelief.com' ||
      host === 'www.njpropertytaxrelief.com' ||
      host === 'watchdogindex.com' ||
      host === 'www.watchdogindex.com' ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.vercel.app')
    ) return origin;
  } catch (_) {}
  return DEFAULT_SITE;
}

function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
}

async function legacyPaddlePortal(customerId: string, subscriptionId: string | null) {
  const key = Deno.env.get('PADDLE_API_KEY');
  if (!key) return null;
  const base = Deno.env.get('PADDLE_API_BASE') || (Deno.env.get('PADDLE_ENVIRONMENT') === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com');
  const body = subscriptionId ? { subscription_ids: [subscriptionId] } : {};
  const response = await fetch(`${base}/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.detail || payload?.error?.code || 'Legacy billing portal request failed');
  return payload?.data?.urls?.general?.overview || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json(req, { error: 'Sign in required', code: 'SIGN_IN_REQUIRED' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json(req, { error: 'Sign in required', code: 'SIGN_IN_REQUIRED' }, 401);

  const { data: entitlement, error: entitlementError } = await admin
    .from('account_entitlements')
    .select('provider,provider_customer_id,provider_subscription_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (entitlementError) return json(req, { error: 'Could not read billing state.', code: 'ENTITLEMENT_READ_FAILED' }, 500);
  if (!entitlement?.provider_customer_id) return json(req, { error: 'No billing account exists yet.', code: 'NO_BILLING_ACCOUNT' }, 409);

  const site = String(Deno.env.get('PUBLIC_SITE_URL') || DEFAULT_SITE).replace(/\/$/, '');

  try {
    let portalUrl: string | null = null;
    let provider = entitlement.provider;

    if (provider === 'stripe') {
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
      if (!stripeKey) return json(req, { error: 'Stripe billing management is not configured yet.', code: 'STRIPE_NOT_CONFIGURED' }, 503);
      const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });
      const session = await stripe.billingPortal.sessions.create({
        customer: entitlement.provider_customer_id,
        return_url: `${site}/property/account/`
      });
      portalUrl = session.url;
    } else if (provider === 'paddle') {
      // Legacy-only support while Paddle subscriptions are migrated. No new
      // subscriptions are created through Paddle after the Stripe cutover.
      portalUrl = await legacyPaddlePortal(entitlement.provider_customer_id, entitlement.provider_subscription_id || null);
      if (!portalUrl) return json(req, { error: 'Legacy Paddle billing management is unavailable. Contact Watchdog support.', code: 'LEGACY_PORTAL_UNAVAILABLE' }, 503);
    } else {
      return json(req, { error: 'This account does not have a self-service subscription provider.', code: 'NO_SELF_SERVICE_PROVIDER' }, 409);
    }

    await admin.from('access_audit_log').insert({
      user_id: user.id,
      event_type: 'billing.portal_opened',
      resource_type: 'billing_customer',
      resource_id: entitlement.provider_customer_id,
      allowed: true,
      metadata: { provider }
    });

    return json(req, { url: portalUrl, provider });
  } catch (error) {
    console.error('BILLING_PORTAL_ERROR', error);
    return json(req, { error: error instanceof Error ? error.message : 'Billing portal request failed.', code: 'BILLING_PORTAL_ERROR' }, 502);
  }
});
