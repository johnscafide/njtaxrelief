import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

/* Referral free month payout. stripe-webhook records a reward when a referred
   account's yearly plan becomes active and holds it for 90 days (eligible_at),
   past any refund window. This daily sweep (pg_cron -> Vault token) pays out
   rewards that have cleared:
   - the referred account must still be on a paying plan and have no refund
     recorded since the reward was earned, otherwise the reward is voided;
   - the inviter gets a Stripe customer balance credit equal to one month of
     their own plan, which comes off their next invoice;
   - an inviter without a live Stripe plan keeps the reward waiting.
   One credit per reward (idempotency key), logged to access_audit_log. */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const service = createClient(SUPABASE_URL, SERVICE_ROLE);

type BillingTier = 'agent' | 'pro' | 'pro_plus';
const MONTHLY_PRICE_ENV: Record<BillingTier, string> = {
  agent: 'STRIPE_PRICE_AGENT_MONTHLY',
  pro: 'STRIPE_PRICE_PRO_MONTHLY',
  pro_plus: 'STRIPE_PRICE_PRO_PLUS_MONTHLY'
};

async function monthlyPrice(stripe: Stripe, tier: BillingTier) {
  const override = String(Deno.env.get(MONTHLY_PRICE_ENV[tier]) || '').trim();
  if (override) return stripe.prices.retrieve(override);
  const result = await stripe.prices.list({ lookup_keys: [`watchdog_${tier}_monthly`], active: true, limit: 1 });
  return result.data[0] || null;
}
const INVITER_LIVE = ['active', 'trialing', 'past_due'];
const REFERRED_PAYING = ['active', 'past_due'];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function voidReward(reward: any, reason: string) {
  const now = new Date().toISOString();
  const { error } = await service.from('watchdog_referral_rewards').update({ status: 'void', detail: { ...(reward.detail || {}), void_reason: reason, voided_at: now }, updated_at: now }).eq('id', reward.id).in('status', ['pending', 'waiting_for_subscription']);
  if (error) throw error;
  await service.from('access_audit_log').insert({ user_id: reward.inviter_user_id, event_type: 'billing.referral_free_month_void', resource_type: 'referral_reward', resource_id: reward.id, required_plan: 'standard', allowed: false, metadata: { reason, referred_user_id: reward.referred_user_id } });
  return { reward_id: reward.id, status: 'void', reason };
}

async function referredStillPaying(reward: any) {
  const { data: ent, error } = await service.from('account_entitlements').select('provider,subscription_status').eq('user_id', reward.referred_user_id).maybeSingle();
  if (error) throw error;
  if (ent?.provider !== 'stripe' || !REFERRED_PAYING.includes(ent.subscription_status)) return `referred plan is ${ent?.subscription_status || 'missing'}`;
  const { data: refunds, error: refundError } = await service.from('access_audit_log').select('id,metadata').eq('user_id', reward.referred_user_id).eq('event_type', 'billing.subscription_refund_observed').gte('created_at', reward.created_at).limit(20);
  if (refundError) throw refundError;
  if ((refunds || []).some((r: any) => Number(r.metadata?.amount_refunded || 0) > 0)) return 'referred payment was refunded';
  return null;
}

async function payOut(stripe: Stripe, reward: any) {
  const blocked = await referredStillPaying(reward);
  if (blocked) return voidReward(reward, blocked);

  const now = new Date().toISOString();
  const { data: ent, error } = await service.from('account_entitlements').select('provider,provider_customer_id,billing_tier,subscription_status').eq('user_id', reward.inviter_user_id).maybeSingle();
  if (error) throw error;
  const tier = ent?.billing_tier as BillingTier | undefined;
  if (ent?.provider !== 'stripe' || !ent.provider_customer_id || !tier || !INVITER_LIVE.includes(ent.subscription_status)) {
    if (reward.status !== 'waiting_for_subscription') {
      const { error: waitError } = await service.from('watchdog_referral_rewards').update({ status: 'waiting_for_subscription', updated_at: now }).eq('id', reward.id).eq('status', 'pending');
      if (waitError) throw waitError;
    }
    return { reward_id: reward.id, status: 'waiting_for_subscription' };
  }

  const price = await monthlyPrice(stripe, tier);
  if (!price) throw new Error(`no active monthly ${tier} price`);
  const amount = Number(price.unit_amount || 0);
  if (!(amount > 0)) throw new Error(`monthly ${tier} price has no amount`);
  const txn = await stripe.customers.createBalanceTransaction(ent.provider_customer_id, {
    amount: -amount,
    currency: price.currency,
    description: 'Watchdog referral reward: one free month',
    metadata: { watchdog_referral_reward_id: reward.id, referred_user_id: reward.referred_user_id }
  }, { idempotencyKey: `watchdog-referral-reward-${reward.id}` });
  const { error: creditError } = await service.from('watchdog_referral_rewards').update({ status: 'credited', inviter_tier: tier, amount_cents: amount, currency: price.currency, stripe_customer_id: ent.provider_customer_id, stripe_balance_transaction_id: txn.id, credited_at: now, updated_at: now }).eq('id', reward.id).in('status', ['pending', 'waiting_for_subscription']);
  if (creditError) throw creditError;
  await service.from('access_audit_log').insert({ user_id: reward.inviter_user_id, event_type: 'billing.referral_free_month_credited', resource_type: 'referral_reward', resource_id: reward.id, required_plan: tier, allowed: true, metadata: { provider: 'stripe', amount_cents: amount, currency: price.currency, balance_transaction_id: txn.id, referred_user_id: reward.referred_user_id } });
  return { reward_id: reward.id, status: 'credited', amount_cents: amount };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const token = req.headers.get('x-referral-sweep-token') || '';
  const { data: ok, error: authError } = await service.rpc('referral_rewards_sweep_authorized', { p_token: token });
  if (authError || ok !== true) return json({ error: 'Not authorized' }, 401);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return json({ error: 'Billing is not configured' }, 503);
  const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });

  const { data: due, error } = await service.from('watchdog_referral_rewards').select('*').in('status', ['pending', 'waiting_for_subscription']).lte('eligible_at', new Date().toISOString()).order('eligible_at').limit(50);
  if (error) return json({ error: error.message }, 500);

  const results = [];
  for (const reward of due || []) {
    try { results.push(await payOut(stripe, reward)); }
    catch (e) { console.error('REFERRAL_SWEEP_ERROR', reward.id, e); results.push({ reward_id: reward.id, error: e instanceof Error ? e.message : 'failed' }); }
  }
  return json({ checked: (due || []).length, results });
});
