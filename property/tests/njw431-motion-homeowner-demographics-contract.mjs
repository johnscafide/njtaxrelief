import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function must(v,m){if(!v)throw new Error(m)}

const refresh=read('property/js/account-refresh-20260925.js');
const refreshCss=read('property/css/account-refresh-20260925.css');
const accountPage=read('property/account/index.html');
const homeownerPage=read('property/account/profile/index.html');
const profile=read('property/js/account-profile.js');
const profileCss=read('property/css/account-profile.css');
const reusable=read('property/partials/account-reusable-profile.html');
const reusableJs=read('property/js/account-reusable-profile.js');
const migration=read('supabase/migrations/20260926015000_njw_431_homeowner_demographics.sql');

must((refresh.match(/kind:'image'/g)||[]).length===10,'Expected 10 static photo backgrounds.');
must((refresh.match(/images\.unsplash\.com/g)||[]).length===10,'Expected 10 Unsplash photo presets.');
must(refresh.includes('id="ac-theme-browser-grid"'),'Single theme browser grid missing.');
must(refresh.includes('renderThemeGrid(panel,kind)'),'Theme category renderer missing.');
must(refresh.includes("node.style.removeProperty('background')"),'Motion theme does not release inline background shorthand.');
must(refresh.includes("node.dataset.motionTheme=theme.key"),'Motion theme data attribute persistence missing.');
must(refreshCss.includes('[data-motion-theme="aurora-motion"]')&&refreshCss.includes('background:'),'Motion theme CSS background missing.');
must(refreshCss.includes('@keyframes acMotionAurora')&&refreshCss.includes('@keyframes acMotionSpectrum'),'Motion keyframes missing.');
must(refreshCss.includes('position:static!important')&&refreshCss.includes('.ac-theme-browser'),'Customizer browser flow reset missing.');
must(refreshCss.includes('box-shadow:none!important'),'Avatar glow removal missing.');
must(refreshCss.includes('linear-gradient(135deg,var(--broker-secondary,#f15a24),var(--broker-primary,#0b8b85)) border-box'),'Brokerage color reversal on hover missing.');

must(profile.includes('await Promise.resolve(window.njptrAccessReady)'),'Homeowner profile does not wait for protected-route auth.');
must(profile.includes('db.auth.onAuthStateChange'),'Homeowner profile does not retry after auth restoration.');
must(profile.includes('Household &amp; demographic context'),'Expanded homeowner demographic panel missing.');
must(profile.includes('household_income_band'),'Household income field missing.');
must(profile.includes('household_composition'),'Household composition field missing.');
must(profile.includes('residence_tenure_band'),'Residence tenure field missing.');
must(profile.includes('primary_residence'),'Primary residence field missing.');
must(profileCss.includes('.acp-demographics'),'Homeowner demographic styling missing.');
must(reusable.includes('Household income, age and other demographics belong in the private homeowner context'),'Reusable/private data boundary copy missing.');
must(reusableJs.includes('account-reusable-profile.html?v=20260926a'),'Reusable homeowner partial cache-bust missing.');

must(migration.includes('add column if not exists household_composition text'),'Household composition column migration missing.');
must(migration.includes('add column if not exists residence_tenure_band text'),'Residence tenure column migration missing.');
must(migration.includes('add column if not exists primary_residence boolean'),'Primary residence column migration missing.');
const intelStart=migration.indexOf('insert into public.intelligence_assumptions');
const intelEnd=migration.indexOf('return query select',intelStart);
const intel=migration.slice(intelStart,intelEnd);
must(!intel.includes("'household_income_band'"),'Income must not be copied to Intelligence assumptions.');
must(!intel.includes("'household_composition'"),'Household composition must not be copied to Intelligence assumptions.');
must(!intel.includes("'residence_tenure_band'"),'Residence tenure must not be copied to Intelligence assumptions.');
must(!intel.includes("'primary_residence'"),'Primary residence flag must not be copied to Intelligence assumptions.');

must(accountPage.includes('account-refresh-20260925.css?v=20260926a'),'Account customizer CSS cache version missing.');
must(accountPage.includes('account-refresh-20260925.js?v=20260926a'),'Account customizer JS cache version missing.');
must(accountPage.includes('account-profile.js?v=20260926a'),'Shared profile JS cache version missing.');
must(homeownerPage.includes('account-profile.js?v=20260926a'),'Homeowner profile JS cache version missing.');
must(homeownerPage.includes('account-profile.css?v=20260926a'),'Homeowner profile CSS cache version missing.');

console.log('NJW-431 motion persistence and homeowner demographics contract passed');
