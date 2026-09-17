import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=(p)=>fs.readFileSync(p,'utf8');
const polish=read('transaction/command-center-polish.js');
const polishCss=read('transaction/command-center-polish.css');
const collab=read('transaction/collaboration.js');
const collabCss=read('transaction/collaboration.css');
const sharedHtml=read('transaction/shared/index.html');
const sharedJs=read('transaction/shared/shared.js');
const sharedCss=read('transaction/shared/shared.css');
const edge=read('supabase/functions/transaction-collaboration/index.ts');
const migration=read('supabase/migrations/20260917224000_njw_382_transaction_professional_collaboration.sql');
const config=read('supabase/config.toml');
const middleware=read('middleware.js');
const vercel=read('vercel.json');

assert.match(
  polish,
  /data-v2-action="refresh"[\s\S]{0,260}data-tx-action="add"[\s\S]{0,260}data-collab-action="open"/,
  'Refresh review, Add transaction, and Invite pro must be directly visible in the transaction header'
);
assert.match(polish,/txv2-add txv2-strong-action/,'Add transaction must use the prominent header action treatment');
assert.match(polish,/if\(invite\)invite\.hidden=!premium/,'Invite pro must stay inside the Pro+ evidence/document boundary');
assert.match(polishCss,/\.txv2-refresh,\.txv2-add[^{]*\{[^}]*background:#3e4a53[^}]*color:#fff/,'primary transaction actions must use restrained dark styling');
assert.match(polishCss,/\.txv2-add\{background:#29353d/,'Add transaction needs the stronger restrained dark treatment');
assert.match(polishCss,/flex-wrap:wrap/,'transaction header actions must wrap on narrow screens');
assert.match(collabCss,/@media\(max-width:759px\)/,'collaboration owner UI must have a mobile contract');
assert.doesNotMatch(collabCss,/gradient|backdrop-filter|glow/i,'collaboration dialog must stay flat and restrained');

for(const role of ['title','lender','tc','attorney','other']){
  assert.match(collab,new RegExp(`value=["']${role}["']`),`owner invite UI missing role ${role}`);
  assert.match(edge,new RegExp(`"${role}"`),`Edge role allow-list missing ${role}`);
}
assert.match(collab,/Only this transaction/,'owner invite UI must clearly state transaction-only scope');
assert.match(collab,/Copy link/,'owner invite UI must expose a secure copy-link handoff');
assert.match(collab,/Email invite/,'owner invite UI must expose an email handoff');
assert.match(collab,/list_collaborators/,'owner UI must list current shared access');
assert.match(collab,/revoke/,'owner UI must support revocation');

for(const table of ['transaction_professional_invites','transaction_professional_memberships']){
  assert.match(migration,new RegExp(`create table if not exists public\\.${table}`),`missing ${table}`);
  assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`),`${table} must enable RLS`);
  assert.match(migration,new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`),`${table} must remain service-only`);
}
assert.doesNotMatch(migration,/grant\s+(?:select|insert|update|delete|all)[^;]+transaction_professional_(?:invites|memberships)[^;]+authenticated/i,'guest membership tables must not gain direct browser grants');
assert.match(migration,/token_hash text not null unique/,'invitation secrets must be stored as hashes only');
assert.match(migration,/unique \(transaction_id, member_user_id\)/,'membership must be scoped to one transaction and user');
assert.match(migration,/transaction_documents_storage_shared_owner_select/,'transaction owner must be able to read collaborator uploads');
assert.match(migration,/transaction_documents_storage_shared_owner_delete/,'transaction owner must be able to remove collaborator uploads');
assert.match(migration,/uploaded_by_role/,'document provenance must identify collaborator role');
assert.match(migration,/actor_user_id/,'transaction activity must preserve collaborator actor provenance');

assert.match(edge,/crypto\.subtle\.digest\("SHA-256"/,'Edge function must hash invitation tokens');
assert.match(edge,/email\(user\.email\)!==email\(inv\.invited_email\)/,'invite acceptance must bind to the exact invited account email');
assert.match(edge,/emailHint\(inv\.invited_email\)/,'mismatched accounts must receive only a masked invite email hint');
assert.match(edge,/ownerTier/,'shared access must re-check the transaction owner entitlement');
assert.match(edge,/RANK\[plan\].*RANK\.pro_plus/s,'owner collaboration must require Pro+ or developer access');
assert.match(edge,/membership\(admin,txId,memberId\)/,'shared reads must require a transaction membership');
assert.match(edge,/startsWith\("custom_"\).*assigned_role===m\.role/s,'custom tasks must only cross the boundary when assigned to the collaborator role');
assert.match(edge,/createSignedUploadUrl/,'guest upload must use bounded signed upload URLs');
assert.match(edge,/shared\/.*owner_user_id.*txId.*user\.id/s,'guest file paths must bind owner, transaction, and collaborator');
assert.match(edge,/createSignedUrl\(doc\.storage_path,300\)/,'guest document downloads must be short-lived signed URLs');
assert.doesNotMatch(edge,/account_entitlements[^\n]{0,240}(insert|update|upsert)/i,'shared access must never grant a paid entitlement');
assert.match(config,/\[functions\.transaction-collaboration\][\s\S]*?verify_jwt = true/,'transaction collaboration Edge Function must require JWT verification');

assert.match(sharedHtml,/Client disclosures are not shared/,'shared portal must tell the guest that client disclosures are excluded');
assert.match(sharedHtml,/Compare Pro &amp; Pro\+/,'shared portal must expose the professional conversion path');
assert.match(sharedHtml,/Manage your own closings and property intelligence/,'shared portal must explain the value of a standalone Watchdog plan');
assert.doesNotMatch(sharedJs,/transaction_disclosures/,'shared portal runtime must never query owner client disclosures');
assert.match(sharedJs,/accept_invite/,'shared portal must accept a scoped invite');
assert.match(sharedJs,/shared_snapshot/,'shared portal must load only the server-projected shared snapshot');
assert.match(sharedJs,/uploadToSignedUrl/,'shared portal must use signed document upload');
assert.match(sharedCss,/@media\(max-width:600px\)/,'shared transaction portal must support mobile');

assert.match(middleware,/ROOT_STATIC_PAGES[^\n]*['"]\/transaction\/shared['"]/,'middleware must pass the shared transaction route through');
assert.match(vercel,/"source"\s*:\s*"\/transaction\/shared\/"[\s\S]{0,140}"destination"\s*:\s*"\/transaction\/shared\/index\.html"/,'Vercel must rewrite /transaction/shared/ to the shared portal');
assert.match(vercel,/"source"\s*:\s*"\/transaction\/shared"[\s\S]{0,140}"destination"\s*:\s*"\/transaction\/shared\/index\.html"/,'Vercel must rewrite /transaction/shared to the shared portal');

console.log('Transaction collaboration contract passed.');
