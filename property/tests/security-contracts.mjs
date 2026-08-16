import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const config = read('supabase/config.toml');
assert.match(config, /\[functions\.paddle-webhook\][\s\S]*?verify_jwt\s*=\s*false/,
  'Paddle must authenticate its public subscription webhook with its provider signature, not a Supabase JWT.');
assert.match(config, /\[functions\.marketing-campaign-checkout\][\s\S]*?verify_jwt\s*=\s*true/,
  'Marketing campaign checkout must require an authenticated Supabase JWT.');
assert.match(config, /\[functions\.stripe-webhook\][\s\S]*?verify_jwt\s*=\s*false/,
  'Stripe campaign webhooks must authenticate with Stripe signatures, not a Supabase JWT.');
assert.match(config, /\[functions\.marketing-track\][\s\S]*?verify_jwt\s*=\s*false/,
  'Public campaign tracking uses an opaque campaign token rather than a user JWT.');
assert.match(config, /\[functions\.marketing-provider-status\][\s\S]*?verify_jwt\s*=\s*true/,
  'Provider readiness details must require an authenticated Marketing Studio session.');
assert.equal(fs.existsSync(path.join(root, 'supabase/functions/stripe-webhook/index.ts')), true,
  'The Stripe campaign payment webhook source must be checked in for rollback and audit.');
assert.equal(fs.existsSync(path.join(root, 'supabase/functions/marketing-track/index.ts')), true,
  'The public campaign tracking source must be checked in for rollback and audit.');
assert.equal(fs.existsSync(path.join(root, 'supabase/functions/marketing-provider-status/index.ts')), true,
  'Provider readiness source must be checked in for rollback and audit.');

const stripe = read('supabase/functions/stripe-webhook/index.ts');
assert.match(stripe, /STRIPE_WEBHOOK_SIGNING_SECRET/,
  'Stripe webhook signing secret must be required.');
assert.match(stripe, /req\.headers\.get\('stripe-signature'\)/,
  'Stripe-Signature must be read from the request.');
