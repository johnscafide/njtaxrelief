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
assert.match(page,/marketing-studio-pcm-workspace\.js/,'PCM production workspace must load on Customize.');
assert.doesNotMatch(page,/\?v=/,'Marketing Studio assets must not use query-string version files.');

const pcmWorkspace=read('property/js/marketing-studio-pcm-workspace.js');
assert.match(pcmWorkspace,/action:'design\.edit'/,'PCM editor sessions must come from the authenticated server adapter.');
assert.match(pcmWorkspace,/window\.addEventListener\('message',onEditorMessage\)/,'PCM editor save messages must be observed by the parent page.');
assert.match(pcmWorkspace,/event\.source!==frame\.contentWindow/,'PCM editor messages must come from the exact embedded iframe window.');
assert.match(pcmWorkspace,/event\.origin!==editorSession\.origin/,'PCM editor messages must match the origin derived from the returned editor URL.');
assert.match(pcmWorkspace,/payload\.designID!==String\(state\.design_id\|\|''\)/,'PCM editor messages must match the active campaign design ID.');
assert.match(pcmWorkspace,/refresh\(null,\{automatic:true\}\)/,'A verified PCM save message must trigger automatic provider proof refresh.');
assert.match(pcmWorkspace,/data-pcmw-refresh/,'Manual PCM refresh must remain available as a fallback.');
assert.match(pcmWorkspace,/24 hours/,'Vendor-confirmed PCM editor token lifetime must be surfaced without persisting the token.');
assert.match(pcmWorkspace,/DynamicImage/,'PCM Dynamic Image readiness must use the exact provider-confirmed variable key.');
assert.match(pcmWorkspace,/3 business days/,'PCM dynamic artwork availability window must be surfaced.');
assert.match(pcmWorkspace,/proof engine is on demand/,'PCM on-demand proof retention risk must be surfaced before future live submission.');
assert.match(pcmWorkspace,/Dynamic image values are not submitted here/,'Customize must not imply that dynamic image data is already wired to live fulfillment.');
assert.match(pcmWorkspace,/No order, postage purchase, payment, cancellation, or production submission occurs here/,'PCM Customize must remain a non-spend, non-cancellation surface.');

const pcmCatalog=read('supabase/functions/pcm-sandbox-catalog/index.ts');
assert.match(pcmCatalog,/\/design\/\$\{encodeURIComponent\(id\)\}\/edit/,'PCM editor sessions must use the verified design edit route.');
assert.match(pcmCatalog,/auth\.startsWith\('Bearer '\)/,'PCM catalog/editor adapter must require authenticated browser access.');
assert.match(pcmCatalog,/https:\/\/www\.watchdogindex\.com/,'PCM catalog/editor adapter must allow the canonical Watchdog browser origin.');
assert.match(pcmCatalog,/https:\/\/www\.njpropertytaxrelief\.com/,'PCM catalog/editor adapter must preserve the intentional legacy browser origin.');
assert.match(pcmCatalog,/provider_mutation_called:false/,'PCM catalog/editor reads must remain explicit non-mutation operations.');

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
assert.match(creativeAdapter,/https:\/\/www\.watchdogindex\.com/,'Creative provider adapter must allow the canonical Watchdog browser origin.');
assert.match(creativeAdapter,/PCM_LIVE_LAUNCH_ENABLED/,'PCM adapter must retain the production-send kill switch configuration.');
assert.match(creativeAdapter,/legacy_launch_disabled:true/,'Legacy browser-triggered provider launch must remain disabled.');
assert.match(creativeAdapter,/live_launch_enabled:false/,'Creative adapter status must not advertise browser-triggered live fulfillment.');

const legacyDirect=read('supabase/functions/pcm-direct-mail/index.ts');
assert.match(legacyDirect,/LEGACY_PCM_DIRECT_SUBMIT_DISABLED/,'Legacy Data Workbench PCM submit must fail closed.');
assert.match(legacyDirect,/provider_mutation_called:\s*false/,'Legacy PCM submit response must explicitly report no provider mutation.');
assert.match(legacyDirect,/order_submission:\s*false/,'Legacy PCM status must not advertise order submission.');
assert.match(legacyDirect,/authoritative_paid_fulfillment:\s*'marketing-direct-mail-fulfill'/,'Legacy PCM status must point at authoritative service-role fulfillment.');
assert.doesNotMatch(legacyDirect,/fetch\s*\(/,'Legacy browser PCM adapter must not contain any outbound provider call.');
assert.doesNotMatch(legacyDirect,/PLACE_ORDER/,'Legacy browser PCM adapter must not retain the old paid-order confirmation path.');

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
assert.match(fulfill,/globalDesignVariables:\s*\[\]/,'Live fulfillment must not start sending newly documented design variables until the mapping is separately certified.');
assert.doesNotMatch(fulfill,/body\?\.(?:amount|price|retail_cents|recipients)/,'Browser/request payload may not supply authoritative price or recipient data to fulfillment.');

const pcmWebhook=read('supabase/functions/pcm-webhook/index.ts');
assert.match(pcmWebhook,/PCM_WEBHOOK_SIGNATURE_CONTRACT_PENDING/,'PCM webhook receiver must fail closed until the exact signature contract is configured.');
assert.match(pcmWebhook,/duplicate:\s*true/,'PCM webhook receiver must return a successful duplicate acknowledgement.');

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
assert.match(config,/\[functions\.pcm-sandbox-catalog\][\s\S]*?verify_jwt\s*=\s*true/,'PCM catalog/editor adapter must require authenticated JWT access.');
assert.match(config,/\[functions\.pcm-direct-mail\][\s\S]*?verify_jwt\s*=\s*true/,'Legacy PCM compatibility adapter must remain JWT protected.');
console.log('Marketing Creative Studio, PCM editor refresh, Dynamic Image/proof-retention UX, legacy-submit shutdown, webhook fail-closed state, and touchless paid Direct Mail fulfillment contracts passed.');
