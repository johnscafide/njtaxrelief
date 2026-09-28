import assert from 'node:assert/strict';
import fs from 'node:fs';

// Referral free month: a referred account's paid yearly plan earns the inviter
// one month of their own plan as a Stripe balance credit, once per referred account.
const read = (p) => fs.readFileSync(p, 'utf8');
const hook = read('supabase/functions/stripe-webhook/index.ts');
const sql = read('supabase/migrations/20260928140000_referral_free_month_rewards.sql');

assert.match(sql, /referred_user_id uuid not null unique/, 'one reward per referred account');
assert.match(sql, /stripe_balance_transaction_id text unique/);
assert.match(sql, /enable row level security/);
assert.match(sql, /using \(inviter_user_id = auth\.uid\(\)\)/, 'members only read their own rewards');
assert.match(sql, /revoke all on public\.watchdog_referral_rewards from anon, authenticated;/);
assert.doesNotMatch(sql, /grant (insert|update|delete|all)[^;]*to authenticated/i, 'only the service role writes rewards');

// Earned only by a paid (active, not trialing) yearly plan.
assert.match(hook, /config\.interval === 'yearly' && sub\.status === 'active'/);
// Amount is the inviter's own monthly price, read from Stripe.
assert.match(hook, /row\.tier === tier && row\.interval === 'monthly'/);
assert.match(hook, /stripe\.prices\.retrieve\(monthly\.id\)/);
// Credit, never a charge, and idempotent per reward.
assert.match(hook, /amount: -amount,/);
assert.match(hook, /idempotencyKey: `watchdog-referral-reward-\$\{reward\.id\}`/);
assert.match(hook, /onConflict: 'referred_user_id', ignoreDuplicates: true/);
// A reward never blocks the entitlement sync.
assert.match(hook, /catch \(e\) \{ console\.error\('REFERRAL_REWARD_ERROR'/);
assert.equal((hook.match(/, event\.created, stripe\)/g) || []).length, 2, 'both subscription sync paths pass Stripe for rewards');

// Pricing page Lifetime toggle: one handler owns the button whether the page
// ships it (soft-launch build) or the guard adds it.
const guard = read('property/js/pro-checkout-guard.js');
assert.match(guard, /if\(cadence\.dataset\.cadence==='lifetime'\)\{ev\.preventDefault\(\);setLifetime\(true\);return;\}/);
assert.doesNotMatch(guard, /b\.addEventListener\('click',function\(\)\{setLifetime\(true\);\}\);/, 'no second Lifetime handler');

console.log('Referral reward and Lifetime toggle contract passed.');
