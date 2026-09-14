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
const FOUNDING = { agent: 149900, pro: 349900, pro_plus: 999900 } as const;
const PLAN_LABEL = { agent: 'Agent', pro: 'Pro', pro_plus: 'Pro+' } as const;
const OPENAI_ADS_ENDPOINT = 'https://bzr.openai.com/v1/events';
type Tier = keyof typeof FOUNDING;

type OpenAIAdsContext = {
  measurement_allowed: boolean;
  oppref: string;
  obref: string;
  source_url: string;
};

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
  return raw === 'agent' || raw === 'pro' || raw === 'pro_plus' ? raw : null;
}

function opaque(value: unknown, max = 2048) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) return '';
  return value;
}

function safeSourceUrl(value: unknown) {
  try {
    const u = new URL(String(value || ''));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('unsupported protocol');
    const host = u.hostname.toLowerCase();
    if (host === 'watchdogindex.com' || host === 'www.watchdogindex.com') return `${CANONICAL_SITE}${u.pathname}`;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')) return `${u.origin}${u.pathname}`;
  } catch (_) {}
  return `${CANONICAL_SITE}/property/pro`;
}

function openAIAdsContext(value: unknown): OpenAIAdsContext | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.measurement_allowed !== true) return null;
  return {
    measurement_allowed: true,
    oppref: opaque(raw.oppref),
    obref: opaque(raw.obref),
    source_url: safeSourceUrl(raw.source_url)
  };
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function openAIAdsEventId(sessionId: string) {
  const digest = await sha256Hex(sessionId);
  return `wd_order_${digest.slice(0, 40)}`;
}

