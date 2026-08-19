import fs from 'node:fs';
import vm from 'node:vm';

const paths={
  today:'property/js/watchdog-today-nav.js',
  css:'property/css/watchdog-today-nav.css',
  dashboard:'property/dashboard/index.html',
  home:'property/js/dashboard/home/home-menu-sync.js',
  appShell:'property/js/app-shell-2027.js',
  daily:'property/intelligence/daily/index.html',
  partial:'property/partials/sidemenu.html',
  analytics:'property/js/product-analytics.js'
};
for(const p of Object.values(paths))if(!fs.existsSync(p))throw new Error(`${p} must exist`);
const read=p=>fs.readFileSync(p,'utf8');
const today=read(paths.today),css=read(paths.css),dashboard=read(paths.dashboard),home=read(paths.home),appShell=read(paths.appShell),daily=read(paths.daily),partial=read(paths.partial),analytics=read(paths.analytics);
const expect=(ok,msg)=>{if(!ok)throw new Error(msg)};
new vm.Script(today,{filename:paths.today});

expect(today.includes('RANK.pro_plus'),'Today return cue must remain gated at Pro+ or higher.');
expect(today.includes("from('intelligence_daily_digests')"),'Today cue must derive work from governed Daily Intelligence digests.');
expect(today.includes("from('intelligence_today_events')"),'Today cue must respect persisted triage state.');
expect(today.includes("action:'open_today'"),'Today navigation choice must be measurable as a categorical action.');
expect(today.includes("surface:'navigation'"),'Today navigation analytics must remain surface-level.');
expect(today.includes("status:state.open>0?'open_items':'caught_up'"),'Today navigation analytics must record only coarse queue state.');
const tracking=today.slice(today.indexOf('function trackReturn'),today.indexOf('function mount'));
for(const forbidden of ['pams_pin','digest_id','model_key','address','user_id','recommended_queue'])expect(!tracking.includes(forbidden),`Today navigation analytics must not include ${forbidden}.`);
expect(today.includes("limit(20)"),'Today cue must keep digest reads bounded.');
expect(today.includes("limit(500)"),'Today cue must keep event reads bounded.');
expect(today.includes("document.addEventListener('visibilitychange'"),'Today cue must refresh when the user returns to the app.');
expect(today.includes("window.addEventListener('focus'"),'Today cue must refresh on focused return sessions.');
expect(css.includes('.wd-today-badge'),'Today cue must remain a compact badge, not a large Intelligence panel.');

const context={window:{},document:{readyState:'loading',addEventListener(){}},console,Date,Map,Set,Promise,Number,String,Array,Math,URL,URLSearchParams};
vm.createContext(context);
new vm.Script(today,{filename:paths.today}).runInContext(context);
const openCount=context.window.WatchdogTodayNav.openCount;
const digest={id:'d1',model_key:'m1',recommended_queue:[{pams_pin:'p1'},{pams_pin:'p2'}]};
expect(openCount([digest],[])===2,'Two untouched governed queue items must produce two open Today items.');
expect(openCount([digest],[{digest_id:'d1',model_key:'m1',pams_pin:'p1',action:'reviewed'}])===1,'Reviewed item must leave the open Today count.');
expect(openCount([digest],[{digest_id:'d1',model_key:'m1',pams_pin:'p1',action:'snoozed',snooze_until:new Date(Date.now()+3600000).toISOString()}])===1,'Future-snoozed item must remain deferred from the open count.');
expect(openCount([digest],[{digest_id:'d1',model_key:'m1',pams_pin:'p1',action:'reopened'}])===2,'Reopened item must return to the open Today count.');

expect(dashboard.includes('/property/js/product-analytics.js'),'Dashboard must participate in first-party product analytics.');
expect(dashboard.includes('/property/js/watchdog-today-nav.js'),'Dashboard must load the Today return cue.');
expect(home.includes('/property/js/watchdog-today-nav.js'),'Property Home must load the Today return cue.');
expect(appShell.includes('/property/js/watchdog-today-nav.js'),'Modern secondary app shell must load the Today return cue.');
expect(daily.includes('data-access-require="pro_plus"'),'Daily Intelligence route must match the Pro+ Today entitlement boundary.');
expect(!partial.includes('>Agent Intel<'),'Shared navigation must not restore legacy Agent Intel naming.');
expect(partial.includes('Watchdog Analyst'),'Shared compatibility navigation must use current Analyst naming.');
expect(analytics.includes("'daily_intelligence'"),'Product analytics must recognize Daily Intelligence as its own surface.');

for(const [name,content] of Object.entries({today,css,dashboard,home,appShell,daily,partial,analytics}))expect(!content.includes('?v='),`${name} must not introduce ?v= asset URLs.`);
console.log('Intelligence retention integration contract passed: entitlement-aware Today cue, bounded governed reads, deterministic triage semantics, privacy-safe return analytics, cross-shell loading, Pro+ route, current Analyst naming, no ?v=.');
