import assert from 'node:assert/strict';
import fs from 'node:fs';

// Agent farm list (/market-list): board design, Watchdog Intelligence, CRM
// matching, labels and exports, plus the privacy boundary on owner data.
const html = fs.readFileSync('property/market-list/index.html', 'utf8');
const js = fs.readFileSync('property/js/market-list.js', 'utf8');
const css = fs.readFileSync('property/css/market-list.css', 'utf8');
const fn = fs.readFileSync('supabase/functions/farm-workspace/index.ts', 'utf8');
const inventory = JSON.parse(fs.readFileSync('supabase/functions/PRODUCTION-INVENTORY.json', 'utf8'));

assert.match(html, /data-access-require="agent"/, 'farm list stays behind the Agent gate');
assert.match(html, /id="ml-print-root"/, 'label print root is a direct page child');
assert.ok(html.indexOf('market-list.css') > html.indexOf('agent-workspace.css'), 'farm styles load after the shared workspace sheet');

// Watchdog Intelligence: canonical name, spectrum word, rotating outer surface with reduced motion.
assert.match(js, /Watchdog <span class="wd-intelligence-brand-word">Intelligence<\/span>/);
assert.match(js, /WatchdogContextualAnalyst\.open\(/);
assert.doesNotMatch(js, /Watchdog Intel\b|Analyst Intel/);
assert.match(css, /\.ml-card\.ml-intel\{[^}]*conic-gradient/);
assert.match(css, /prefers-reduced-motion:reduce\)\{\.ml-card\.ml-intel\{animation:none\}/);

// CRM sync and other databases.
assert.match(js, /functions\.invoke\('farm-workspace'/);
assert.match(js, /route\('\/integrations'\)/);
assert.match(js, /function importCsv\(/);
assert.match(js, /Emails and phone numbers in the file are ignored/);
assert.doesNotMatch(js, /pickCol\(heads,\[\/\^\(e-?mail|pickCol\(heads,\[\/\^\(phone/, 'the CSV matcher never reads email or phone columns');

// Labels and downloads.
assert.match(js, /function printLabels\(/);
assert.match(css, /\.ml-sheet\.f5160\{[^}]*grid-template-columns:repeat\(3,2\.625in\)[^}]*grid-auto-rows:1in/);
assert.match(css, /\.ml-sheet\.f5163\{[^}]*grid-template-columns:repeat\(2,4in\)[^}]*grid-auto-rows:2in/);
assert.match(js, /function exportCrm\(/);
assert.match(js, /function exportMerge\(/);
assert.match(js, /if\(\/\^\[=\+\\-@\]\/\.test\(s\)\)s="'"\+s/, 'CSV cells are protected against spreadsheet formula injection');

// Clean public routes only.
assert.doesNotMatch(js, /['"`]\/property\/(?!js\/|css\/)/, 'no hard-coded /property/ page links in the farm list (assets are fine)');

// Server function: plan gate, explicit origins, no contact data returned.
assert.match(fn, /agent_plan_limits/);
assert.match(fn, /consume_municipal_quota/);
assert.doesNotMatch(fn, /Access-Control-Allow-Origin":\s*"\*"/);
assert.doesNotMatch(fn, /\[a-z0-9-\]\+\\\.vercel\\\.app/, 'preview origins stay limited to this project');
assert.doesNotMatch(fn, /contact_email|contact_phone/, 'CRM email and phone are never selected');
const returned = fn.match(/byPin\[pin\] = \{([^}]*)\}/)?.[1] || '';
assert.deepEqual(returned.split(',').map((x) => x.split(':')[0].trim()), ['owner_name', 'last_deed_year', 'owner_mails_elsewhere', 'postal_city'], 'only these parcel fields go back to the browser; the mailing address never does');
assert.match(fn, /mailsElsewhere === false \? clean\(a\.CITY_STATE/, 'postal city is only used when the tax bill goes to the property itself');
assert.match(fn, /status === "verified"/, 'only verified CRM property links are shown');
assert.equal(inventory.functions['farm-workspace']?.verify_jwt, true);

console.log('Farm list contract passed.');