async function sendOpenAIAdsOrderCreated(args: {
  context: OpenAIAdsContext | null;
  eventId: string;
  tier: Tier;
  amountCents: number;
  email: string | null;
  userId: string;
  userAgent: string;
}) {
  if (!args.context?.measurement_allowed) return;
  const pixelId = String(Deno.env.get('OPENAI_ADS_PIXEL_ID') || '').trim();
  const apiKey = String(Deno.env.get('OPENAI_ADS_CAPI_KEY') || '').trim();
  if (!pixelId || !apiKey) return;

  const user: Record<string, unknown> = {};
  if (args.context.obref) user.obref = args.context.obref;
  const normalizedEmail = String(args.email || '').trim().toLowerCase();
  if (normalizedEmail) user.emails_sha256 = [await sha256Hex(normalizedEmail)];
  if (args.userId.trim()) user.external_ids_sha256 = [await sha256Hex(args.userId.trim())];
  if (args.userAgent.trim()) user.user_agent = args.userAgent.trim().slice(0, 512);

  const event: Record<string, unknown> = {
    id: args.eventId,
    type: 'order_created',
    timestamp_ms: Date.now(),
    source_url: args.context.source_url,
    action_source: 'web',
    opt_out: true,
    data: {
      type: 'contents',
      amount: args.amountCents,
      currency: 'USD',
      contents: [{
        id: `watchdog_founding_lifetime_${args.tier}`,
        name: `Watchdog ${PLAN_LABEL[args.tier]} Founding Lifetime`,
        content_type: 'plan',
        quantity: 1,
        amount: args.amountCents,
        currency: 'USD'
      }]
    }
  };
  if (args.context.oppref) event.oppref = args.context.oppref;
  if (Object.keys(user).length) event.user = user;

  const validateOnly = /^(1|true|yes)$/i.test(String(Deno.env.get('OPENAI_ADS_VALIDATE_ONLY') || ''));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${OPENAI_ADS_ENDPOINT}?pid=${encodeURIComponent(pixelId)}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        validate_only: validateOnly,
        integration_source: 'watchdog_web',
        events: [event]
      })
    });
    if (!response.ok) console.warn('OPENAI_ADS_CAPI_FAILED', { status: response.status });
  } catch (error) {
    console.warn('OPENAI_ADS_CAPI_FAILED', { reason: error instanceof Error ? error.name : 'unknown' });
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed.' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json(req, { error: 'Sign in required.', code: 'SIGN_IN_REQUIRED' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const stripeKey = String(Deno.env.get('STRIPE_SECRET_KEY') || '').trim();
  if (!stripeKey) return json(req, { error: 'Secure billing is unavailable.', code: 'STRIPE_NOT_CONFIGURED' }, 503);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json(req, { error: 'Sign in required.', code: 'SIGN_IN_REQUIRED' }, 401);

  const body = await req.json().catch(() => ({}));
  const sessionId = String(body?.session_id || '').trim();
  if (!sessionId.startsWith('cs_')) return json(req, { error: 'Invalid checkout session.', code: 'INVALID_CHECKOUT_SESSION' }, 400);
  const adsContext = openAIAdsContext(body?.openai_ads);

  const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
  } catch (error) {
    console.error('LIFETIME_SESSION_RETRIEVE_ERROR', error);
    return json(req, { error: 'Could not verify the checkout session.', code: 'CHECKOUT_VERIFY_FAILED' }, 502);
  }

  const meta = session.metadata || {};
  const tier = tierOf(meta.billing_tier || meta.plan_tier);
  if (meta.product !== 'watchdog_founding_lifetime' || !tier || meta.supabase_user_id !== user.id) {
    return json(req, { error: 'This checkout does not belong to this Watchdog account.', code: 'CHECKOUT_ACCOUNT_MISMATCH' }, 403);
  }
  if (session.mode !== 'payment' || (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required')) {
    return json(req, { error: 'Payment has not completed yet.', code: 'PAYMENT_NOT_COMPLETE' }, 409);
  }
  if (String(session.currency || '').toLowerCase() !== 'usd' || Number(session.amount_subtotal || 0) !== FOUNDING[tier]) {
    return json(req, { error: 'The checkout amount does not match the governed Founding Lifetime offer.', code: 'LIFETIME_AMOUNT_MISMATCH' }, 409);
  }

  const paymentIntent = session.payment_intent;
  const paymentIntentId = typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id || null;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || null;
  if (!paymentIntentId || !customerId) return json(req, { error: 'The completed payment is missing its billing references.', code: 'LIFETIME_PAYMENT_REFERENCE_MISSING' }, 409);

  const prior = await admin.from('billing_lifetime_purchases').select('checkout_session_id,user_id,tier,status').eq('checkout_session_id', session.id).maybeSingle();
  if (prior.error) return json(req, { error: 'Could not read lifetime purchase state.', code: 'LIFETIME_LEDGER_READ_FAILED' }, 500);
  if (prior.data && prior.data.user_id !== user.id) return json(req, { error: 'This checkout is already assigned to another account.', code: 'CHECKOUT_ACCOUNT_MISMATCH' }, 403);

  const now = new Date().toISOString();
  const amountTotalCents = Number(session.amount_total || session.amount_subtotal || FOUNDING[tier]);
  const purchase = {
    checkout_session_id: session.id,
    user_id: user.id,
    payment_intent_id: paymentIntentId,
    stripe_customer_id: customerId,
    tier,
    amount_cents: amountTotalCents,
    currency: 'usd',
    status: 'paid',
    purchased_at: prior.data ? undefined : now,
    metadata: {
      founding_offer: meta.founding_offer || '2026_soft_launch_v1',
      base_price_cents: FOUNDING[tier],
      amount_total_cents: Number(session.amount_total || 0),
      automatic_tax: true
    },
    updated_at: now
  } as Record<string, unknown>;
  if (purchase.purchased_at === undefined) delete purchase.purchased_at;

  const ledger = prior.data
    ? await admin.from('billing_lifetime_purchases').update(purchase).eq('checkout_session_id', session.id)
    : await admin.from('billing_lifetime_purchases').insert(purchase);
  if (ledger.error) {
    console.error('LIFETIME_LEDGER_WRITE_ERROR', ledger.error);
    return json(req, { error: 'Payment was verified but access could not be recorded safely. Contact Watchdog support.', code: 'LIFETIME_LEDGER_WRITE_FAILED' }, 500);
  }

  const sentinel = `lifetime:${session.id}`;
  const entitlement = await admin.from('account_entitlements').upsert({
    user_id: user.id,
    plan_tier: tier,
    billing_tier: tier,
    billing_interval: 'lifetime',
    property_capacity: CAPACITY[tier],
    subscription_status: 'active',
    provider: 'stripe',
    provider_customer_id: customerId,
    provider_subscription_id: sentinel,
    provider_price_id: sentinel,
    current_period_end: null,
    cancel_at_period_end: false,
    provider_event_at: now,
    source: 'stripe-lifetime',
    updated_at: now
  }, { onConflict: 'user_id' });
  if (entitlement.error) {
    console.error('LIFETIME_ENTITLEMENT_WRITE_ERROR', entitlement.error);
    return json(req, { error: 'Payment was verified but access could not be activated safely. Contact Watchdog support.', code: 'LIFETIME_ENTITLEMENT_WRITE_FAILED' }, 500);
  }

  if (!prior.data) {
    await admin.from('access_audit_log').insert({
      user_id: user.id,
      event_type: 'billing.lifetime_activated',
      resource_type: 'checkout_session',
      resource_id: session.id,
      required_plan: tier,
      allowed: true,
      metadata: {
        provider: 'stripe', payment_intent_id: paymentIntentId, customer_id: customerId,
        billing_tier: tier, billing_interval: 'lifetime', property_capacity: CAPACITY[tier],
        amount_subtotal_cents: FOUNDING[tier], amount_total_cents: Number(session.amount_total || 0),
        founding_offer: meta.founding_offer || '2026_soft_launch_v1'
      }
    });
  }

  const adsEventId = await openAIAdsEventId(session.id);
  if (adsContext) {
    const conversion = sendOpenAIAdsOrderCreated({
      context: adsContext,
      eventId: adsEventId,
      tier,
      amountCents: amountTotalCents,
      email: user.email || null,
      userId: user.id,
      userAgent: String(req.headers.get('user-agent') || '')
    });
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime && typeof edgeRuntime.waitUntil === 'function') edgeRuntime.waitUntil(conversion);
    else await conversion;
  }

  return json(req, {
    ok: true,
    tier,
    billing_interval: 'lifetime',
    property_capacity: CAPACITY[tier],
    already_activated: Boolean(prior.data),
    amount_cents: amountTotalCents,
    ads_event_id: adsContext ? adsEventId : null
  });
});
