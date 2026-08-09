import { createClient } from '@supabase/supabase-js';

const cors = {
  'Access-Control-Allow-Origin': 'https://njpropertytaxrelief.com',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' }
});
const paddleBase = () => Deno.env.get('PADDLE_ENVIRONMENT') === 'sandbox'
  ? 'https://sandbox-api.paddle.com'
  : 'https://api.paddle.com';

type Cadence = 'monthly' | 'yearly';
type SellableTier = 'agent' | 'professional';

function requestedProduct(body: Record<string, unknown>) {
  const raw = String(body?.tier || body?.plan || '').toLowerCase();
  const cadence: Cadence = body?.cadence === 'monthly' ? 'monthly' : 'yearly';
  if (raw === 'firm' || raw === 'firm_api' || raw === 'teams') {
    return { gated: true, tier: 'firm', plan: 'teams', cadence } as const;
  }
  if (raw === 'agent' || raw === 'pro') {
    return { gated: false, tier: 'agent' as SellableTier, plan: 'pro', cadence } as const;
  }
  if (raw === 'professional' || raw === 'pro_plus' || raw === 'pro+') {
    return { gated: false, tier: 'professional' as SellableTier, plan: 'pro_plus', cadence } as const;
  }
  return null;
}

function priceFor(tier: SellableTier, cadence: Cadence) {
  const envName = tier === 'agent'
    ? cadence === 'yearly' ? 'PADDLE_PRICE_AGENT_YEARLY' : 'PADDLE_PRICE_AGENT_MONTHLY'
    : cadence === 'yearly' ? 'PADDLE_PRICE_PROFESSIONAL_YEARLY' : 'PADDLE_PRICE_PROFESSIONAL_MONTHLY';
  const configured = Deno.env.get(envName);
  if (configured) return { id: configured, envName };

  // Preserve existing Sandbox/monthly subscriptions while the four-price
  // catalog is rolled out. Annual checkout never falls back to a monthly ID.
  if (cadence === 'monthly') {
    const legacyName = tier === 'agent' ? 'PADDLE_PRICE_PRO' : 'PADDLE_PRICE_PRO_PLUS';
    const legacy = Deno.env.get(legacyName);
    if (legacy) return { id: legacy, envName: legacyName };
  }
  return { id: null, envName };
}

async function paddle(path: string, init: RequestInit = {}) {
  const key = Deno.env.get('PADDLE_API_KEY');
  if (!key) throw new Error('Paddle is not configured yet');
  const response = await fetch(paddleBase() + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.detail || payload?.error?.type || 'Paddle request failed');
  }
  return payload?.data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (Deno.env.get('BILLING_CHECKOUT_ENABLED') !== 'true') {
    return json({ error: 'Paid enrollment is not open yet', code: 'ENROLLMENT_CLOSED' }, 503);
  }

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Sign in required' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, service);
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Sign in required' }, 401);

  const body = await req.json().catch(() => ({}));
  const product = requestedProduct(body);
  if (!product) return json({ error: 'Choose Agent or Professional' }, 400);
  if (product.gated) {
    return json({
      error: 'Firm / API access is being enrolled separately while team controls are completed.',
      code: 'FIRM_GATED'
    }, 409);
  }

  const price = priceFor(product.tier, product.cadence);
  if (!price.id) {
    return json({
      error: `${product.tier === 'agent' ? 'Agent' : 'Professional'} ${product.cadence} billing is not configured yet`,
      code: 'PRICE_NOT_CONFIGURED',
      required_setting: price.envName
    }, 503);
  }
  if (!Deno.env.get('PADDLE_API_KEY')) return json({ error: 'Billing is not configured yet' }, 503);
  const clientToken = Deno.env.get('PADDLE_CLIENT_TOKEN');
  if (!clientToken) return json({ error: 'Paddle Checkout is not configured yet' }, 503);

  const { data: entitlement } = await admin.from('account_entitlements')
    .select('plan_tier,provider,provider_customer_id,provider_subscription_id,provider_price_id,subscription_status')
    .eq('user_id', user.id)
    .maybeSingle();
  const customerId = entitlement?.provider === 'paddle' ? entitlement.provider_customer_id : null;
  const subscriptionOpen = customerId && entitlement?.provider_subscription_id &&
    ['active', 'trialing', 'past_due', 'paused'].includes(entitlement.subscription_status || '');

  if (subscriptionOpen) {
    const samePrice = entitlement?.provider_price_id === price.id;
    if (!samePrice && ['active', 'trialing'].includes(entitlement.subscription_status || '')) {
      try {
        // Paddle is the billing authority. Access changes only after the signed
        // subscription.updated webhook resolves this exact Price ID.
        const subscription = await paddle(`/subscriptions/${encodeURIComponent(entitlement.provider_subscription_id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            items: [{ price_id: price.id, quantity: 1 }],
            proration_billing_mode: 'prorated_immediately'
          })
        });
        await admin.from('access_audit_log').insert({
          user_id: user.id,
          event_type: 'billing.subscription_plan_change_requested',
          resource_type: 'subscription',
          resource_id: entitlement.provider_subscription_id,
          required_plan: product.plan,
          allowed: true,
          metadata: {
            provider: 'paddle',
            from_plan: entitlement.plan_tier,
            to_plan: product.plan,
            tier: product.tier,
            cadence: product.cadence,
            price_id: price.id,
            proration: 'prorated_immediately'
          }
        });
        return json({
          provider: 'paddle',
          destination: 'plan_change',
          plan_change_requested: true,
          subscription_id: subscription?.id || entitlement.provider_subscription_id,
          requested_plan: product.plan,
          requested_tier: product.tier,
          requested_cadence: product.cadence
        });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Could not change subscription plan' }, 502);
      }
    }

    try {
      const portal = await paddle(`/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
        method: 'POST',
        body: JSON.stringify({ subscription_ids: [entitlement.provider_subscription_id] })
      });
      await admin.from('access_audit_log').insert({
        user_id: user.id,
        event_type: 'billing.existing_subscription_redirected_to_portal',
        resource_type: 'subscription',
        resource_id: entitlement.provider_subscription_id,
        allowed: true,
        metadata: { tier: product.tier, cadence: product.cadence, price_id: price.id }
      });
      return json({ url: portal?.urls?.general?.overview, destination: 'portal', provider: 'paddle' });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Could not open billing portal' }, 502);
    }
  }

  let transaction;
  try {
    transaction = await paddle('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ price_id: price.id, quantity: 1 }],
        collection_mode: 'automatic',
        ...(customerId ? { customer_id: customerId } : {}),
        custom_data: {
          watchdog_user_id: user.id,
          plan_tier: product.plan,
          product_tier: product.tier,
          billing_cadence: product.cadence,
          product: 'watchdog'
        },
        checkout: { url: 'https://njpropertytaxrelief.com/property/account.html?checkout=success' }
      })
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not create checkout' }, 502);
  }

  await admin.from('access_audit_log').insert({
    user_id: user.id,
    event_type: 'billing.checkout_created',
    resource_type: 'transaction',
    resource_id: transaction?.id,
    required_plan: product.plan,
    allowed: true,
    metadata: {
      provider: 'paddle',
      tier: product.tier,
      cadence: product.cadence,
      price_id: price.id
    }
  });
  return json({
    provider: 'paddle',
    transaction_id: transaction?.id,
    client_token: clientToken,
    environment: Deno.env.get('PADDLE_ENVIRONMENT') === 'sandbox' ? 'sandbox' : 'production',
    requested_plan: product.plan,
    requested_tier: product.tier,
    requested_cadence: product.cadence
  });
});
