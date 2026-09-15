import fs from 'node:fs';
import vm from 'node:vm';

const files = {
  outcomes: 'property/js/plan-outcomes.js',
  css: 'property/css/plan-outcomes.css',
  account: 'property/account/index.html',
  dashboard: 'property/dashboard/index.html',
  projs: 'property/js/pro.js'
};
const read = key => fs.readFileSync(files[key], 'utf8');
const outcomes = read('outcomes');
const css = read('css');
const account = read('account');
const dashboard = read('dashboard');
const projs = read('projs');
const expect = (condition, message) => { if (!condition) throw new Error(message); };

new vm.Script(outcomes, { filename: files.outcomes });
new vm.Script(projs, { filename: files.projs });

for (const tier of ['standard','agent','pro','pro_plus','teams','developer']) {
  expect(outcomes.includes(`${tier}:{`) || outcomes.includes(`${tier}: {`), `Missing outcome catalog tier: ${tier}.`);
}
for (const phrase of ['UNDERSTAND & WATCH','AGENT WORKFLOW','PROFESSIONAL RESEARCH','RESEARCH AT SCALE','TEAM WORKSPACE']) {
  expect(outcomes.includes(phrase), `Missing plan language: ${phrase}.`);
}
expect(outcomes.includes("property_decision:{minimum:'pro'"), 'Property-level professional Intelligence must begin at Pro.');
expect(outcomes.includes("population_triage:{minimum:'pro_plus'"), 'Population/scheduled Intelligence must begin at Pro+.');
expect(outcomes.includes("team_operations:{minimum:'teams'"), 'Organization operations must remain a Teams outcome.');
expect(outcomes.includes('Server entitlements remain authoritative'), 'Public wording must not replace server authorization.');
expect(outcomes.includes('From $59'), 'Professional plan card must start at the current Agent monthly price.');
expect(outcomes.includes('Pro $129 · Pro+ $399'), 'Professional plan card must use the current Pro and Pro+ monthly prices.');
expect(!outcomes.includes('<b>$49</b>'), 'Outcome layer must not reintroduce the retired $49 price.');
expect(!dashboard.includes('/property/js/dashboard/zzzdashboard-v2.js') && !dashboard.includes('/property/js/dashboard/dashboard-v2.js'), 'Current Dashboard must not load either retired legacy dashboard pricing layer.');
expect(account.includes('/property/js/plan-outcomes.js'), 'Account must load the shared plan language layer.');
expect(projs.includes("var src='/property/js/plan-outcomes.js'"), 'Public Pro page must load the shared plan language layer.');
expect(outcomes.includes('Choose the plan you need'), 'Account plan comparison must use concise customer wording.');
expect(outcomes.includes("if(h)h.textContent='Compare plans'"), 'Public plan comparison must use a concise heading.');
expect(outcomes.includes('Watchdog Intelligence · live'), 'Public Pro page must identify launched Watchdog Intelligence as live.');
expect(outcomes.includes('Models still being calibrated are labeled Preview.'), 'Live Intelligence copy must preserve Preview honesty.');
expect(outcomes.includes('Property-change monitoring with evidence-backed findings'), 'Public Pro comparison must describe the live monitoring outcome.');
expect(css.includes('.wd-plan-outcome'), 'Plan language needs a scoped visual treatment.');

for (const [key, content] of Object.entries({ outcomes, css, projs })) {
  expect(!content.includes('?v='), `${files[key]} must not introduce ?v= asset version parameters.`);
}

console.log('Plan language, pricing consistency, live Intelligence copy, entitlement boundary, and asset contracts passed.');
