import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read=p=>fs.readFileSync(p,'utf8');
const files={
  shared:read('agent/shared/workflows.js'),
  listing:read('agent/listing-prep/listing-prep.js'),
  listingPage:read('agent/listing-prep/index.html'),
  buyers:read('agent/buyers/buyers.js'),
  buyersPage:read('agent/buyers/index.html'),
  open:read('agent/open-house/open-house.js'),
  openPage:read('agent/open-house/index.html'),
  openPublic:read('open-house/index.html'),
  openApi:read('api/open-house.js'),
  propertyApi:read('api/agent-property-search.js'),
  clientApi:read('api/transaction-client-room.js'),
  clientPage:read('client-room/index.html'),
  clientOwner:read('transaction/client-room.js'),
  txPage:read('transaction/index.html'),
  txV2:read('transaction/command-center-polish.js'),
  today:read('property/js/agent-today.js'),
  desk:read('property/agent-desk/index.html'),
  middleware:read('middleware.js'),
  migration:read('supabase/migrations/20260919181500_agent_workspace_client_rooms.sql'),
  foundations:read('supabase/migrations/20260919180500_agent_workflow_foundations.sql'),
  robots:read('api/watchdog-index-robots.js')
};

for(const [name,source] of Object.entries({
  shared:files.shared,listing:files.listing,buyers:files.buyers,open:files.open,
  clientOwner:files.clientOwner,today:files.today,txV2:files.txV2
})) new vm.Script(source,{filename:name+'.js'});

for(const page of [files.listingPage,files.buyersPage,files.openPage]){
  assert.match(page,/data-access-require="agent"/,'private Agent workflow must require Agent access');
  assert.match(page,//property/js/access-guard.js/,'private Agent workflow must load the canonical access guard');
}
assert.match(files.shared,//api/agent-property-search/,'Agent property search must use a server-authorized API boundary');
assert.doesNotMatch(files.shared,/from\(['"]property_lookups['"]\)/,'browser workflow must not query statewide property_lookups directly');
assert.match(files.propertyApi,/has_watchdog_plan/,'property search API must verify Agent entitlement');
assert.match(files.propertyApi,/property_lookups/,'server boundary must query the governed property cache');
assert.doesNotMatch(files.propertyApi,/owner_name|mailing_address/i,'property search must not expose owner/contact enrichment');

assert.match(files.listing,/agent_listing_packs/,'Listing Prep must persist owner-scoped prep packs');
assert.match(files.listing,/transaction_workspaces/,'Listing Prep must hand off to Transactions');
assert.match(files.listing,/side:'seller'/,'Listing Prep transaction handoff must preserve seller-side context');
assert.match(files.buyers,/agent_buyer_shortlists/,'Buyer workflow must persist shortlists');
assert.match(files.buyers,/agent_buyer_shortlist_properties/,'Buyer workflow must persist selected properties');
assert.match(files.buyers,/transaction_workspaces/,'Buyer workflow must hand selected property into Transactions');
assert.match(files.buyers,/side:'buyer'/,'Buyer handoff must preserve buyer-side context');
assert.match(files.txV2,/URLSearchParams\(location\.search\)\.get\(['"]tx['"]\)/,'Transaction workspace must honor workflow deep-link transaction id');

assert.match(files.openApi,/capture_agent_open_house_lead_v1/,'open-house API must use the governed capture RPC');
assert.match(files.openApi,/contact_consent/,'open-house capture must require explicit contact consent');
assert.match(files.openApi,/has_watchdog_plan|account_entitlements/,'public open-house access must depend on current Agent entitlement');
assert.match(files.open,/open_house_id/,'Agent event view must load only event-linked leads');
assert.match(files.open,/Possible duplicate/,'Agent event view must flag possible duplicate lead identities');
assert.match(files.open,/Watchdog Open House/,'Open House CSV export must preserve source tagging');
assert.match(files.openPublic,/noindex,nofollow,noarchive/,'public open-house check-in must be non-indexable');

assert.match(files.migration,/transaction_client_rooms/,'client-room schema must be source controlled');
assert.match(files.migration,/digest\(v_token,'sha256'\)/,'client-room server state must store a token hash, not plaintext token');
assert.match(files.migration,/client_visible boolean not null default false/,'client sharing must remain opt-in');
assert.match(files.clientApi,/client_visible=eq\.true/,'public Client Room API may return only explicitly shared records');
assert.doesNotMatch(files.clientApi,/disclosure|payload|source_url|source_label/i,'public Client Room API must not select private disclosures or internal evidence payloads');
assert.match(files.clientApi,/account_entitlements/,'public Client Room must stop when Agent entitlement is inactive');
assert.match(files.clientOwner,/rotate_transaction_client_room_v1/,'owner Client Room controls must rotate secure links through governed RPC');
assert.match(files.clientOwner,/client_visible/,'owner UI must explicitly toggle sharing flags');
assert.match(files.txPage,//transaction/client-room\.js/,'Transaction page must load Client Room controls');
assert.match(files.txV2,/data-client-room="open"/,'Transaction header must expose Client Room action');
assert.match(files.clientPage,/noindex,nofollow,noarchive/,'public Client Room must be non-indexable');

assert.match(files.today,/transaction_workspaces/,'Today hub must include closing work');
assert.match(files.today,/agent_listing_packs/,'Today hub must include Listing Prep');
assert.match(files.today,/agent_buyer_shortlists/,'Today hub must include buyer shortlists');
assert.match(files.today,/agent_open_houses/,'Today hub must include open houses');
assert.match(files.desk,/id="ad-today-hub"/,'Agent Desk must render the cross-workspace Today hub');
for(const route of ['/agent/listing-prep','/agent/buyers','/agent/open-house','/open-house','/client-room']){
  assert.ok(files.middleware.includes("'"+route+"'"),'middleware missing static workflow route '+route);
  assert.ok(files.robots.includes("'"+route+"'"),'robots boundary missing private workflow route '+route);
}
assert.match(files.foundations,/agent_listing_packs/);
assert.match(files.foundations,/agent_buyer_shortlists/);
assert.match(files.foundations,/agent_open_houses/);
assert.match(files.foundations,/enable row level security/);

console.log('NJW-394 Agent workflow suite contract passed.');
