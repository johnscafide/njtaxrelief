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
  'supabase/migrations/20260805180000_ownership_verification.sql',
  'supabase/migrations/20260805183000_manual_verification_email.sql',
  'supabase/functions/request-verify-code/index.ts',
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
for (const marker of ['townIntelligenceCard(r)', 'toolTaxPressure(r)', "'tax-pressure-simulator'"]) {
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
if (!Array.isArray(versions.releases) || versions.releases.length < 10) throw new Error('Release history is incomplete');
if (!Array.isArray(versions.roadmap) || versions.roadmap.length < 8) throw new Error('Project roadmap is incomplete');
if (versions.releases[0].version !== '0.9.1' || !versions.releases[0].timestamp) {
  throw new Error('Current tracker release or timestamp is missing');
}
const freshness = JSON.parse(read('property/data/data-freshness.json'));
if (freshness.overall_status !== 'passed' || freshness.failures.length) throw new Error('State-data coverage validation failed');
if (!read('property/js/sidemenu.js').includes('genericToggle')) throw new Error('Shared sidebar fallback is missing');
if (!read('property/js/dashboard/tools/assessment-drift.js').includes('toolTimeMachine')) throw new Error('Property Time Machine is missing');
if (!read('property/pro.html').includes('Data Center')) throw new Error('Pro+ Data Center integration is missing');
if (read('property/js/dashboard/tools/town-intelligence.js').includes("row.band + '\"'")) throw new Error('Town Intelligence can still emit an undefined class');
if (!read('supabase/functions/request-verify-code/index.ts').includes('VERIFY_ADMIN_EMAIL')) throw new Error('Manual administrator-email delivery is missing');

console.log('Verified release 0.9.1: mobile cards, manual postcard fulfillment, navigation, Town Intelligence, Property Time Machine, data automation, tracker, and Pro+ Data Center specification.');
