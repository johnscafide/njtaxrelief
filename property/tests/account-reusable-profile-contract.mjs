import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=(p)=>fs.readFileSync(p,'utf8');
const account=read('property/js/account-reusable-profile.js');
const partial=read('property/partials/account-reusable-profile.html');
const page=read('property/account/index.html');

assert.match(page,/account-reusable-profile\.js/);
assert.match(page,/account-member-profile\.css/);
assert.match(account,/account-reusable-profile\.html/);
assert.match(account,/legal_first_name/);
assert.match(account,/mailing_address/);
assert.match(account,/mailing_city/);
assert.match(account,/mailing_state/);
assert.match(account,/mailing_zip/);
assert.match(account,/municipality_code/);
assert.match(account,/set_my_reusable_profile_v1/);
assert.match(account,/auth\.updateUser\(\{data:\{full_name:name\}\}\)/);
assert.match(account,/#acp-save/);
assert.match(account,/^.*Saved\\\./m);
// Disclaimer rewritten in NJW-431 (4fb2e3d9) when optional household income/age bands moved to the
// separate private homeowner context section. Sensitive tax data must still be excluded here.
assert.match(partial,/This section is only for reusable name and mailing details\./);
assert.match(partial,/Household income, age and other demographics belong in the private homeowner info section/i);
assert.match(partial,/Social Security numbers, tax amounts, recovery keys and tax-year filing answers are never stored here/i);
assert.doesNotMatch(account,/gross_income|nj_taxable_income|social_security|\.ssn|birth_year/i);
assert.doesNotMatch(account,/p_(?:gross_income|nj_taxable_income|filing_status|birth_year|ssn|disability)/i);
console.log('NJW-335 Account reusable profile contract passed');
