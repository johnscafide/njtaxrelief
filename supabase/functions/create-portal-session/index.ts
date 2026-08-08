import { createClient } from '@supabase/supabase-js';

const cors = { 'Access-Control-Allow-Origin': 'https://njpropertytaxrelief.com', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const paddleBase = () => Deno.env.get('PADDLE_ENVIRONMENT') === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
async function paddlePortal(customerId: string, subscriptionId?: string | null) {
  const key = Deno.env.get('PADDLE_API_KEY');
  if (!key) throw new Error('Billing is not configured yet');
  const response = await fetch(`${paddleBase()}/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(subscriptionId ? { subscription_ids: [subscriptionId] } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.detail || payload?.error?.type || 'Paddle portal request failed');
  return payload?.data?.urls?.general?.overview;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Sign in required' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, service);
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Sign in required' }, 401);
  const { data: entitlement } = await admin.from('account_entitlements').select('provider,provider_customer_id,provider_subscription_id').eq('user_id', user.id).maybeSingle();
  if (entitlement?.provider !== 'paddle' || !entitlement?.provider_customer_id) return json({ error: 'No Paddle billing account exists yet' }, 409);
  try {
    const portalUrl = await paddlePortal(entitlement.provider_customer_id, entitlement.provider_subscription_id);
    await admin.from('access_audit_log').insert({ user_id: user.id, event_type: 'billing.portal_opened', resource_type: 'billing_customer', resource_id: entitlement.provider_customer_id, allowed: true, metadata: { provider: 'paddle' } });
    return json({ url: portalUrl, provider: 'paddle' });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not open billing portal' }, 502);
  }
});
