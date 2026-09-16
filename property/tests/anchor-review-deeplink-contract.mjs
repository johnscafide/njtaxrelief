import fs from 'node:fs';
import assert from 'node:assert/strict';

const page=fs.readFileSync('property/review/index.html','utf8');
const script=fs.readFileSync('property/js/anchor-review.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260916130500_anchor_review_low_rating_feedback_withdrawal_v1.sql','utf8');

assert.match(page,/How did we do\?/);
assert.match(page,/data-rating="5"/);
assert.match(page,/review-feedback-prompt/);
assert.match(page,/What could we have done better/);
assert.match(page,/anchor-review\.js/);
assert.match(page,/\/property\/privacy/);
assert.match(page,/\/property\/terms/);
assert.match(script,/new URLSearchParams\(location\.search\)\.get\('rating'\)/);
assert.match(script,/eq\('status','generated'\)/);
assert.match(script,/anchor_application_reviews/);
assert.match(script,/record_my_anchor_application_review_v1/);
assert.match(script,/rating<=3&&!comment/);
assert.match(script,/feedback_required_for_rating_3_or_below/);
assert.match(script,/withdrawn_at/);
assert.match(script,/application_review_saved/);
assert.match(script,/shouldCreateUser:false/);
assert.doesNotMatch(script,/p_review_comment:[^\n]*email/i);
assert.match(migration,/p_rating <= 3 and v_comment is null/);
assert.match(migration,/withdraw_my_anchor_application_review_v1/);
assert.match(migration,/where withdrawn_at is null/);

console.log('NJW-341 dedicated review deep-link contract passed');
