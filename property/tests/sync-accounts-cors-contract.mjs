import { readFileSync } from 'node:fs';

// Browser calls through supabase.functions.invoke() always send X-Client-Info.
// If an Edge Function's CORS preflight does not allow it, the browser drops the
// real POST and the page shows "Failed to send a request to the Edge Function".
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); };

const SDK_HEADERS = ['authorization', 'x-client-info', 'apikey', 'content-type'];
const functions = ['tmp-boldtrail-probe', 'integration-provider-manager', 'integration-gateway', 'integration-key-manager', 'create-support-checkout', 'get-platform-health', 'pcm-direct-mail', 'intelligence-crm-context'];

// Watchdog Intelligence CRM context must accept the WatchdogIndex hosts, not only the legacy site.
const crmContext = read('supabase/functions/intelligence-crm-context/index.ts');
must(crmContext.includes('"https://www.watchdogindex.com"') && crmContext.includes('"https://watchdogindex.com"'), 'intelligence-crm-context must allow the WatchdogIndex origins.');

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

// /support has no deployed Edge Function slot; it submits through the submit_support_request RPC.
const support = read('property/js/support.js');
must(support.includes("client.rpc('submit_support_request'") && !support.includes("functions.invoke('submit-support-request'"), 'Support form must use the submit_support_request RPC.');
const supportSql = read('supabase/migrations/20260928200000_support_request_rpc.sql');
must(/security definer/i.test(supportSql) && /revoke all on function public\.submit_support_request/i.test(supportSql) && /'access'/.test(supportSql) && /'other'/.test(supportSql), 'Support RPC migration must be security definer, revoke public access and allow the form categories.');

const css = read('property/css/account-self-service.css');
must(css.includes('.ac-key-help>summary') && css.includes('min-height:44px'), 'Key help toggle must keep a 44px touch target.');

console.log('Sync Accounts CORS, key-help and support contract passed');
