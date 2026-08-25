import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const cryptoProvider = Stripe.createSubtleCryptoProvider();
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const service = createClient(SUPABASE_URL, SERVICE_ROLE);

type BillingTier = 'agent' | 'pro' | 'pro_plus';
type BillingInterval = 'monthly' | 'yearly';
type PriceConfig = { id: string; tier: BillingTier; interval: BillingInterval; capacity: number };

const LIVE_PRICE_DEFAULTS = {
  agent_monthly: 'price_1U5qPZAgYeNIcesFuC2gKGTz',
  agent_yearly: 'price_1U5qPjAgYeNIcesFCXaHoU0c',
  pro_monthly: 'price_1U5qPyAgYeNIcesFy57ssZsV',
  pro_yearly: 'price_1U5qQAAgYeNIcesF6UOsmwAX',
  pro_plus_monthly: 'price_1U5qQKAgYeNIcesFmQqrWROC',
  pro_plus_yearly: 'price_1U5qQUAgYeNIcesFOSN8JZjR'
} as const;

function priceCatalog(): PriceConfig[] {
  return [
    { id: Deno.env.get('STRIPE_PRICE_AGENT_MONTHLY') || LIVE_PRICE_DEFAULTS.agent_monthly, tier: 'agent', interval: 'monthly', capacity: 25 },
    { id: Deno.env.get('STRIPE_PRICE_AGENT_YEARLY') || LIVE_PRICE_DEFAULTS.agent_yearly, tier: 'agent', interval: 'yearly', capacity: 25 },
    { id: Deno.env.get('STRIPE_PRICE_PRO_MONTHLY') || LIVE_PRICE_DEFAULTS.pro_monthly, tier: 'pro', interval: 'monthly', capacity: 250 },
    { id: Deno.env.get('STRIPE_PRICE_PRO_YEARLY') || LIVE_PRICE_DEFAULTS.pro_yearly, tier: 'pro', interval: 'yearly', capacity: 250 },
    { id: Deno.env.get('STRIPE_PRICE_PRO_PLUS_MONTHLY') || LIVE_PRICE_DEFAULTS.pro_plus_monthly, tier: 'pro_plus', interval: 'monthly', capacity: 2500 },
    { id: Deno.env.get('STRIPE_PRICE_PRO_PLUS_YEARLY') || LIVE_PRICE_DEFAULTS.pro_plus_yearly, tier: 'pro_plus', interval: 'yearly', capacity: 2500 }
  ];
}

function configForPrice(priceId?: string | null) {
  return priceId ? priceCatalog().find(row => row.id === priceId) || null : null;
}

function entitlementStatus(status: Stripe.Subscription.Status) {
  if (['trialing', 'active', 'past_due', 'paused', 'canceled'].includes(status)) return status;
  return 'none';
}

async function resolveSubscriptionUser(sub: Stripe.Subscription, customerId: string) {
  if (sub.metadata?.supabase_user_id) return sub.metadata.supabase_user_id;
  const bySubscription = await service.from('account_entitlements').select('user_id').eq('provider', 'stripe').eq('provider_subscription_id', sub.id).maybeSingle();
  if (bySubscription.error) throw bySubscription.error;
  if (bySubscription.data?.user_id) return bySubscription.data.user_id;
  const byCustomer = await service.from('account_entitlements').select('user_id').eq('provider', 'stripe').eq('provider_customer_id', customerId).maybeSingle();
  if (byCustomer.error) throw byCustomer.error;
  return byCustomer.data?.user_id || null;
}

