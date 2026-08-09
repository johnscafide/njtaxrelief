import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const html = read('property/agent-desk.html');
const js = read('property/js/agent-desk.js');
const sql = read('supabase/migrations/20260809213000_agent_opportunity_desk.sql');
const digest = read('supabase/functions/agent-opportunity-digest/index.ts');

for (const id of ['ad-list','ad-stats','ad-import-modal','ad-drawer','ad-digest','ad-load-more']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing Agent Desk UI contract: ${id}`);
}
if (!html.includes('data-queue="top"')) throw new Error('Top 10 focused worklist is missing');
if (!js.includes("'/property/home.html?pin='")) throw new Error('Matched properties do not deep-link to the property workspace');
if (!js.includes("ACTIONABLE_TYPES=['assessment_change'")) throw new Error('Actionable event allowlist is missing');
if (!js.includes("propertyKey(property),e.event_type")) throw new Error('Property/reason deduplication key is missing');
if (!js.includes("type:'record_review'")) throw new Error('Property-specific baseline review fallback is missing');
if (/eventWeights[^\n]*source_refresh/.test(digest)) throw new Error('Digest still treats routine source refreshes as agent opportunities');
if (!digest.includes('agent_farm_properties') || !digest.includes('saved_properties')) throw new Error('Digest is not constrained to the agent sphere');
for (const reason of ['assessment_change','tax_change','appeal_deadline','permit_change','deed_change']) {
  if (!js.includes(`${reason}:`)) throw new Error(`Missing authoritative reason: ${reason}`);
}
for (const action of ['watch','snooze','dismiss','outcome']) {
  if (!js.includes(`data-action="${action}"`)) throw new Error(`Missing action: ${action}`);
}
for (const table of ['agent_farm_properties','agent_opportunity_actions','agent_digest_preferences']) {
  if (!sql.includes(`create table if not exists public.${table}`)) throw new Error(`Missing table: ${table}`);
  if (!sql.includes(`alter table public.${table} enable row level security`)) throw new Error(`Missing RLS: ${table}`);
}
if ((sql.match(/public\.has_watchdog_plan\('pro'\)/g) || []).length < 10) throw new Error('Pro entitlement is not consistently enforced by RLS');
new vm.Script(js, { filename: 'agent-desk.js' });
console.log('Agent Opportunity Desk contracts passed.');
