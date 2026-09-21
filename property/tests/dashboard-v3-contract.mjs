import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }
function syntax(path){ const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'}); if(r.status!==0) throw new Error(path+' syntax failed: '+(r.stderr||r.stdout)); }

const page=read('property/dashboard/index.html');
const css=read('property/css/dashboard/watchdog-dashboard-spike.css');
const shellCss=read('property/css/dashboard/watchdog-dashboard-spike-promoted.css');
const render=read('property/js/dashboard/wd-render.js');
const spikeLayout=read('property/js/dashboard/wd-dashboard-spike-layout.js');

syntax('property/js/dashboard/wd-render.js');
syntax('property/js/dashboard/wd-dashboard-spike-layout.js');

must(page.includes('<html lang="en" data-ui="spike">'), 'Dashboard must make Spike the canonical UI without query/session switching.');
must(page.includes('watchdog-dashboard-spike.css') && page.includes('watchdog-dashboard-spike-promoted.css'), 'Dashboard must load the promoted Spike styles.');
must(!page.includes('watchdog-dashboard-v3.css') && !page.includes('wd-ui-v3'), 'Dashboard must not load the retired V3 presentation.');
must(!page.includes('wdd-ui-flag') && !page.includes("sessionStorage.setItem(KEY") && !page.includes("searchParams.set('ui'"), 'Temporary V3/Spike chooser must be removed.');
must(page.includes('class="wd-nav wdd-dashboard-nav"') && page.includes('id="wd-menu-trigger"') && page.includes('id="wd-main-sheet"'), 'Dashboard must use the shared Watchdog header and left pop-out menu.');
must(page.includes('/property/css/public-mobile-nav.css') && page.includes('/property/js/watchdog-universal-menu.js') && page.includes('/property/js/public-nav.js'), 'Dashboard must reuse the canonical shared navigation assets.');
must(!page.includes('class="wdd-sidebar"') && !page.includes('class="wdd-mobile-nav"'), 'Dashboard markup must not ship a persistent sidebar or duplicate mobile navigation.');
must(!spikeLayout.includes('buildSidebar();'), 'Promoted Spike runtime must not create a second dashboard navigation sidebar.');
must(shellCss.includes('#wd-main-sheet') && shellCss.includes('z-index:9500') && shellCss.includes('#wd-public-backdrop'), 'Shared menu layer must stay above the sticky dashboard header.');
must(page.indexOf('id="wdd-queue"') < page.indexOf('class="wdd-work"'), 'Action Queue must sit above the portfolio workspace.');
must(render.includes('Good morning') && render.includes('wdd-command'), 'Dashboard header must render greeting and command search.');
must(render.includes('Watchdog Score') && render.includes('Worth Reviewing'), 'KPI row must include approved top-level metrics.');
must(render.includes('Your Portfolio') && render.includes('Recent Changes') && render.includes('Portfolio Analysis'), 'Dashboard workspace must include portfolio, change feed and analysis modules.');
must(render.includes('wdd-case-review') && render.includes('slice(0,3)'), 'Action Queue must render compact top review cards.');
must(render.includes('wdd-rail-map') && render.includes('L.circleMarker'), 'Right rail must render the live portfolio map.');
must(spikeLayout.includes('buildGauge') && spikeLayout.includes('buildGapChart'), 'Promoted Spike must preserve its score gauge and gap-by-property enhancements.');
must(css.includes('.wdd-dashboard-nav') && css.includes('.wdd-command'), 'Spike CSS must style the shared header and app command bar.');
must(/@media \(max-width:760px\)/.test(css), 'Promoted Spike must retain its phone/tablet breakpoint.');
must(css.includes('overflow-x:hidden'), 'Promoted Spike must prevent horizontal page drift.');
must(page.includes('/property/manifest.webmanifest'), 'Dashboard must keep a valid manifest link.');

console.log('Dashboard promoted Spike contract passed.');
