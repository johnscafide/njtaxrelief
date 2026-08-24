import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const page = read('property/developer-marketing-plan.html');
const access = read('property/js/access-guard.js');
const universal = read('property/js/watchdog-universal-menu.js');

assert(page.includes('data-access-require="developer"'), 'Marketing campaign page must require developer access');
assert(page.includes('data-developer-only="true"'), 'Marketing campaign page must be marked developer-only');
assert(page.includes('noindex,nofollow,noarchive'), 'Marketing campaign page must be excluded from indexing');
assert(page.includes('/property/js/access-guard.js'), 'Marketing campaign page must load the shared access guard');
assert(page.includes('Total ceiling'), 'Marketing campaign page must expose the hard budget ceiling');
assert(page.includes('&lt; $100'), 'Marketing campaign page must keep total spend below $100');
assert(page.includes('$5–$10'), 'Marketing campaign page must keep individual paid tests tiny');
assert(page.includes('utm_campaign=watchdog_launch_2026'), 'Marketing campaign page must define the launch UTM campaign');
assert(page.includes('Google Business Profile caveat'), 'Marketing campaign page must preserve the Google eligibility guardrail');

assert(access.includes("sb().rpc('is_watchdog_developer')"), 'Shared access guard must verify the developer role server-side');
assert(access.includes("if (required === 'developer' && !isDeveloper) allowed = false;"), 'Developer access must remain fail-closed');

assert(universal.includes("key:'developer-marketing'"), 'Universal developer menu must include the marketing campaign entry');
assert(universal.includes("href:'/property/developer-marketing-plan.html'"), 'Universal developer menu must point to the developer marketing page');
assert(universal.includes("label:'Marketing Campaign'"), 'Universal developer menu must label the marketing campaign entry');
assert(universal.includes("if(!isDeveloper()) return '';"), 'Universal developer tools must stay hidden for non-developers');

console.log('Developer marketing plan contract: PASS');
