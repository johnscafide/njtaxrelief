(function(){
'use strict';
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function css(){if(document.querySelector('link[data-wd-semantic-tools-css]'))return;var l=document.createElement('link');l.rel='stylesheet';l.href='/property/css/watchdog-semantic-tools.css';l.dataset.wdSemanticToolsCss='1';document.head.appendChild(l);}
function value(v){if(v==null)return'Not available';if(typeof v==='number')return Number.isInteger(v)?v.toLocaleString():v.toLocaleString(undefined,{maximumFractionDigits:4});if(typeof v==='boolean')return v?'Yes':'No';try{return typeof v==='object'?JSON.stringify(v):String(v);}catch(_e){return String(v);}}
function root(){var host=document.getElementById('wdcx-root');if(host&&host.parentNode)return host.parentNode;return document.getElementById('hm-body')||document.getElementById('db-panel-main')||document.getElementById('ad-app')||document.querySelector('.dw-shell,main');}
function findMarker(data,pin,id){var snaps=Array.isArray(data&&data.snapshots)?data.snapshots:[],s=snaps.find(function(x){return String(x.pams_pin)===String(pin);});return s&&Array.isArray(s.markers)?s.markers.find(function(m){return m.id===id;}):null;}
function remove(){var n=document.getElementById('wd-semantic-alert');if(n)n.remove();}
function render(detail){
  var data=detail&&detail.data||{},summary=data.conflict_summary||{},rows=Array.isArray(summary.markers)?summary.markers:[];if(!rows.length){remove();return;}
  css();var host=root();if(!host)return;remove();var box=document.createElement('section');box.id='wd-semantic-alert';box.className='wd-semantic-tools wd-semantic-alert';
  var details=rows.map(function(r){var m=findMarker(data,r.pams_pin,r.marker_id),obs=m&&Array.isArray(m.observations)?m.observations:[];return '<article class="wd-semantic-conflict-item"><strong>'+esc(r.label||r.marker_id)+'</strong><div class="wd-semantic-canonical">Using <b>'+esc(value(r.canonical_value))+'</b> from '+esc(r.canonical_source||'the canonical governed source')+' · authority '+esc(r.canonical_authority_rank)+'/100</div><div class="wd-semantic-observations">'+obs.map(function(o){return '<div class="wd-semantic-observation"><span>'+esc(o.source||o.observation_kind||'Observation')+'<br><small>'+esc(o.truth_class||'resolved value')+' · authority '+esc(o.authority_rank)+'/100</small></span><b>'+esc(value(o.value))+'</b></div>';}).join('')+'</div></article>';}).join('');
  box.innerHTML='<div class="wd-semantic-alert-icon"><i class="fas fa-code-compare"></i></div><div class="wd-semantic-alert-copy"><span>DATA CHECK</span><h3>'+rows.length+' governed value'+(rows.length===1?' has':'s have')+' competing observations</h3><p>Watchdog selected the canonical value using its published source-authority rules. The alternatives remain attached to the property record and facts hash.</p><div class="wd-semantic-conflicts">'+details+'</div></div><button type="button" class="wd-semantic-alert-toggle" aria-expanded="false">Review</button>';
  var anchor=document.getElementById('wdcx-root');if(anchor&&anchor.parentNode===host)host.insertBefore(box,anchor);else host.insertBefore(box,host.firstChild);var btn=box.querySelector('.wd-semantic-alert-toggle');if(btn)btn.onclick=function(){var open=box.classList.toggle('open');btn.setAttribute('aria-expanded',open?'true':'false');btn.textContent=open?'Hide':'Review';};
}
window.addEventListener('watchdog:section-semantic-context',function(e){render(e.detail||{});});
window.addEventListener('watchdog:page-context',function(e){var d=e.detail||{};if(d.section&&d.section!=='assessment'&&d.section!=='closing'&&d.section!=='compare')remove();});
window.WatchdogSemanticAlerts={render:render,clear:remove};
})();
