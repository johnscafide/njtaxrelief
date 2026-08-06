import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const cors = { 'Access-Control-Allow-Origin': 'https://njpropertytaxrelief.com', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Sign in required' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, service);
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Sign in required' }, 401);

  const body = await req.json().catch(() => ({}));
  const plan = body?.plan === 'pro_plus' ? 'pro_plus' : body?.plan === 'pro' ? 'pro' : null;
  if (!plan) return json({ error: 'Choose Pro or Pro+' }, 400);
  const price = plan === 'pro' ? Deno.env.get('STRIPE_PRICE_PRO') : Deno.env.get('STRIPE_PRICE_PRO_PLUS');
  if (!price) return json({ error: 'Billing price is not configured yet' }, 503);

  const { data: entitlement } = await admin.from('account_entitlements').select('provider_customer_id,provider_subscription_id,subscription_status').eq('user_id', user.id).maybeSingle();
  let customerId = entitlement?.provider_customer_id || null;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { supabase_user_id: user.id } });
    customerId = customer.id;
    await admin.from('account_entitlements').upsert({ user_id: user.id, provider: 'stripe', provider_customer_id: customerId, source: 'stripe-checkout', updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  }

  if (customerId && entitlement?.provider_subscription_id && ['active','trialing'].includes(entitlement.subscription_status)) {
    const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: 'https://njpropertytaxrelief.com/property/account.html' });
    await admin.from('access_audit_log').insert({ user_id: user.id, event_type: 'billing.existing_subscription_redirected_to_portal', resource_type: 'subscription', resource_id: entitlement.provider_subscription_id, allowed: true });
    return json({ url: portal.url, destination: 'portal' });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription', customer: customerId,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,
    allow_promotion_codes: true,
    success_url: 'https://njpropertytaxrelief.com/property/account.html?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://njpropertytaxrelief.com/property/pro.html?checkout=cancelled#plans',
    subscription_data: { metadata: { supabase_user_id: user.id, plan_tier: plan } },
    metadata: { supabase_user_id: user.id, plan_tier: plan }
  });
  await admin.from('access_audit_log').insert({ user_id: user.id, event_type: 'billing.checkout_created', resource_type: 'subscription', resource_id: session.id, required_plan: plan, allowed: true });
  return json({ url: session.url });
});