async function syncSubscription(sub: Stripe.Subscription, eventCreated?: number) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const price = sub.items.data[0]?.price;
  const priceId = price?.id || null;
  const config = configForPrice(priceId);
  const userId = await resolveSubscriptionUser(sub, customerId);
  if (!userId) return { skipped: 'missing supabase_user_id' };
  const eventAt = new Date((eventCreated || Math.floor(Date.now() / 1000)) * 1000).toISOString();
  const { data: existing, error: existingError } = await service.from('account_entitlements').select('provider,provider_event_at').eq('user_id', userId).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.provider === 'stripe' && existing.provider_event_at && new Date(existing.provider_event_at).getTime() > new Date(eventAt).getTime()) {
    return { user_id: userId, skipped: 'stale_subscription_event', provider_event_at: existing.provider_event_at };
  }
  const status = entitlementStatus(sub.status);
  const periodEnd = sub.items.data[0]?.current_period_end ? new Date(sub.items.data[0].current_period_end * 1000).toISOString() : null;
  const next = config
    ? { user_id: userId, plan_tier: config.tier, billing_tier: config.tier, billing_interval: config.interval, property_capacity: config.capacity, subscription_status: status, provider: 'stripe', provider_customer_id: customerId, provider_subscription_id: sub.id, provider_price_id: priceId, current_period_end: periodEnd, cancel_at_period_end: sub.cancel_at_period_end, provider_event_at: eventAt, source: 'stripe-webhook', updated_at: new Date().toISOString() }
    : { user_id: userId, plan_tier: 'standard', billing_tier: null, billing_interval: null, property_capacity: null, subscription_status: 'none', provider: 'stripe', provider_customer_id: customerId, provider_subscription_id: sub.id, provider_price_id: priceId, current_period_end: null, cancel_at_period_end: sub.cancel_at_period_end, provider_event_at: eventAt, source: 'stripe-webhook-unrecognized-price', updated_at: new Date().toISOString() };
  const { error } = await service.from('account_entitlements').upsert(next, { onConflict: 'user_id' });
  if (error) throw error;
  await service.from('access_audit_log').insert({
    user_id: userId,
    event_type: config ? 'billing.subscription_synced' : 'billing.subscription_unrecognized_price',
    resource_type: 'subscription', resource_id: sub.id, required_plan: config?.tier || 'standard', allowed: Boolean(config),
    metadata: { provider: 'stripe', stripe_status: sub.status, entitlement_status: next.subscription_status, price_id: priceId, billing_tier: config?.tier || null, billing_interval: config?.interval || null, event_at: eventAt }
  });
  return config ? { user_id: userId, plan_tier: config.tier, status, billing_interval: config.interval, property_capacity: config.capacity } : { user_id: userId, plan_tier: 'standard', status: 'none', warning: 'unrecognized Stripe price' };
}

function campaignMeta(session: Stripe.Checkout.Session) {
  return session.metadata?.product === 'watchdog_marketing_campaign' ? session.metadata : null;
}

function moveMeta(session: Stripe.Checkout.Session) {
  return session.metadata?.product === 'watchdog_move' ? session.metadata : null;
}

async function recordMovePayment(session: Stripe.Checkout.Session, statusOverride?: 'paid' | 'failed') {
  const meta = moveMeta(session);
  const userId = meta?.supabase_user_id || meta?.watchdog_user_id || session.client_reference_id || null;
  if (!meta || !userId) return { skipped: 'not watchdog move checkout' };
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || '';
  const paid = statusOverride === 'paid' || session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  if (!paid) {
    await service.from('access_audit_log').insert({
      user_id: userId,
      event_type: statusOverride === 'failed' ? 'billing.move_payment_failed' : 'billing.move_payment_pending',
      resource_type: 'checkout_session', resource_id: session.id, required_plan: 'standard', allowed: false,
      metadata: { provider: 'stripe', product: 'watchdog_move', payment_status: session.payment_status, payment_intent_id: paymentIntentId || null }
    });
    return { user_id: userId, status: statusOverride === 'failed' ? 'failed' : 'pending' };
  }

  const granted = await service.rpc('watchdog_move_grant_paid', {
    p_user_id: userId,
    p_checkout_session_id: session.id,
    p_payment_intent_id: paymentIntentId,
    p_paid_at: new Date().toISOString(),
    p_provider_price_id: Deno.env.get('STRIPE_PRICE_WATCHDOG_MOVE') || 'price_1U7fTZAgYeNIcesFeaGad6Ew'
  });
  if (granted.error) throw granted.error;
  const grant = Array.isArray(granted.data) ? granted.data[0] : granted.data;

  await service.from('access_audit_log').insert({
    user_id: userId,
    event_type: 'billing.move_paid',
    resource_type: 'checkout_session', resource_id: session.id, required_plan: 'standard', allowed: true,
    metadata: { provider: 'stripe', product: 'watchdog_move', payment_intent_id: paymentIntentId || null, duration_days: 90, expires_at: grant?.expires_at || null }
  });
  return { user_id: userId, product: 'watchdog_move', status: 'paid', grant_id: grant?.grant_id || null, expires_at: grant?.expires_at || null };
}

