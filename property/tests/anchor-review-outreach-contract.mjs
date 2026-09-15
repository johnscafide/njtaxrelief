import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const migration = readFileSync('supabase/migrations/20260915232000_anchor_review_outreach_tracking.sql','utf8');
const openApi = readFileSync('api/watchdog-review-outreach-open.js','utf8');
const clickApi = readFileSync('api/watchdog-review-outreach-click.js','utf8');
const backofficeApi = readFileSync('api/watchdog-backoffice-reviews.js','utf8');
const backofficePage = readFileSync('property/backoffice/reviews/index.html','utf8');

assert.match(migration,/create table if not exists public\.anchor_review_outreach/);
assert.match(migration,/token_digest text not null unique/);
assert.match(migration,/enable row level security/);
assert.match(migration,/revoke all on public\.anchor_review_outreach from anon, authenticated/);
assert.match(migration,/grant execute on function public\.record_anchor_review_outreach_event_v1\(text,text,integer\) to service_role/);
assert.match(migration,/private\.sync_anchor_review_outreach_v1/);
assert.match(migration,/after insert or update of rating, review_comment on public\.anchor_application_reviews/);

assert.match(openApi,/createHash\('sha256'\)/);
assert.match(openApi,/record_anchor_review_outreach_event_v1/);
assert.match(openApi,/p_event: 'open'/);
assert.match(openApi,/image\/gif/);
assert.doesNotMatch(openApi,/email/i);

assert.match(clickApi,/createHash\('sha256'\)/);
assert.match(clickApi,/p_event: 'click'/);
assert.match(clickApi,/\/property\/review\//);
assert.doesNotMatch(clickApi,/email/i);
assert.doesNotMatch(clickApi,/application_id/i);

assert.match(backofficeApi,/anchor_review_outreach/);
assert.match(backofficeApi,/outreach_summary/);
assert.match(backofficeApi,/mark_outreach_sent/);
assert.match(backofficePage,/Review outreach/);
assert.match(backofficePage,/estimated via image load/);
assert.match(backofficePage,/Apple Mail Privacy Protection/);

console.log('NJW-364 review outreach analytics contract passed');
