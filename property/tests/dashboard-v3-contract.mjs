import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

// Dashboard board contract. The file keeps its historical name because the
// Vercel build calls it as test:dashboard-v3; it now guards the board design:
// the beagle loader, one stylesheet, one renderer, and the shared app shell.

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }
function syntax(path){ const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'}); if(r.status!==0) throw new Error(path+' syntax failed: '+(r.stderr||r.stdout)); }

const page=read('property/dashboard/index.html');
const css=read('property/css/dashboard/watchdog-dashboard-board.css');
const appShell=read('property/js/app-shell-2027.js');
const render=read('property/js/dashboard/wd-render.js');
const core=read('property/js/dashboard/wd-core.js');
const loader=read('property/js/dashboard/wd-beagle-loader.js');
const autocomplete=read('property/js/nj-address-autocomplete.js');

syntax('property/js/dashboard/wd-render.js');
syntax('property/js/dashboard/wd-core.js');
syntax('property/js/dashboard/wd-beagle-loader.js');
syntax('property/js/nj-address-autocomplete.js');

const scripts=[...page.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)].map(m=>({src:m[1].split('?')[0],tag:m[0]}));
const styles=[...page.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g)].map(m=>m[1].split('?')[0]);
const indexOf=src=>scripts.findIndex(s=>s.src===src);

// Page shell
must(page.includes('<html lang="en" data-ui="board">'), 'Dashboard must render the board presentation.');
must(page.includes('<meta name="robots" content="noindex, nofollow">'), 'The private dashboard must stay out of search indexes.');
must(page.includes('<link rel="canonical" href="https://www.watchdogindex.com/dashboard">'), 'Dashboard canonical must use the clean WatchdogIndex URL.');
must(page.includes('/property/manifest.webmanifest'), 'Dashboard must keep a valid manifest link.');
must(page.includes('/property/css/app-shell-2027.css') && page.includes('/property/js/app-shell-2027.js'), 'Dashboard must load the global application shell.');
must(appShell.includes("header.className='wdx-topbar'") && appShell.includes('id="wdx-menu"') && appShell.includes('ensureUniversalMenu()') && !appShell.includes('dashboardNavMarkup'), 'Global app shell must own the visible dashboard header and hamburger navigation.');
must(!page.includes('wdd-dashboard-nav') && !page.includes('id="wd-menu-trigger"') && !page.includes('id="wd-main-sheet"') && !page.includes('id="wd-public-backdrop"'), 'Dashboard must not render a second local navigation/header system.');
must(!page.includes('/property/css/public-mobile-nav.css') && !page.includes('/property/js/watchdog-universal-menu.js') && !page.includes('/property/js/public-nav.js'), 'Dashboard must not load the retired secondary navigation assets.');
must(!page.includes('class="wdd-sidebar"') && !page.includes('class="wdd-mobile-nav"'), 'Dashboard markup must not ship another persistent sidebar or duplicate mobile navigation.');

// One stylesheet, one renderer
const dashboardStyles=styles.filter(h=>h.includes('/property/css/dashboard/'));
must(dashboardStyles.length===1 && dashboardStyles[0]==='/property/css/dashboard/watchdog-dashboard-board.css', 'Dashboard must load exactly one dashboard stylesheet (watchdog-dashboard-board.css); found: '+dashboardStyles.join(', '));
must(!/watchdog-dashboard-(spike|v3|hero-2027|workspace|professional|hotfix|followup|visuals)/.test(page), 'Dashboard must not load retired presentation layers.');
must(!/wd-dashboard-(spike-layout|workspace|polish|followup|visual-core|news-visuals)\.js/.test(page) && !/zzzdashboard/.test(page), 'Dashboard must not load retired DOM-patching scripts.');
const coreIdx=indexOf('/property/js/dashboard/wd-core.js'), renderIdx=indexOf('/property/js/dashboard/wd-render.js'), loaderIdx=indexOf('/property/js/dashboard/wd-beagle-loader.js');
must(coreIdx>=0 && renderIdx>coreIdx, 'Renderer must load after the data core.');
must(loaderIdx>=0 && loaderIdx<coreIdx && !/\bdefer\b|\basync\b/.test(scripts[loaderIdx].tag), 'Beagle loader must run immediately, before the deferred data core.');
must(page.indexOf('id="wdd-boot"')<page.indexOf('wd-beagle-loader.js'), 'Loader markup must exist before the loader script runs.');
must(['wdd-boot-msg','wdd-boot-retry','wdd-app','wdd-pull','wdd-drawer','wdd-toast'].every(id=>page.includes('id="'+id+'"')), 'Dashboard must keep the element ids wd-core.js and wd-intel.js drive.');

