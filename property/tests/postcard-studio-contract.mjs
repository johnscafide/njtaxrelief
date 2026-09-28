import assert from 'node:assert/strict';
import fs from 'node:fs';

// Postcard Studio (/marketing-studio/postcards) and the PostcardMania v3 wiring
// behind it: signed webhooks, per-agent child accounts, the live-send kill switch,
// fixed profitable pricing and mail credits for addresses PCM cannot mail.
const read = (p) => fs.readFileSync(p, 'utf8');
const html = read('property/marketing-studio/postcards/index.html');
const js = read('property/js/postcard-studio.js');
const css = read('property/css/postcard-studio.css');
const shared = read('supabase/functions/_shared/pcm-v3.ts');
const studio = read('supabase/functions/pcm-postcard-studio/index.ts');
const webhook = read('supabase/functions/pcm-webhook/index.ts');
const fulfill = read('supabase/functions/marketing-direct-mail-fulfill/index.ts');
const checkout = read('supabase/functions/marketing-campaign-checkout/index.ts');
const migration = read('supabase/migrations/20260928010000_postcard_studio_pricing_and_mail_credits.sql');
const vercel = read('vercel.json');
const inventory = JSON.parse(read('supabase/functions/PRODUCTION-INVENTORY.json'));

// Page: agent-gated, one size, static copy in HTML, clean routes.
assert.match(html, /data-access-require="agent"/);
assert.match(html, /<template id="ps-page">/);
assert.match(html, /6 x 8\.5 postcards, printed and mailed First Class by Watchdog Designs/);
// White label: agents only ever see Watchdog Designs, never the print vendor's name.
for (const [name, text] of [['page', html], ['page script', js.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')]]) {
  assert.doesNotMatch(text, /postcard ?mania/i, `Postcard Studio ${name} must not show the vendor name`);
  assert.doesNotMatch(text, /\bPCM\b/, `Postcard Studio ${name} must not show the vendor abbreviation`);
}
assert.doesNotMatch(studio.match(/error: error\.status === 404[^\n]*/)?.[0] || '', /PostcardMania|PCM/, 'agent-facing studio errors use the Watchdog Designs name');
assert.match(css, /\.ps-shell \[hidden\][^{]*\{display:none!important\}/, 'hidden controls stay hidden despite button display rules');
assert.doesNotMatch(js, /['"`]\/property\/(?!js\/|css\/)/, 'no hard-coded /property/ page links');
assert.match(vercel, /frame-src[^;]*https:\/\/portal\.pcmintegrations\.com/, 'CSP lets the PCM embedded editor load');

// Editor messages are only trusted from PCM's portal origin.
assert.match(js, /const PCM_ORIGIN='https:\/\/portal\.pcmintegrations\.com'/);
assert.match(js, /if\(e\.origin!==PCM_ORIGIN\)return;/);

// Browser never supplies price: it asks the server quote, then opens checkout with the quote id only.
assert.match(js, /rpc\('marketing_direct_mail_product_quote'/);
assert.match(js, /invoke\('marketing-campaign-checkout',\{body:\{quote_id:quote\.quote_id,return_to:'postcards'\}\}\)/);

// Shared v3 client: v3 base URL, login with per-agent child account.
assert.match(shared, /https:\/\/v3\.pcmintegrations\.com/);
assert.match(shared, /childRefNbr: child/);
assert.match(shared, /PCM_POSTCARD_SIZE = '68'/);

// Studio function: signed-in agent only, explicit origins, test accounts use sandbox.
assert.match(studio, /marketing_studio_bootstrap/);
assert.doesNotMatch(studio, /Access-Control-Allow-Origin['"]?:\s*['"]\*/);
assert.match(studio, /!isTest && pcmConfigured\('live'\) \? 'live' : 'sandbox'/);
assert.match(studio, /Reading it under the agent's child login proves the design is theirs/);
assert.match(studio, /proof\.creative_id !== creative\.id/, 'approval must match the exact proofed design');
assert.match(studio, /Date\.now\(\) >= deadline\.getTime\(\)/, 'cancel is refused after the 11:30 PM ET cutoff');
assert.equal(inventory.functions['pcm-postcard-studio']?.verify_jwt, true);

// Webhook: fails closed without a secret, verifies {timestamp}.{body} HMAC in constant time.
assert.match(webhook, /PCM_WEBHOOK_SIGNATURE_CONTRACT_PENDING/);
assert.match(webhook, /'pcmi-signature'/);
assert.match(webhook, /timestampHeader: 'pcmi-timestamp'/);
assert.match(webhook, /`\$\{timestamp\}\.\$\{raw\}`/);
assert.match(webhook, /constantTimeEqual\(expected, candidate\)/);
assert.match(webhook, /split\(\/\[\\s,;\]\+\/\)/, 'one secret per PCM subscription: the env var holds a list');
assert.match(webhook, /for \(const secret of current\.secrets\)/);
assert.match(webhook, /pcm:batch:\$\{batch\}:undeliverable:\$\{undeliverable\}/, 'undeliverable credits are keyed per batch count so retries never double-credit');

// Fulfillment: v3 order endpoint, live kill switch kept, service-role only, credits redeemed after submit.
assert.match(fulfill, /'POST', '\/order\/postcard'/);
assert.doesNotMatch(fulfill, /api\.pcmintegrations\.com\/v2/);
assert.match(fulfill, /PCM_LIVE_LAUNCH_ENABLED/);
assert.match(fulfill, /Bearer \$\{SERVICE\}/);
assert.match(fulfill, /marketing_mail_credit_redeem/);
assert.match(fulfill, /PCM_PROOF_STALE/);

// Checkout: gates untouched, returns agents to the host that started checkout.
assert.match(checkout, /MARKETING_BILLING_ENABLED/);
assert.match(checkout, /PCM_LIVE_LAUNCH_ENABLED/);
assert.match(checkout, /ALLOWED_ORIGINS\.has\(origin\) \? origin : 'https:\/\/njpropertytaxrelief\.com'/);

// Pricing: fixed per-plan retail with a 20% margin floor; credits are service-issued only.
assert.match(migration, /'agent', 179, 'pro', 169, 'pro_plus', 159, 'teams', 149, 'developer', 149/);
assert.match(migration, /greatest\(plan_unit_cents, floor_unit_cents\)/);
assert.match(migration, /revoke all on function public\.marketing_mail_credit_issue\([^)]*\) from public, anon, authenticated;/);
assert.match(migration, /greatest\(gross_retail_cents - 100, 0\)/, 'at least $1.00 stays due so checkout always has a real charge');

// Every agent-facing Marketing Studio page runs a white-label filter (admin is staff-only).
for (const page of fs.readdirSync('property/marketing-studio', { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'admin').map((d) => d.name).concat([''])) {
  const file = `property/marketing-studio/${page ? page + '/' : ''}index.html`;
  const src = read(file);
  assert.match(src, /watchdog-designs-white-label\.js|marketing-studio-providers\.js/, `${file} must load a Watchdog Designs white-label filter`);
}
const whiteLabel = read('property/js/watchdog-designs-white-label.js');
assert.match(whiteLabel, /Post\\s\?card\\s\?Mania/, 'filter catches the vendor name');
assert.match(whiteLabel, /\\bPCM\\b/, 'filter catches the vendor abbreviation');

console.log('Postcard Studio contract passed.');
