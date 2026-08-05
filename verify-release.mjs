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
  'property/js/dashboard/tools/professional-due-diligence.js',
  'property/js/dashboard/tools/professional-workflows.js',
  'property/css/dashboard/11-ui-polish.css',
  'property/css/dashboard/12-professional-due-diligence.css',
  'property/css/home.css',
  'property/css/home/04-scorecard-workspace.css',
  'property/css/dashboard/10-special-assessments.css',
  'property/data/exempt-pilot.json',
  'property/abatements.json',
  'property/scripts/build_exempt_pilot.py',
  'property/data/marker-registry.json',
  'property/scripts/build_marker_registry.py',
  'property/data-center.html',
  'property/js/data-center.js',
  'property/css/data-center.css',
  'property/css/mobile-app.css',
  'property/marker.html',
  'property/css/marker-intelligence.css',
  'property/css/home/05-marker-experience.css',
  'property/js/marker-intelligence.js',
  'property/js/marker-detail.js',
  'property/data/marker-content.json',
  'property/js/plan-context.js',
  'property/css/plan-context.css',
  'property/data/proprietary-marker-backlog.json',
  'property/data/saas-platform-pipeline.json',
  'supabase/migrations/20260805220000_developer_plan_access.sql',
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
for (const marker of ['townIntelligenceCard(r)', 'toolTaxPressure(r)', "'tax-pressure-simulator'", 'toolAddedOmitted(r)', 'toolFarmland(r)', 'toolExemptPilot(r)', 'toolProfessionalDueDiligence(r)']) {
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
if (versions.releases[0].version !== '0.16.0' || !versions.releases[0].timestamp) {
  throw new Error('Current tracker release or timestamp is missing');
}
const freshness = JSON.parse(read('property/data/data-freshness.json'));
if (freshness.overall_status !== 'passed' || freshness.failures.length) throw new Error('State-data coverage validation failed');
if (!read('property/js/sidemenu.js').includes('genericToggle')) throw new Error('Shared sidebar fallback is missing');
if (!read('property/js/dashboard/tools/assessment-drift.js').includes('toolTimeMachine')) throw new Error('Property Time Machine is missing');
if (!read('property/js/dashboard/tools/assessment-drift.js').includes('tm-dashboard-disclosure')) throw new Error('Collapsed Dashboard Time Machine is missing');
if (!read('property/js/dashboard/tools/professional-due-diligence.js').includes('Tidelands')) throw new Error('Professional due-diligence state signals are missing');
if (!read('property/js/dashboard/tools/professional-due-diligence.js').includes('constraintsHTML')) throw new Error('Flood/wetlands preflight is missing');
if (!read('property/js/dashboard/home/index.js').includes('toolProfessionalWorkflows(r)')) throw new Error('Professional closing workflows are missing from Home');
const markerRegistry = JSON.parse(read('property/data/marker-registry.json'));
if (markerRegistry.summary.total !== 324 || markerRegistry.markers.length !== 324) throw new Error('Marker registry tally changed unexpectedly');
if (!read('property/home.html').includes('marker-intelligence.css') || !read('property/home.html').includes('marker-intelligence.js')) throw new Error('Home marker intelligence is not loaded');
if (!read('property/js/dashboard/home/index.js').includes('data-marker-id')) throw new Error('Home data-marker links are missing');
if (!read('property/marker.html').includes('marker-detail.js')) throw new Error('Universal marker detail page is incomplete');
if (!read('property/data-center.html').includes('marker-intelligence.js')) throw new Error('Data Center marker intelligence is not loaded');
if (!read('property/js/dashboard/home/index.js').includes('compactHomeSection')) throw new Error('Home progressive-disclosure signals are missing');
if (!read('property/css/home/05-marker-experience.css').includes('border-left-width:0!important')) throw new Error('Home report rails returned');
if (!read('property/index.html').includes('/property/pro.html#plans')) throw new Error('Public Pricing link is missing');
if (!read('property/home.html').includes('plan-context.js') || !read('property/dashboard.html').includes('plan-context.js')) throw new Error('Developer View As integration is missing');
const proprietaryBacklog = JSON.parse(read('property/data/proprietary-marker-backlog.json'));
if (proprietaryBacklog.professions.length !== 9 || proprietaryBacklog.professions.some(p => p.markers.length !== 10)) throw new Error('Professional proprietary-marker backlog is incomplete');
const saasPipeline = JSON.parse(read('property/data/saas-platform-pipeline.json'));
if (saasPipeline.items.length < 15) throw new Error('Professional SaaS pipeline is incomplete');
if (!menu.includes('/property/data-center.html')) throw new Error('Data Center navigation link is missing');
if (!read('property/home.html').includes('hm-mobile-intel-overlay') || !read('property/home.html').includes('mobile-app.css')) throw new Error('Home mobile app treatment is missing');
if (!read('property/dashboard.html').includes('mobile-app.css')) throw new Error('Dashboard mobile app treatment is missing');
if (!read('property/js/dashboard/home/index.js').includes("class=\"ai ai-mobile\"")) throw new Error('Home Agent Intel mobile sheet is missing');
if (!menu.includes('db-side-group-toggle') || !menu.includes('db-side-mobile')) throw new Error('Responsive drill-down navigation is missing');
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
if (cardCss.includes('.pr-card-metrics span { border-left:')) throw new Error('Dashboard metric divider returned');

console.log('Verified release 0.16.0: compact Home signals, sourced drill-downs, developer View As, dense Data Center, 90-marker backlog, SaaS pipeline, and prior Watchdog integrations.');
