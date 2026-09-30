import { existsSync, readFileSync } from 'node:fs';

// Watchdog Backoffice rebuild: one auth flow, board design, consent-safe CRM
// handoffs and the lead pipeline (stages, follow-ups, notes, contact log).
const url = (path) => new URL(`../../${path}`, import.meta.url);
const read = (path) => readFileSync(url(path), 'utf8');
const exists = (path) => existsSync(url(path));
const must = (condition, message) => { if (!condition) throw new Error(message); };

const page = read('property/backoffice/index.html');
const js = read('property/backoffice/backoffice.js');
const shell = read('property/backoffice/backoffice-shell.js');
const leadiq = read('property/backoffice/leadiq-tools.js');
const api = read('supabase/functions/backoffice-api/index.ts');
const gateway = read('api/watchdog-backoffice-gateway.js');
const subpages = ['property/backoffice/reviews/index.html', 'property/backoffice/professional-verifications/index.html', 'property/backoffice/town-info/index.html', 'property/backoffice/realestate/index.html'];
const backofficeHtml = [page, ...subpages.map(read)];
const townInfo = read('property/backoffice/town-info/town-info.js');
const backofficeJs = [js, shell, leadiq, townInfo];

// ---------- one auth flow ----------
for (const retired of ['property/backoffice/backoffice-dev-auth.js', 'property/backoffice/backoffice-recovery.js', 'property/backoffice/backoffice-secure.css']) {
  must(!exists(retired), `${retired} is retired and must stay deleted.`);
}
for (const source of backofficeJs) {
  must(!/supabase\.co/i.test(source), 'Backoffice JS must talk to the same-origin gateway, never a supabase.co URL.');
  must(!/window\.fetch\s*=|__watchdogBackofficeCanonicalFetch/.test(source), 'Backoffice JS must not install a fetch shim.');
  must(!/location\.reload\s*\(/.test(source), 'Backoffice must never reload the page (no reload loop after login or lock).');
  must(!/createElement\(\s*['"]style['"]\s*\)|\.innerHTML\s*=|insertAdjacentHTML/.test(source), 'Backoffice JS fills data only: no injected <style> and no HTML strings.');
}
must(js.includes("LOGIN_API='/api/watchdog-backoffice-gateway?target=login'") && js.includes("API='/api/watchdog-backoffice-gateway?target=api'"), 'Backoffice must use the same-origin gateway for login and API calls.');
must(/'Authorization':'Bearer '\+accessToken/.test(js) && /NJPTRAccess\.client\(\)\.auth\.getSession\(\)/.test(js), 'Opening a session must send the Watchdog access token from the shared client.');
must(/res\.status===401\)\{showGate\('signed-out'\)/.test(js) && /res\.status===403\)\{showGate\('denied'\)/.test(js), 'Login must distinguish signed out (401) from not on the access list (403).');
must(page.includes('href="/dashboard?access=signin&amp;return=%2Fbackoffice"') && page.includes('Sign in to Watchdog'), 'Signed-out card must link to Watchdog sign-in and return to /backoffice.');
must(page.includes('Sign in with a different account') && page.includes('isn’t on the Backoffice access list'), 'Not-on-list card must explain and offer a different account.');
must(/async function lock\(\)[\s\S]*?action:'logout'/.test(js) && page.includes('id="bo-open"') && page.includes('Backoffice is locked'), 'Lock must revoke the session (logout) and leave a working Open Backoffice card.');
must(/WatchdogBackofficeShell\.onLock=lock/.test(js), 'The shared Lock button must use the Lead Intelligence lock handler on this page.');
for (const html of backofficeHtml) {
  must(!/shared (?:backoffice )?key|FIRST-TIME SETUP|temporarily disabled|Password protected|Developer gated/i.test(html), 'Retired shared-key / gated copy must not appear in Backoffice HTML.');
  must(!/<a\b[^>]*href="[^"]*\/property\//i.test(html), 'Backoffice links must use clean Watchdog URLs, never /property/.');
  must(!/\sonclick=|\sstyle="/i.test(html), 'Backoffice HTML must not use inline handlers or inline styles.');
  must(html.includes('backoffice-board.css') && html.includes('backoffice-shell.js') && html.includes('class="bo-shell"'), 'Every Backoffice page must use the shared shell.');
  must(/<a href="\/backoffice\/reviews"[^>]*data-bo-dev-only hidden>/.test(html) && /<a href="\/backoffice\/realestate"[^>]*data-bo-dev-only hidden>/.test(html), 'Developer-only nav starts hidden on every page.');
}
for (const source of [page, js, shell, leadiq, api]) {
  must(!/shared key|FIRST-TIME SETUP|temporarily disabled/i.test(source.replace(/backoffice_shared_access_key/g, '')), 'Retired shared-key copy must be gone.');
  must(!/\bWife\b/.test(source), 'Operator names come from the export profiles; "Wife" must not be user-facing.');
}
must(!/data-access-require/.test(page.split('</head>')[0].split('<html')[1] || ''), 'Lead Intelligence is gated by the Backoffice session, not data-access-require.');
must(!/normalizedPath === '\/backoffice'/.test(read('property/js/access-guard.js')), 'access-guard must not special-case /backoffice.');
must(/data-access-require="developer"/.test(read('property/backoffice/reviews/index.html')) && /data-access-require="developer"/.test(read('property/backoffice/professional-verifications/index.html')) && /data-access-require="developer"/.test(read('property/backoffice/town-info/index.html')), 'Developer tool pages keep their developer gate.');
must(/client\.rpc\('is_watchdog_developer'\)/.test(shell) && /if\(!developer\)return;\s*refreshBadges\(\);/.test(shell), 'Developer nav and review counts only appear after the server-side developer check.');
must(!/set_google_key|rotate_access_key|name="google_key"|name="new_key"/.test(page + js), 'The dead Google-key and shared-key forms must be gone.');
must(page.includes('data-s="google"') && page.includes('data-s="expires"') && page.includes('data-s="who"') && page.includes('id="bo-settings-boldtrail"'), 'Settings must be read-only status: Google, BoldTrail per operator, who is signed in, session expiry.');
must(/\/\^\\\/\(\?:property\\\/\)\?backoffice\(\?:\\\/\|\$\)\/i\.test/.test(read('property/js/contact-routing-policy.js')), 'Contact policy must leave Backoffice tel:/sms:/mailto: links alone.');
must(/if \(isBackofficePath\(publicPath\)\) return html;/.test(read('api/watchdog-index-page-contact-safe.js')), 'Server contact sanitizer must skip Backoffice.');
must(read('btc.html').includes('https://www.watchdogindex.com/backoffice#leadiq') && !read('btc.html').includes('/property/'), 'btc.html must point to the clean Backoffice LeadIQ URL.');
must(/headers\['X-Forwarded-For'\] = ip/.test(gateway) && /headers\['User-Agent'\] = userAgent/.test(gateway), 'Gateway must forward the client IP and user agent upstream.');

// ---------- pipeline, follow-ups, notes, contact, owners ----------
must(js.includes("filters:{owner:'mine'") && page.includes('<option value="mine">My leads</option>') && page.includes('<option value="all">Everyone</option>'), '"My leads" must be the default view with an Everyone option.');
must(/bulk&&state\.actor\)bulk\.value=state\.actor/.test(js), 'Bulk owner must default to the signed-in operator.');
must(/function ownedByOthers/.test(js) && /bulkSync[\s\S]*?confirmDialog/.test(js) && /bulkExport[\s\S]*?confirmDialog/.test(js), 'Bulk send/export must confirm before moving the other operator’s leads.');
for (const stage of ['new', 'contacted', 'qualified', 'nurture', 'closed', 'archived']) must(page.includes(`data-stage="${stage}"`) && page.includes(`<option value="${stage}">`), `Stage ${stage} needs a tab and a picker option.`);
must(/'log_contact',\{lead_id:l\.id,channel\}/.test(js) && page.includes('data-channel="call"') && page.includes('data-channel="text"') && page.includes('data-channel="email"'), 'Quick contact buttons must log the contact.');
must(/'add_note',\{lead_id:l\.id,note\}/.test(js) && /'mark_reviewed',\{lead_id:l\.id\}/.test(js), 'Timeline notes and Mark reviewed must call their actions.');
must(page.includes('No marketing consent on file'), 'Consent status must be visible next to Text/Email.');
must(/function needsAttention\(l\)\{return \['review','error'\]\.includes\(l\.processing_status\)\}/.test(js), 'Needs attention must follow processing_status so Mark reviewed clears it.');
must(page.includes('value="today"') && page.includes('value="overdue"') && page.includes('value="upcoming"'), 'Follow-up filters must include Due today, Overdue and Upcoming.');
must(/state\.leads\.filter\(\(l\)=>ownerMatch\(l\)&&isOpenStage\(l\)\)/.test(js), 'Stat tiles must leave archived (and closed) leads out.');
must(/function baseMatch\(l\)\{return ownerMatch\(l\)&&searchMatch\(l\)/.test(js) && /stageMatch\(l,state\.filters\.stage\)/.test(js), 'Search must apply in every stage, including Archived.');
must(/function computeDupes/.test(js), 'Leads sharing an email or phone must be flagged as possible duplicates.');
must(js.includes("'intent-high'") && js.includes("'benefit-1k-plus'"), 'Client hashtag preview must match the bucketed server tags.');

// ---------- stylesheets: board design ----------
for (const path of ['property/backoffice/backoffice-board.css', 'property/backoffice/backoffice.css', 'property/backoffice/leadiq-tools.css', 'property/backoffice/reviews/reviews.css', 'property/backoffice/professional-verifications/professional-verifications.css', 'property/backoffice/town-info/town-info.css', 'property/backoffice/realestate/realestate.css']) {
  const css = read(path);
  must(/@media print/.test(css) && /prefers-reduced-motion:\s*reduce/.test(css), `${path} needs print and reduced-motion rules.`);
  must(!/border-left\s*:/.test(css), `${path}: the board design does not use border-left accents.`);
  must(!/content:\s*["'][^"']+["']/.test(css), `${path} must not inject text with content:.`);
  must(!/font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px|font:\s*\d{3}\s+(?:[0-9]|1[01])(?:\.\d+)?px/.test(css), `${path}: text must be at least 12px.`);
}
const board = read('property/backoffice/backoffice-board.css');
must(board.includes('--bo-bg:#f3f1ec') && board.includes('--bo-surface:#fbfaf7') && board.includes('--bo-navy:#0e2248') && board.includes('--bo-radius:24px') && board.includes('"Plus Jakarta Sans"'), 'Board tokens must match the Integration Center board.');
must(/\.bo-btn\{[^}]*min-height:44px/.test(board) && /\.bo-nav a\{[^}]*min-height:44px/.test(board) && /\.bo-search input\{[^}]*min-height:44px|:is\(input,select,textarea\),\.bo-search input\{[^}]*min-height:44px/.test(board), 'Buttons, nav pills and inputs must keep 44px targets.');
must(/:focus-visible\{outline:3px solid/.test(board), 'Focus rings must be visible.');
must(/\.bo-detail\.is-open\{[^}]*position:fixed;inset:0/.test(read('property/backoffice/backoffice.css')), 'Lead detail must open as a full-screen sheet on phones.');
must(page.includes('id="bo-bulk" role="region" aria-label="Bulk actions" hidden'), 'Bulk bar must start hidden and only show with a selection.');

// ---------- server: backoffice-api ----------
must(/const RETIRED_ACTIONS = new Set\(\["setup", "login", "rotate_access_key", "set_google_key"\]\);/.test(api) && /if \(RETIRED_ACTIONS\.has\(action\)\) return json\(req, \{ error: "retired" \}, 410\);/.test(api), 'Retired actions must return 410 {error:"retired"}.');
must(!/email_optin:\s*1|text_on:\s*1/.test(api), 'BoldTrail opt-ins must never be hard-coded on.');
must(/email_optin: consent\.email_optin,\s*phone_on: consent\.phone_on,\s*text_on: consent\.text_on/.test(api), 'BoldTrail flags must come from recorded consent.');
must(/basis\.marketing_consent \|\| basis\.email_marketing_consent \? 1 : 0/.test(api) && /text_on: basis\.sms_consent \? 1 : 0/.test(api) && /c\.marketing_consent === true/.test(api), 'Only explicit consent turns on email/text opt-ins.');
must(!/marketing_consent_inferred\s*===\s*true|marketing_consent_inferred\s*\?/.test(api), 'Inferred marketing consent is not consent.');
must(/consent_flags: consentSent/.test(api), 'BoldTrail events must record which flags were sent.');
must(/syncLeadToBoldTrail\(lead: Json, profile: string, actor: string/.test(api) && /details: \{ actor, destination: profile, contact_id/.test(api), 'BoldTrail sync events must record the signed-in operator as actor.');
must(/function csvCell\(value: unknown\) \{ let s = [^}]*if \(\/\^\[=\+\\-@\\t\\r\]\/\.test\(s\)\) s = `'\$\{s\}`;/.test(api), 'Server CSV must neutralize formula cells.');
must(/function csvCell\(value\)\{let s=[^}]*if\(\/\^\[=\+\\-@\\t\\r\]\/\.test\(s\)\)s="'"\+s;/.test(leadiq), 'LeadIQ CSV must neutralize formula cells.');
must(/if \(action === "export_csv"\)[^\n]*\.neq\("lead_status", "archived"\)/.test(api), 'CSV export must leave archived leads out.');
must(/const LEAD_STAGES = \["new", "contacted", "qualified", "nurture", "closed", "archived"\];/.test(api) && /if \(!LEAD_STAGES\.includes\(stage\)\)/.test(api) && !/"open"/.test(api), 'update must allow exactly the lead_status values the DB CHECK allows.');
must(/const BULK_SYNC_LIMIT = 50;/.test(api) && /raw\.length > BULK_SYNC_LIMIT/.test(api) && /!resend && isSynced\(lead\)/.test(api) && /skipped_count/.test(api) && /failed_count/.test(api), 'Bulk BoldTrail send must cap at 50, skip already-synced leads unless re-sent, and report counts.');
must(/code: "ALREADY_SYNCED"/.test(api), 'Single send must not silently re-send an already-synced lead.');
must(api.includes('"intent-high"') && api.includes('"benefit-1k-plus"') && !/`intent-\$\{Math\.round/.test(api) && !/`benefit-\$\{Math\.round/.test(api), 'CRM hashtags must be bucketed, not one per exact value.');
must(/if \(action === "add_note"\)[^\n]*event_type: "note\.added"[^\n]*details: \{ actor, note \}/.test(api), 'add_note must write a note.added event with the author.');
must(/if \(action === "log_contact"\)[^\n]*CONTACT_CHANNELS[^\n]*last_contacted_at[^\n]*lead_status === "new"\) patch\.lead_status = "contacted"[^\n]*event_type: "contact\.logged"/.test(api), 'log_contact must stamp last_contacted_at, move New to Contacted and log contact.logged.');
must(/if \(action === "mark_reviewed"\)[^\n]*processing_status: "ready"[^\n]*event_type: "lead\.reviewed"/.test(api) && /keptManualReview/.test(api) && /if \(!keptManualReview\) patch\.processing_status/.test(api), 'Mark reviewed must clear the flag, and address revalidation must keep a manual review.');
must(/if \(action === "session"\)[^\n]*operators[^\n]*actor_label: labelFor\(labels, actor\)/.test(api), 'session must return the operator list and the signed-in operator label.');
must(/if \(action === "list"\)[^\n]*FOLLOWUP_COLUMNS/.test(api) && /referral_source,referral_source_detail/.test(api) && /next_action,next_action_due,last_contacted_at/.test(api), 'list must include referral and follow-up columns.');
must(/if \(action === "update"\)[^\n]*next_action[^\n]*200[^\n]*next_action_due[^\n]*isIsoDate/.test(api), 'update must validate the follow-up fields.');

// ---------- migration ----------
const sql = read('supabase/migrations/20260928250000_backoffice_lead_followups.sql');
must(/add column if not exists next_action text/.test(sql) && /add column if not exists next_action_due date/.test(sql) && /add column if not exists last_contacted_at timestamptz/.test(sql), 'Follow-up columns must be added idempotently.');
must(/check \(next_action is null or char_length\(next_action\) <= 200\)/.test(sql) && /if not exists \(\s*select 1 from pg_constraint/.test(sql), 'next_action must be capped at 200 characters, idempotently.');
must(/create index if not exists backoffice_leads_owner_followup_idx\s+on public\.backoffice_leads \(crm_owner, next_action_due\)\s+where lead_status not in \('closed', 'archived'\);/.test(sql), 'Follow-up index must cover open leads by owner and due date.');
must(!/drop |delete from|update public\.backoffice_leads/i.test(sql), 'Follow-up migration must only add columns, a constraint and an index.');

console.log('Watchdog Backoffice board contract passed');
