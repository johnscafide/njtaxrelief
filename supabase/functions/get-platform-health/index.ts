import { createClient } from 'npm:@supabase/supabase-js@2.55.0';
import Stripe from 'npm:stripe@18.4.0';

const CANONICAL_SITE = 'https://www.watchdogindex.com';
const PRICE_LOOKUPS = [
  ['watchdog_agent_monthly', 5900, 'month'],
  ['watchdog_agent_yearly', 59000, 'year'],
  ['watchdog_pro_monthly', 12900, 'month'],
  ['watchdog_pro_yearly', 129000, 'year'],
  ['watchdog_pro_plus_monthly', 39900, 'month'],
  ['watchdog_pro_plus_yearly', 399000, 'year']
] as const;
const PUBLIC_STATUS_ACTIVE_WINDOW_MS = 30 * 60 * 1000;
const PUBLIC_STATUS_HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type CheckoutMode = 'closed' | 'controlled' | 'open';
type PublicIncidentRow = {
  severity: string | null;
  status: string | null;
  last_seen_at: string | null;
  resolved_at: string | null;
};

function allowedOrigin(req: Request) {
  const origin = req.headers.get('origin') || '';
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (
      host === 'watchdogindex.com' ||
      host === 'www.watchdogindex.com' ||
      host === 'njpropertytaxrelief.com' ||
      host === 'www.njpropertytaxrelief.com' ||
      host === 'watchdogre.com' ||
      host === 'www.watchdogre.com' ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.vercel.app')
    ) return origin;
  } catch (_) {}
  return CANONICAL_SITE;
}

function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function publicJson(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=60'
    }
  });
}

function envPresent(name: string) {
  return Boolean(String(Deno.env.get(name) || '').trim());
}

function validMode(value: unknown): CheckoutMode | null {
  const normalized = String(value || '').trim().toLowerCase();
  return ['closed', 'controlled', 'open'].includes(normalized) ? normalized as CheckoutMode : null;
}

async function resolveStripeCatalog(stripeKey: string | undefined) {
  const state = {
    resolved: 0,
    required: PRICE_LOOKUPS.length,
    ready: false,
    mode: 'missing',
    error: null as string | null
  };
  if (!stripeKey) return state;
  state.mode = stripeKey.startsWith('sk_live_') ? 'live' : stripeKey.startsWith('sk_test_') ? 'test' : 'unknown';
  if (state.mode === 'unknown') {
    state.error = 'unrecognized_key_mode';
    return state;
  }

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });
    for (const [lookupKey, amount, interval] of PRICE_LOOKUPS) {
      const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 10 });
      const matches = prices.data.filter(price =>
        price.currency.toLowerCase() === 'usd' &&
        price.unit_amount === amount &&
        price.type === 'recurring' &&
        price.recurring?.interval === interval
      );
      if (matches.length === 1) state.resolved++;
    }
    state.ready = state.resolved === state.required;
  } catch (_) {
    state.error = 'stripe_catalog_lookup_failed';
  }
  return state;
}

