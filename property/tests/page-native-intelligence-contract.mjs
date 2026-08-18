#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.cwd());
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const failures=[];
const assert=(condition,message)=>{if(!condition)failures.push(message);};

const dashboardHtml=read('property/dashboard/index.html');
const dashboardBridge=read('property/js/watchdog-dashboard-v2-intelligence.js');
const homeLoader=read('property/js/dashboard/home/home-menu-sync.js');
const homeBridge=read('property/js/watchdog-home-semantic-bridge.js');
const pageContext=read('property/js/watchdog-page-context.js');
const intelligenceContext=read('property/js/watchdog-intelligence-context.js');

assert(dashboardHtml.includes('/property/js/watchdog-dashboard-v2-intelligence.js'), '2027 Dashboard must load its Phase 7 shell bridge.');
assert(dashboardBridge.includes("host.id='db-panel-main'"), 'Dashboard v2 bridge must provide the shared Intelligence mount point.');
assert(dashboardBridge.includes("document.querySelector('.wd4-canvas')"), 'Dashboard v2 bridge must attach to the current wd4 canvas, not a retired shell.');
assert(dashboardBridge.includes("new CustomEvent('watchdog:context-refresh'"), 'Dashboard v2 bridge must refresh governed context after render/rerender.');

for(const asset of [
  '/property/js/watchdog-intelligence-context.js',
  '/property/js/watchdog-semantic-context.js',
  '/property/js/watchdog-page-context.js',
  '/property/js/watchdog-dashboard-context-bridge.js',
  '/property/js/watchdog-context-feedback.js'
]) assert(dashboardBridge.includes("'"+asset+"'"),`Dashboard bridge must load ${asset}.`);

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
assert(!dashboardBridge.includes('?v='), 'Dashboard Intelligence bridge must not use ?v= asset URLs.');
assert(!homeLoader.includes('?v='), 'Property Home Intelligence loader must not use ?v= asset URLs.');

if(failures.length){console.error(JSON.stringify({passed:false,failures},null,2));process.exit(1);}
console.log(JSON.stringify({passed:true,contract:'watchdog-page-native-intelligence-shell-v2',checks:19},null,2));
