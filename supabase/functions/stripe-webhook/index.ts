import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const planForPrice = (price?: string | null) => price && price === Deno.env.get('STRIPE_PRICE_PRO_PLUS') ? 'pro_plus' : price && price === Deno.env.get('STRIPE_PRICE_PRO') ? 'pro' : null;

async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const priceId = sub.items.data[0]?.price?.id || null;
  // Price IDs are the billing authority. Subscription metadata is useful for
  // traceability, but must never grant a plan after a price change in Portal.
  const plan = planForPrice(priceId);
  const userId = sub.metadata.supabase_user_id || null;
  if (!userId) return { skipped: 'missing supabase_user_id' };
  if (!plan) {
    const { error } = await service.from('account_entitlements').upsert({
      user_id: userId, plan_tier: 'standard', subscription_status: 'none', provider: 'stripe',
      provider_customer_id: customerId, provider_subscription_id: sub.id, provider_price_id: priceId,
      current_period_end: null, cancel_at_period_end: sub.cancel_at_period_end,
      source: 'stripe-webhook-unrecognized-price', updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (error) throw error;
    return { user_id: userId, plan_tier: 'standard', status: 'none', warning: 'unrecognized Stripe price' };
  }
  const status = ['trialing','active','past_due','paused','canceled'].includes(sub.status) ? sub.status : sub.status === 'unpaid' ? 'past_due' : 'none';
  const periodEnd = sub.items.data[0]?.current_period_end ? new Date(sub.items.data[0].current_period_end * 1000).toISOString() : null;
  const { error } = await service.from('account_entitlements').upsert({
    user_id: userId, plan_tier: plan, subscription_status: status, provider: 'stripe', provider_customer_id: customerId,
    provider_subscription_id: sub.id, provider_price_id: priceId, current_period_end: periodEnd,
    cancel_at_period_end: sub.cancel_at_period_end, source: 'stripe-webhook', updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
  if (error) throw error;
  return { user_id: userId, plan_tier: plan, status };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing Stripe signature', { status: 400 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')!, undefined, cryptoProvider);
  } catch (error) {
    return new Response(`Invalid webhook: ${error instanceof Error ? error.message : 'unknown error'}`, { status: 400 });
  }
  const { data: prior } = await service.from('billing_webhook_events').select('stripe_event_id').eq('stripe_event_id', event.id).maybeSingle();
  if (prior) return new Response('Already processed', { status: 200 });

  let result: Record<string, unknown> = { ignored: true };
  if (event.type.startsWith('customer.subscription.')) result = await syncSubscription(event.data.object as Stripe.Subscription);
  else if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (typeof session.subscription === 'string') result = await syncSubscription(await stripe.subscriptions.retrieve(session.subscription));
  }
  await service.from('billing_webhook_events').insert({ stripe_event_id: event.id, event_type: event.type, payload_version: event.api_version || null, result });
  return new Response('ok', { status: 200 });
});
