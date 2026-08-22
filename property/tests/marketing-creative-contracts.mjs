import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const page=read('property/marketing-studio/customize/index.html');
assert.match(page,/data-access-require="agent"/,'Marketing Studio must remain Agent+.');
assert.match(page,/marketing-studio-creative\.js/,'Creative Studio must load in Marketing Studio.');
assert.match(page,/marketing-studio-creative\.css/,'Creative Studio styles must load.');
assert.doesNotMatch(page,/\?v=/,'Marketing Studio assets must not use query-string version files.');

const creative=read('property/js/marketing-studio-creative.js');
assert.match(creative,/marketing_prepare_direct_mail_recipients/,'Recipients must be materialized server-side before quote/checkout.');
assert.match(creative,/marketing_approve_creative/,'Creative approval must be explicit.');
assert.match(creative,/marketing_studio_quote/,'Price must come from the server quote engine.');
assert.match(creative,/marketing-campaign-checkout/,'Funding must use the guarded campaign checkout.');
assert.match(creative,/confirm\(/,'Final paid-mail checkout must require an explicit user confirmation.');

// marketing-direct-mail-launch is now the authenticated Creative Studio provider adapter.
// Paid fulfillment is intentionally service-to-service after a confirmed checkout; browser
// code cannot call the fulfillment worker or submit authoritative price/recipient rows.
const creativeAdapter=read('supabase/functions/marketing-direct-mail-launch/index.ts');
assert.match(creativeAdapter,/PCM_LIVE_LAUNCH_ENABLED/,'PCM adapter must retain the production-send kill switch configuration.');
assert.match(creativeAdapter,/legacy_launch_disabled:true/,'Legacy browser-triggered provider launch must remain disabled.');
assert.match(creativeAdapter,/live_launch_enabled:false/,'Creative adapter status must not advertise browser-triggered live fulfillment.');

const fulfill=read('supabase/functions/marketing-direct-mail-fulfill/index.ts');
assert.match(fulfill,/Bearer \$\{SERVICE\}/,'Paid fulfillment must require service-role authorization.');
assert.match(fulfill,/marketing_payments/,'Paid fulfillment must re-read the server payment ledger.');
assert.match(fulfill,/marketing_price_quotes/,'Paid fulfillment must re-read the authoritative quote.');
assert.match(fulfill,/proof_review\?\.status !== 'approved'/,'Paid fulfillment must require an approved PCM proof.');
assert.match(fulfill,/\.eq\('status', 'approved'\)/,'Paid fulfillment must require approved creative.');
assert.match(fulfill,/marketing_direct_mail_fulfillment_recipients/,'Paid fulfillment must use server-owned immutable prepared recipients.');
assert.match(fulfill,/provider_design_id/,'Provider design mapping must be required before fulfillment.');
assert.match(fulfill,/recipients\.data\.length !== Number\(quote\.quantity\)/,'Paid fulfillment must fail closed if recipient count differs from the paid quote.');
assert.match(fulfill,/PCM_LIVE_LAUNCH_ENABLED/,'Paid fulfillment must keep the explicit live-send kill switch.');
assert.doesNotMatch(fulfill,/body\?\.(?:amount|price|retail_cents|recipients)/,'Browser/request payload may not supply authoritative price or recipient data to fulfillment.');

const webhook=read('supabase/functions/stripe-webhook/index.ts');
assert.match(webhook,/marketing-direct-mail-fulfill/,'Paid fulfillment handoff must originate from the server Stripe webhook.');
assert.match(webhook,/Authorization: `Bearer \$\{SERVICE_ROLE\}`/,'Stripe webhook must authenticate the fulfillment handoff service-to-service.');

const schema=read('supabase/migrations/20260814190000_marketing_creative_direct_mail_launch.sql');
assert.match(schema,/marketing_direct_mail_recipients/,'Immutable mailing-recipient snapshot table must exist.');
assert.match(schema,/marketing_launch_approvals/,'Historical launch-approval ledger must remain retained for audit compatibility.');
assert.match(schema,/revoke insert,update,delete on public\.marketing_direct_mail_recipients from authenticated/i,'Browser writes to recipient snapshots must remain revoked.');
assert.match(schema,/revoke insert,update,delete on public\.marketing_launch_approvals from authenticated/i,'Browser writes to launch approvals must remain revoked.');

const config=read('supabase/config.toml');
assert.match(config,/\[functions\.marketing-direct-mail-launch\][\s\S]*?verify_jwt\s*=\s*true/,'Creative provider adapter must require authenticated JWT access.');
console.log('Marketing Creative Studio and touchless paid Direct Mail fulfillment contracts passed.');
