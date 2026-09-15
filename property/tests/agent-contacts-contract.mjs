import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('agent/contacts/index.html', 'utf8');
const css = fs.readFileSync('agent/contacts/contacts.css', 'utf8');
const js = fs.readFileSync('agent/contacts/contacts.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260915174600_njw_346_agent_contacts_private_csv_v1.sql', 'utf8');

new vm.Script(js, { filename: 'agent/contacts/contacts.js' });

assert.match(html, /data-access-require="agent"/, 'Agent Contacts must require Agent-or-higher access');
assert.match(html, /id="acx-file-input"[^>]+accept="[^"]*\.csv/, 'CSV file input is required');
assert.match(html, /BoldTrail-ready CSV/, 'BoldTrail export path must be visible');
assert.match(html, /read-only today/, 'UI must not falsely claim direct BoldTrail writes');
assert.match(html, /id="acx-history"/, 'Persistent file history UI is required');
assert.match(html, /contacts\.css/, 'Contacts stylesheet must load');
assert.match(html, /contacts\.js/, 'Contacts runtime must load');

assert.match(js, /MAX_BYTES=25\*1024\*1024/, '25 MB upload limit must remain explicit');
assert.match(js, /MAX_ROWS=50000/, '50,000-row client safety limit must remain explicit');
assert.match(js, /storage\.from\(BUCKET\)\.upload/, 'Originals and exports must use private Storage');
assert.match(js, /from\('agent_contact_files'\)/, 'File metadata/history must use agent_contact_files');
assert.match(js, /user\/\+'\/'\+user\.id|user\/'\+user\.id/, 'Storage path must be scoped to the authenticated user');
assert.match(js, /window\.URL\.createObjectURL/, 'Browser object URLs must use the native URL API');
assert.doesNotMatch(js, /service_role|serviceRole/i, 'Browser code must never include a service-role credential');
assert.match(js, /Cell Phone 1/, 'BoldTrail-ready export must include a mobile mapping field');
assert.match(js, /Primary Address - Street/, 'BoldTrail-ready export must carry address mapping fields');

assert.match(migration, /alter table public\.agent_contact_files enable row level security/i, 'RLS must be enabled');
assert.match(migration, /revoke all on public\.agent_contact_files from anon/i, 'Anonymous table access must be revoked');
assert.match(migration, /user_id = \(select auth\.uid\(\)\)/i, 'Metadata RLS must be user scoped');
assert.match(migration, /'agent-contact-files'[\s\S]*false/i, 'Storage bucket must be private');
assert.match(migration, /\(storage\.foldername\(name\)\)\[2\]\s*=\s*\(\(select auth\.uid\(\)\)\)::text/i, 'Storage object policies must enforce user folders');

assert.match(css, /@media\(max-width:620px\)/, 'Mobile breakpoint must be present');
assert.match(css, /prefers-reduced-motion/, 'Reduced motion support must be present');
assert.match(css, /min-height:44px/, 'Primary touch targets should meet the 44px target');

console.log('Agent Contacts contract checks passed.');
