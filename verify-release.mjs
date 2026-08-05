import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));

const required = [
  'property/fairness.html', 'property/town-compare.html', 'property/sidemenu.html',
  'property/js/dashboard/tools/town-intelligence.js',
  'property/js/dashboard/tools/town-risk-matrix.js',
  'property/js/dashboard/tools/tax-pressure-simulator.js',
  'property/js/town-compare/index.js',
  'property/css/dashboard/07-town-intelligence.css', 'property/css/town-compare.css',
  'property/updates.html', 'property/css/updates.css', 'property/js/updates.js',
  'property/data/versions.json',
  'property/js/dashboard/tools/assessment-drift.js',
  'property/css/dashboard/08-time-machine.css',
  'property/verification-diagnostics.html',
  'property/js/verification-diagnostics.js',
  'property/data/source-registry.json',
  'property/data/data-freshness.json',
  'property/scripts/refresh_state_data.py',
  'property/docs/pro-plus-data-center-spec.md',
  'property/js/ownership-verification.js',
  'property/js/lookup.js',
  'property/js/dashboard/tools/municipal-budget-pressure.js',
  'property/css/dashboard/09-budget-pressure.css',
  'property/data/budget-pressure.json',
  'property/scripts/build_budget_pressure.py',
  'property/js/dashboard/tools/exempt-pilot-exposure.js',
  'property/js/dashboard/tools/added-omitted-monitor.js',
  'property/js/dashboard/tools/farmland-qualification.js',
  'property/css/dashboard/10-special-assessments.css',
  'property/data/exempt-pilot.json',
  'property/abatements.json',
  'property/scripts/build_exempt_pilot.py',
  'supabase/migrations/20260805180000_ownership_verification.sql',
  'supabase/migrations/20260805183000_manual_verification_email.sql',
  'supabase/functions/request-verify-code/index.ts',
  'supabase/functions/request-verify-code/EMAILJS-TEMPLATE-SETUP.md',
  '.github/workflows/state-data-refresh.yml',
  'sitemap.xml'
];
required.forEach(file => { if (!exists(file)) throw new Error('Missing release file: ' + file); });

const dashboard = read('property/js/dashboard/index.js');
const home = read('property/js/dashboard/home/index.js');
const menu = read('property/sidemenu.html');
const fairness = read('property/fairness.html');

for (const marker of ['townIntelSummary(r)', 'townIntelAgentPoints()', 'toolTownRiskMatrix()', "Town fairness (0-100)"]) {
  if (!dashboard.includes(marker)) throw new Error('Dashboard integration missing: ' + marker);
}
for (const marker of ['townIntelligenceCard(r)', 'toolTaxPressure(r)', "'tax-pressure-simulator'", 'toolAddedOmitted(r)', 'toolFarmland(r)', 'toolExemptPilot(r)']) {
  if (!home.includes(marker)) throw new Error('Home integration missing: ' + marker);
}
if (!menu.includes('/property/fairness.html') || !menu.includes('/property/town-compare.html')) {
  throw new Error('Shared menu links are missing');
}
if (!menu.includes('/property/updates.html')) throw new Error('Updates & roadmap menu link is missing');
if (!menu.includes('/property/verification-diagnostics.html')) throw new Error('Verification status menu link is missing');
if (!fairness.includes("townIntelAll()") || !fairness.includes('fi-detail')) {
  throw new Error('Fairness Index does not use shared Town Intelligence');
}
if (exists('property/css/fairness.html')) throw new Error('Obsolete CSS-folder HTML copy is present');

const versions = JSON.parse(read('property/data/versions.json'));
if (!Array.isArray(versions.releases) || versions.releases.length < 11) throw new Error('Release history is incomplete');
if (!Array.isArray(versions.roadmap) || versions.roadmap.length < 4) throw new Error('Project roadmap is incomplete');
if (versions.releases[0].version !== '0.11.0' || !versions.releases[0].timestamp) {
  throw new Error('Current tracker release or timestamp is missing');
}
const freshness = JSON.parse(read('property/data/data-freshness.json'));
if (freshness.overall_status !== 'passed' || freshness.failures.length) throw new Error('State-data coverage validation failed');
if (!read('property/js/sidemenu.js').includes('genericToggle')) throw new Error('Shared sidebar fallback is missing');
if (!read('property/js/dashboard/tools/assessment-drift.js').includes('toolTimeMachine')) throw new Error('Property Time Machine is missing');
if (!read('property/pro.html').includes('Data Center')) throw new Error('Pro+ Data Center integration is missing');
if (read('property/js/dashboard/tools/town-intelligence.js').includes("row.band + '\"'")) throw new Error('Town Intelligence can still emit an undefined class');
if (!read('supabase/functions/request-verify-code/index.ts').includes('api.emailjs.com/api/v1.0/email/send')) throw new Error('EmailJS administrator delivery is missing');
if (!read('property/js/lookup.js').includes("kind === 'home' && window.NJPTRVerification")) throw new Error('Lookup does not offer verification after claiming a home');
if (!read('property/js/dashboard/home/index.js').includes('window.dbVerify = function')) throw new Error('Home verification action is missing');
if (!read('property/dashboard.html').includes('ownership-verification.js') || !read('property/home.html').includes('ownership-verification.js')) throw new Error('Shared ownership verification is not loaded');
const budgetPressure = JSON.parse(read('property/data/budget-pressure.json'));
if (!budgetPressure.municipalities || Object.keys(budgetPressure.municipalities).length < 560) throw new Error('Municipal Budget Pressure coverage is incomplete');
if (!read('property/js/dashboard/index.js').includes('budgetPressureSummary(r)')) throw new Error('Dashboard Budget Pressure integration is missing');
if (!read('property/js/dashboard/home/index.js').includes('budgetPressureCard(r)')) throw new Error('Home Budget Pressure integration is missing');
if (!read('property/js/town-compare/index.js').includes('Budget pressure score')) throw new Error('Town comparison Budget Pressure integration is missing');
const exposure = JSON.parse(read('property/data/exempt-pilot.json'));
if (!exposure.municipalities || Object.keys(exposure.municipalities).length !== 564) throw new Error('Exempt/PILOT coverage is incomplete');
const abatements = JSON.parse(read('property/abatements.json'));
if (!abatements.districts || Object.keys(abatements.districts).length !== 564) throw new Error('Partial-abatement coverage is incomplete');
const cardCss = read('property/css/dashboard/05-collections.css');
if (!cardCss.includes('aspect-ratio: auto') || !cardCss.includes('grid-template-rows: auto auto')) throw new Error('Dashboard card sizing repair is missing');

console.log('Verified release 0.11.0: Exempt/PILOT exposure, Added/Omitted monitor, Farmland screener, Dashboard card repair, Budget Pressure, verification, Town Intelligence, Time Machine, tracker, and Pro+ Data Center specification.');
