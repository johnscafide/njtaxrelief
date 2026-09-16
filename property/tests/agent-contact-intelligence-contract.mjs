import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read=p=>fs.readFileSync(p,'utf8');
const ui=read('agent/contacts/contact-intelligence.js');
const css=read('agent/contacts/contact-intelligence.css');
const loader=read('agent/contacts/crm-companion-install.js');
const edge=read('supabase/functions/agent-contact-intelligence/index.ts');

assert.match(loader,/contact-intelligence\.js\?v=/,'Agent Contacts must load Contact Intelligence');
assert.match(ui,/Health Check/);assert.match(ui,/Segments/);assert.match(ui,/Property Match/);assert.match(ui,/Opportunities/);assert.match(ui,/Re-engage/);
assert.match(ui,/agent-contact-intelligence/,'UI must invoke the governed server boundary');
assert.match(ui,/agent-contact-files/,'Re-engagement export must remain in the private Agent file bucket');
assert.doesNotMatch(ui,/service_role|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/i,'Browser code must not contain service credentials');
assert.match(ui,/does not establish that the contact owns the property/i,'UI must disclose address-match limits');
assert.match(ui,/does not assume marketing consent/i,'UI must disclose outreach consent boundary');
assert.match(ui,/not a prediction that someone will sell, move, buy or transact/i,'Opportunity UI must not claim transaction propensity');
assert.match(edge,/watchdog_effective_plan/,'Edge function must use server-owned entitlement');
assert.match(edge,/ALLOWED_PLANS=new Set\(\["agent","pro","pro_plus","teams","developer"\]\)/,'Agent+ entitlement ladder must be explicit');
assert.match(edge,/NJ Office of GIS statewide Parcels and MOD-IV Composite/,'Property resolution must use the governed NJ parcel source');
assert.match(edge,/property_lookups/);assert.match(edge,/property_watchdog_scores/);assert.match(edge,/property_field_changes/);assert.match(edge,/property_update_events/);assert.match(edge,/property_record_snapshots/);
assert.match(edge,/It does not prove that the contact owns the property/i,'Server response must preserve ownership boundary');
assert.match(edge,/not likelihood to sell, move, buy, or transact/i,'Server response must preserve opportunity semantics');
assert.match(edge,/MAX_CONTACTS=50/,'Server batch size must be bounded');
assert.match(css,/@media\(max-width:700px\)/,'Contact Intelligence must include mobile behavior');

for(const file of ['agent/contacts/contact-intelligence.js','agent/contacts/crm-companion-install.js']){
  const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert.equal(r.status,0,`${file} must parse: ${r.stderr}`);
}
console.log('Agent Contact Intelligence contract checks passed.');
