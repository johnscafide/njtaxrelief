import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const DEFAULT_SITE = 'https://njpropertytaxrelief.com';
const CAPACITY = { agent: 25, pro: 250, pro_plus: 2500 } as const;
type Tier = keyof typeof CAPACITY;
type Cadence = 'monthly' | 'yearly';

function allowedOrigin(req: Request) {
  const origin = req.headers.get('origin') || '';
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (
      host === 'njpropertytaxrelief.com' ||
      host === 'www.njpropertytaxrelief.com' ||
      host === 'watchdogre.com' ||
      host === 'www.watchdogre.com' ||
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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function checkoutMode() {
  // BILLING_CHECKOUT_MODE is environment-neutral so the identical artifact can
  // be exercised in staging before production. STRIPE_LIVE_CHECKOUT_MODE is
  // accepted only as a temporary production migration fallback.
  const explicit = String(
    Deno.env.get('BILLING_CHECKOUT_MODE') ||
    Deno.env.get('STRIPE_LIVE_CHECKOUT_MODE') ||
    ''
  ).trim().toLowerCase();
  if (['closed', 'controlled', 'open'].includes(explicit)) return explicit;
  return 'closed';
}

function controlledUsers() {
  return new Set(
    String(
      Deno.env.get('BILLING_CONTROLLED_USER_IDS') ||
      Deno.env.get('STRIPE_LIVE_CONTROLLED_USER_IDS') ||
      ''
    )
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)
  );
}

function priceFor(tier: Tier, cadence: Cadence) {
  const names: Record<Tier, Record<Cadence, string>> = {
    agent: {
      monthly: 'STRIPE_PRICE_AGENT_MONTHLY',
      yearly: 'STRIPE_PRICE_AGENT_YEARLY'
    },
    pro: {
      monthly: 'STRIPE_PRICE_PRO_MONTHLY',
      yearly: 'STRIPE_PRICE_PRO_YEARLY'
    },
    pro_plus: {
      monthly: 'STRIPE_PRICE_PRO_PLUS_MONTHLY',
      yearly: 'STRIPE_PRICE_PRO_PLUS_YEARLY'
    }
  };
  const configured = Deno.env.get(names[tier][cadence]);
  if (configured) return configured;
  // Temporary compatibility only for the two historical monthly names. Annual
  // prices and Agent never fall back. There are deliberately no hard-coded
  // Live Price IDs here: staging and production must each configure their own.
  if (tier === 'pro' && cadence === 'monthly') return Deno.env.get('STRIPE_PRICE_PRO') || null;
  if (tier === 'pro_plus' && cadence === 'monthly') return Deno.env.get('STRIPE_PRICE_PRO_PLUS') || null;
  return null;
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

  const mode = checkoutMode();
  if (mode === 'closed') return json(req, { error: 'Paid enrollment is not open yet.', code: 'BILLING_ENROLLMENT_CLOSED' }, 503);
  if (mode === 'controlled' && !controlledUsers().has(user.id)) {
    return json(req, { error: 'Paid enrollment is currently limited to controlled launch accounts.', code: 'BILLING_CONTROLLED_ONLY' }, 403);
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return json(req, { error: 'Stripe Checkout is not configured yet.', code: 'STRIPE_NOT_CONFIGURED' }, 503);
  const liveMode = stripeKey.startsWith('sk_live_');
  const testMode = stripeKey.startsWith('sk_test_');
  if (!liveMode && !testMode) {
    return json(req, { error: 'Stripe Checkout key mode is not recognized.', code: 'STRIPE_KEY_MODE_INVALID' }, 503);
  }

  const { data: isTest } = await admin.rpc('is_watchdog_test_account', { p_user_id: user.id });
  if (liveMode && isTest) {
    return json(req, { error: 'Watchdog test accounts cannot create real charges.', code: 'WATCHDOG_TEST_NO_REAL_SPEND' }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const rawTier = String(body?.tier || body?.plan || '').toLowerCase();
  if (rawTier === 'teams') return json(req, { error: 'Teams enrollment is not open yet.', code: 'TEAMS_ENROLLMENT_CLOSED' }, 409);
  if (!['agent', 'pro', 'pro_plus', 'pro+'].includes(rawTier)) {
    return json(req, { error: 'Choose Agent, Pro, or Pro+.', code: 'INVALID_PLAN' }, 400);
  }
  const tier = (rawTier === 'pro+' ? 'pro_plus' : rawTier) as Tier;
  const cadence: Cadence = String(body?.cadence || 'yearly').toLowerCase() === 'monthly' ? 'monthly' : 'yearly';
  const priceId = priceFor(tier, cadence);
  if (!priceId) {
    return json(req, { error: 'That Stripe price is not configured in this environment.', code: 'PRICE_NOT_CONFIGURED' }, 503);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });
  const { data: entitlement, error: entitlementError } = await admin
    .from('account_entitlements')
    .select('plan_tier,billing_tier,provider,provider_customer_id,provider_subscription_id,provider_price_id,subscription_status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (entitlementError) return json(req, { error: 'Could not read billing state.', code: 'ENTITLEMENT_READ_FAILED' }, 500);

  const hasLiveLikeSubscription = ['active', 'trialing', 'past_due', 'paused'].includes(entitlement?.subscription_status || '');
  if (entitlement?.provider === 'paddle' && entitlement?.provider_subscription_id && hasLiveLikeSubscription) {
    return json(req, {
      error: 'This account still has a legacy Paddle subscription. Contact Watchdog support before starting Stripe billing so you are not charged twice.',
      code: 'LEGACY_SUBSCRIPTION_MIGRATION_REQUIRED'
    }, 409);
  }

  if (entitlement?.provider === 'stripe' && entitlement?.provider_customer_id && entitlement?.provider_subscription_id && hasLiveLikeSubscription) {
    try {
      const site = String(Deno.env.get('PUBLIC_SITE_URL') || DEFAULT_SITE).replace(/\/$/, '');
      const portal = await stripe.billingPortal.sessions.create({
        customer: entitlement.provider_customer_id,
        return_url: `${site}/property/account/`
      });
      await admin.from('access_audit_log').insert({
        user_id: user.id,
        event_type: 'billing.existing_subscription_redirected_to_portal',
        resource_type: 'subscription',
        resource_id: entitlement.provider_subscription_id,
        required_plan: tier,
        allowed: true,
        metadata: { provider: 'stripe', requested_tier: tier, requested_cadence: cadence, current_price_id: entitlement.provider_price_id }
      });
      return json(req, { provider: 'stripe', destination: 'portal', url: portal.url });
    } catch (error) {
      console.error('STRIPE_PORTAL_FROM_CHECKOUT_ERROR', error);
      return json(req, { error: 'Could not open Stripe billing management.', code: 'STRIPE_PORTAL_ERROR' }, 502);
    }
  }

  const site = String(Deno.env.get('PUBLIC_SITE_URL') || DEFAULT_SITE).replace(/\/$/, '');
  const customerId = entitlement?.provider === 'stripe' ? entitlement.provider_customer_id : null;
  const metadata = {
    supabase_user_id: user.id,
    watchdog_user_id: user.id,
    product: 'watchdog_subscription',
    billing_tier: tier,
    plan_tier: tier,
    billing_interval: cadence,
    property_capacity: String(CAPACITY[tier])
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      ...(customerId ? { customer: customerId } : user.email ? { customer_email: user.email } : {}),
      client_reference_id: user.id,
      metadata,
      subscription_data: { metadata },
      success_url: `${site}/property/account/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/property/account/?checkout=cancelled`,
      billing_address_collection: 'auto',
      integration_identifier: 'watchdog_web_kqrmxpta'
    });

    await admin.from('access_audit_log').insert({
      user_id: user.id,
      event_type: 'billing.checkout_created',
      resource_type: 'checkout_session',
      resource_id: session.id,
      required_plan: tier,
      allowed: true,
      metadata: {
        provider: 'stripe',
        billing_tier: tier,
        cadence,
        price_id: priceId,
        checkout_mode: mode,
        stripe_mode: liveMode ? 'live' : 'test'
      }
    });

    return json(req, {
      provider: 'stripe',
      destination: 'checkout',
      url: session.url,
      session_id: session.id,
      tier,
      cadence,
      stripe_mode: liveMode ? 'live' : 'test'
    });
  } catch (error) {
    console.error('STRIPE_CHECKOUT_ERROR', error);
    return json(req, { error: error instanceof Error ? error.message : 'Could not create Stripe Checkout.', code: 'STRIPE_CHECKOUT_ERROR' }, 502);
  }
});
