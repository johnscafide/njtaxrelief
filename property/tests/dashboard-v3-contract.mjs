import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }
function syntax(path){ const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'}); if(r.status!==0) throw new Error(path+' syntax failed: '+(r.stderr||r.stdout)); }

const page=read('property/dashboard/index.html');
const css=read('property/css/dashboard/watchdog-dashboard-spike.css');
const shellCss=read('property/css/dashboard/watchdog-dashboard-spike-promoted.css');
const appShell=read('property/js/app-shell-2027.js');
const render=read('property/js/dashboard/wd-render.js');
const core=read('property/js/dashboard/wd-core.js');
const spikeLayout=read('property/js/dashboard/wd-dashboard-spike-layout.js');
const visualCore=read('property/js/dashboard/wd-dashboard-visual-core.js');
const autocomplete=read('property/js/nj-address-autocomplete.js');

syntax('property/js/dashboard/wd-render.js');
syntax('property/js/dashboard/wd-core.js');
syntax('property/js/dashboard/wd-dashboard-spike-layout.js');
syntax('property/js/dashboard/wd-dashboard-visual-core.js');
syntax('property/js/nj-address-autocomplete.js');

must(page.includes('<html lang="en" data-ui="spike">'), 'Dashboard must make Spike the canonical UI without query/session switching.');
must(page.includes('watchdog-dashboard-spike.css') && page.includes('watchdog-dashboard-spike-promoted.css'), 'Dashboard must load the promoted Spike styles.');
must(!page.includes('watchdog-dashboard-v3.css') && !page.includes('wd-ui-v3'), 'Dashboard must not load the retired V3 presentation.');
must(!page.includes('wdd-ui-flag') && !page.includes("sessionStorage.setItem(KEY") && !page.includes("searchParams.set('ui'"), 'Temporary V3/Spike chooser must be removed.');
must(page.includes('/property/css/app-shell-2027.css') && page.includes('/property/js/app-shell-2027.js'), 'Dashboard must load the global application shell.');
must(appShell.includes("header.className='wdx-topbar'") && appShell.includes('id="wdx-menu"') && appShell.includes('dashboardNavMarkup()'), 'Global app shell must own the visible dashboard header and hamburger navigation.');
must(!page.includes('wdd-dashboard-nav') && !page.includes('id="wd-menu-trigger"') && !page.includes('id="wd-main-sheet"') && !page.includes('id="wd-public-backdrop"'), 'Dashboard must not render a second local navigation/header system.');
must(!page.includes('/property/css/public-mobile-nav.css') && !page.includes('/property/js/watchdog-universal-menu.js') && !page.includes('/property/js/public-nav.js'), 'Dashboard must not load the retired secondary navigation assets.');
must(!page.includes('class="wdd-sidebar"') && !page.includes('class="wdd-mobile-nav"'), 'Dashboard markup must not ship another persistent sidebar or duplicate mobile navigation.');
must(!spikeLayout.includes('buildSidebar();'), 'Promoted Spike runtime must not create a second dashboard navigation sidebar.');
must(!shellCss.includes('#wd-main-sheet') && !shellCss.includes('#wd-public-backdrop'), 'Promoted Spike shell must not retain styling for the removed secondary menu.');
must(page.indexOf('id="wdd-queue"') < page.indexOf('class="wdd-work"'), 'Action Queue must sit above the portfolio workspace.');
must(render.includes('Good morning') && render.includes('wdd-command'), 'Dashboard header must render greeting and command search.');
must(render.includes('Watchdog Score') && render.includes('Worth Reviewing'), 'KPI row must include approved top-level metrics.');
must(render.includes('wdd-sponsor-signal') && render.includes('Greentree Mortgage') && render.includes('Advertisement'), 'Sixth KPI slot must be the labeled Greentree Mortgage advertisement.');
must(!render.includes('<div class="wdd-account">') && render.includes('wdd-command-voice'), 'Dashboard command row must remove duplicate account/notification chrome and include voice search.');
must(page.includes('/property/js/nj-address-autocomplete.js'), 'Dashboard must load the shared New Jersey address autocomplete runtime.');
must(autocomplete.includes("bindCustom(q('wdd-command-input'),lib)") && autocomplete.includes('WatchdogNJAddressAutocompleteRefresh=boot'), 'Shared address autocomplete must bind the dynamic dashboard command input.');
must(render.includes('wdd-row-actions') && render.includes('copy-address') && render.includes('/property/report?pin='), 'Portfolio ellipsis must expose a multi-action property menu.');
must(shellCss.includes('.wdd-addr>span') && shellCss.includes('white-space:nowrap') && shellCss.includes('.wdd-row-actions'), 'Promoted Spike CSS must keep addresses single-line and style compact row actions.');
must(visualCore.includes("visual='<span class=\"wdd-feed-source") && visualCore.includes("getAttribute('data-ui')!=='spike'"), 'Recent Changes must use semantic icons and must not overwrite the promoted Spike KPI row.');
must(spikeLayout.includes("if (v == null || v === '') return null") && spikeLayout.includes('peer != null && peer > 0'), 'Score gauge must not convert missing peer medians into zero.');
must(core.includes('function townPeerKey(town, county)') && core.includes("trim().toUpperCase() + '|'"), 'Town score fallback must distinguish same-named municipalities by county.');
must(spikeLayout.includes("var WD = w.WD, vals = [], seen = {}") && spikeLayout.includes('seen[townKey]'), 'Portfolio peer benchmark must count each unique town/county once.');
must(shellCss.includes('grid-row:1 / span 2') && shellCss.includes('.wdd-work>.wdd-adaptive'), 'Desktop workspace must keep adaptive cards directly under the portfolio while the right rail spans both rows.');
must(render.includes('Your Portfolio') && render.includes('Recent Changes') && render.includes('Portfolio Analysis'), 'Dashboard workspace must include portfolio, change feed and analysis modules.');
must(render.includes('wdd-case-review') && render.includes('slice(0,3)'), 'Action Queue must render compact top review cards.');
must(render.includes('wdd-rail-map') && render.includes('L.circleMarker'), 'Right rail must render the live portfolio map.');
must(core.includes("from('profiles').select('display_name,full_name,photo_url,avatar_url').eq('id', S.user.id).maybeSingle()") && core.includes('userPhoto: function'), 'Dashboard must load the signed-in user photo from their profile with auth metadata fallbacks.');
must(render.includes('wdd-intro-art is-photo') && render.includes('palette-\'+fallbackVariant') && render.includes('safePhotoUrl'), 'Greeting must safely show the uploaded profile photo or a colorful fallback.');
must(render.includes('data-analysis-tab="assessed"') && render.includes('data-analysis-tab="tax"') && render.includes('function taxDistribution()') && !render.includes('Tax Distribution</button>\' disabled'), 'Both portfolio analysis tabs must be enabled and show distinct data.');
must(shellCss.includes('.wdd-work>.wdd-rail{\n  position:sticky') && shellCss.includes('position:static;max-height:none;overflow:visible'), 'The desktop right rail must stick while scrolling and return to page flow on smaller screens.');
must(shellCss.includes('.wdd-command:focus-within') && shellCss.includes('border-color:transparent') && shellCss.includes('.wdd-signal.is-score .wdd-signal-v{'), 'Search focus must stay free of a focus border and the Watchdog score number must align as one metric.');
must(spikeLayout.includes('buildGauge') && spikeLayout.includes('buildGapChart'), 'Promoted Spike must preserve its score gauge and gap-by-property enhancements.');
must(css.includes('.wdd-command'), 'Spike CSS must style the dashboard command bar.');
must(/@media \(max-width:760px\)/.test(css), 'Promoted Spike must retain its phone/tablet breakpoint.');
must(css.includes('overflow-x:hidden'), 'Promoted Spike must prevent horizontal page drift.');
must(page.includes('/property/manifest.webmanifest'), 'Dashboard must keep a valid manifest link.');

console.log('Dashboard promoted Spike contract passed.');
