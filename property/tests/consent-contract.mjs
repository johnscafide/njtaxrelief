import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const consent = read('property/js/watchdog-consent.js');
const css = read('property/css/watchdog-consent.css');
const runtime = read('property/js/supabase-runtime.js');
const observability = read('property/js/platform-observability.js');
const entry = read('api/watchdog-index-entry.js');
const cleanRouteAdapter = read('api/watchdog-index-page.js');
const footer = read('property/partials/footer.html');

assert(consent.includes("watchdog_cookie_preferences_v1"), 'Consent preference storage must be versioned');
assert(consent.includes("analytics_storage:analytics?'granted':'denied'"), 'Google analytics_storage consent is missing');
assert(consent.includes("ad_storage:'denied'"), 'Google ad_storage must stay denied');
assert(consent.includes("ad_user_data:'denied'"), 'Google ad_user_data must stay denied');
assert(consent.includes("ad_personalization:'denied'"), 'Google ad_personalization must stay denied');
assert(consent.includes("window.gtag('consent',mode||'update'"), 'Google Consent Mode update is missing');
assert(consent.includes("window.clarity('consentv2'"), 'Clarity Consent API V2 is missing');
assert(consent.includes("analytics_Storage:analytics?'granted':'denied'"), 'Clarity analytics storage consent is missing');
assert(consent.includes("ad_Storage:'denied'"), 'Clarity ad storage must stay denied');
assert(consent.includes('Reject optional cookies'), 'Reject optional cookies choice is missing');
assert(consent.includes('Accept all cookies'), 'Accept all cookies choice is missing');
assert(consent.includes('Cookie settings'), 'Cookie settings choice is missing');
assert(consent.includes('Necessary cookies'), 'Necessary cookies disclosure is missing');
assert(consent.includes('Optional cookies'), 'Optional cookies disclosure is missing');
assert(consent.includes('GA_ID'), 'Google Analytics consent implementation is missing');
assert(consent.includes('CLARITY_ID'), 'Microsoft Clarity consent implementation is missing');
assert(consent.includes("watchdog:'G-EDW7CZV66M'"), 'Watchdog GA4 measurement ID is missing');
assert(consent.includes("legacy:'G-ENP9182L0J'"), 'Legacy NJPropertyTaxRelief GA4 measurement ID is missing');
assert(consent.includes("watchdog:'y8g1uivano'"), 'Watchdog Microsoft Clarity project ID is missing');
assert(consent.includes("legacy:'wjeklv0exl'"), 'Legacy NJPropertyTaxRelief Clarity project ID is missing');
assert(consent.includes("host==='watchdogindex.com'||host==='www.watchdogindex.com'"), 'Watchdog analytics host routing is missing');
assert(consent.includes("host==='njpropertytaxrelief.com'||host==='www.njpropertytaxrelief.com'"), 'Legacy analytics host routing is missing');
assert(consent.includes("if(!GA_ID) return;"), 'Unknown and preview hosts must fail closed instead of loading GA4');
assert(consent.includes("if(!CLARITY_ID) return;"), 'Unknown and preview hosts must fail closed instead of loading Clarity');
assert(!consent.includes('supabase.co'), 'Browser cookie choice must not be written to Supabase');
assert(!consent.includes('user_id'), 'Cookie preference storage must not be linked to a user ID');

assert(css.includes('.wd-consent-banner'), 'Consent banner styles are missing');
assert(css.includes('@media(max-width:560px)'), 'Mobile consent layout is missing');
assert(css.includes('@media(prefers-reduced-motion:reduce)'), 'Reduced-motion consent styles are missing');
assert(!css.includes('radial-gradient'), 'Consent UI must not use decorative circle/orb motifs');

assert(runtime.includes("/property/js/watchdog-consent.js"), 'Shared Supabase runtime does not load consent UI');
assert(observability.includes('WatchdogConsent.syncAnalytics()'), 'Primary app analytics are not delegated to consent runtime');
assert(!observability.includes('googletagmanager.com/gtag/js?id='), 'Platform observability still directly loads GA4');
assert(!observability.includes('clarity.ms/tag/wjeklv0exl'), 'Platform observability still directly loads Clarity');
assert(!observability.includes('clarity.ms/tag/y8g1uivano'), 'Platform observability must not bypass consent for Watchdog Clarity');
assert(entry.includes('installConsentFirstAnalytics'), 'Canonical Watchdog entry does not install consent-first analytics');
assert(entry.includes('CONSENT_TAG'), 'Canonical Watchdog entry does not inject the consent runtime');
assert(cleanRouteAdapter.includes('installConsentFirstAnalytics'), 'Clean Watchdog routes do not install consent-first analytics');
assert(cleanRouteAdapter.includes('CONSENT_SCRIPT'), 'Clean Watchdog routes do not inject the consent runtime');
assert(cleanRouteAdapter.includes('ensureCookiePreferenceControl'), 'Clean Watchdog routes cannot add a cookie-preferences control');
assert(cleanRouteAdapter.includes('data-watchdog-cookie-settings'), 'Clean Watchdog route footer control is missing');
assert(footer.includes('data-watchdog-cookie-settings'), 'Shared footer cannot reopen cookie preferences');

console.log('Watchdog consent contract passed.');
