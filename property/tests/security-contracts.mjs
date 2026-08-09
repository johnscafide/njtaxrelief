import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const config = read('supabase/config.toml');
assert.match(config, /\[functions\.paddle-webhook\][\s\S]*?verify_jwt\s*=\s*false/,
  'Paddle must authenticate its public webhook with its provider signature, not a Supabase JWT.');
assert.doesNotMatch(config, /\[functions\.stripe-webhook\]/,
  'The retired Stripe webhook must not be registered.');
assert.equal(fs.existsSync(path.join(root, 'supabase/functions/stripe-webhook/index.ts')), false,
  'The retired Stripe webhook implementation must stay deleted.');

const paddle = read('supabase/functions/paddle-webhook/index.ts');
const signatureRead = paddle.indexOf("req.headers.get('Paddle-Signature')");
const signatureCheck = paddle.indexOf('await verifyPaddleSignature(raw, signature, secret)');
const serviceClient = paddle.indexOf("createClient(Deno.env.get('SUPABASE_URL')!");
const entitlementWrite = paddle.indexOf("from('account_entitlements').upsert");
assert.ok(signatureRead >= 0 && signatureCheck > signatureRead,
  'Paddle-Signature must be read and verified.');
assert.ok(serviceClient > signatureCheck && entitlementWrite > signatureCheck,
  'No service-role client or entitlement write may be reached before signature verification.');
assert.match(paddle, /safeEqual\(/, 'Webhook signatures must use a timing-safe comparison.');
assert.match(paddle, /PADDLE_WEBHOOK_TOLERANCE_SECONDS/, 'Webhook replay tolerance must be enforced.');

const entitlement = read('supabase/migrations/20260805233000_saas_entitlements_audit.sql');
assert.match(entitlement, /alter table public\.account_entitlements enable row level security/i);
assert.match(entitlement, /revoke all on public\.account_entitlements from anon, authenticated/i);
assert.match(entitlement, /grant all on public\.account_entitlements to service_role/i);
assert.match(entitlement, /where p\.id = auth\.uid\(\)/i,
  'The entitlement getter must scope itself to the authenticated user.');

const verification = read('supabase/functions/request-verify-code/index.ts');
assert.doesNotMatch(verification, /'Access-Control-Allow-Origin':\s*'\*'/,
  'Verification CORS must never allow every origin.');
assert.doesNotMatch(verification, /detail:\s*(insertError|String\(error)/,
  'Verification responses must not expose raw database or runtime errors.');

const vercel = JSON.parse(read('vercel.json'));
const responseHeaders = new Map(vercel.headers?.[0]?.headers?.map(({ key, value }) => [key, value]));
for (const key of [
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'Strict-Transport-Security'
]) {
  assert.ok(responseHeaders.has(key), `${key} must be set on every deployed route.`);
}
assert.equal(responseHeaders.get('X-Content-Type-Options'), 'nosniff');
assert.equal(responseHeaders.get('X-Frame-Options'), 'SAMEORIGIN');

for (const relative of [
  'property/js/lookup.js',
  'property/js/dashboard/index.js',
  'property/js/dashboard/home/index.js'
]) {
  const source = read(relative);
  assert.match(source, /chapter123_coverage/, `${relative} must record Chapter 123 coverage.`);
  assert.match(source, /evidence_basis/, `${relative} must record the independent evidence basis.`);
  assert.match(source, /living_sqft_present/, `${relative} must record subject square-footage coverage.`);
}

console.log('Security and Chapter 123 measurement contracts passed.');
