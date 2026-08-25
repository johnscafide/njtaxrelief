import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const CANONICAL_SITE = 'https://www.watchdogindex.com';
const DEFAULT_SITE = CANONICAL_SITE;
const WATCHDOG_HOSTS = new Set(['watchdogindex.com', 'www.watchdogindex.com']);
const PRODUCTION_HOSTS = new Set([
  'njpropertytaxrelief.com',
  'www.njpropertytaxrelief.com',
  'watchdogindex.com',
  'www.watchdogindex.com'
]);
const CAPACITY = { agent: 25, pro: 250, pro_plus: 2500 } as const;
const PRICE_CATALOG = {
  agent: {
    monthly: { lookup_key: 'watchdog_agent_monthly', amount: 5900 },
    yearly: { lookup_key: 'watchdog_agent_yearly', amount: 59000 }
  },
  pro: {
    monthly: { lookup_key: 'watchdog_pro_monthly', amount: 12900 },
    yearly: { lookup_key: 'watchdog_pro_yearly', amount: 129000 }
  },
  pro_plus: {
    monthly: { lookup_key: 'watchdog_pro_plus_monthly', amount: 39900 },
    yearly: { lookup_key: 'watchdog_pro_plus_yearly', amount: 399000 }
  }
} as const;
const MOVE_PRICE = { lookup_key: 'watchdog_move_90_day', amount: 2900 } as const;
type Tier = keyof typeof CAPACITY;
type Cadence = 'monthly' | 'yearly';
type CheckoutMode = 'closed' | 'controlled' | 'open';

function allowedOrigin(req: Request) {
  const origin = req.headers.get('origin') || '';
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (
      PRODUCTION_HOSTS.has(host) ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.vercel.app')
    ) return origin;
  } catch (_) {}
  return DEFAULT_SITE;
}

function normalizeSite(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !PRODUCTION_HOSTS.has(host)) return '';
    if (WATCHDOG_HOSTS.has(host)) return CANONICAL_SITE;
    return `${url.protocol}//${url.host}`;
  } catch (_) {
    return '';
  }
}

function requestSite(req: Request) {
  const originSite = normalizeSite(req.headers.get('origin') || '');
  if (originSite) return originSite;
  const configuredSite = normalizeSite(String(Deno.env.get('PUBLIC_SITE_URL') || ''));
  return configuredSite || DEFAULT_SITE;
}

function accountPath(site: string) {
  try {
    return WATCHDOG_HOSTS.has(new URL(site).hostname.toLowerCase()) ? '/account' : '/property/account/';
  } catch (_) {
    return '/account';
  }
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

function validMode(value: unknown): CheckoutMode | null {
  const normalized = String(value || '').trim().toLowerCase();
  return ['closed', 'controlled', 'open'].includes(normalized) ? normalized as CheckoutMode : null;
}

function isStripeAuthError(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as any).type === 'StripeAuthenticationError');
}

async function releaseControl(admin: any) {
  const envMode = validMode(Deno.env.get('BILLING_CHECKOUT_MODE') || Deno.env.get('STRIPE_LIVE_CHECKOUT_MODE'));
  const envUsers = String(Deno.env.get('BILLING_CONTROLLED_USER_IDS') || Deno.env.get('STRIPE_LIVE_CONTROLLED_USER_IDS') || '')
    .split(',').map(v => v.trim()).filter(Boolean);

  const { data, error } = await admin
    .from('platform_release_gates')
    .select('status,evidence')
    .eq('gate_key', 'live_billing_lifecycle')
    .maybeSingle();
  if (error) throw error;

  const evidence = data?.evidence && typeof data.evidence === 'object' ? data.evidence : {};
  const gateMode = validMode((evidence as any).checkout_mode || (evidence as any).public_checkout);
  const gateUsers = Array.isArray((evidence as any).controlled_user_ids)
    ? (evidence as any).controlled_user_ids.map((v: unknown) => String(v || '').trim()).filter(Boolean)
    : [];

  return {
    mode: envMode || gateMode || 'closed' as CheckoutMode,
    controlledUsers: new Set(envUsers.length ? envUsers : gateUsers),
    source: envMode ? 'environment_override' : gateMode ? 'release_gate' : 'fail_closed_default',
    liveGatePassed: data?.status === 'passed'
  };
}

