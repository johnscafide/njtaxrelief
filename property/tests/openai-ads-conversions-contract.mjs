import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const pixel = read('property/js/openai-ads-conversions.js');
const billing = read('property/js/billing-client.js');
const consent = read('property/js/watchdog-consent.js');
const complete = read('supabase/functions/complete-lifetime-checkout/index.ts');

function must(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message || `Missing: ${needle}`);
}
function mustNot(source, needle, message) {
  if (source.includes(needle)) throw new Error(message || `Unexpected: ${needle}`);
}

must(pixel, 'https://bzrcdn.openai.com/sdk/oaiq.min.js', 'OpenAI Ads Pixel must use the official SDK origin.');
must(pixel, "q('consent',consentGranted())", 'Pixel consent must be set before/with initialization.');
must(pixel, "q('init',{pixelId:id})", 'Pixel must initialize with the configured Pixel ID.');
must(pixel, "'page_viewed'", 'Paid landing pages should emit a standard page_viewed event.');
must(pixel, "'checkout_started'", 'Lifetime checkout should use the standard checkout_started event.');
must(pixel, "'order_created'", 'Completed lifetime purchases should use the standard order_created event.');
must(pixel, "cookieRaw('__oppref')", 'Browser attribution must preserve the OpenAI oppref cookie.');
must(pixel, "cookieRaw('__obref')", 'Hybrid attribution must preserve the OpenAI obref cookie.');
mustNot(pixel, 'decodeURIComponent', 'Opaque OpenAI attribution identifiers must not be decoded or transformed.');
mustNot(pixel, 'OPENAI_ADS_CAPI_KEY', 'The Conversions API secret must never appear in browser JavaScript.');
must(pixel, 'opt_out:true', 'Browser measurement should opt events out of future user-level personalization.');

must(billing, "name==='complete-lifetime-checkout'", 'Billing transport must attach attribution only to the lifetime completion verification call.');
must(billing, 'payload.openai_ads=context', 'Billing completion must forward consent-approved OpenAI attribution context.');
must(billing, 'measureCheckoutStarted', 'Billing must measure checkout creation after the server returns a Stripe URL.');
must(billing, 'measureOrderCreated', 'Billing must measure verified purchase completion in the browser.');
must(billing, '/property/js/openai-ads-conversions.js', 'Paid checkout surfaces must load the OpenAI Ads measurement runtime.');

must(consent, 'OpenAI Ads measurement remain opt-in', 'Consent documentation must explicitly keep OpenAI Ads measurement opt-in.');
must(consent, "'__oppref','__obref'", 'Revoking optional consent must clear OpenAI measurement cookies.');
must(consent, 'Ad personalization stays off.', 'Consent UI must disclose the personalization boundary.');

must(complete, "Deno.env.get('OPENAI_ADS_PIXEL_ID')", 'Server CAPI must use the configured OpenAI Pixel ID secret.');
must(complete, "Deno.env.get('OPENAI_ADS_CAPI_KEY')", 'Server CAPI must use the server-only OpenAI CAPI key.');
must(complete, "https://bzr.openai.com/v1/events", 'CAPI must use the official OpenAI conversion endpoint.');
must(complete, "type: 'order_created'", 'Verified Stripe payment must map to order_created.');
must(complete, "action_source: 'web'", 'Lifetime conversion must be identified as a web event.');
must(complete, 'emails_sha256', 'Email matching must use SHA-256, never raw email.');
must(complete, 'external_ids_sha256', 'Stable Watchdog user IDs must be SHA-256 hashed before CAPI matching.');
must(complete, 'event.oppref = args.context.oppref', 'oppref must be forwarded unchanged when available.');
must(complete, 'user.obref = args.context.obref', 'obref must be forwarded unchanged when available.');
must(complete, "opt_out: true", 'Server conversion events must opt out of future user-level personalization.');
must(complete, 'ads_event_id: adsContext ? adsEventId : null', 'The server event ID must return to the browser for Pixel/CAPI deduplication.');
must(complete, 'EdgeRuntime.waitUntil', 'CAPI delivery should use background execution when the Edge Runtime supports it.');
must(complete, "console.warn('OPENAI_ADS_CAPI_FAILED'", 'CAPI failures must be isolated and logged without exposing identifiers.');

console.log('OpenAI Ads conversion measurement contract passed.');
