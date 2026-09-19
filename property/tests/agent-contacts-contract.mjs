import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('agent/contacts/index.html', 'utf8');
const cleanRouteHtml = fs.readFileSync('property/agent/contacts/index.html', 'utf8');
const css = fs.readFileSync('agent/contacts/contacts.css', 'utf8');
const polishCss = fs.readFileSync('agent/contacts/contacts-polish.css', 'utf8');
const workspaceCss = fs.readFileSync('agent/contacts/workspace-v2.css', 'utf8');
const sharedWorkspaceCss = fs.readFileSync('agent/shared/agent-workspace.css', 'utf8');
const sharedWorkspaceJs = fs.readFileSync('agent/shared/agent-workspace.js', 'utf8');
const js = fs.readFileSync('agent/contacts/contacts.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260915174600_njw_346_agent_contacts_private_csv_v1.sql', 'utf8');

new vm.Script(js, { filename: 'agent/contacts/contacts.js' });
new vm.Script(sharedWorkspaceJs, { filename: 'agent/shared/agent-workspace.js' });

assert.match(html, /data-access-require="agent"/, 'Agent Contacts must require Agent-or-higher access');
assert.match(html, /id="acx-file-input"[^>]+accept="[^"]*\.csv/, 'CSV file input is required');
assert.match(html, /BoldTrail-ready CSV/, 'BoldTrail export path must be visible');
assert.match(html, /read-only today/, 'UI must not falsely claim direct BoldTrail writes');
assert.match(html, /id="acx-history"/, 'Persistent file history UI is required');
assert.match(html, /contacts\.css/, 'Contacts stylesheet must load');
assert.match(html, /\/agent\/shared\/agent-workspace\.css/, 'Contacts must load the canonical Agent Workspace stylesheet');
assert.match(html, /\/agent\/contacts\/workspace-v2\.css[^>]+data-agent-workspace-final/, 'Contacts must load the final Agent page presentation layer');
assert.match(html, /\/agent\/shared\/agent-workspace\.js/, 'Contacts must load the canonical Agent Workspace runtime');
assert.match(html, /data-agent-workspace="contacts"/, 'Contacts must identify itself as an Agent Workspace page');
assert.match(html, /class="awx-utility"/, 'Contacts must use the shared Agent utility breadcrumb');
assert.match(html, /class="awx-header"/, 'Contacts must use the shared Agent page header');
assert.match(html, /class="awx-tabs"/, 'Contacts must use the shared Agent product tabs');
assert.match(html, /href="\/transaction\/"[^>]*>[^<]*<i|href="\/transaction\/"[^>]*>/, 'Transactions must remain a live Agent destination');
assert.match(html, /data-agent-soon="Coming soon for Agents"/, 'Future Agent destinations must remain visibly staged');
assert.doesNotMatch(html, /class="acx-worknav"/, 'The retired one-off Contacts subnav must not return');
assert.doesNotMatch(html, /class="acx-hero"/, 'Agent Contacts must not use a marketing-style hero');
assert.match(html, /contacts\.js/, 'Contacts runtime must load');

assert.match(cleanRouteHtml, /data-access-require="agent"/, 'Clean-route source must preserve Agent access');
assert.match(cleanRouteHtml, /<meta name="color-scheme" content="light">/, 'Clean route must explicitly request light browser chrome');
assert.match(cleanRouteHtml, /<meta name="theme-color" content="#ffffff">/, 'Clean route must use the neutral Agent Workspace theme color');
assert.match(cleanRouteHtml, /href="\/agent\/contacts\/contacts\.css"/, 'Clean route must reuse the canonical Contacts stylesheet');
assert.match(cleanRouteHtml, /href="\/agent\/shared\/agent-workspace\.css"/, 'Clean route must reuse the shared Agent Workspace stylesheet');
assert.match(cleanRouteHtml, /href="\/agent\/contacts\/workspace-v2\.css"[^>]+data-agent-workspace-final/, 'Clean route must keep Contacts polish last');
assert.match(cleanRouteHtml, /src="\/agent\/shared\/agent-workspace\.js"/, 'Clean route must reuse the shared Agent Workspace runtime');
assert.match(cleanRouteHtml, /src="\/agent\/contacts\/contacts\.js"/, 'Clean route must reuse the canonical Contacts runtime');
assert.match(cleanRouteHtml, /href="\/agent\/contacts"[^>]+aria-current="page"/, 'Clean route navigation must point to /agent/contacts');
assert.match(cleanRouteHtml, /id="acx-file-input"[^>]+accept="[^"]*\.csv/, 'Clean route must expose the same CSV workflow');

