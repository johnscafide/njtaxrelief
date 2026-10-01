import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const consent = read('property/js/watchdog-consent.js');
const runtime = read('property/js/watchdog-ad-pixels.js');
const privacy = read('property/privacy/index.html');

// The ad platform IDs live in one block in the consent runtime.
const block = consent.match(/var AD_PIXELS = \{([\s\S]*?)\n  \};/);
assert(block, 'AD_PIXELS config block is missing from watchdog-consent.js');
const filled = [...block[1].matchAll(/([a-z_]+):'([^']*)'/g)].filter(([, , value]) => value.trim() !== '');
const platformOf = (field) => {
  const line = block[1].split('\n').find((row) => row.includes(`${field}:'`)) || '';
  return (line.match(/^\s*([a-z_]+):\{/) || [])[1] || '';
};
const configured = new Set(filled.map(([, field]) => platformOf(field)).filter(Boolean));

const names = {
  meta: 'Meta', google_ads: 'Google Ads', linkedin: 'LinkedIn', tiktok: 'TikTok', microsoft: 'Microsoft Advertising',
  reddit: 'Reddit', pinterest: 'Pinterest', snapchat: 'Snapchat', x: 'X (Twitter)', nextdoor: 'Nextdoor'
};
for (const key of Object.keys(names)) assert(new RegExp(`\\b${key}:\\{`).test(block[1]), `AD_PIXELS is missing the ${key} entry`);

// No ad platform may go live before the Privacy Policy discloses it.
if (configured.size) {
  assert(privacy.includes('id="advertising"'), 'An ad platform ID is filled in, but the Privacy Policy has no Advertising section (id="advertising"). Publish it first; draft in property/docs/ad-tracking-setup.md.');
  for (const key of configured) assert(privacy.includes(names[key]), `Privacy Policy must name ${names[key]} before its ID is filled in.`);
}

// Off by default: Google consent defaults stay denied and only the opt-in path grants ad signals.
assert(consent.includes("signalGoogle(false,'default')"), 'Google consent default must be the denied payload');
assert(consent.includes("mode!=='default'&&advertisingAllowed()?advertisingPayload"), 'Ad consent signals may only be granted through advertisingAllowed()');
assert(consent.includes('return ADS_AVAILABLE && !privacySignal() && !!(stored && stored.advertising);'), 'Advertising must require availability, an explicit opt-in and no GPC/DNT signal');
assert(consent.includes("navigator.globalPrivacyControl===true||String(navigator.doNotTrack||'')==='1'"), 'Consent runtime must honor Global Privacy Control and Do Not Track');
assert(consent.includes("var ADS_AVAILABLE = isWatchdogHost() && adPlatformConfigured();"), 'Advertising must only exist on WatchdogIndex with a configured platform');
assert(consent.includes("if(name==='reject'){apply(false,true,false);"), 'Reject optional cookies must turn advertising off');
for (const vendor of ['connect.facebook.net', 'snap.licdn.com', 'analytics.tiktok.com', 'bat.bing.com', 'redditstatic.com', 's.pinimg.com', 'sc-static.net', 'ads-twitter.com', 'ads.nextdoor.com']) {
  assert(!consent.includes(vendor), `Consent runtime must not load ${vendor} directly; only watchdog-ad-pixels.js may`);
}

// The pixel runtime re-checks everything itself and sends no personal data.
assert(runtime.includes("host!=='watchdogindex.com'&&host!=='www.watchdogindex.com'"), 'Pixel runtime must be limited to WatchdogIndex');
assert(runtime.includes('navigator.globalPrivacyControl===true'), 'Pixel runtime must honor Global Privacy Control');
assert(runtime.includes('c.advertising===true'), 'Pixel runtime must require the advertising opt-in');
assert(runtime.includes('if(!config||!consented()) return;'), 'Pixel runtime must stop when consent or config is missing');
assert(!/user\.(email|phone)|\.email\b|hashed?_?email|em:/.test(runtime), 'Pixel runtime must not send email or phone to ad platforms');

console.log(`Ad pixels contract passed (${configured.size ? [...configured].join(', ') : 'no platforms configured; advertising cookies hidden'}).`);