// Beagle loader
const sprite='property/assets/beagle/watchdog-beagle-frames.webp';
must(fs.existsSync(sprite) && fs.readFileSync(sprite).subarray(8,12).toString()==='WEBP', 'Beagle sprite strip must exist as WebP.');
must(page.includes('rel="preload" as="image" href="/property/assets/beagle/watchdog-beagle-frames.webp"'), 'Dashboard must preload the beagle sprite strip.');
must(css.includes("url('/property/assets/beagle/watchdog-beagle-frames.webp') 0 0/400% 100%") && ['"b"','"leap"','"front"'].every(f=>css.includes('[data-frame='+f+']')), 'Loader CSS must map the four aligned sprite frames.');
must(loader.includes("addEventListener('wd:ready'") && loader.includes('boot.hidden = false'), 'Loader must keep the scene up for the finale after wd-core announces the dashboard.');
must(loader.includes('prefers-reduced-motion') && loader.includes("if (reduced() || d.hidden) { hide(); return; }"), 'Reduced motion and background tabs must skip the finale.');
must(loader.includes("w.setTimeout(hide, 4200)"), 'Loader must never hold the dashboard behind the animation.');
must(loader.includes("attributeFilter: ['hidden']") && loader.includes("setState('failed')"), 'Loader must switch to a still failure pose when wd-core reports an error.');
must(page.includes('id="wdd-boot-treat"') && page.includes('id="wdd-boot-dog"'), 'Loader scene must include the beagle and her treat.');
must(/@media \(prefers-reduced-motion:reduce\)/.test(css), 'Board CSS must respect reduced motion.');

// Renderer
must(render.includes("return greetingWord()+', '+name") && render.includes("h<12?'Good morning'"), 'Dashboard must greet the member by time of day.');
must(['wdd-card--score','wdd-card--changes','wdd-card--status','wdd-card--value'].every(c=>render.includes(c)), 'Dashboard must render the four summary cards.');
must(render.includes("'Watchdog Score:'") || render.includes('Watchdog Score:'), 'Score card must be labeled with the Watchdog Score.');
must(render.includes('The Watchdog Score, powered by the ROBUST Framework.') && render.includes("route('/data-methodology')"), 'Score card must link to the ROBUST methodology.');
must(render.includes('wdd-peer-line') && render.includes('peer!=null&&shown.length'), 'Town median line must only render when a peer median exists.');
must(render.includes('Your properties') && render.includes('Property details') && render.includes('data-select-pin'), 'Dashboard must render the property list with a linked details card.');
must(render.includes('wdd-cal-day') && render.includes('isoWeek') && render.includes('Recent activity'), 'Side column must render the calendar and recent activity.');
must(render.includes('APPEAL_ALT_COUNTIES') && render.includes("'BURLINGTON','GLOUCESTER','MONMOUTH'") && !/days (left|remaining)/i.test(render), 'Appeal note must follow appeal-deadline-rules.json: county-aware baseline, no countdown.');
must(render.includes('verify your deadline on the assessment notice'), 'Appeal baselines must tell members to verify against their notice.');
must(render.includes('wdd-sponsor') && render.includes('Greentree Mortgage') && render.includes('Advertisement') && render.includes('rel="noopener sponsored"'), 'The Greentree Mortgage placement must stay labeled as an advertisement.');
must(render.includes('Compare plans') && render.includes('WD.isPro()'), 'Free members must see the plan comparison link.');
must(render.includes('Decision-support data.'), 'Dashboard must keep the decision-support disclaimer.');
must(render.includes('function route(path)') && render.includes('routePrefix') && !/['"]\/property\/(home|report|pulse|pro|dashboard)/.test(render), 'Dashboard links must use clean WatchdogIndex routes via the runtime route prefix.');
must(render.includes('id="wdd-command-input"') && render.includes('data-act="voice-search"') && render.includes("(ev.metaKey||ev.ctrlKey)&&String(ev.key).toLowerCase()==='k'"), 'Dashboard must keep address search with voice input and the ⌘K shortcut.');
must(render.includes("slot.querySelector('#wdd-command')"), 'Search box must be built once so repaints never wipe typed text.');
must(page.includes('/property/js/nj-address-autocomplete.js') && autocomplete.includes("bindCustom(q('wdd-command-input'),lib)") && autocomplete.includes('WatchdogNJAddressAutocompleteRefresh=boot'), 'Shared address autocomplete must bind the dashboard search input.');
must(render.includes('function exportCsv()') && render.includes('data-act="export"'), 'Dashboard must keep the CSV export.');
must(render.includes('el.__wddHTML===html'), 'Regions must repaint only when their markup changes.');

// Data core invariants the board relies on
must(core.includes('function townPeerKey(town, county)') && core.includes("trim().toUpperCase() + '|'"), 'Town score fallback must distinguish same-named municipalities by county.');
must(core.includes('function verdict(score)') && core.includes('verdict: verdict') && render.includes('WD.verdict(avg)'), 'Score card must use the shared score verdict.');
must(core.includes("from('profiles').select('display_name,full_name,photo_url,avatar_url').eq('id', S.user.id).maybeSingle()"), 'Dashboard must load the signed-in member profile for the greeting.');

// Layout safety
must(css.includes('overflow-x:clip') && css.includes('grid-template-columns:minmax(0,1fr)'), 'Board must prevent horizontal page drift.');
must(/@media \(max-width:760px\)/.test(css) && /@media \(max-width:420px\)/.test(css), 'Board must keep its phone breakpoints.');
must(!css.includes('border-left'), 'Board CSS must not use border-left accents.');

console.log('Dashboard board contract passed.');