assert.match(js, /MAX_BYTES=25\*1024\*1024/, '25 MB upload limit must remain explicit');
assert.match(js, /MAX_ROWS=50000/, '50,000-row client safety limit must remain explicit');
assert.match(js, /storage\.from\(BUCKET\)\.upload/, 'Originals and exports must use private Storage');
assert.match(js, /from\('agent_contact_files'\)/, 'File metadata/history must use agent_contact_files');
assert.match(js, /user\/\+'\/'\+user\.id|user\/'\+user\.id/, 'Storage path must be scoped to the authenticated user');
assert.match(js, /window\.URL\.createObjectURL/, 'Browser object URLs must use the native URL API');
assert.doesNotMatch(js, /service_role|serviceRole/i, 'Browser code must never include a service-role credential');
assert.match(js, /Cell Phone 1/, 'BoldTrail-ready export must include a mobile mapping field');
assert.match(js, /Primary Address - Street/, 'BoldTrail-ready export must carry address mapping fields');

assert.match(js, /fullNameSynonyms/, 'Generic Name / Full Name headers must be detected independently from First Name');
assert.match(js, /function splitNameText\(/, 'Agent Contacts must contain the CRM name splitter');
assert.match(js, /parts\.shift\(\),parts\.join\(' '\)/, 'Name splitter must keep everything after the first token together as Last Name');
assert.match(js, /@full:/, 'Full-name source columns must support a derived split mapping');
assert.match(js, /Split into First \+ Last/, 'Import flow must offer split names');
assert.match(js, /Keep the full name together/, 'Import flow must offer keeping names together');
assert.match(js, /RECOMMENDED/, 'Split mode must be visually marked as recommended');
assert.match(js, /contacts-polish\.css/, 'Runtime must load the Agent Contacts readability and visual polish stylesheet');
assert.match(js, /Turn one name column into CRM-ready fields/, 'Mapping view must include a graphical name-cleanup explanation');

assert.match(migration, /alter table public\.agent_contact_files enable row level security/i, 'RLS must be enabled');
assert.match(migration, /revoke all on public\.agent_contact_files from anon/i, 'Anonymous table access must be revoked');
assert.match(migration, /user_id = \(select auth\.uid\(\)\)/i, 'Metadata RLS must be user scoped');
assert.match(migration, /'agent-contact-files'[\s\S]*false/i, 'Storage bucket must be private');
assert.match(migration, /\(storage\.foldername\(name\)\)\[2\]\s*=\s*\(\(select auth\.uid\(\)\)\)::text/i, 'Storage object policies must enforce user folders');

assert.match(css, /color-scheme:light/, 'Agent Contacts must be light-only');
assert.match(css, /--acx-bg:#f4f7fb/, 'Agent Contacts must use the Watchdog light workspace background');
assert.match(css, /--acx-panel:#ffffff/, 'Agent Contacts cards must use a light surface');
assert.doesNotMatch(css, /--acx-bg:#0a0e17/, 'The old dark workspace theme must not return');
assert.match(css, /@media\(max-width:620px\)/, 'Mobile breakpoint must be present');
assert.match(css, /prefers-reduced-motion/, 'Reduced motion support must be present');
assert.match(css, /min-height:44px/, 'Primary touch targets should meet the 44px target');

assert.match(polishCss, /\.acx-map-item b\{font-size:14px\}/, 'Field labels must be materially larger than the original compact UI');
assert.match(polishCss, /\.acx-map-item select,[\s\S]*font-size:14px/, 'Mapping controls must use readable desktop text');
assert.match(polishCss, /\.acx-name-intelligence\{/, 'Mapping screen must have a branded graphical name flow');
assert.match(polishCss, /\.acx-name-modal\{/, 'Name handling choice must have a dedicated polished dialog');
assert.match(polishCss, /@media\(max-width:620px\)/, 'Readability polish must remain responsive on mobile');

assert.match(sharedWorkspaceCss, /--awx-button:#29353d/, 'Agent Workspace must use the restrained dark action hierarchy');
assert.match(sharedWorkspaceCss, /\.awx-utility\{/, 'Shared Agent Workspace utility bar missing');
assert.match(sharedWorkspaceCss, /\.awx-header\{/, 'Shared Agent Workspace header missing');
assert.match(sharedWorkspaceCss, /\.awx-tabs\{/, 'Shared Agent Workspace tabs missing');
assert.match(sharedWorkspaceCss, /@media\(max-width:760px\)/, 'Shared Agent Workspace mobile contract missing');
assert.doesNotMatch(sharedWorkspaceCss, /gradient|glass|glow|backdrop-filter/i, 'Shared Agent Workspace must stay flat and restrained');
assert.match(sharedWorkspaceJs, /data-agent-workspace-final/, 'Agent Workspace runtime must keep page-specific final polish above dynamically injected feature CSS');

assert.match(workspaceCss, /grid-template-columns:260px minmax\(0,1fr\)/, 'Contacts must use a restrained file rail on desktop');
assert.match(workspaceCss, /\.acx-crm-install\{[\s\S]{0,180}background:#f7f8f9/, 'CRM Companion must be visually integrated into the Agent Workspace');
assert.match(workspaceCss, /#aci-shell\.aci-simple-ready[\s\S]{0,220}background:#fff!important/, 'Watchdog Analyze must use the flat Agent Workspace presentation');
assert.match(workspaceCss, /@media\(max-width:620px\)/, 'Contacts v2 must include mobile behavior');
assert.doesNotMatch(workspaceCss, /gradient|glass|glow/i, 'Contacts v2 presentation must not introduce AI-style decorative effects');

console.log('Agent Contacts contract checks passed.');
