import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const css = read('property/css/pro-2026.css');
const guard = read('property/js/pro-checkout-guard.js');
const billing = read('property/js/billing-client.js');
const createLifetime = read('supabase/functions/create-lifetime-checkout/index.ts');
const completeLifetime = read('supabase/functions/complete-lifetime-checkout/index.ts');

assert.equal(/border-left/i.test(css), false, 'Lifetime pricing CSS must not use border-left.');
assert.match(css, /width:min\(1180px,100%\)/, 'Lifetime pricing cards must stay bounded.');
assert.equal(/is-lifetime-mode \.pro-lifetime-terms|:not\(\.is-lifetime-mode\) \.pro-lifetime-terms/.test(css), false, 'Lifetime terms must always show now that Lifetime is the only plan.');
assert.equal(/rotateX|rotateY|perspective\(/.test(css), false, 'Lifetime cards must not use 3D tilt transforms.');

assert.match(guard, /billing\.invoke\('create-lifetime-checkout'/, 'Lifetime checkout must use the shared billing transport.');
assert.match(guard, /billing\.invoke\('complete-lifetime-checkout'/, 'Lifetime completion must use the shared billing transport.');
assert.equal(/client\.functions\.invoke\('(?:create|complete)-lifetime-checkout'/.test(guard), false, 'Do not create a second Edge Function transport path for lifetime billing.');
assert.match(billing, /invoke:invoke/, 'Shared billing client must expose invoke().');

for (const source of [createLifetime, completeLifetime]) {
  assert.match(source, /host\.endsWith\('\.vercel\.app'\)/, 'Lifetime billing must allow approved Vercel preview origins.');
  assert.match(source, /njpropertytaxrelief\.com/, 'Lifetime billing must allow the NJPropertyTaxRelief production origin.');
  assert.match(source, /www\.watchdogindex\.com/, 'Lifetime billing must allow the canonical Watchdog origin.');
}

// Owner decision 2026-10-07: Agent $99 and Professional $299, one time.
assert.match(createLifetime, /agent: \{ amount: 9900,/, 'Agent lifetime governed amount changed unexpectedly.');
assert.match(createLifetime, /pro_plus: \{ amount: 29900,/, 'Professional lifetime governed amount changed unexpectedly.');
assert.match(guard, /amount:9900/);
assert.match(guard, /amount:29900/);
assert.match(billing, /invoke\('create-lifetime-checkout',\{tier:tier\}\)/, 'Plan buttons must open Lifetime checkout.');

console.log('pro-lifetime-soft-launch-contract: ok');