async function moveReleaseControl(admin: any) {
  const envMode = validMode(Deno.env.get('MOVE_CHECKOUT_MODE'));
  const envUsers = String(Deno.env.get('MOVE_CONTROLLED_USER_IDS') || '')
    .split(',').map(v => v.trim()).filter(Boolean);
  const { data, error } = await admin
    .from('platform_release_gates')
    .select('status,evidence')
    .eq('gate_key', 'watchdog_move_paid_checkout')
    .maybeSingle();
  if (error) throw error;
  const evidence = data?.evidence && typeof data.evidence === 'object' ? data.evidence : {};
  const gateMode = validMode((evidence as any).checkout_mode);
  const gateUsers = Array.isArray((evidence as any).controlled_user_ids)
    ? (evidence as any).controlled_user_ids.map((v: unknown) => String(v || '').trim()).filter(Boolean)
    : [];
  return {
    mode: envMode || gateMode || 'closed' as CheckoutMode,
    controlledUsers: new Set(envUsers.length ? envUsers : gateUsers),
    source: envMode ? 'environment_override' : gateMode ? 'release_gate' : 'fail_closed_default',
    liveGatePassed: data?.status === 'passed'
  };
}

function configuredPriceId(tier: Tier, cadence: Cadence) {
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
  const configured = String(Deno.env.get(names[tier][cadence]) || '').trim();
  return configured || null;
}

function matchesSubscriptionPrice(price: Stripe.Price, tier: Tier, cadence: Cadence) {
  const expected = PRICE_CATALOG[tier][cadence];
  return (
    price.active &&
    price.currency.toLowerCase() === 'usd' &&
    price.unit_amount === expected.amount &&
    price.type === 'recurring' &&
    price.recurring?.interval === (cadence === 'monthly' ? 'month' : 'year')
  );
}

async function resolvePrice(stripe: Stripe, tier: Tier, cadence: Cadence) {
  const override = configuredPriceId(tier, cadence);
  if (override) {
    const price = await stripe.prices.retrieve(override);
    if (!matchesSubscriptionPrice(price, tier, cadence)) {
      throw new Error(`Configured Stripe Price does not match the governed ${tier} ${cadence} catalog entry.`);
    }
    return price;
  }

  const expected = PRICE_CATALOG[tier][cadence];
  const result = await stripe.prices.list({ lookup_keys: [expected.lookup_key], active: true, limit: 10 });
  const matches = result.data.filter(price => matchesSubscriptionPrice(price, tier, cadence));
  if (matches.length !== 1) throw new Error(`Expected exactly one active Stripe Price for ${expected.lookup_key}; found ${matches.length}.`);
  return matches[0];
}

