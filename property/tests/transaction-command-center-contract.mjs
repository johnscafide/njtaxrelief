import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=(p)=>fs.readFileSync(p,'utf8');
const html=read('transaction/index.html');
const js=read('transaction/transaction.js');
const shell=read('transaction/shell.js');
const css=read('transaction/transaction.css');
const schema=read('supabase/migrations/20260915161000_transaction_command_center.sql');
const indexes=read('supabase/migrations/20260915163500_transaction_command_center_fk_indexes.sql');

for(const id of ['tx-gate','tx-app','tx-list','tx-detail','tx-checklist','tx-disclosures','tx-stage-track','tx-activity','tx-modal-layer']){
  assert.match(html,new RegExp(`id=["']${id}["']`),`missing required transaction UI id ${id}`);
}
assert.match(html,/data-plan-auto=["']true["']/,'page must participate in Watchdog plan context');
assert.match(html,/\/property\/js\/app-shell-2027\.js/,'page must use shared Watchdog app shell');
assert.match(html,/\/transaction\/transaction\.js/,'page must load transaction runtime');

for(const table of ['transaction_workspaces','transaction_items','transaction_disclosures','transaction_activity']){
  assert.match(js,new RegExp(table),`runtime must use ${table}`);
  assert.match(schema,new RegExp(`public\\.${table}`),`schema must define ${table}`);
  assert.match(schema,new RegExp(`alter table public\\.${table} enable row level security`),`${table} must enable RLS`);
}
assert.match(schema,/has_watchdog_plan\('pro_plus'\)/,'database policies must enforce Pro+');
assert.match(schema,/revoke all on public\.transaction_workspaces from anon, authenticated/,'schema must reset legacy grants before explicit browser grants');
assert.match(schema,/grant select, insert on public\.transaction_activity to authenticated/,'activity log must be browser append/read only');
assert.match(indexes,/transaction_items\(transaction_id,user_id\)/,'items composite workspace FK needs a covering index');
assert.match(indexes,/transaction_disclosures\(transaction_id,user_id\)/,'disclosures composite workspace FK needs a covering index');
assert.match(indexes,/transaction_activity\(transaction_id,user_id\)/,'activity composite workspace FK needs a covering index');

for(const token of ['provider_missing','clear_observed','issue_observed','intelligence-closing-run-preview','NJ Office of GIS','PAMS_PIN']){
  assert.match(js,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),`runtime missing governed/source-aware token ${token}`);
}
assert.match(js,/slice\(0,50\)/,'bulk intake must remain bounded');
assert.match(js,/Private client input only|Private-life answers are never inferred|Watchdog does not infer/,'private disclosure workflow must preserve non-inference language');
assert.doesNotMatch(js,/title is clear|clear title|title cleared/i,'runtime must not claim legal title clearance');
assert.match(css,/@media\(max-width:600px\)/,'mobile layout contract missing');
assert.match(shell,/Transaction Command Center/,'shared-shell adapter missing transaction title');

console.log('Transaction Command Center contract passed.');
