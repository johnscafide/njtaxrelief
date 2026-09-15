import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260915233500_anchor_review_outreach_emailjs_automation.sql','utf8');
const worker = readFileSync('supabase/functions/anchor-review-outreach-worker/index.ts','utf8');
const unsubscribe = readFileSync('api/watchdog-review-outreach-unsubscribe.js','utf8');
const template = readFileSync('property/docs/emailjs-anchor-review-template.md','utf8');

assert.match(migration,/automation_enabled boolean not null default false/i,'automation must default off');
assert.match(migration,/delay_minutes smallint not null default 60/i,'review request should default to a 60 minute delay');
assert.match(migration,/automation_started_at = case[\s\S]*now\(\)/i,'enabling must reset the start boundary to avoid historical backfill');
assert.match(migration,/watchdog-anchor-review-outreach/i,'review worker must be scheduled');
assert.match(migration,/\*\/5 \* \* \* \*/,'worker must poll every five minutes');
assert.match(migration,/delivery_status in \('prepared','processing','retry','sent','failed','suppressed'\)/i);

assert.match(worker,/EMAILJS_ANCHOR_REVIEW_TEMPLATE_ID/,'worker needs a dedicated EmailJS review template');
assert.match(worker,/template_anchor_review/,'worker should use the documented fallback template ID');
assert.match(worker,/api\/v1\.0\/email\/send/,'worker must use the EmailJS REST API');
assert.match(worker,/await sleep\(1100\)/,'worker must respect EmailJS send rate limiting');
assert.match(worker,/\.eq\("status", "generated"\)/,'only completed/generated applications are eligible');
assert.match(worker,/\.eq\("tax_year", 2025\)/,'automation is currently scoped to the 2025 application');
assert.match(worker,/\.gte\("generated_at", startedAt\.toISOString\(\)\)/,'automation must not backfill applications older than its activation');
assert.match(worker,/anchor_application_reviews/,'already-reviewed applications must be reconciled');
assert.match(worker,/marketing_suppressions/,'review-email suppressions must be honored');
assert.match(worker,/token_digest: tokenDigest/,'database must store only token digest');
assert.doesNotMatch(worker,/searchParams\.set\(['"]email/i,'tracking URLs must not contain recipient email');
assert.doesNotMatch(worker,/searchParams\.set\(['"]application/i,'tracking URLs must not contain application IDs');
assert.match(worker,/review_1_url/);
assert.match(worker,/review_5_url/);
assert.match(worker,/open_pixel_url/);
assert.match(worker,/unsubscribe_url/);

assert.match(unsubscribe,/marketing_suppressions/,'unsubscribe must create a campaign suppression');
assert.match(unsubscribe,/review_outreach_unsubscribe/);
assert.match(unsubscribe,/Other account or filing-related service messages are unaffected/);

assert.match(template,/Template ID:\*\* `template_anchor_review`/);
assert.match(template,/\{\{review_1_url\}\}/);
assert.match(template,/\{\{review_5_url\}\}/);
assert.match(template,/\{\{review_url\}\}/);
assert.match(template,/\{\{open_pixel_url\}\}/);
assert.match(template,/\{\{unsubscribe_url\}\}/);

console.log('ANCHOR EmailJS review automation contract passed.');
