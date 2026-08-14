import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const page=read('property/marketing-studio.html');
assert.match(page,/data-access-require="agent"/,'Marketing Studio must remain Agent+.');
assert.match(page,/marketing-studio-creative\.js/,'Creative Studio must load in Marketing Studio.');
assert.match(page,/marketing-studio-creative\.css/,'Creative Studio styles must load.');
assert.doesNotMatch(page,/\?v=/,'Marketing Studio assets must not use query-string version files.');

const creative=read('property/js/marketing-studio-creative.js');
assert.match(creative,/marketing_prepare_direct_mail_recipients/,'Recipients must be materialized server-side before quote/launch.');
assert.match(creative,/marketing_approve_creative/,'Creative approval must be explicit.');
assert.match(creative,/marketing_approve_direct_mail_launch/,'Paid direct mail requires explicit final approval.');
assert.match(creative,/marketing_studio_quote/,'Price must come from the server quote engine.');
assert.match(creative,/marketing-campaign-checkout/,'Funding must use the guarded campaign checkout.');
assert.match(creative,/marketing-direct-mail-launch/,'Launch must use the guarded provider adapter.');
assert.match(creative,/confirm\(/,'Final provider launch must require an explicit user confirmation.');

const launch=read('supabase/functions/marketing-direct-mail-launch/index.ts');
assert.match(launch,/PCM_LIVE_LAUNCH_ENABLED/,'PCM launch must have a separate live-send kill switch.');
assert.match(launch,/marketing_launch_approvals/,'Provider launch must require the server launch approval ledger.');
assert.match(launch,/marketing_direct_mail_recipients/,'Provider launch must use immutable prepared recipients.');
assert.match(launch,/provider_design_id/,'Provider design mapping must be required before launch.');
assert.match(launch,/quote_id:approval\.quote_id/,'Provider job must bind the exact approved quote.');
assert.match(launch,/payment_id:approval\.payment_id/,'Provider job must bind the exact captured payment.');
assert.doesNotMatch(launch,/body\?\.(?:amount|price|retail_cents|recipients)/,'Browser may not submit authoritative price or recipient data to the launch adapter.');

const schema=read('supabase/migrations/20260814190000_marketing_creative_direct_mail_launch.sql');
assert.match(schema,/marketing_direct_mail_recipients/,'Immutable mailing-recipient snapshot table must exist.');
assert.match(schema,/marketing_launch_approvals/,'Launch approval ledger must exist.');
assert.match(schema,/revoke insert,update,delete on public\.marketing_direct_mail_recipients from authenticated/i,'Browser writes to recipient snapshots must remain revoked.');
assert.match(schema,/revoke insert,update,delete on public\.marketing_launch_approvals from authenticated/i,'Browser writes to launch approvals must remain revoked.');

const config=read('supabase/config.toml');
assert.match(config,/\[functions\.marketing-direct-mail-launch\][\s\S]*?verify_jwt\s*=\s*true/,'Direct mail launch must require authenticated JWT access.');
console.log('Marketing Creative Studio and Direct Mail Launch contracts passed.');