async function publicStatus(req: Request, admin: ReturnType<typeof createClient>) {
  const now = Date.now();
  const historySince = new Date(now - PUBLIC_STATUS_HISTORY_WINDOW_MS).toISOString();
  const activeSince = now - PUBLIC_STATUS_ACTIVE_WINDOW_MS;
  const { data, error } = await admin
    .from('platform_incidents')
    .select('severity,status,last_seen_at,resolved_at')
    .gte('last_seen_at', historySince)
    .order('last_seen_at', { ascending: false })
    .limit(100);

  if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
    console.error('public_status_incident_read_failed', { code: error.code });
    return publicJson(req, {
      generated_at: new Date().toISOString(),
      status: 'unknown',
      components: [],
      recent_resolved: []
    }, 503);
  }

  const rows = (data || []) as PublicIncidentRow[];
  // platform_incidents are daily aggregation buckets and are not automatically
  // closed when signals stop. Only recently observed unresolved signals represent
  // current public service health; older rows remain internal historical evidence.
  const active = rows.filter(row => {
    if (row.status === 'resolved' || !row.last_seen_at) return false;
    const seen = new Date(row.last_seen_at).getTime();
    return Number.isFinite(seen) && seen >= activeSince;
  });
  const hasCritical = active.some(row => String(row.severity || '').toLowerCase() === 'critical');
  const overall = hasCritical ? 'major_outage' : active.length ? 'degraded' : 'operational';
  const recentResolved = rows
    .filter(row => row.status === 'resolved' && row.resolved_at)
    .sort((a, b) => new Date(b.resolved_at || 0).getTime() - new Date(a.resolved_at || 0).getTime())
    .slice(0, 5)
    .map(row => ({ component: 'Watchdog web app', resolved_at: row.resolved_at }));

  return publicJson(req, {
    generated_at: new Date().toISOString(),
    status: overall,
    components: [{ name: 'Watchdog web app', status: overall }],
    recent_resolved: recentResolved
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, service);

  if (req.method === 'GET') return publicStatus(req, admin);
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json(req, { error: 'Sign in required' }, 401);

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json(req, { error: 'Sign in required' }, 401);
  const { data: profile } = await admin.from('profiles').select('account_role').eq('id', user.id).maybeSingle();
  if (profile?.account_role !== 'developer') return json(req, { error: 'Developer access required' }, 403);

  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const [telemetry, incidents, stripeEvents, billingAudit, releaseGate, entitlements] = await Promise.all([
    admin.from('access_audit_log')
      .select('event_type,resource_id,metadata,created_at')
      .like('event_type', 'platform.%')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100),
    admin.from('platform_incidents')
      .select('id,title,severity,status,signal_type,route,event_count,last_seen_at,release')
      .order('last_seen_at', { ascending: false })
      .limit(50),
    admin.from('billing_webhook_events')
      .select('stripe_event_id,event_type,processed_at,result')
      .order('processed_at', { ascending: false })
      .limit(250),
    admin.from('access_audit_log')
      .select('event_type,created_at,metadata')
      .like('event_type', 'billing.%')
      .order('created_at', { ascending: false })
      .limit(250),
    admin.from('platform_release_gates')
      .select('gate_key,status,evidence,verified_at,updated_at')
      .eq('gate_key', 'live_billing_lifecycle')
      .maybeSingle(),
    admin.from('account_entitlements')
      .select('subscription_status,billing_tier,billing_interval,provider')
      .eq('provider', 'stripe')
      .limit(1000)
  ]);

  if (telemetry.error) return json(req, { error: 'Reliability events could not be loaded' }, 500);
  if (incidents.error && incidents.error.code !== '42P01') return json(req, { error: 'Incidents could not be loaded' }, 500);
  if (stripeEvents.error && stripeEvents.error.code !== '42P01') return json(req, { error: 'Stripe webhook events could not be loaded' }, 500);
  if (billingAudit.error) return json(req, { error: 'Billing audit events could not be loaded' }, 500);

  const rows = telemetry.data || [];
  const cutoff = Date.now() - 86400000;
  const counts: Record<string, number> = {
    last_24h: 0,
    last_7d: rows.length,
    client_errors: 0,
    slow_pages: 0,
    open_incidents: 0,
    critical_incidents: 0
  };
  rows.forEach((row) => {
    if (new Date(row.created_at).getTime() >= cutoff) counts.last_24h++;
    if (row.event_type !== 'platform.slow_page') counts.client_errors++;
    else counts.slow_pages++;
  });
  (incidents.data || []).forEach((row) => {
    if (row.status !== 'resolved') {
      counts.open_incidents++;
      if (row.severity === 'critical') counts.critical_incidents++;
    }
  });

  const webhookTypes = new Set((stripeEvents.data || []).map((row) => row.event_type));
  const auditTypes = new Set((billingAudit.data || []).map((row) => row.event_type));
  const entitlementStatuses = new Set((entitlements.data || []).map((row) => row.subscription_status).filter(Boolean));
  const gate = releaseGate.data || null;
  const gateEvidence = gate?.evidence && typeof gate.evidence === 'object' ? gate.evidence as Record<string, any> : {};
  const envCheckoutMode = validMode(Deno.env.get('BILLING_CHECKOUT_MODE') || Deno.env.get('STRIPE_LIVE_CHECKOUT_MODE'));
  const checkoutMode = envCheckoutMode || validMode(gateEvidence.checkout_mode || gateEvidence.public_checkout) || 'closed';
  const checkoutControlSource = envCheckoutMode ? 'environment_override' : validMode(gateEvidence.checkout_mode || gateEvidence.public_checkout) ? 'release_gate' : 'fail_closed_default';
  const controlledUserCount = Array.isArray(gateEvidence.controlled_user_ids) ? gateEvidence.controlled_user_ids.length : 0;
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const stripeCatalog = await resolveStripeCatalog(stripeKey);
  const priceOverrideNames = [
    'STRIPE_PRICE_AGENT_MONTHLY',
    'STRIPE_PRICE_AGENT_YEARLY',
    'STRIPE_PRICE_PRO_MONTHLY',
    'STRIPE_PRICE_PRO_YEARLY',
    'STRIPE_PRICE_PRO_PLUS_MONTHLY',
    'STRIPE_PRICE_PRO_PLUS_YEARLY'
  ];
  const configuredPriceOverrides = priceOverrideNames.filter(envPresent).length;
  const secretReadiness = {
    stripe_secret_configured: envPresent('STRIPE_SECRET_KEY'),
    webhook_secret_configured: envPresent('STRIPE_WEBHOOK_SIGNING_SECRET'),
    price_overrides_configured: configuredPriceOverrides,
    price_overrides_required: 0,
    catalog_lookup_resolved: stripeCatalog.resolved,
    catalog_lookup_required: stripeCatalog.required,
    stripe_key_mode: stripeCatalog.mode,
    ready_for_controlled_acceptance:
      envPresent('STRIPE_SECRET_KEY') &&
      envPresent('STRIPE_WEBHOOK_SIGNING_SECRET') &&
      stripeCatalog.mode === 'live' &&
      stripeCatalog.ready
  };

  const checks = [
    {
      id: 'configuration',
      label: 'Stripe Live secrets and six-price catalog ready',
      passed: secretReadiness.ready_for_controlled_acceptance
    },
    {
      id: 'controlled_access',
      label: 'Controlled Checkout account selected',
      passed: checkoutMode === 'controlled' ? controlledUserCount > 0 : checkoutMode === 'open' && gate?.status === 'passed'
    },
    {
      id: 'checkout',
      label: 'Authenticated Stripe Checkout created',
      passed: auditTypes.has('billing.checkout_created')
    },
    {
      id: 'purchase',
      label: 'Signed subscription purchase processed',
      passed:
        webhookTypes.has('checkout.session.completed') ||
        webhookTypes.has('customer.subscription.created')
    },
    {
      id: 'portal',
      label: 'Stripe Customer Portal opened',
      passed:
        auditTypes.has('billing.portal_opened') ||
        auditTypes.has('billing.existing_subscription_redirected_to_portal')
    },
    {
      id: 'plan_change',
      label: 'Subscription update processed',
      passed: webhookTypes.has('customer.subscription.updated')
    },
    {
      id: 'cancel_resume',
      label: 'Cancellation / resume lifecycle processed',
      passed:
        webhookTypes.has('customer.subscription.deleted') ||
        webhookTypes.has('customer.subscription.resumed') ||
        webhookTypes.has('customer.subscription.updated')
    },
    {
      id: 'past_due',
      label: 'Payment failure / past-due behavior observed',
      passed: webhookTypes.has('invoice.payment_failed') || entitlementStatuses.has('past_due')
    },
    {
      id: 'recovery',
      label: 'Payment recovery observed',
      passed: webhookTypes.has('invoice.paid')
    },
    {
      id: 'refund',
      label: 'Refund webhook processed',
      passed: webhookTypes.has('charge.refunded')
    },
    {
      id: 'live_cycle',
      label: 'Controlled Live billing lifecycle accepted',
      passed: gate?.status === 'passed'
    }
  ];

  const billing = {
    provider: 'stripe',
    environment: 'production',
    checkout_mode: checkoutMode,
    checkout_control_source: checkoutControlSource,
    controlled_user_count: controlledUserCount,
    secrets: secretReadiness,
    catalog: {
      resolved: stripeCatalog.resolved,
      required: stripeCatalog.required,
      ready: stripeCatalog.ready,
      key_mode: stripeCatalog.mode,
      error: stripeCatalog.error
    },
    checks,
    gate: gate ? {
      status: gate.status,
      verified_at: gate.verified_at,
      updated_at: gate.updated_at
    } : { status: 'missing', verified_at: null, updated_at: null },
    webhook_event_count: (stripeEvents.data || []).length,
    latest_event_at: stripeEvents.data?.[0]?.processed_at || null,
    stripe_entitlement_count: (entitlements.data || []).length
  };

  return json(req, {
    generated_at: new Date().toISOString(),
    release: '2026-08-18-stripe-launch-health-v3',
    counts,
    events: rows.slice(0, 50),
    incidents: incidents.data || [],
    billing
  });
});