async function expireMoveCheckout(session: Stripe.Checkout.Session) {
  const meta = moveMeta(session);
  const userId = meta?.supabase_user_id || meta?.watchdog_user_id || session.client_reference_id || null;
  if (!meta || !userId) return { skipped: 'not watchdog move checkout' };
  await service.from('access_audit_log').insert({
    user_id: userId, event_type: 'billing.move_checkout_expired', resource_type: 'checkout_session', resource_id: session.id,
    required_plan: 'standard', allowed: false, metadata: { provider: 'stripe', product: 'watchdog_move' }
  });
  return { user_id: userId, product: 'watchdog_move', status: 'expired' };
}

async function finalizeCredit(meta: Record<string, string> | null | undefined, action: 'redeem' | 'release', detail: Record<string, unknown> = {}) {
  const id = meta?.credit_reservation_id;
  if (!id) return null;
  const r = await service.rpc('marketing_credit_finalize', { p_reservation_id: id, p_action: action, p_detail: detail });
  if (r.error) throw r.error;
  return r.data;
}

async function triggerFulfillment(campaignId: string, paymentId: string) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/marketing-direct-mail-fulfill`, {
      method: 'POST', headers: { Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId, payment_id: paymentId, source: 'stripe_webhook' })
    });
    const text = await r.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { message: text.slice(0, 300) }; }
    if (!r.ok) console.error('MARKETING_FULFILLMENT_HANDOFF', r.status, data);
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    console.error('MARKETING_FULFILLMENT_HANDOFF_ERROR', e);
    return { ok: false, status: 0, data: { error: e instanceof Error ? e.message : 'Fulfillment handoff failed' } };
  }
}

async function recordCampaignPayment(session: Stripe.Checkout.Session, statusOverride?: string) {
  const meta = campaignMeta(session);
  if (!meta?.watchdog_user_id || !meta?.campaign_id || !meta?.quote_id) return { skipped: 'not marketing campaign checkout' };
  const paid = statusOverride === 'paid' || session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  const failed = statusOverride === 'failed';
  const status = failed ? 'failed' : (statusOverride || (paid ? 'paid' : 'pending'));
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null;
  const existing = await service.from('marketing_payments').select('id,amount_cents,metadata').eq('user_id', meta.watchdog_user_id).eq('campaign_id', meta.campaign_id).eq('quote_id', meta.quote_id).maybeSingle();
  if (existing.error) throw existing.error;
  const merged = { ...(existing.data?.metadata || {}), checkout_session_id: session.id, payment_intent_id: paymentIntentId, payment_status: session.payment_status, customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id || null, channel: meta.channel || null, provider_key: meta.provider_key || null, product_type: meta.product_type || null, credit_reservation_id: meta.credit_reservation_id || null, credit_applied_cents: Number(meta.credit_applied_cents || 0), retail_cents: Number(meta.retail_cents || existing.data?.amount_cents || 0), amount_due_cents: Number(meta.amount_due_cents || 0) };
  const { data: payment, error } = await service.from('marketing_payments').update({ status, paid_at: paid ? new Date().toISOString() : null, processor_payment_id: session.id, metadata: merged, updated_at: new Date().toISOString() }).eq('user_id', meta.watchdog_user_id).eq('campaign_id', meta.campaign_id).eq('quote_id', meta.quote_id).select('id,amount_cents').maybeSingle();
  if (error) throw error;
  if (!payment) return { skipped: 'marketing payment ledger not found' };
  if (paid) await finalizeCredit(meta, 'redeem', { processor: 'stripe', payment_id: payment.id, payment_intent_id: paymentIntentId });
  else if (failed) await finalizeCredit(meta, 'release', { reason: 'stripe_payment_failed', payment_id: payment.id });
  const campaignStatus = paid ? 'funded' : (failed ? 'payment_failed' : 'payment_pending');
  const eventType = paid ? 'payment.captured' : (failed ? 'payment.failed' : 'payment.pending');
  await service.from('marketing_campaigns').update({ status: campaignStatus, updated_at: new Date().toISOString() }).eq('id', meta.campaign_id).eq('user_id', meta.watchdog_user_id);
  await service.from('marketing_events').insert({ user_id: meta.watchdog_user_id, campaign_id: meta.campaign_id, event_type: eventType, source: 'stripe', payload: { payment_id: payment.id, quote_id: meta.quote_id, checkout_session_id: session.id, payment_intent_id: paymentIntentId, amount_cents: payment.amount_cents, payment_status: session.payment_status, credit_applied_cents: Number(meta.credit_applied_cents || 0), amount_due_cents: Number(meta.amount_due_cents || 0), product_type: meta.product_type || null } });
  const fulfillment = paid ? await triggerFulfillment(meta.campaign_id, payment.id) : null;
  return { user_id: meta.watchdog_user_id, campaign_id: meta.campaign_id, payment_id: payment.id, status, fulfillment };
}

async function expireCampaignPayment(session: Stripe.Checkout.Session) {
  const meta = campaignMeta(session);
  if (!meta?.watchdog_user_id || !meta?.campaign_id || !meta?.quote_id) return { skipped: 'not marketing campaign checkout' };
  const { data: payment, error } = await service.from('marketing_payments').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('user_id', meta.watchdog_user_id).eq('campaign_id', meta.campaign_id).eq('quote_id', meta.quote_id).neq('status', 'paid').select('id').maybeSingle();
  if (error) throw error;
  if (!payment) return { skipped: 'no pending payment to expire' };
  await finalizeCredit(meta, 'release', { reason: 'stripe_checkout_expired', payment_id: payment.id });
  await service.from('marketing_campaigns').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('id', meta.campaign_id).eq('user_id', meta.watchdog_user_id);
  await service.from('marketing_events').insert({ user_id: meta.watchdog_user_id, campaign_id: meta.campaign_id, event_type: 'payment.expired', source: 'stripe', payload: { payment_id: payment.id, quote_id: meta.quote_id, checkout_session_id: session.id, credit_applied_cents: Number(meta.credit_applied_cents || 0) } });
  return { payment_id: payment.id, status: 'expired' };
}

async function recordSubscriptionBillingSignal(eventType: string, customer: string | Stripe.Customer | Stripe.DeletedCustomer | null, detail: Record<string, unknown>) {
  const customerId = typeof customer === 'string' ? customer : customer?.id || null;
  if (!customerId) return { skipped: 'missing customer' };
  const { data: entitlement, error } = await service.from('account_entitlements').select('user_id,provider_subscription_id,billing_tier').eq('provider', 'stripe').eq('provider_customer_id', customerId).maybeSingle();
  if (error) throw error;
  if (!entitlement?.user_id) return { skipped: 'not watchdog subscription customer' };
  await service.from('access_audit_log').insert({ user_id: entitlement.user_id, event_type: eventType, resource_type: 'subscription', resource_id: entitlement.provider_subscription_id, required_plan: entitlement.billing_tier || 'standard', allowed: true, metadata: { provider: 'stripe', ...detail } });
  return { user_id: entitlement.user_id, recorded: eventType };
}

function isMissingMarketingPaymentsLedger(error: any) {
  const code = String(error?.code || '').toUpperCase();
  const message = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ').toLowerCase();
  const namesLedger = message.includes('marketing_payments');
  const missingRelation = code === '42P01' || code === 'PGRST205' || message.includes('does not exist') || message.includes('schema cache');
  return namesLedger && missingRelation;
}

async function recordMoveRefund(charge: Stripe.Charge, paymentIntentId: string) {
  const lookup = await service.from('watchdog_move_grants').select('id,recipient_user_id,expires_at,status').eq('stripe_payment_intent_id', paymentIntentId).maybeSingle();
  if (lookup.error) throw lookup.error;
  const grant = lookup.data;
  if (!grant) return null;
  const refunded = Number(charge.amount_refunded || 0);
  if (!charge.refunded || refunded < Number(charge.amount || 0)) {
    await service.from('access_audit_log').insert({ user_id: grant.recipient_user_id, event_type: 'billing.move_partial_refund_observed', resource_type: 'payment_intent', resource_id: paymentIntentId, required_plan: 'standard', allowed: true, metadata: { provider: 'stripe', charge_id: charge.id, amount_refunded: refunded, original_amount: Number(charge.amount || 0) } });
    return { product: 'watchdog_move', grant_id: grant.id, status: 'partial_refund_observed', refunded_cents: refunded };
  }
  const { error: refundError } = await service.from('watchdog_move_grants').update({ status: 'refunded', updated_at: new Date().toISOString(), metadata: { refund_charge_id: charge.id, refunded_cents: refunded } }).eq('id', grant.id);
  if (refundError) throw refundError;
  const remaining = await service.from('watchdog_move_grants').select('expires_at').eq('recipient_user_id', grant.recipient_user_id).eq('status', 'active').gt('expires_at', new Date().toISOString()).order('expires_at', { ascending: false }).limit(1).maybeSingle();
  if (remaining.error) throw remaining.error;
  await service.from('account_feature_entitlements').upsert({ user_id: grant.recipient_user_id, feature_key: 'watchdog_move', status: remaining.data?.expires_at ? 'active' : 'inactive', provider: 'stripe', current_period_end: remaining.data?.expires_at || null, source: 'watchdog-move-refund', metadata: { refunded_grant_id: grant.id, refund_charge_id: charge.id }, updated_at: new Date().toISOString() }, { onConflict: 'user_id,feature_key' });
  await service.from('access_audit_log').insert({ user_id: grant.recipient_user_id, event_type: 'billing.move_refunded', resource_type: 'payment_intent', resource_id: paymentIntentId, required_plan: 'standard', allowed: true, metadata: { provider: 'stripe', charge_id: charge.id, refunded_cents: refunded, refunded_grant_id: grant.id, remaining_expires_at: remaining.data?.expires_at || null } });
  return { product: 'watchdog_move', grant_id: grant.id, status: 'refunded', refunded_cents: refunded, remaining_expires_at: remaining.data?.expires_at || null };
}

async function recordRefund(charge: Stripe.Charge) {
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id || null;
  if (pi) {
    const move = await recordMoveRefund(charge, pi);
    if (move) return move;

    const lookup = await service.from('marketing_payments').select('id,user_id,campaign_id,amount_cents,metadata').contains('metadata', { payment_intent_id: pi }).maybeSingle();
    if (lookup.error && !isMissingMarketingPaymentsLedger(lookup.error)) throw lookup.error;
    if (lookup.error) console.warn('STRIPE_REFUND_MARKETING_LEDGER_UNAVAILABLE', lookup.error.code || 'unknown');
    const payment = lookup.error ? null : lookup.data;
    if (payment) {
      const refunded = Number(charge.amount_refunded || 0);
      const status = refunded >= Number((payment.metadata?.amount_due_cents ?? payment.amount_cents) || 0) ? 'refunded' : 'partially_refunded';
      const { error: updateError } = await service.from('marketing_payments').update({ status, refunded_cents: refunded, updated_at: new Date().toISOString() }).eq('id', payment.id);
      if (updateError) throw updateError;
      await service.from('marketing_campaigns').update({ status: status === 'refunded' ? 'refunded' : 'funded', updated_at: new Date().toISOString() }).eq('id', payment.campaign_id).eq('user_id', payment.user_id);
      await service.from('marketing_events').insert({ user_id: payment.user_id, campaign_id: payment.campaign_id, event_type: 'payment.refunded', source: 'stripe', payload: { payment_id: payment.id, payment_intent_id: pi, refunded_cents: refunded, status, credit_applied_cents: Number(payment.metadata?.credit_applied_cents || 0) } });
      return { payment_id: payment.id, status, refunded_cents: refunded };
    }
  }
  return recordSubscriptionBillingSignal('billing.subscription_refund_observed', charge.customer, { charge_id: charge.id, payment_intent_id: pi, amount_refunded: Number(charge.amount_refunded || 0), fully_refunded: Boolean(charge.refunded) });
}

async function claimWebhookEvent(event: Stripe.Event) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const claimedAt = new Date().toISOString();
    const { data, error } = await service.from('billing_webhook_events').insert({ stripe_event_id: event.id, event_type: event.type, payload_version: event.api_version || null, processed_at: claimedAt, result: { status: 'processing', claimed_at: claimedAt } }).select('stripe_event_id').maybeSingle();
    if (!error && data?.stripe_event_id) return { claimed: true, processing: false };
    if (error?.code !== '23505') throw error;
    const { data: prior, error: priorError } = await service.from('billing_webhook_events').select('stripe_event_id,processed_at,result').eq('stripe_event_id', event.id).maybeSingle();
    if (priorError) throw priorError;
    if (!prior) continue;
    const processing = prior.result?.status === 'processing';
    const ageMs = Date.now() - new Date(prior.processed_at).getTime();
    if (processing && Number.isFinite(ageMs) && ageMs > 5 * 60 * 1000 && attempt === 0) {
      const { error: staleDeleteError } = await service.from('billing_webhook_events').delete().eq('stripe_event_id', event.id).contains('result', { status: 'processing' });
      if (staleDeleteError) throw staleDeleteError;
      continue;
    }
    return { claimed: false, processing };
  }
  return { claimed: false, processing: true };
}

async function completeWebhookEvent(event: Stripe.Event, result: Record<string, unknown>) {
  const { error } = await service.from('billing_webhook_events').update({ result, processed_at: new Date().toISOString() }).eq('stripe_event_id', event.id).contains('result', { status: 'processing' });
  if (error) throw error;
}

async function releaseWebhookClaim(event: Stripe.Event) {
  const { error } = await service.from('billing_webhook_events').delete().eq('stripe_event_id', event.id).contains('result', { status: 'processing' });
  if (error) console.error('STRIPE_WEBHOOK_CLAIM_RELEASE_ERROR', event.id, error);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET');
  if (!stripeKey || !webhookSecret) return new Response('Billing webhook is not configured', { status: 503 });
  const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });
  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing Stripe signature', { status: 400 });
  const body = await req.text();
  let event: Stripe.Event;
  try { event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, cryptoProvider); }
  catch (error) { return new Response(`Invalid webhook: ${error instanceof Error ? error.message : 'unknown error'}`, { status: 400 }); }

  let claim: { claimed: boolean; processing: boolean };
  try { claim = await claimWebhookEvent(event); }
  catch (error) { console.error('STRIPE_WEBHOOK_CLAIM_ERROR', event.id, event.type, error); return new Response('Internal Server Error', { status: 500 }); }
  if (!claim.claimed) return new Response(claim.processing ? 'Processing' : 'Already processed', { status: claim.processing ? 202 : 200 });

  try {
    let result: Record<string, unknown> = { ignored: true };
    if (event.type.startsWith('customer.subscription.')) {
      result = await syncSubscription(event.data.object as Stripe.Subscription, event.created);
    } else if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (moveMeta(session)) result = await recordMovePayment(session);
      else if (campaignMeta(session)) result = await recordCampaignPayment(session);
      else if (session.subscription) {
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
        result = await syncSubscription(await stripe.subscriptions.retrieve(subscriptionId), event.created);
      }
    } else if (event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      result = moveMeta(session) ? await recordMovePayment(session, 'paid') : await recordCampaignPayment(session, 'paid');
    } else if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object as Stripe.Checkout.Session;
      result = moveMeta(session) ? await recordMovePayment(session, 'failed') : await recordCampaignPayment(session, 'failed');
    } else if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session;
      result = moveMeta(session) ? await expireMoveCheckout(session) : await expireCampaignPayment(session);
    } else if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      result = await recordSubscriptionBillingSignal('billing.invoice_payment_failed', invoice.customer, { invoice_id: invoice.id, amount_due: invoice.amount_due, attempt_count: invoice.attempt_count });
    } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;
      result = await recordSubscriptionBillingSignal('billing.invoice_paid', invoice.customer, { invoice_id: invoice.id, amount_paid: invoice.amount_paid, attempt_count: invoice.attempt_count });
    } else if (event.type === 'charge.refunded') {
      result = await recordRefund(event.data.object as Stripe.Charge);
    }
    await completeWebhookEvent(event, result);
    return new Response('ok', { status: 200 });
  } catch (error) {
    console.error('STRIPE_WEBHOOK_PROCESSING_ERROR', event.id, event.type, error);
    await releaseWebhookClaim(event);
    return new Response('Internal Server Error', { status: 500 });
  }
});