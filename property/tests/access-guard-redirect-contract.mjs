// Signed-out or under-plan visits to a guarded page redirect away. That must not
// surface as an uncaught page error (the global Playwright audit counted it as a
// crash on every guarded route), while pages still see a rejected
// njptrAccessReady so they never load private data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const guard = fs.readFileSync('property/js/access-guard.js', 'utf8');

async function visit({ user, plan = 'standard', status = 'none', required = 'agent' }) {
  let redirect = null;
  const listeners = {};
  const client = {
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: async (name) => ({ data: name === 'is_watchdog_developer' ? false : name === 'get_my_agent_training_state' ? [] : [{ plan_tier: plan, subscription_status: status }] })
  };
  const window = { supabase: { createClient: () => client }, addEventListener: (type, fn) => { listeners[type] = fn; } };
  const document = { documentElement: { getAttribute: () => required, classList: { add() {}, remove() {} } }, body: { getAttribute: () => null }, dispatchEvent() {} };
  const location = { hostname: 'www.watchdogindex.com', pathname: '/agent-desk', search: '', hash: '', replace(value) { redirect = value; } };
  vm.runInNewContext(guard, { window, document, location, URLSearchParams, CustomEvent: class {} });
  const reason = await window.njptrAccessReady.then(() => null, (error) => error);
  let prevented = false;
  if (reason && listeners.unhandledrejection) listeners.unhandledrejection({ reason, preventDefault() { prevented = true; } });
  return { redirect, reason, prevented, hasListener: typeof listeners.unhandledrejection === 'function' };
}

const signedOut = await visit({ user: null });
assert.match(signedOut.redirect, /^\/dashboard\?access=signin&return=%2Fagent-desk$/, 'signed-out visitors are sent to sign in');
assert.equal(signedOut.reason?.message, 'Sign in required', 'pages still see the rejection and stop loading');
assert.equal(signedOut.reason?.watchdogAccessRedirect, true, 'the rejection is marked as an expected redirect');
assert.ok(signedOut.hasListener && signedOut.prevented, 'the expected redirect is kept out of uncaught-error reports');

const underPlan = await visit({ user: { id: 'u1' }, plan: 'standard', status: 'active' });
assert.match(underPlan.redirect, /access=restricted/);
assert.equal(underPlan.reason?.watchdogAccessRedirect, true);
assert.ok(underPlan.prevented);

const allowed = await visit({ user: { id: 'u1' }, plan: 'agent', status: 'active' });
assert.equal(allowed.redirect, null);
assert.equal(allowed.reason, null, 'allowed visitors resolve normally');

// Ordinary page errors are never swallowed: only marked access redirects.
let swallowed = false;
const plain = new Error('Something else broke');
const listenerSource = guard.match(/window\.addEventListener\('unhandledrejection', function \(event\) \{\n\s+if \(event && event\.reason && event\.reason\.watchdogAccessRedirect\) event\.preventDefault\(\);/);
assert.ok(listenerSource, 'the listener only prevents marked access redirects');
if (plain.watchdogAccessRedirect) swallowed = true;
assert.equal(swallowed, false);

console.log('Access guard redirect contract passed.');
