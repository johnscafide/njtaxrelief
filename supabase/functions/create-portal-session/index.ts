import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const cors = { 'Access-Control-Allow-Origin': 'https://njpropertytaxrelief.com', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

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
  const { data: entitlement } = await admin.from('account_entitlements').select('provider_customer_id').eq('user_id', user.id).maybeSingle();
  if (!entitlement?.provider_customer_id) return json({ error: 'No billing account exists yet' }, 409);
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return json({ error: 'Billing is not configured yet' }, 503);
  const stripe = new Stripe(stripeKey);
  const session = await stripe.billingPortal.sessions.create({ customer: entitlement.provider_customer_id, return_url: 'https://njpropertytaxrelief.com/property/account.html' });
  await admin.from('access_audit_log').insert({ user_id: user.id, event_type: 'billing.portal_opened', resource_type: 'billing_customer', allowed: true });
  return json({ url: session.url });
});
