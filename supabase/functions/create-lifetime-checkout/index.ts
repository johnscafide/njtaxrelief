import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const CANONICAL_SITE = 'https://www.watchdogindex.com';
const PRODUCTION_HOSTS = new Set([
  'watchdogindex.com',
  'www.watchdogindex.com',
  'njpropertytaxrelief.com',
  'www.njpropertytaxrelief.com'
]);
const CAPACITY = { agent: 25, pro: 250, pro_plus: 2500 } as const;
const FOUNDING = {
  agent: { amount: 149900, label: 'Agent' },
  pro: { amount: 349900, label: 'Pro' },
  pro_plus: { amount: 999900, label: 'Pro+' }
} as const;
const TAX_CODE = 'txcd_10701400';
type Tier = keyof typeof FOUNDING;

function origin(req: Request) {
  const raw = req.headers.get('origin') || '';
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (PRODUCTION_HOSTS.has(host) || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')) return raw;
  } catch (_) {}
  return CANONICAL_SITE;
}

function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': origin(req),
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

function tierOf(value: unknown): Tier | null {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'pro+') return 'pro_plus';
  return raw === 'agent' || raw === 'pro' || raw === 'pro_plus' ? raw : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed.' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json(req, { error: 'Sign in required.', code: 'SIGN_IN_REQUIRED' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json(req, { error: 'Sign in required.', code: 'SIGN_IN_REQUIRED' }, 401);

  const body = await req.json().catch(() => ({}));
  const tier = tierOf(body?.tier || body?.plan);
  if (!tier) return json(req, { error: 'Choose Agent, Pro, or Pro+.', code: 'INVALID_PLAN' }, 400);

  const gate = await admin.from('platform_release_gates').select('status,evidence').eq('gate_key', 'live_billing_lifecycle').maybeSingle();
  if (gate.error) return json(req, { error: 'Paid enrollment is unavailable right now.', code: 'BILLING_RELEASE_CONTROL_ERROR' }, 503);
  const evidence = gate.data?.evidence && typeof gate.data.evidence === 'object' ? gate.data.evidence : {};
  const mode = String((evidence as any).checkout_mode || (evidence as any).public_checkout || '').toLowerCase();
  if (gate.data?.status !== 'passed' || mode !== 'open') return json(req, { error: 'Founding Lifetime enrollment is not open right now.', code: 'LIFETIME_ENROLLMENT_CLOSED' }, 503);

  const { data: isTest } = await admin.rpc('is_watchdog_test_account', { p_user_id: user.id });
  if (isTest) return json(req, { error: 'Watchdog test accounts cannot create real charges.', code: 'WATCHDOG_TEST_NO_REAL_SPEND' }, 403);

  const entitlementResult = await admin.from('account_entitlements')
    .select('plan_tier,billing_tier,billing_interval,provider,provider_customer_id,provider_subscription_id,subscription_status,source')
    .eq('user_id', user.id)
    .maybeSingle();
  if (entitlementResult.error) return json(req, { error: 'Could not read billing state.', code: 'ENTITLEMENT_READ_FAILED' }, 500);
  const entitlement = entitlementResult.data;

  if (entitlement?.billing_interval === 'lifetime' && entitlement?.subscription_status === 'active') {
    return json(req, { error: 'This account already has Founding Lifetime access.', code: 'LIFETIME_ALREADY_ACTIVE' }, 409);
  }
  const hasRecurring = Boolean(entitlement?.provider_subscription_id) && ['active', 'trialing', 'past_due', 'paused'].includes(entitlement?.subscription_status || '');
  if (hasRecurring) {
    return json(req, { error: 'This account already has active recurring billing. End that subscription before switching to Founding Lifetime so you are not charged twice.', code: 'LIFETIME_ACTIVE_SUBSCRIPTION' }, 409);
  }

  const stripeKey = String(Deno.env.get('STRIPE_SECRET_KEY') || '').trim();
  if (!stripeKey) return json(req, { error: 'Secure checkout is not configured.', code: 'STRIPE_NOT_CONFIGURED' }, 503);
  const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });
  const offer = FOUNDING[tier];
  const metadata = {
    supabase_user_id: user.id,
    watchdog_user_id: user.id,
    product: 'watchdog_founding_lifetime',
    billing_tier: tier,
    plan_tier: tier,
    billing_interval: 'lifetime',
    property_capacity: String(CAPACITY[tier]),
    founding_offer: '2026_soft_launch_v1',
    governed_amount_cents: String(offer.amount)
  };

  try {
    const customerId = entitlement?.provider === 'stripe' && entitlement?.provider_customer_id ? entitlement.provider_customer_id : null;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: offer.amount,
          product_data: {
            name: `Watchdog ${offer.label} · Founding Lifetime`,
            description: 'One-time Watchdog professional plan access. Usage-based services and third-party costs are separate.',
            tax_code: TAX_CODE,
            metadata: { product: 'watchdog_founding_lifetime', tier }
          }
        },
        quantity: 1
      }],
      ...(customerId ? { customer: customerId, customer_update: { address: 'auto' as const } } : user.email ? { customer_email: user.email, customer_creation: 'always' as const } : { customer_creation: 'always' as const }),
      client_reference_id: user.id,
      metadata,
      payment_intent_data: { metadata },
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      success_url: `${CANONICAL_SITE}/property/pro?checkout=lifetime-success&session_id={CHECKOUT_SESSION_ID}#pricing`,
      cancel_url: `${CANONICAL_SITE}/property/pro?checkout=lifetime-cancelled#pricing`,
      integration_identifier: 'watchdog_web_kqrmxpta'
    });

    await admin.from('access_audit_log').insert({
      user_id: user.id,
      event_type: 'billing.lifetime_checkout_created',
      resource_type: 'checkout_session',
      resource_id: session.id,
      required_plan: tier,
      allowed: true,
      metadata: {
        provider: 'stripe', billing_tier: tier, billing_interval: 'lifetime',
        amount_cents: offer.amount, checkout_mode: mode, automatic_tax: true,
        founding_offer: '2026_soft_launch_v1'
      }
    });

    return json(req, {
      provider: 'stripe', destination: 'checkout', url: session.url,
      session_id: session.id, tier, cadence: 'lifetime', amount_cents: offer.amount
    });
  } catch (error) {
    console.error('STRIPE_LIFETIME_CHECKOUT_ERROR', error);
    return json(req, { error: 'Could not open secure Founding Lifetime checkout.', code: 'STRIPE_LIFETIME_CHECKOUT_ERROR' }, 502);
  }
});
