import { readFileSync } from 'node:fs';

// Browser calls through supabase.functions.invoke() always send X-Client-Info.
// If an Edge Function's CORS preflight does not allow it, the browser drops the
// real POST and the page shows "Failed to send a request to the Edge Function".
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); };

const SDK_HEADERS = ['authorization', 'x-client-info', 'apikey', 'content-type'];
const functions = ['tmp-boldtrail-probe', 'integration-provider-manager', 'integration-gateway', 'integration-key-manager'];

for (const name of functions) {
  const source = read(`supabase/functions/${name}/index.ts`);
  const match = source.match(/Access-Control-Allow-Headers["']\s*:\s*["']([^"']+)["']/);
  must(match, `${name}: CORS Access-Control-Allow-Headers missing.`);
  const allowed = match[1].split(',').map((h) => h.trim().toLowerCase());
  for (const header of SDK_HEADERS) must(allowed.includes(header), `${name}: CORS must allow ${header} or browser invoke() calls fail preflight.`);
}

const self = read('property/js/account-self-service.js');
must(self.includes('Where do I find my BoldTrail API token?'), 'BoldTrail key help missing on Sync Accounts.');
must(self.includes('Where do I find my Kit V4 API key?'), 'Kit key help missing on Sync Accounts.');
must(self.includes('FunctionsFetchError'), 'Unreachable-service error is not translated into plain language.');

const css = read('property/css/account-self-service.css');
must(css.includes('.ac-key-help>summary') && css.includes('min-height:44px'), 'Key help toggle must keep a 44px touch target.');

console.log('Sync Accounts CORS and key-help contract passed');
