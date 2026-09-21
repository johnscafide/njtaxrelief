import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }
function syntax(path){ const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'}); if(r.status!==0) throw new Error(path+' syntax failed: '+(r.stderr||r.stdout)); }

const page=read('property/dashboard/index.html');
const css=read('property/css/dashboard/watchdog-dashboard-v3.css');
const render=read('property/js/dashboard/wd-render.js');

syntax('property/js/dashboard/wd-render.js');

must(page.includes('watchdog-dashboard-v3.css'), 'Dashboard must load the V3 stylesheet.');
must(page.includes('class="wdd-sidebar"') && page.includes('class="wdd-mobile-nav"'), 'Dashboard must ship desktop and mobile app navigation.');
must(page.indexOf('id="wdd-queue"') < page.indexOf('class="wdd-work"'), 'Action Queue must sit above the portfolio workspace.');
must(render.includes('Good morning') && render.includes('wdd-command'), 'V3 header must render greeting and command search.');
must(render.includes('Watchdog Score') && render.includes('Worth Reviewing'), 'KPI row must include approved top-level metrics.');
must(render.includes('Your Portfolio') && render.includes('Recent Changes') && render.includes('Portfolio Analysis'), 'V3 workspace must include portfolio, change feed and analysis modules.');
must(render.includes('wdd-case-review') && render.includes('slice(0,3)'), 'Action Queue must render compact top review cards.');
must(render.includes('wdd-rail-map') && render.includes('L.circleMarker'), 'Right rail must render the live portfolio map.');
must(css.includes('grid-template-columns:var(--w3-sidebar)') && css.includes('.wdd-mobile-nav'), 'CSS must implement desktop app shell and mobile bottom nav.');
must(/@media\(max-width:680px\)/.test(css), 'Dashboard V3 must have a phone breakpoint.');
must(css.includes('overflow-x:hidden'), 'Dashboard V3 must prevent mobile horizontal page drift.');

console.log('Dashboard V3 contract passed.');
