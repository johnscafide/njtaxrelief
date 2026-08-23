const DEFAULT_SITE = 'https://www.watchdogindex.com';

function allowedOrigin(req: Request) {
  const origin = req.headers.get('origin') || '';
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
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
  return DEFAULT_SITE;
}

// Public catalog data is intentionally environment-neutral. Checkout resolves
// the actual Stripe Price ID server-side from Edge Function secrets so a
// staging deployment can never inherit a Live Price ID from this endpoint.
const catalog = {
  provider: 'stripe',
  currency: 'USD',
  catalog_version: '2026-08-22',
  teams_available: false,
  tax_collection_enabled: false,
  intelligence: {
    regular_add_on_monthly: 12,
    included_plans: ['pro_plus', 'teams'],
    promotion: {
      active: true,
      label: 'Limited time',
      eligible_plans: ['agent', 'pro'],
      price_during_promotion: 0,
      ends_on: null
    }
  },
  plans: {
    agent: {
      label: 'Agent',
      monthly: { amount: 59, lookup_key: 'watchdog_agent_monthly' },
      yearly: { amount: 590, lookup_key: 'watchdog_agent_yearly' }
    },
    pro: {
      label: 'Pro',
      monthly: { amount: 129, lookup_key: 'watchdog_pro_monthly' },
      yearly: { amount: 1290, lookup_key: 'watchdog_pro_yearly' }
    },
    pro_plus: {
      label: 'Pro+',
      monthly: { amount: 399, lookup_key: 'watchdog_pro_plus_monthly' },
      yearly: { amount: 3990, lookup_key: 'watchdog_pro_plus_yearly' }
    }
  }
};

Deno.serve((req) => {
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin(req),
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300'
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'GET only' }), { status: 405, headers });
  return new Response(JSON.stringify(catalog), { headers });
});
