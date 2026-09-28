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

const sweep = read('supabase/functions/referral-rewards-sweep/index.ts');
const hold = read('supabase/migrations/20260928160000_referral_reward_90_day_hold.sql');
const config = read('supabase/config.toml');

// Webhook only records the reward (paid yearly plan, not trialing) with a 90-day hold.
assert.match(hook, /config\.interval !== 'yearly' \|\| sub\.status !== 'active'/);
assert.match(hook, /const REFERRAL_HOLD_DAYS = 90;/);
assert.match(hook, /eligible_at: eligibleAt/);
assert.match(hook, /onConflict: 'referred_user_id', ignoreDuplicates: true/);
assert.doesNotMatch(hook, /createBalanceTransaction/, 'the webhook never moves money; the sweep pays out after the hold');
assert.match(hook, /catch \(e\) \{ console\.error\('REFERRAL_REWARD_ERROR'/, 'recording a reward never blocks the entitlement sync');

// Sweep: token from Vault, only cleared rewards, void if the referred plan stopped or was refunded.
assert.match(sweep, /rpc\('referral_rewards_sweep_authorized'/);
assert.match(sweep, /\.lte\('eligible_at', new Date\(\)\.toISOString\(\)\)/);
assert.match(sweep, /billing\.subscription_refund_observed/);
assert.match(sweep, /const REFERRED_PAYING = \['active', 'past_due'\];/);
assert.match(sweep, /voidReward\(reward, blocked\)/);
// Credit, never a charge; the inviter's own monthly price read from Stripe; idempotent per reward.
assert.match(sweep, /amount: -amount,/);
assert.match(sweep, /stripe\.prices\.retrieve\(priceId\)/);
assert.match(sweep, /idempotencyKey: `watchdog-referral-reward-\$\{reward\.id\}`/);

assert.match(hold, /alter column eligible_at set not null/);
assert.match(hold, /revoke all on function public\.referral_rewards_sweep_authorized\(text\) from public, anon, authenticated;/);
assert.match(hold, /revoke all on function public\.invoke_referral_rewards_sweep\(\) from public, anon, authenticated;/);
assert.match(hold, /cron\.schedule\('watchdog-referral-rewards-sweep'/);
assert.match(config, /\[functions\.referral-rewards-sweep\]\nverify_jwt = false/);

// Pricing page Lifetime toggle: one handler owns the button whether the page
// ships it (soft-launch build) or the guard adds it.
const guard = read('property/js/pro-checkout-guard.js');
assert.match(guard, /if\(cadence\.dataset\.cadence==='lifetime'\)\{ev\.preventDefault\(\);setLifetime\(true\);return;\}/);
assert.doesNotMatch(guard, /b\.addEventListener\('click',function\(\)\{setLifetime\(true\);\}\);/, 'no second Lifetime handler');

console.log('Referral reward and Lifetime toggle contract passed.');
