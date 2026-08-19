import fs from 'node:fs';
import vm from 'node:vm';

const files={
  runtime:'property/js/watchdog-intelligence-density.js',
  css:'property/css/watchdog-intelligence-density.css',
  dashboard:'property/js/watchdog-dashboard-v2-intelligence.js',
  home:'property/js/dashboard/home/home-menu-sync.js',
  homeCore:'property/js/dashboard/home/index.js',
  homePage:'property/home/index.html'
};
for(const path of Object.values(files)){
  if(!fs.existsSync(path))throw new Error(`${path} must exist`);
}
const runtime=fs.readFileSync(files.runtime,'utf8');
const css=fs.readFileSync(files.css,'utf8');
const dashboard=fs.readFileSync(files.dashboard,'utf8');
const home=fs.readFileSync(files.home,'utf8');
const homeCore=fs.readFileSync(files.homeCore,'utf8');
const homePage=fs.readFileSync(files.homePage,'utf8');
new vm.Script(runtime,{filename:files.runtime});
new vm.Script(homeCore,{filename:files.homeCore});

function expect(ok,msg){if(!ok)throw new Error(msg)}
expect(dashboard.includes('/property/js/watchdog-intelligence-density.js'),'Dashboard must load the density runtime.');
expect(home.includes('/property/js/watchdog-intelligence-density.js'),'Property Home must load the density runtime.');
expect(runtime.includes("(?:intelligence|daily-intelligence|data-center|scan)"),'Immersive Intelligence-first routes must remain exempt from compact mode.');
expect(runtime.includes("item.classList.toggle('wd-density-extra',i>0)"),'Supporting Context Intelligence must rank one finding above the rest by default.');
expect(runtime.includes("Review all "+"'"),'Context Intelligence must keep the full queue one action away.');
expect(runtime.includes('WATCHDOG DECISION BRIEF'),'Property Home must expose a concise decision brief.');
expect(runtime.includes('slice(0,3)'),'The compact brief must cap supporting reasons at three.');
expect(runtime.includes('Next:</b>'),'The compact brief must expose one next-action statement.');
expect(runtime.includes('Inspect reasoning'),'Full reasoning must remain available through progressive disclosure.');
expect(runtime.includes('if(existing){setAnalystExpanded'),'Density enhancement must be idempotent across dynamic Analyst renders.');
expect(css.includes('.wdcx-root.wdcx-compact'),'Compact Context Intelligence styling must exist.');
expect(css.includes('.wdai-compact-summary'),'Compact Property Home decision-brief styling must exist.');
expect(css.includes('-webkit-line-clamp:2'),'Supporting recommendation prose must be visually bounded.');
expect(css.includes('@media(max-width:760px)'),'Compact Intelligence must have a mobile layout.');
expect(homeCore.includes("import('../tools/' + name + '.js')"),'Property Home lazy tools must use stable unversioned module URLs.');
expect(!homeCore.includes(".js?v="),'Property Home core must not restore query-versioned tool imports.');
expect(homeCore.includes('Watchdog Analyst Intel'),'Legacy Property Home fallback must use Watchdog Analyst Intel naming.');
expect(!homeCore.includes('>Agent Intel<'),'Legacy visible Agent Intel labels must not return.');
expect(homePage.includes('aria-label="Close Watchdog Analyst Intel"'),'Mobile Analyst close control must use current product naming.');
for(const [name,content] of Object.entries({runtime,css,dashboard,home,homeCore,homePage}))expect(!content.includes('?v='),`${name} must not introduce ?v= asset URLs.`);
console.log('Intelligence density contract passed: compact supporting surfaces, <=3 reasons, one next action, progressive disclosure, immersive-route exemption, stable Home assets, Analyst naming, idempotency, mobile, no ?v=.');
