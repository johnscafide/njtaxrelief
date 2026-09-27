#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.cwd());
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const failures=[];
const assert=(condition,message)=>{if(!condition)failures.push(message);};

const dashboardHtml=read('property/dashboard/index.html');
// The 2027 Dashboard rebuild retired the in-page Phase 7 bridge (quarantined as
// zzzwatchdog-dashboard-v2-intelligence.js). Watchdog Intelligence now opens in a
// Dashboard drawer that embeds the governed Intelligence page.
const dashboardIntel=read('property/js/dashboard/wd-intel.js');
const intelligencePage=read('property/intelligence/index.html');
const homeLoader=read('property/js/dashboard/home/home-menu-sync.js');
const homeBridge=read('property/js/watchdog-home-semantic-bridge.js');
const pageContext=read('property/js/watchdog-page-context.js');
const intelligenceContext=read('property/js/watchdog-intelligence-context.js');

assert(dashboardHtml.includes('/property/js/dashboard/wd-intel.js') && dashboardHtml.includes('id="wdd-drawer"'), '2027 Dashboard must load its Watchdog Intelligence drawer.');
assert(dashboardIntel.includes('src="/property/intelligence/?embed=1"'), 'Dashboard drawer must embed the governed Intelligence page.');
for(const asset of ['/property/js/access-guard.js','/property/js/watchdog-contextual-analyst.js','/property/js/watchdog-intelligence-voice.js']) assert(intelligencePage.includes(asset),`Embedded Intelligence page must load ${asset}.`);

for(const asset of [
  '/property/js/watchdog-intelligence-context.js',
  '/property/js/watchdog-semantic-context.js',
  '/property/js/watchdog-page-context.js',
  '/property/js/watchdog-home-semantic-bridge.js',
  '/property/js/watchdog-context-feedback.js'
]) assert(homeLoader.includes("'"+asset+"'"),`Property Home must load ${asset}.`);

assert(homeBridge.includes("new CustomEvent('watchdog:property-context'"), 'Property Home must publish the selected property into shared page context.');
assert(pageContext.includes("window.addEventListener('watchdog:property-context'"), 'Shared page context must consume Property Home property-context events.');
assert(intelligenceContext.includes("if(s==='dashboard')return document.getElementById('db-panel-main')"), 'Shared renderer must use the Dashboard bridge mount contract.');
const homeIntelligenceLoader=(homeLoader.match(/function loadIntelligenceRuntime\(\)\{[^\n]*/)||[''])[0];
assert(homeIntelligenceLoader && !homeIntelligenceLoader.includes('?v='), 'Property Home Intelligence loader must not use ?v= asset URLs.');

if(failures.length){console.error(JSON.stringify({passed:false,failures},null,2));process.exit(1);}
console.log(JSON.stringify({passed:true,contract:'watchdog-page-native-intelligence-shell-v2',checks:19},null,2));
