import fs from 'node:fs';
import vm from 'node:vm';

const files = {
  analyst: 'property/js/dashboard/home/watchdog-analyst-intel.js',
  onboarding: 'property/js/dashboard/home/profession-onboarding.js',
  loader: 'property/js/dashboard/home/watchdog-analyst-intel-loader.js',
  menu: 'property/js/dashboard/home/home-menu-sync.js',
  css: 'property/css/home/watchdog-analyst-intel.css'
};
const read = (key) => fs.readFileSync(files[key], 'utf8');
const analyst = read('analyst');
const onboarding = read('onboarding');
const loader = read('loader');
const menu = read('menu');
const css = read('css');

const fail = (message) => { throw new Error(message); };
const expect = (condition, message) => { if (!condition) fail(message); };

new vm.Script(analyst, { filename: files.analyst });
new vm.Script(onboarding, { filename: files.onboarding });
new vm.Script(loader, { filename: files.loader });

expect(analyst.includes("from('professional_preferences')"), 'Analyst Intel must read the explicit professional_preferences record.');
expect(analyst.includes('onboarding_complete !== true'), 'Exact profession must require completed profession onboarding.');
expect(analyst.includes("return explicitProfession() || 'general'"), 'Missing profession must fall back to generalized Intel.');
expect(analyst.includes("from('professional_preferences').upsert"), 'Inline profession onboarding must persist to professional_preferences.');
expect(analyst.includes("surface: 'home', scope_type: 'property'"), 'Evidence fallback must remain property-scoped.');
expect(analyst.includes("functions.invoke('intelligence-context-suggestions'"), 'Analyst Intel must use the governed Context Intelligence boundary.');
expect(analyst.includes("window.addEventListener('watchdog:context-suggestions'"), 'Analyst Intel must reuse shared Home Intelligence evidence when available.');
expect(analyst.includes("target.closest('[data-watchdog-analyst-intel]')"), 'Mutation observer must ignore Analyst Intel self-renders.');
expect(analyst.includes("if (!force && state.lastPin === pinValue"), 'Refresh loop must short-circuit when the rendered property has not changed.');

for (const profession of ['real_estate','investor','attorney','mortgage_lending','appraiser','contractor','property_tax_professional','title_closing','homeowner']) {
  expect(analyst.includes(profession + ':'), `Missing profession lens: ${profession}`);
  expect(onboarding.includes("'" + profession + "'"), `Missing profession onboarding choice: ${profession}`);
}
for (const label of ['FINANCIAL LENS','MOTIVATION','INNOVATION','EVIDENCE','NEXT BEST ACTION']) {
  expect(analyst.includes(label), `Missing Analyst Intel decision layer: ${label}`);
}
expect(analyst.includes('rather than manufacture urgency'), 'Motivation layer must explicitly refuse manufactured urgency.');
expect(analyst.includes('Renovation ROI still depends'), 'ROI language must preserve uncertainty and required inputs.');
expect(analyst.includes('not an appraisal'), 'Appraiser lens must not present Watchdog screening context as an appraisal.');
expect(analyst.includes('legal or appeal conclusion'), 'Attorney/tax lens must preserve professional-conclusion boundary.');
expect(analyst.includes('Your profession personalizes recommendations. It does not change billing or authorization.'), 'Profession selection must be described as personalization, not authorization.');

expect(onboarding.includes("from('professional_preferences').select"), 'Property Home onboarding must check the existing explicit profession record.');
expect(onboarding.includes("from('professional_preferences').upsert"), 'Property Home onboarding must persist the selected profession to the user-owned preference record.');
expect(onboarding.includes('Use generalized Intel for now'), 'Users must be able to decline exact personalization and continue with generalized Intel.');
expect(onboarding.includes('does not change your plan, billing, or authorization'), 'Onboarding must keep personalization separate from authorization.');
expect(onboarding.includes("sessionStorage.setItem(key(),'1')"), 'Profession prompt must not nag repeatedly during the same session.');

expect(loader.includes('/property/css/home/watchdog-analyst-intel.css'), 'Loader must install Analyst Intel CSS.');
expect(loader.includes('/property/js/dashboard/home/profession-onboarding.js'), 'Loader must ask profession before exact Property Home Intel.');
expect(loader.includes('/property/js/dashboard/home/watchdog-analyst-intel.js'), 'Loader must install Analyst Intel runtime.');
expect(menu.includes('/property/js/dashboard/home/watchdog-analyst-intel-loader.js'), 'Property Home runtime must load Analyst Intel.');
expect(css.includes('.ai.wdai'), 'Analyst Intel must have scoped Property Home styling.');
expect(css.includes('.wd-profession-onboarding'), 'Profession onboarding must have a production UI treatment.');

for (const [key, content] of Object.entries({ analyst, onboarding, loader, menu, css })) {
  expect(!content.includes('?v='), `${files[key]} must not introduce ?v= asset version parameters.`);
}

console.log('Watchdog Analyst Intel profession, onboarding, evidence, refresh, and asset contracts passed.');
