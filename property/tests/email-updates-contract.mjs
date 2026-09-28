import assert from 'node:assert/strict';
import fs from 'node:fs';

// Email updates (/newsletter-studio), in partnership with Kit: one page, five steps,
// every Kit call through the Kit gateway with the agent's own server-side key.
const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);
const page = read('property/newsletter-studio/index.html');
const js = read('property/js/email-updates.js');
const css = read('property/css/email-updates.css');
const gateway = read('supabase/functions/tmp-boldtrail-probe/index.ts');

// Page shell: Agent plans and up, the app shell, one script and one stylesheet.
assert.match(page, /<html lang="en" class="aw27-page" data-access-require="agent">/, 'Email updates is an Agent+ app-shell page');
assert.match(page, /data-sidebar-page="email-updates"/);
assert.match(page, /<title>Email updates \| Watchdog<\/title>/);
assert.match(page, /email-updates\.css\?v=\d{8}[a-z]/, 'stylesheet loads with a cache version');
assert.match(page, /email-updates\.js\?v=\d{8}[a-z]/, 'script loads with a cache version');
assert.match(page, /In partnership with<\/span> <span class="eu-kit-word">Kit<\/span>/, 'the hero carries the Kit partnership lockup');
for (const step of ['connect', 'audience', 'write', 'send', 'track']) {
  assert.match(page, new RegExp(`data-step="${step}"`), `step ${step} is on the page`);
}
assert.match(page, /https:\/\/app\.kit\.com\/account_settings\/developer_settings/, 'connect step links to Kit developer settings');

// The old layered studio is gone for good.
for (const old of ['newsletter-studio.js', 'newsletter-studio-ux.js', 'broadcast-brand-kit.js', 'broadcast-studio-v3.js', 'broadcast-core-v5.js', 'broadcast-wizard-v7.js', 'broadcast-brand-editor-v9.js']) {
  assert.equal(exists(`property/js/${old}`), false, `${old} must not come back`);
  assert.doesNotMatch(page, new RegExp(old.replace('.', '\\.')), `page must not load ${old}`);
}
assert.doesNotMatch(page, /private beta/i, 'the page no longer describes a private beta');

// Copy lives in the page; the script fills in data.
for (const starter of ['market', 'listed', 'sold', 'newsletter', 'taxes', 'note', 'blank']) {
  assert.match(page, new RegExp(`<div data-starter="${starter}" data-subject=`), `starter email ${starter} lives in the HTML`);
}
assert.doesNotMatch(js, /innerHTML\s*=/, 'the page script never assigns innerHTML');
assert.match(js, /const GATEWAY='tmp-boldtrail-probe';/);
assert.doesNotMatch(js, /api\.kit\.com/, 'the browser never calls Kit directly');
assert.doesNotMatch(js, /api_key[^\n]*localStorage|localStorage[^\n]*api_key/, 'the Kit key is never stored in the browser');

// Sending safety: explicit consent, confirmation before everyone, schedule floor.
assert.match(js, /if\(w!=='draft'&&!qs\('#eu-consent'\)\.checked\)out\.push\('consent'\)/, 'sending needs the consent box');
assert.match(js, /if\(w!=='draft'&&a\.type==='all'&&!confirm\(word\('confirmAll'\)\)\)return;/, 'sending to everyone asks first');
assert.match(js, /payload\.confirm_send=true;if\(a\.type==='all'\)payload\.confirm_all_subscribers=true/);
assert.match(js, /const SEND_NOW_MINUTES=3,SCHEDULE_MIN_MINUTES=10;/, '"Send now" leaves a short window to cancel');

// Email HTML: escaped text, https-only links and images, Kit merge tag for the name.
assert.match(js, /const esc=v=>String\(v==null\?'':v\)\.replace\(\/\[&<>"'\]\/g/);
assert.match(js, /const httpsUrl=v=>\{const x=String\(v\|\|''\)\.trim\(\);return \/\^https:/);
assert.match(js, /'\{\{ subscriber\.first_name \| default: "there" \}\}'/, 'greeting uses the Kit first-name merge tag with a fallback');
assert.match(page, /sandbox="allow-popups allow-popups-to-escape-sandbox"/, 'preview frame runs without scripts or same-origin access');

// Gateway: open to Agent+ (the beta list keeps access), new actions guarded by the connection.
assert.match(gateway, /const planAllowed=!entError&&PROFESSIONAL_PLANS\.has\(plan\);/);
assert.match(gateway, /if\(!betaActive&&!planAllowed\)return reply\(req,403,/, 'non-Agent plans are refused');
assert.match(gateway, /const PROFESSIONAL_PLANS=new Set\(\["agent","pro","pro_plus","teams","developer"\]\);/);
for (const action of ['kit.audience', 'broadcast.refresh', 'broadcast.cancel', 'broadcast.create']) {
  const at = gateway.indexOf(`if(action==="${action}")`);
  assert.ok(at > 0, `${action} exists`);
  assert.match(gateway.slice(at, at + 200), /const conn=await getKitConnection\(\);if\(!conn\|\|conn\.status!=="connected"\)return reply\(req,404,/, `${action} requires a connected Kit account`);
}
assert.match(gateway, /if\(row\.status==="scheduled"&&row\.send_at&&new Date\(row\.send_at\)\.getTime\(\)<Date\.now\(\)\+30000\)return reply\(req,409,/, 'an email that is already sending cannot be canceled');
assert.match(gateway, /\.eq\("id",id\)\.eq\("user_id",user\.id\)\.eq\("provider_key","kit"\)\.maybeSingle\(\)/, 'cancel only touches the signed-in agent\'s own broadcast');
assert.match(gateway, /if\(sendAt&&!targetType&&!ids\.length&&body\.confirm_all_subscribers!==true\)return reply\(req,409,/, 'server refuses an unconfirmed send to everyone');
assert.match(gateway, /if\(body\.confirm_send!==true\)return reply\(req,409,/, 'server refuses an unconfirmed scheduled send');
assert.match(gateway, /function htmlSafe\(raw:unknown\)/, 'email content is still sanitized server-side');
assert.doesNotMatch(gateway, /brandInfo[^\n]*profiles"\)\.select\("[^"]*email/, 'the signature never exposes the login email');

// Design floor.
assert.match(css, /min-height:44px/, 'phones get 44px targets');
assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
assert.match(css, /@media print/);
assert.doesNotMatch(css, /content:\s*["'][^"']+["']/, 'no text injected with content:');

console.log('Email updates contract passed.');
