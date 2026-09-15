import fs from 'node:fs';
import assert from 'node:assert/strict';

const page=fs.readFileSync('property/review/index.html','utf8');
const script=fs.readFileSync('property/js/anchor-review.js','utf8');

assert.match(page,/How did we do\?/);
assert.match(page,/data-rating="5"/);
assert.match(page,/anchor-review\.js/);
assert.match(page,/\/property\/privacy/);
assert.match(page,/\/property\/terms/);
assert.match(script,/new URLSearchParams\(location\.search\)\.get\('rating'\)/);
assert.match(script,/eq\('status','generated'\)/);
assert.match(script,/anchor_application_reviews/);
assert.match(script,/record_my_anchor_application_review_v1/);
assert.match(script,/application_review_saved/);
assert.match(script,/shouldCreateUser:false/);
assert.doesNotMatch(script,/p_review_comment:[^\n]*email/i);

console.log('NJW-341 dedicated review deep-link contract passed');