assert.match(stripe, /constructEventAsync\(/,
  'Stripe webhook payloads must be cryptographically verified before event handling.');
assert.match(stripe, /await req\.text\(\)/,
  'Stripe webhook verification must use the raw request body.');
assert.match(stripe, /billing_webhook_events/,
  'Stripe webhook events must be deduplicated in the billing event ledger.');

const campaignCheckout = read('supabase/functions/marketing-campaign-checkout/index.ts');
assert.match(campaignCheckout, /MARKETING_BILLING_ENABLED/,
  'Paid marketing checkout must have an explicit server-side activation gate.');
assert.match(campaignCheckout, /marketing_price_quotes/,
  'Campaign checkout must use a server-generated Marketing Studio quote.');
assert.match(campaignCheckout, /marketing_payments/,
  'Campaign checkout must persist a server-side payment ledger row.');
assert.doesNotMatch(campaignCheckout, /body\?\.(price|amount|unit_amount|retail_cents)/,
  'Browser-submitted price or amount must never be authoritative for campaign checkout.');

const marketingTrack = read('supabase/functions/marketing-track/index.ts');
assert.doesNotMatch(marketingTrack, /'Access-Control-Allow-Origin':\s*'\*'/,
  'Public marketing tracking must never use wildcard CORS.');
assert.match(marketingTrack, /\^\[a-f0-9\]\{64\}\$/,
  'Public marketing tracking must require a 64-character opaque token.');
assert.match(marketingTrack, /ORIGINS\.has\(o\)/,
  'Tracking POST events must validate the Watchdog origin.');
assert.match(marketingTrack, /destination_path/,
  'Tracking redirects must use the server-stored destination, never a browser destination parameter.');
assert.doesNotMatch(marketingTrack, /searchParams\.get\(['"](?:url|redirect|destination)['"]\)/,
  'Tracking must not expose an open redirect parameter.');

const providerStatus = read('supabase/functions/marketing-provider-status/index.ts');
assert.doesNotMatch(providerStatus, /'Access-Control-Allow-Origin':\s*'\*'/,
  'Provider readiness must never use wildcard CORS.');
assert.match(providerStatus, /client\.rpc\('marketing_studio_bootstrap'\)/,
  'Provider readiness must verify Marketing Studio entitlement before returning its catalog.');
assert.doesNotMatch(providerStatus, /missing_configuration/,
  'Agent-facing provider readiness must not expose server secret variable names.');
assert.doesNotMatch(providerStatus, /value:\s*Deno\.env|get\(k\).*return.*k/s,
  'Provider readiness must never return server secret values.');

const providerCatalog = read('supabase/migrations/20260814183500_marketing_provider_adapter_catalog.sql');
assert.match(providerCatalog, /oauth2_multi_user/,
  'Google Ads must declare a multi-user OAuth adapter strategy.');
assert.match(providerCatalog, /owner_record_custom_audiences[^\n]*false/,
  'Google Ads adapter metadata must reject property-owner-record custom audiences.');
assert.match(providerCatalog, /cold_property_record_email[^\n]*false/,
  'Email adapter metadata must reject cold property-record email.');
assert.match(providerCatalog, /cold_property_record_sms[^\n]*false/,
  'SMS adapter metadata must reject cold property-record SMS.');
assert.match(providerCatalog, /revoke all on public\.marketing_provider_connections from anon,authenticated/i,
  'Provider connection internals must remain server-only.');

const consentMigration = read('supabase/migrations/20260814184000_marketing_contact_consent_ledger.sql');
assert.match(consentMigration, /subject_hash text not null check\(subject_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/i,
  'Permission-based channel consent must use a normalized SHA-256 subject hash.');
assert.match(consentMigration, /marketing_has_contact_consent/,
  'Permission-based adapters need a central consent check.');
assert.match(consentMigration, /not public\.marketing_is_suppressed/i,
  'Consent may not override an active suppression.');
assert.match(consentMigration, /revoke insert,update,delete on public\.marketing_contact_consents from anon,authenticated/i,
  'Browser clients must not fabricate consent records.');

const automationMigration = read('supabase/migrations/20260814180500_marketing_automation_attribution_engine.sql');
assert.match(automationMigration, /kill_switch/,
  'Campaign automation must include a kill switch.');
assert.match(automationMigration, /for update of s skip locked/i,
  'Due-step claiming must use row locking to prevent duplicate processing.');
assert.match(automationMigration, /grant execute on function public\.marketing_claim_due_steps\(integer\) to service_role/i,
  'Only the service role may claim due automation steps.');
const controlsMigration = read('supabase/migrations/20260814181500_marketing_automation_controls_and_learning.sql');
assert.match(controlsMigration, /SHA-256 hash/,
  'Suppression subjects must be stored as hashes rather than raw contact values.');
assert.match(controlsMigration, /sample_size integer not null check\(sample_size>=5\)/i,
  'Aggregate recommendation learning must enforce a minimum privacy sample.');
assert.match(controlsMigration, /revoke all on public\.marketing_performance_rollups from anon,authenticated/i,
  'Cross-customer aggregate learning data must remain server-only.');

const paddle = read('supabase/functions/paddle-webhook/index.ts');
const signatureRead = paddle.indexOf("req.headers.get('Paddle-Signature')");
const signatureCheck = paddle.indexOf('await verify(raw,sig,secret)');
const serviceClient = paddle.indexOf("createClient(Deno.env.get('SUPABASE_URL')!");
const entitlementWrite = paddle.indexOf("from('account_entitlements').upsert");
assert.ok(signatureRead >= 0 && signatureCheck > signatureRead,
  'Paddle-Signature must be read and verified.');
assert.ok(serviceClient > signatureCheck && entitlementWrite > signatureCheck,
  'No Paddle service-role client or entitlement write may be reached before signature verification.');
assert.match(paddle, /d\|=a\.charCodeAt\(i\)\^b\.charCodeAt\(i\)/,
  'Paddle webhook signatures must use a timing-safe comparison.');
assert.match(paddle, /sigs\.some\(x=>eq\(x\.toLowerCase\(\),dig\)\)/,
  'Paddle HMAC verification must compare the computed digest through the timing-safe helper.');
assert.match(paddle, /PADDLE_WEBHOOK_TOLERANCE_SECONDS/, 'Paddle webhook replay tolerance must be enforced.');

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

console.log('Security, campaign billing, marketing automation, provider adapters and Chapter 123 measurement contracts passed.');
