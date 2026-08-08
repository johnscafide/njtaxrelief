import { createClient } from '@supabase/supabase-js';

const cors = { 'Access-Control-Allow-Origin': 'https://njpropertytaxrelief.com', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const apiBase = () => Deno.env.get('PADDLE_API_BASE') || (Deno.env.get('PADDLE_ENVIRONMENT') === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com');

async function paddle(path: string, init: RequestInit = {}) {
  const key = Deno.env.get('PADDLE_API_KEY');
  if (!key) throw new Error('PADDLE_NOT_CONFIGURED');
  const response = await fetch(apiBase() + path, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.detail || payload?.error?.code || 'PADDLE_REQUEST_FAILED');
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (Deno.env.get('BILLING_CHECKOUT_ENABLED') !== 'true') return json({ error: 'Paid enrollment is not open yet' }, 503);
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Sign in required' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!Deno.env.get('PADDLE_API_KEY')) return json({ error: 'Billing is not configured yet' }, 503);
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, service);
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Sign in required' }, 401);

  const body = await req.json().catch(() => ({}));
  const plan = body?.plan === 'pro_plus' ? 'pro_plus' : body?.plan === 'pro' ? 'pro' : null;
  if (!plan) return json({ error: 'Choose Pro or Pro+' }, 400);
  const price = plan === 'pro' ? Deno.env.get('PADDLE_PRICE_PRO') : Deno.env.get('PADDLE_PRICE_PRO_PLUS');
  if (!price) return json({ error: 'Billing price is not configured yet' }, 503);

  const { data: entitlement } = await admin.from('account_entitlements')
    .select('provider,provider_customer_id,provider_subscription_id,subscription_status')
    .eq('user_id', user.id).maybeSingle();
  if (entitlement?.provider_subscription_id && ['active','trialing','past_due'].includes(entitlement.subscription_status || '')) {
    if (entitlement.provider !== 'paddle') return json({ error: 'An existing subscription must be managed from the current billing provider' }, 409);
    const portal = await paddle(`/customers/${encodeURIComponent(entitlement.provider_customer_id)}/portal-sessions`, { method: 'POST', body: JSON.stringify({ subscription_ids: [entitlement.provider_subscription_id] }) });
    await admin.from('access_audit_log').insert({ user_id: user.id, event_type: 'billing.existing_subscription_redirected_to_portal', resource_type: 'subscription', resource_id: entitlement.provider_subscription_id, allowed: true });
    return json({ url: portal?.data?.urls?.general?.overview, destination: 'portal' });
  }

  const transactionBody: Record<string, unknown> = {
    items: [{ price_id: price, quantity: 1 }],
    collection_mode: 'automatic',
    custom_data: { watchdog_user_id: user.id, plan_tier: plan, product: 'watchdog' }
  };
  if (entitlement?.provider === 'paddle' && entitlement.provider_customer_id) transactionBody.customer_id = entitlement.provider_customer_id;
  const transaction = await paddle('/transactions', { method: 'POST', body: JSON.stringify(transactionBody) });
  const checkoutUrl = transaction?.data?.checkout?.url;
  if (!checkoutUrl) return json({ error: 'Paddle checkout URL is unavailable. Confirm the Paddle default payment link is configured.' }, 503);
  await admin.from('access_audit_log').insert({ user_id: user.id, event_type: 'billing.checkout_created', resource_type: 'paddle_transaction', resource_id: transaction.data.id, required_plan: plan, allowed: true });
  return json({ url: checkoutUrl, provider: 'paddle' });
});
