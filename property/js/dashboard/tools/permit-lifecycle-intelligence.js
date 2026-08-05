/* Watchdog proprietary analysis layered on NJ DCA permit records. */
(function(){
  'use strict';var records=Object.create(null);
  function key(r){return String((r&&(r.pams_pin||r.id))||'property').replace(/[^a-z0-9]/gi,'');}
  function day(v){var d=new Date(v);return isNaN(d)?null:d;}
  function days(a,b){return Math.max(0,Math.round((b-a)/86400000));}
  function calc(payload){
    var rows=(payload&&payload.rows)||[],now=new Date(),open=rows.filter(function(x){return String(x.status||'').toUpperCase()==='P';}),closed=rows.filter(function(x){return day(x.permitdate)&&day(x.certdate);});
    var cycle=closed.map(function(x){return days(day(x.permitdate),day(x.certdate));}).sort(function(a,b){return a-b;}),median=cycle.length?cycle[Math.floor(cycle.length/2)]:null;
    var ages=open.map(function(x){var d=day(x.permitdate);return d?days(d,now):0;}),oldest=ages.length?Math.max.apply(null,ages):0,stale=ages.filter(function(x){return x>365;}).length;
    var since=new Date(now);since.setFullYear(now.getFullYear()-2);var recent=rows.filter(function(x){var d=day(x.permitdate);return d&&d>=since;}).length;
    var score=Math.min(100,Math.round(Math.min(45,stale*25)+Math.min(25,open.length*8)+Math.min(20,oldest/730*20)+Math.min(10,recent/8*10)));
    return {records:rows.length,open:open.length,stale:stale,oldest:oldest,median:median,recent:recent,score:score,band:score>=65?'High review':score>=35?'Review':'Routine'};
  }
  function render(r,payload){var host=document.getElementById('pli-'+key(r));if(!host)return;var v=calc(payload);host.innerHTML='<div class="pci-hero"><div><b>'+v.score+'</b><span>/ 100 lifecycle review</span></div><p><strong>'+v.band+'.</strong> '+(v.open?v.open+' permit record'+(v.open===1?' remains':'s remain')+' issued without a certificate in the state feed.':'No issued-without-certificate gap appears in the matching state feed.')+'</p></div><div class="pci-scenarios"><span><small>Matched records</small><b>'+v.records+'</b></span><span><small>Open gaps</small><b>'+v.open+'</b></span><span><small>Oldest open</small><b>'+v.oldest+' days</b></span><span><small>Median permit → cert.</small><b>'+(v.median==null?'—':v.median+' days')+'</b></span><span><small>Stale &gt; 1 year</small><b>'+v.stale+'</b></span><span><small>Last 24 months</small><b>'+v.recent+'</b></span></div><div class="tl-fine">Watchdog lifecycle analysis of the live NJ DCA Construction Permit feed, matched by municipality code + block + lot. DCA warns the raw feed may be incomplete or contain errors. A missing certificate in this feed is a review flag, not proof that work remains legally open; verify with the municipal construction office.</div>';}
  function hydrate(r){var host=document.getElementById('pli-'+key(r));if(!host||typeof ddPermitRecords!=='function')return;ddPermitRecords(r).then(function(p){render(r,p);}).catch(function(){host.innerHTML='<div class="tl-note">The live NJ DCA permit feed could not be checked right now.</div>';});}
  function card(r){records[key(r)]=r;setTimeout(function(){hydrate(r);},0);return toolCard('Permit Lifecycle Intelligence','fa-helmet-safety','<p class="tl-p">Turns a raw permit list into a project-lifecycle screen: certificate gaps, age, completion time, stale activity and recent permit frequency.</p><div id="pli-'+key(r)+'"><div class="dd-loading"><span class="pl-spin"></span><div><b>Building permit lifecycle</b><small>Checking live NJ DCA records</small></div></div></div>');}
  Object.assign(window,{permitLifecycleMetrics:calc,toolPermitLifecycle:card});
})();
export {};
