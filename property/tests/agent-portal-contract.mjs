import assert from 'node:assert/strict';
import fs from 'node:fs';

// Public agent share page (/agent/<slug>): official NJREC name, verified license,
// contact actions, leads to the agent only, and a pro invite credited to the agent.
const read = (p) => fs.readFileSync(p, 'utf8');
const page = read('property/agent/index.html');
const migration = read('supabase/migrations/20260928120000_agent_portal_licensed_name_and_referral.sql');

// Name: the official NJDOBI licensee name leads; the nickname is only a fallback.
assert.match(page, /const name=p\.licensed_name\|\|p\.display_name\|\|/);
assert.match(page, /p\.license_verified/);
assert.match(page, /New Jersey Real Estate License /);
assert.match(migration, /'licensed_name', case when v_verified then public\.watchdog_format_licensee_name\(v_licensee\) end/);
assert.match(migration, /v\.verification_status = 'verified'[\s\S]*v\.verification_due_at > now\(\)/, 'only a current NJDOBI verification shows the official name');

// Public boundary unchanged: service-only, active Agent+ entitlement required.
assert.match(migration, /revoke all on function public\.get_public_agent_portal_profile\(text\) from public, anon, authenticated;/);
assert.match(migration, /grant execute on function public\.get_public_agent_portal_profile\(text\) to service_role;/);
assert.match(migration, /subscription_status in \('active','trialing','past_due','cancel_scheduled'\)/);

// Share-ready header: call, text, email, save contact, share.
for (const id of ['call', 'text', 'email', 'saveContact', 'share']) assert.match(page, new RegExp(`id="${id}"`), `${id} action`);
assert.match(page, /\[hidden\]\{display:none!important\}/, 'hidden actions stay hidden despite button display rules');
assert.match(page, /location\.origin\+'\/agent\/'\+slug/, 'shared link is the clean /agent/<slug> URL');

// Leads go to this agent; lead form contract unchanged.
assert.match(page, /fetch\('\/api\/agent-portal-lead'/);
assert.match(page, /contact_consent:fd\.get\('contact_consent'\)==='on'/);

// Pro invite: credited to this agent through the member invite code.
assert.match(page, /Build your own Watchdog portfolio/);
assert.match(page, /'\/pro\?invite='\+encodeURIComponent\(p\.referral_code\)/);
assert.match(page, /const INVITE_KEY='wd_invite_code_v1'/, 'same invite key the universal menu claims after sign-up');
assert.match(read('property/js/watchdog-universal-menu.js'), /var INVITE_KEY = 'wd_invite_code_v1'/);

// Clean public links only.
assert.doesNotMatch(page, /href="\/property\/"/);

// Link previews: /agent/<slug> is served with server-built Open Graph tags
// (texting apps and social sites never run page scripts).
const previewApi = read('api/agent-portal-page.js');
assert.match(read('middleware.js'), /new URL\('\/api\/agent-portal-page',request\.url\)/);
assert.match(previewApi, /rpc\/get_public_agent_portal_profile/);
assert.match(previewApi, /p\.licensed_name \|\| p\.display_name/, 'previews use the official NJREC name first');
assert.match(previewApi, /property="og:title"/);
assert.match(previewApi, /const esc = /, 'profile text is escaped before it goes into HTML');
assert.match(previewApi, /Any failure serves the static page unchanged/);

console.log('Agent portal contract passed.');
