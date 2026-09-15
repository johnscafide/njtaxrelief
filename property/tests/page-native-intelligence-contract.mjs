#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.cwd());
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const failures=[];
const assert=(condition,message)=>{if(!condition)failures.push(message);};

const dashboardHtml=read('property/dashboard/index.html');
const dashboardIntel=read('property/js/dashboard/wd-intel.js');
const dashboardCore=read('property/js/dashboard/wd-core.js');
const homeLoader=read('property/js/dashboard/home/home-menu-sync.js');
const homeBridge=read('property/js/watchdog-home-semantic-bridge.js');
const pageContext=read('property/js/watchdog-page-context.js');

// The consolidated 2027 Dashboard uses a page-native Intelligence drawer
// rather than the retired watchdog-dashboard-v2-intelligence shell bridge.
assert(!dashboardHtml.includes('/property/js/watchdog-dashboard-v2-intelligence.js'), '2027 Dashboard must not reintroduce the retired Phase 7 shell bridge.');
assert(dashboardHtml.includes('id="wdd-pull"') && dashboardHtml.includes('id="wdd-drawer"'), '2027 Dashboard must expose its native Watchdog Intelligence pull-in and drawer mount.');
assert(dashboardHtml.includes('/property/js/dashboard/wd-intel.js'), '2027 Dashboard must load its current page-native Intelligence drawer runtime.');
assert(dashboardCore.includes("H.el('wdd-pull')") && dashboardCore.includes('pull.hidden = false'), 'Dashboard must reveal Intelligence only after the authenticated workspace is ready.');
assert(dashboardIntel.includes("src=\"/property/intelligence/?embed=1\""), 'Dashboard drawer must embed the canonical Watchdog Intelligence surface.');
assert(dashboardIntel.includes('role="dialog"') && dashboardIntel.includes('aria-modal="true"'), 'Dashboard Intelligence drawer must remain an accessible modal dialog.');
assert(dashboardIntel.includes("if(ev.key==='Escape')close()"), 'Dashboard Intelligence drawer must remain keyboard dismissible.');
assert(dashboardIntel.includes("w.WatchdogIntelligenceDrawer={open:open,close:close}"), 'Dashboard must expose the current drawer controller contract.');

for(const asset of [
  '/property/js/watchdog-intelligence-context.js',
  '/property/js/watchdog-semantic-context.js',
  '/property/js/watchdog-page-context.js',
  '/property/js/watchdog-home-semantic-bridge.js',
  '/property/js/watchdog-context-feedback.js'
]) {
  assert(homeLoader.includes("'"+asset+"'"),`Property Home must load ${asset}.`);
  assert(!homeLoader.includes(asset+'?v='),`Property Home Intelligence boundary asset must remain canonical and unversioned: ${asset}.`);
}

assert(homeBridge.includes("new CustomEvent('watchdog:property-context'"), 'Property Home must publish the selected property into shared page context.');
assert(pageContext.includes("window.addEventListener('watchdog:property-context'"), 'Shared page context must consume Property Home property-context events.');

if(failures.length){console.error(JSON.stringify({passed:false,failures},null,2));process.exit(1);}
console.log(JSON.stringify({passed:true,contract:'watchdog-page-native-intelligence-shell-v3',checks:20},null,2));
