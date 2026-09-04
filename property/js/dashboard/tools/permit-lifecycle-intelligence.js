/* Watchdog proprietary analysis layered on NJ DCA permit records. */
(function(){
  'use strict';var records=Object.create(null);
  function key(r){return String((r&&(r.pams_pin||r.id))||'property').replace(/[^a-z0-9]/gi,'');}
  function clean(v){return String(v==null?'':v).trim();}
  function norm(v){return clean(v).toUpperCase().replace(/[^A-Z0-9]/g,'');}
  function day(v){var d=new Date(v);return isNaN(d)?null:d;}
  function days(a,b){return Math.max(0,Math.round((b-a)/86400000));}
  function lifecycles(rows){
    var groups=Object.create(null),order=[],unmatchable=0;
    (rows||[]).forEach(function(row){var pn=norm(row&&row.permitno),st=clean(row&&row.status).toUpperCase();if(!pn){if(st==='P')unmatchable+=1;return;}if(!groups[pn]){groups[pn]=[];order.push(pn);}groups[pn].push(row);});
    var out=[];
    order.forEach(function(pn){
      var group=groups[pn],issued=group.filter(function(x){return clean(x.status).toUpperCase()==='P';}),certified=group.filter(function(x){return clean(x.status).toUpperCase()==='C'&&clean(x.certdate);});
      if(!issued.length&&!certified.length)return;
      var permitDates=group.map(function(x){return day(x.permitdate);}).filter(Boolean).sort(function(a,b){return a-b;}),certDates=certified.map(function(x){return day(x.certdate);}).filter(Boolean).sort(function(a,b){return a-b;}),rep=certified[certified.length-1]||issued[issued.length-1]||group[0]||{};
      out.push({permit:permitDates[0]||null,certificate:certDates.length?certDates[certDates.length-1]:null,certified:certified.length>0,verification:certified.length===0&&issued.length>0,type:clean(rep.permittype||rep.permittypedesc||'unknown')});
    });
    return{items:out,unmatchable:unmatchable};
  }
  function calc(payload,r){
    var rows=(payload&&payload.rows)||[],now=new Date(),life=lifecycles(rows),items=life.items,candidates=items.filter(function(x){return x.verification;}),closed=items.filter(function(x){return x.certified&&x.permit&&x.certificate;});
    var cycle=closed.map(function(x){return days(x.permit,x.certificate);}).sort(function(a,b){return a-b;}),median=cycle.length?cycle[Math.floor(cycle.length/2)]:null;
    var ages=candidates.map(function(x){return x.permit?days(x.permit,now):0;}),oldest=ages.length?Math.max.apply(null,ages):0,stale=ages.filter(function(x){return x>365;}).length;
    var since=new Date(now);since.setFullYear(now.getFullYear()-2);var recentItems=items.filter(function(x){return x.permit&&x.permit>=since;}),recent=recentItems.length;
    var types={};recentItems.forEach(function(x){types[x.type||'unknown']=1;});
    var intensity=Math.min(100,Math.round(recent*14+Math.max(0,Object.keys(types).length-1)*8));
    var sale=day(r&&(r._lastSaleDate||r.last_sale_date||r.sale_date));var postSale=sale?items.filter(function(x){return x.permit&&x.permit>sale;}).length:null;
    var verify=candidates.length+life.unmatchable;
    var score=Math.min(100,Math.round(Math.min(45,stale*25)+Math.min(25,verify*8)+Math.min(20,oldest/730*20)+Math.min(10,recent/8*10)));
    return{records:rows.length,lifecycles:items.length,verification:verify,certified:closed.length,stale:stale,oldest:oldest,median:median,recent:recent,intensity:intensity,postSale:postSale,score:score,band:score>=65?'High review':score>=35?'Review':'Routine'};
  }
  function render(r,payload){
    var host=document.getElementById('pli-'+key(r));if(!host)return;var v=calc(payload,r);
    host.innerHTML='<div class="pci-hero"><div><b>'+v.score+'</b><span>/ 100 lifecycle review</span></div><p><strong>'+v.band+'.</strong> '+(v.verification?v.verification+' permit lifecycle'+(v.verification===1?' needs':'s need')+' certificate or municipal verification in the state feed.':'No permit-number lifecycle currently lacks a certificate date in the matching state feed.')+'</p></div><div class="pci-scenarios"><span><small>Matched lifecycles</small><b>'+v.lifecycles+'</b></span><span><small>Verify municipality</small><b>'+v.verification+'</b></span><span><small>Oldest candidate</small><b>'+(v.verification?v.oldest+' days':'—')+'</b></span><span><small>Median permit → cert.</small><b>'+(v.median==null?'—':v.median+' days')+'</b></span><span><small>Improvement intensity</small><b>'+v.intensity+'/100</b></span><span><small>Post-sale permits</small><b>'+(v.postSale==null?'sale date unavailable':v.postSale)+'</b></span></div><div class="tl-fine">Watchdog groups the live NJ DCA Construction Permit feed by permit number before evaluating certificate state. “Verify municipality” means the matching state lifecycle does not currently show a certificate date, or cannot be safely joined by permit number. It is a preliminary review flag, not proof that work remains legally open; municipal records control.</div>';
  }
  function hydrate(r){var host=document.getElementById('pli-'+key(r));if(!host||typeof ddPermitRecords!=='function')return;ddPermitRecords(r).then(function(p){render(r,p);}).catch(function(){host.innerHTML='<div class="tl-note">The live NJ DCA permit feed could not be checked right now.</div>';});}
  function card(r){records[key(r)]=r;setTimeout(function(){hydrate(r);},0);return toolCard('Permit Lifecycle Intelligence','fa-helmet-safety','<p class="tl-p">Turns raw permit rows into a permit-number lifecycle screen: certificate verification, age, completion time and recent activity.</p><div id="pli-'+key(r)+'"><div class="dd-loading"><span class="pl-spin"></span><div><b>Building permit lifecycle</b><small>Checking live NJ DCA records</small></div></div></div>');}
  Object.assign(window,{permitLifecycleMetrics:calc,toolPermitLifecycle:card});
})();
export {};
