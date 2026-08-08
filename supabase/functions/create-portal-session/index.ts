import { createClient } from '@supabase/supabase-js';

const cors = { 'Access-Control-Allow-Origin': 'https://njpropertytaxrelief.com', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const apiBase = () => Deno.env.get('PADDLE_API_BASE') || (Deno.env.get('PADDLE_ENVIRONMENT') === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com');

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
  if (!entitlement?.provider_customer_id) return json({ error: 'No billing account exists yet' }, 409);
  if (entitlement.provider !== 'paddle') return json({ error: 'This subscription is not managed by Paddle' }, 409);
  const key = Deno.env.get('PADDLE_API_KEY');
  if (!key) return json({ error: 'Billing is not configured yet' }, 503);
  const body = entitlement.provider_subscription_id ? { subscription_ids: [entitlement.provider_subscription_id] } : {};
  const response = await fetch(`${apiBase()}/customers/${encodeURIComponent(entitlement.provider_customer_id)}/portal-sessions`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return json({ error: payload?.error?.detail || payload?.error?.code || 'Billing portal request failed' }, 502);
  const portalUrl = payload?.data?.urls?.general?.overview;
  if (!portalUrl) return json({ error: 'Paddle did not return a Customer Portal URL' }, 502);
  await admin.from('access_audit_log').insert({ user_id: user.id, event_type: 'billing.portal_opened', resource_type: 'billing_customer', resource_id: entitlement.provider_customer_id, allowed: true });
  return json({ url: portalUrl, provider: 'paddle' });
});