async function resolveMovePrice(stripe: Stripe) {
  const override = String(Deno.env.get('STRIPE_PRICE_WATCHDOG_MOVE') || '').trim();
  if (override) {
    const price = await stripe.prices.retrieve(override);
    if (!price.active || price.currency.toLowerCase() !== 'usd' || price.unit_amount !== MOVE_PRICE.amount || price.type !== 'one_time' || price.recurring) {
      throw new Error('Configured Watchdog Move Stripe Price does not match the governed one-time $29 price.');
    }
    return price;
  }
  const result = await stripe.prices.list({ lookup_keys: [MOVE_PRICE.lookup_key], active: true, limit: 10 });
  const matches = result.data.filter(price =>
    price.currency.toLowerCase() === 'usd' &&
    price.unit_amount === MOVE_PRICE.amount &&
    price.type === 'one_time' &&
    !price.recurring
  );
  if (matches.length !== 1) throw new Error(`Expected exactly one active Stripe Price for ${MOVE_PRICE.lookup_key}; found ${matches.length}.`);
  return matches[0];
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

  const body = await req.json().catch(() => ({}));
  const requestedProduct = String(body?.product || '').trim().toLowerCase();
  const rawTier = String(body?.tier || body?.plan || '').toLowerCase();
  const isMove = requestedProduct === 'watchdog_move' || rawTier === 'move' || rawTier === 'watchdog_move';

  let control;
  try {
    control = isMove ? await moveReleaseControl(admin) : await releaseControl(admin);
  } catch (error) {
    console.error(isMove ? 'MOVE_RELEASE_CONTROL_ERROR' : 'BILLING_RELEASE_CONTROL_ERROR', error);
    return json(req, { error: isMove ? 'Watchdog Move enrollment is not available right now.' : 'Paid enrollment is not available right now.', code: isMove ? 'MOVE_RELEASE_CONTROL_ERROR' : 'BILLING_RELEASE_CONTROL_ERROR' }, 503);
  }
  if (control.mode === 'closed') return json(req, { error: isMove ? 'Watchdog Move paid enrollment is not open yet.' : 'Paid enrollment is not open yet.', code: isMove ? 'MOVE_ENROLLMENT_CLOSED' : 'BILLING_ENROLLMENT_CLOSED' }, 503);
  if (control.mode === 'controlled' && !control.controlledUsers.has(user.id)) {
    return json(req, { error: isMove ? 'Watchdog Move enrollment is currently limited to controlled launch accounts.' : 'Paid enrollment is currently limited to controlled launch accounts.', code: isMove ? 'MOVE_CONTROLLED_ONLY' : 'BILLING_CONTROLLED_ONLY' }, 403);
  }
  if (control.mode === 'open' && !control.liveGatePassed) {
    return json(req, { error: isMove ? 'Watchdog Move is awaiting final paid lifecycle acceptance.' : 'Paid enrollment is awaiting final Live billing acceptance.', code: isMove ? 'MOVE_GATE_NOT_PASSED' : 'BILLING_GATE_NOT_PASSED' }, 503);
  }

  const stripeKey = String(Deno.env.get('STRIPE_SECRET_KEY') || '').trim();
  if (!stripeKey) return json(req, { error: 'Stripe Checkout is not configured yet.', code: 'STRIPE_NOT_CONFIGURED' }, 503);

  const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });
  const site = requestSite(req);
  const { data: isTest } = await admin.rpc('is_watchdog_test_account', { p_user_id: user.id });

  if (isMove) {
    let price: Stripe.Price;
    try {
      price = await resolveMovePrice(stripe);
    } catch (error) {
      console.error('STRIPE_MOVE_PRICE_RESOLUTION_ERROR', error);
      const code = isStripeAuthError(error) ? 'STRIPE_API_KEY_INVALID' : 'MOVE_PRICE_NOT_CONFIGURED';
      const message = code === 'STRIPE_API_KEY_INVALID'
        ? 'Stripe rejected the configured Checkout API credential.'
        : 'The Watchdog Move price could not be resolved safely in this environment.';
      return json(req, { error: message, code }, 503);
    }
    const liveMode = price.livemode === true;
    if (liveMode && isTest) return json(req, { error: 'Watchdog test accounts cannot create real charges.', code: 'WATCHDOG_TEST_NO_REAL_SPEND' }, 403);
    const priceId = price.id;

    const metadata = {
      supabase_user_id: user.id,
      watchdog_user_id: user.id,
      product: 'watchdog_move',
      duration_days: '90',
      auto_renew: 'false'
    };

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        ...(user.email ? { customer_email: user.email } : {}),
        client_reference_id: user.id,
        metadata,
        payment_intent_data: { metadata },
        success_url: `${site}/move/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${site}/move/?checkout=cancelled`,
        billing_address_collection: 'auto',
        integration_identifier: 'watchdog_web_kqrmxpta'
      });

      await admin.from('access_audit_log').insert({
        user_id: user.id,
        event_type: 'billing.move_checkout_created',
        resource_type: 'checkout_session',
        resource_id: session.id,
        required_plan: 'standard',
        allowed: true,
        metadata: {
          provider: 'stripe',
          product: 'watchdog_move',
          duration_days: 90,
          price_id: priceId,
          checkout_mode: control.mode,
          checkout_control_source: control.source,
          stripe_mode: liveMode ? 'live' : 'test',
          return_site: site
        }
      });

      return json(req, {
        provider: 'stripe',
        product: 'watchdog_move',
        destination: 'checkout',
        url: session.url,
        session_id: session.id,
        duration_days: 90,
        auto_renew: false,
        stripe_mode: liveMode ? 'live' : 'test'
      });
    } catch (error) {
      console.error('STRIPE_MOVE_CHECKOUT_ERROR', error);
      return json(req, { error: error instanceof Error ? error.message : 'Could not create Watchdog Move Checkout.', code: 'STRIPE_MOVE_CHECKOUT_ERROR' }, 502);
    }
  }

  if (rawTier === 'teams') return json(req, { error: 'Teams enrollment is not open yet.', code: 'TEAMS_ENROLLMENT_CLOSED' }, 409);
  if (!['agent', 'pro', 'pro_plus', 'pro+'].includes(rawTier)) return json(req, { error: 'Choose Agent, Pro, or Pro+.', code: 'INVALID_PLAN' }, 400);
  const tier = (rawTier === 'pro+' ? 'pro_plus' : rawTier) as Tier;
  const cadence: Cadence = String(body?.cadence || 'yearly').toLowerCase() === 'monthly' ? 'monthly' : 'yearly';

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
      const portal = await stripe.billingPortal.sessions.create({ customer: entitlement.provider_customer_id, return_url: `${site}${accountPath(site)}` });
      await admin.from('access_audit_log').insert({
        user_id: user.id,
        event_type: 'billing.existing_subscription_redirected_to_portal',
        resource_type: 'subscription',
        resource_id: entitlement.provider_subscription_id,
        required_plan: tier,
        allowed: true,
        metadata: { provider: 'stripe', requested_tier: tier, requested_cadence: cadence, current_price_id: entitlement.provider_price_id, checkout_control_source: control.source, return_site: site }
      });
      return json(req, { provider: 'stripe', destination: 'portal', url: portal.url });
    } catch (error) {
      console.error('STRIPE_PORTAL_FROM_CHECKOUT_ERROR', error);
      return json(req, { error: 'Could not open Stripe billing management.', code: 'STRIPE_PORTAL_ERROR' }, 502);
    }
  }

  let price: Stripe.Price;
  try {
    price = await resolvePrice(stripe, tier, cadence);
  } catch (error) {
    console.error('STRIPE_PRICE_RESOLUTION_ERROR', error);
    const code = isStripeAuthError(error) ? 'STRIPE_API_KEY_INVALID' : 'PRICE_NOT_CONFIGURED';
    const message = code === 'STRIPE_API_KEY_INVALID'
      ? 'Stripe rejected the configured Checkout API credential.'
      : 'That Stripe price could not be resolved safely in this environment.';
    return json(req, { error: message, code }, 503);
  }
  const liveMode = price.livemode === true;
  if (liveMode && isTest) return json(req, { error: 'Watchdog test accounts cannot create real charges.', code: 'WATCHDOG_TEST_NO_REAL_SPEND' }, 403);
  const priceId = price.id;

  const account = accountPath(site);
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
      ...(customerId ? { customer_update: { address: 'auto' } } : {}),
      client_reference_id: user.id,
      metadata,
      subscription_data: { metadata },
      automatic_tax: { enabled: true },
      success_url: `${site}${account}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}${account}?checkout=cancelled`,
      billing_address_collection: 'required',
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
        provider: 'stripe', billing_tier: tier, cadence, price_id: priceId,
        checkout_mode: control.mode, checkout_control_source: control.source,
        stripe_mode: liveMode ? 'live' : 'test', return_site: site,
        automatic_tax: true
      }
    });

    return json(req, {
      provider: 'stripe', destination: 'checkout', url: session.url,
      session_id: session.id, tier, cadence, stripe_mode: liveMode ? 'live' : 'test'
    });
  } catch (error) {
    console.error('STRIPE_CHECKOUT_ERROR', error);
    return json(req, { error: error instanceof Error ? error.message : 'Could not create Stripe Checkout.', code: 'STRIPE_CHECKOUT_ERROR' }, 502);
  }
});