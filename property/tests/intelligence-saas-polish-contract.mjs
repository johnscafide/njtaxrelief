import fs from 'node:fs';
import vm from 'node:vm';

const files={daily:'property/js/intelligence-daily.js',today:'property/js/intelligence-today.js',dailyCss:'property/css/intelligence-daily.css',todayCss:'property/css/intelligence-today.css'};
const read=k=>fs.readFileSync(files[k],'utf8');
const daily=read('daily'),today=read('today'),dailyCss=read('dailyCss'),todayCss=read('todayCss');
const expect=(ok,msg)=>{if(!ok)throw new Error(msg)};

new vm.Script(daily,{filename:files.daily});
new vm.Script(today,{filename:files.today});

expect(daily.includes("[limitR,scopeR,jobR,digestR].find(r=>r.error)"),'Daily Intelligence must distinguish failed queries from empty datasets.');
expect(daily.includes('Daily Intelligence could not refresh.'),'Daily Intelligence needs a visible refresh failure state.');
expect(daily.includes('id="wdi-retry"'),'Daily Intelligence failure state needs an explicit retry action.');
expect(daily.includes("activeJobCount()?20000:90000"),'Daily Intelligence must poll adaptively instead of re-querying continuously at one aggressive cadence.');
expect(!daily.includes('setInterval('),'Daily Intelligence must not retain fixed high-frequency polling.');
expect(daily.includes("document.addEventListener('visibilitychange'"),'Daily Intelligence must refresh after the user returns to the tab.');
expect(daily.includes("aria-busy"),'Daily Intelligence must expose refresh state to assistive technology.');
expect(daily.includes('Your saved schedules and server-side jobs are not changed by this page error.'),'Failure copy must distinguish page availability from server-side job state.');
expect(dailyCss.includes('.wdi-error'),'Daily Intelligence needs styled recovery UI.');
expect(dailyCss.includes('prefers-reduced-motion'),'Daily Intelligence must respect reduced-motion preferences.');

expect(today.includes("[digestR,intentR,eventR].find(r=>r.error)"),'Today must distinguish failed governed queries from an empty inbox.');
expect(today.includes('Watchdog is not treating a failed request as an empty inbox.'),'Today must fail honestly rather than converting request errors into zero items.');
expect(today.includes('id="wdi-today-retry"'),'Today failure state needs an explicit retry action.');
expect(today.includes('That Today action was not saved. Your queue has not been changed.'),'Failed Today actions must give visible non-destructive feedback.');
expect(today.includes("if(r.error)throw r.error;events=r.data||[]"),'Today event refresh must not silently erase queue state after a failed query.');
expect(todayCss.includes('.wdi-today-load-error'),'Today needs a responsive recovery state.');

for(const [key,content] of Object.entries({daily,today,dailyCss,todayCss}))expect(!content.includes('?v='),`${files[key]} must not introduce ?v= asset version parameters.`);
console.log('Intelligence SaaS loading, polling, retry, reduced-motion and fail-honest state contracts passed.');
