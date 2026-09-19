import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read=p=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/20260919104500_njw_388_agent_workflows.sql');
const workflowsHtml=read('property/agent/workflows/index.html');
const workflowsJs=read('agent/workflows/workflows.js');
const openHouseApi=read('api/agent-open-house.js');
const openHouseHtml=read('open-house/index.html');
const contacts=read('agent/contacts/contacts.js');
const contactsLead=read('agent/contacts/watchdog-leads.js');
const collaboration=read('transaction/collaboration.js');
const shared=read('transaction/shared/shared.js');
const edge=read('supabase/functions/transaction-collaboration/index.ts');
const transaction=read('transaction/transaction.js');
const today=read('property/js/agent-today.js');
const desk=read('property/agent-desk/index.html');
const universal=read('property/js/watchdog-universal-menu.js');
const side=read('property/partials/sidemenu.html');
const vercel=read('vercel.json');
const middleware=read('middleware.js');

for(const [name,source] of [
  ['workflows',workflowsJs],['open-house-api',openHouseApi],['contacts',contacts],
  ['contacts-lead',contactsLead],['collaboration',collaboration],['shared',shared],
  ['transaction',transaction],['today',today],['universal',universal]
]){
  new vm.Script(source,{filename:name+'.js'});
}

for(const table of ['agent_listing_packs','agent_buyer_shortlists','agent_buyer_shortlist_properties','agent_open_houses']){
  assert.match(migration,new RegExp('create table if not exists public\\.'+table),'missing '+table);
  assert.match(migration,new RegExp('alter table public\\.'+table+' enable row level security'),'RLS missing on '+table);
}
assert.match(migration,/client_visible boolean not null default false/g,'Client Room visibility must default private');
assert.match(migration,/buyer['"]?,['"]seller|buyer','seller/,'buyer and seller transaction roles required');
assert.match(migration,/capture_agent_open_house_lead/,'governed open-house capture RPC required');
assert.match(migration,/revoke all on function public\.capture_agent_open_house_lead[\s\S]*from public, anon, authenticated/,'public clients must not call capture RPC directly');
assert.match(migration,/grant execute on function public\.capture_agent_open_house_lead[\s\S]*to service_role/,'capture RPC must be service-mediated');
assert.match(migration,/open_house_lead_captured/,'open-house funnel attribution required');

for(const tab of ['listing','buyer','open-house','clients']) assert.ok(workflowsHtml.includes('data-view="'+tab+'"'),'missing '+tab+' Agent workflow');
assert.match(workflowsHtml,/data-access-require="agent"/,'Agent Workflows must be plan gated');
assert.match(workflowsJs,/agent_listing_packs/,'Listing Prep must persist');
assert.match(workflowsJs,/agent_buyer_shortlists/,'Buyer Shortlists must persist');
assert.match(workflowsJs,/agent_buyer_shortlist_properties/,'Buyer shortlist properties must persist');
assert.match(workflowsJs,/items\.length>=10/,'Buyer shortlist must be bounded to 10 properties');
assert.match(workflowsJs,/preset=broker_listing/,'Listing Prep must hand off to the existing broker listing report');
assert.match(workflowsJs,/prefill_side=buyer/,'chosen buyer property must hand off into a buyer transaction');
assert.match(workflowsJs,/prefill_side=seller/,'listing prep must hand off into a seller transaction');
assert.match(workflowsJs,/new QRCode/,'open-house QR must be generated locally');
assert.match(workflowsJs,/agent_portal_leads[\s\S]*source','open_house'/,'open-house leads must be visible in the owning Agent workspace');

assert.match(openHouseApi,/consume_public_request_budget/,'public open-house API needs rate limiting');
assert.match(openHouseApi,/contact_consent!==true/,'public capture must require explicit consent');
assert.match(openHouseApi,/capture_agent_open_house_lead/,'public API must use governed capture RPC');
assert.match(openHouseApi,/X-Robots-Tag/,'public event form must stay out of search');
assert.match(openHouseHtml,/name="contact_consent"/,'visitor form must visibly request consent');
assert.doesNotMatch(openHouseHtml,/owner name|mailing address|private/i,'public check-in must not expose owner/private-property data');

assert.match(contacts,/loadWatchdogLeads/,'Contact Cleanup needs a Watchdog lead import surface');
assert.match(contacts,/seenEmails=new Set\(\),seenPhones=new Set\(\)/,'Watchdog lead import must dedupe email and phone');
assert.match(contactsLead,/agent_portal_leads/,'Contact Cleanup must load first-party consented lead records');
assert.match(contacts,/Watchdog Open House/,'open-house source must remain attributable in CRM export');

assert.match(edge,/CLIENT_ROLE = new Set\(\["buyer","seller"\]\)/,'shared service must distinguish client roles');
assert.match(edge,/clientAllowed:rank>=RANK\.agent/,'Client Rooms must be available at Agent tier');
assert.match(edge,/professionalAllowed:rank>=RANK\.pro_plus/,'professional collaboration must retain Pro+ boundary');
assert.match(edge,/item\.client_visible===true/,'client checklist must be server filtered');
assert.match(edge,/doc\.client_visible===true/,'client documents must be server filtered');
assert.match(edge,/CLIENT_ROLE\.has\(String\(m\.role\|\|""\)\)&&doc\.client_visible!==true/,'client document signed URLs must enforce visibility server-side');

assert.match(collaboration,/Client Room visibility/,'owner needs explicit Client Room controls');
assert.match(collaboration,/transaction_items[\s\S]*client_visible/,'owner must be able to share checklist items');
assert.match(collaboration,/transaction_documents[\s\S]*client_visible/,'owner must be able to share documents');
assert.match(shared,/clientRoom[\s\S]*sg-upload['"]\)\.hidden=true/,'client room must be view-only in the guest UI');

assert.match(transaction,/prefill_address/,'Transactions must support workflow prefill');
assert.match(transaction,/prefill_pams_pin/,'parcel identity must travel with a workflow handoff');
assert.match(transaction,/client_room/,'Agent Workflows must deep-link into Client Room controls');

for(const source of ['transaction_workspaces','transaction_items','agent_portal_leads','agent_listing_packs','agent_buyer_shortlists']) assert.ok(today.includes(source),'Today queue missing '+source);
assert.match(today,/does not infer that a person intends to buy or sell/i,'Today queue must preserve non-inference language');
assert.match(desk,/agent-today\.js/,'Agent Desk must load Today queue');
assert.match(desk,/\/agent\/workflows/,'Agent Desk must link Agent Workflows');

assert.match(universal,/key:'agent-workflows'/,'canonical menu must expose Agent Workflows to agents');
assert.match(side,/\/agent\/workflows/,'shared side menu must expose Agent Workflows');
assert.match(vercel,/"source"\s*:\s*"\/agent\/workflows"[\s\S]{0,160}"destination"\s*:\s*"\/property\/agent\/workflows\/index\.html"/,'clean Agent Workflows route missing');
assert.match(vercel,/"source"\s*:\s*"\/open-house"[\s\S]{0,120}"destination"\s*:\s*"\/open-house\/index\.html"/,'clean open-house route missing');
assert.match(middleware,/['"]\/agent\/workflows['"]/,'middleware must recognize Agent Workflows');
assert.match(middleware,/['"]\/open-house['"]/,'middleware must recognize public open-house page');

console.log('NJW-388 Agent workflows suite contract passed.');
