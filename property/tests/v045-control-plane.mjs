import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const migration = read('supabase/migrations/20260809233000_watchdog_v045_control_plane.sql');
const edge = read('supabase/functions/municipal-data/index.ts');
const agentHtml = read('property/agent-desk.html');
const agentJs = read('property/js/agent-control.js');
const agentDeskJs = read('property/js/agent-desk.js');
const nav = read('property/sidemenu.html');
const navJs = read('property/js/sidemenu.js');
const updates = read('property/js/updates.js');
const versions = JSON.parse(read('property/data/versions.json'));

for (const table of ['agent_territories', 'agent_funnel_events', 'municipal_data_requests']) {
  if (!migration.includes(`create table if not exists public.${table}`)) throw new Error(`Missing v0.45 table: ${table}`);
  if (!migration.includes(`alter table public.${table} enable row level security`)) throw new Error(`Missing RLS for ${table}`);
}
for (const internal of ['municipal_data_requests', 'consume_municipal_quota', 'record_municipal_delivery']) {
  if (!migration.includes(internal)) throw new Error(`Missing protected delivery contract: ${internal}`);
}
if (!migration.includes('revoke execute on function public.record_lookup(jsonb) from public, anon')) throw new Error('Anonymous record_lookup execution was not revoked');
if (!migration.includes('add column if not exists zip text')) throw new Error('Agent territory ZIP coverage column is missing');
if (!edge.includes("userClient.auth.getUser()")) throw new Error('Municipal delivery does not validate the bearer session');
if (!edge.includes("client.functions") && !agentJs.includes("client.functions.invoke('municipal-data'")) throw new Error('Agent Control does not use protected municipal delivery');
if (/Access-Control-Allow-Origin['"]\s*:\s*['"]\*/.test(edge)) throw new Error('Municipal delivery uses wildcard CORS');
if (!edge.includes("standard: { requests: 20, rows: 25 }") || !edge.includes("pro_plus: { requests: 300, rows: 1000 }")) throw new Error('Plan-aware delivery limits are missing');
if (!edge.includes("'Retry-After'")) throw new Error('Municipal delivery does not tell rate-limited clients when to retry');
if (!edge.includes('assessed_value') || !edge.includes("order('last_seen'")) throw new Error('Municipal delivery does not match the live property lookup schema');
if (edge.includes('watchdog_value') || edge.includes('last_seen_at')) throw new Error('Municipal delivery still references retired property lookup fields');
if (/owner|name|phone|email/i.test(edge.match(/select\([\s\S]*?\);/)?.[0] || '')) throw new Error('Municipal response allowlist appears to expose identity fields');

for (const id of ['ad-territory-list', 'ad-territory-form', 'ad-funnel', 'ad-funnel-window']) {
  if (!agentHtml.includes(`id="${id}"`)) throw new Error(`Missing Agent Control UI: ${id}`);
}
for (const event of ['evidence_opened', 'property_opened', 'conversation_started', 'valuation_request', 'appointment', 'listing']) {
  if (!agentJs.includes(event)) throw new Error(`Missing Agent Control funnel event: ${event}`);
}
if (!agentDeskJs.includes("zip:x.zip||x.postal_code||null")) throw new Error('Agent sphere import does not retain ZIP territory coverage');
for (const contract of ['db-nav-search', 'Research', 'Professional work', 'Platform', 'db-side-plan']) {
  if (!nav.includes(contract)) throw new Error(`Missing navigation contract: ${contract}`);
}
if (!navJs.includes('function activateSearch')) throw new Error('Sidebar tool search is missing');
if (updates.includes('Object.entries(r.impact')) throw new Error('Version charts still sum arbitrary raw impact metrics');
for (const area of ['Customer experience', 'Professional workflows', 'Security & reliability', 'Revenue & billing']) {
  if (!updates.includes(area)) throw new Error(`Missing stable release product area: ${area}`);
}
if (versions.releases[0].version !== '0.45.0') throw new Error('v0.45.0 is not the current release');
if (versions.active_roadmap.length > 6) throw new Error('Completed roadmap work was not retired');

new vm.Script(agentJs, { filename: 'agent-control.js' });
new vm.Script(agentDeskJs, { filename: 'agent-desk.js' });
new vm.Script(navJs, { filename: 'sidemenu.js' });
new vm.Script(updates, { filename: 'updates.js' });
console.log('Watchdog v0.45 control-plane contracts passed.');
