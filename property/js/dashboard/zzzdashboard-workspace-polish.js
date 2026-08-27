/* Watchdog Dashboard workspace polish: scattered navigation, reliable card scrolling, widget switches, Add Property */
(function(){
'use strict';
if(window.__WD_WORKSPACE_POLISH__) return;
window.__WD_WORKSPACE_POLISH__ = true;

var SUPABASE_URL='https://uvkvaxljhhngydvlrzom.supabase.co';
var SUPABASE_KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
var NJ_GEOCODE='https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
var NJ_PARCEL='https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
var FIELDS=['PAMS_PIN','COUNTY','MUN_NAME','PROP_LOC','PCLBLOCK','PCLLOT','PCLQCODE','PROP_CLASS','BLDG_DESC','CALC_ACRE','YR_CONSTR','DWELL','LAND_VAL','IMPRVT_VAL','NET_VALUE','LAST_YR_TX','SALE_PRICE','DEED_DATE','ZIP5'].join(',');
var root=document.getElementById('wd4-root');
if(!root||!window.supabase) return;
var db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}});
var queued=false,searching=false,candidate=null;

function esc(v){return String(v==null?'':v).replace(/[&<>\"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]});}
function num(v){var n=Number(v);return Number.isFinite(n)?n:null;}
function money(v){var n=num(v);if(n==null)return'—';return'$'+Math.round(n).toLocaleString();}
function validNj(lat,lon){return lat>=38.8&&lat<=41.4&&lon>=-75.7&&lon<=-73.8;}
function median(list){if(!list.length)return null;var a=list.slice().sort(function(x,y){return x-y;}),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function timeoutFetch(url,ms){var ctl=typeof AbortController!=='undefined'?new AbortController():null,t=ctl?setTimeout(function(){ctl.abort();},ms||12000):null;return fetch(url,{signal:ctl?ctl.signal:undefined}).then(function(r){if(t)clearTimeout(t);if(!r.ok)throw new Error('http '+r.status);return r.json();},function(err){if(t)clearTimeout(t);throw err;});}
function setStatus(text,tone){var n=document.getElementById('wd7-add-status');if(!n)return;n.textContent=text||'';n.className='wd7-add-status '+(tone||'');}

function scatterCards(){
  var g=document.getElementById('wd4-grid');if(!g)return;
  var placements=[
    ['property-home-link','map'],
    ['town-compare-link','monitored'],
    ['fairness-link','scoretrend'],
    ['marketing','opportunities'],
    ['change-link','weather'],
    ['appeal-link','taxvalue'],
    ['agent-link','municipality'],
    ['workbench-link','properties']
  ];
  placements.forEach(function(pair){
    var card=g.querySelector('[data-card-id="'+pair[0]+'"]'),anchor=g.querySelector('[data-card-id="'+pair[1]+'"]');
    if(!card||!anchor||anchor.nextElementSibling===card)return;
    g.insertBefore(card,anchor.nextElementSibling);
  });
}

function switchify(){
  var p=document.getElementById('wd4-widget-pop');if(!p)return;
  var intro=p.querySelector(':scope > p');if(intro)intro.textContent='Choose what appears on your dashboard. Green means the widget is visible.';
  p.querySelectorAll('[data-widget-toggle], [data-wd6-widget] button').forEach(function(btn){
    var row=btn.closest('.wd4-widget-option,.wd5-widget-option'),label=row&&row.querySelector('span')?row.querySelector('span').textContent.trim():'widget';
    var raw=(btn.textContent||'').trim().toLowerCase();
    var on=raw!=='add';
    btn.classList.add('wd7-switch');btn.classList.toggle('on',on);btn.setAttribute('aria-pressed',String(on));btn.setAttribute('aria-label',(on?'Hide ':'Show ')+label);
    if(!btn.querySelector('span'))btn.innerHTML='<span aria-hidden="true"></span>';
  });
}

function wireScroller(el){
  if(!el||el.dataset.wd7Scroll==='1')return;
  el.dataset.wd7Scroll='1';
  function classify(){var can=el.scrollHeight>el.clientHeight+3;el.classList.toggle('wd7-can-scroll',can);el.classList.toggle('wd7-no-scroll',!can);}
  classify();
  el.addEventListener('wheel',function(ev){
    classify();if(!el.classList.contains('wd7-can-scroll'))return;
    var max=el.scrollHeight-el.clientHeight,before=el.scrollTop,next=Math.max(0,Math.min(max,before+ev.deltaY));
    if(next!==before){el.scrollTop=next;ev.preventDefault();ev.stopPropagation();}
  },{passive:false});
  el.addEventListener('touchstart',classify,{passive:true});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(classify).observe(el);
}
function wireScrollers(){
  document.querySelectorAll('.wd5-properties-wrap,.wd4-activity-list,.wd4-municipality,.wd5-county-list').forEach(wireScroller);
}

function insertAddPropertyButton(){
  var acts=document.querySelector('.wd4-page-actions');if(!acts||acts.querySelector('[data-wd7="add-property"]'))return;
  var b=document.createElement('button');b.type='button';b.className='wd7-add-property';b.dataset.wd7='add-property';b.innerHTML='<i class="fas fa-house-circle-plus"></i><span>Add Property</span>';
  acts.insertBefore(b,acts.firstChild);
}

function ensureAddModal(){
  if(document.getElementById('wd7-add-modal'))return;
  var shade=document.createElement('button');shade.type='button';shade.id='wd7-add-shade';shade.className='wd7-add-shade';shade.dataset.wd7='close-add';shade.setAttribute('aria-label','Close Add Property');
  var modal=document.createElement('section');modal.id='wd7-add-modal';modal.className='wd7-add-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','wd7-add-title');
  modal.innerHTML='<button type="button" class="wd7-add-x" data-wd7="close-add" aria-label="Close"><i class="fas fa-xmark"></i></button>'+
    '<span class="wd7-add-kicker">PROPERTY PORTFOLIO</span><h2 id="wd7-add-title">Add a New Jersey property</h2><p>Type an address. Watchdog will match it to the official NJ parcel record before anything is added.</p>'+
    '<form id="wd7-add-form"><label for="wd7-add-input">Property address</label><div class="wd7-add-search"><input id="wd7-add-input" type="search" autocomplete="street-address" placeholder="123 Main St, Cherry Hill, NJ"><button type="submit"><i class="fas fa-magnifying-glass"></i><span>Search</span></button></div></form>'+
    '<div id="wd7-add-status" class="wd7-add-status" aria-live="polite"></div><div id="wd7-add-result" class="wd7-add-result"></div>';
  document.body.appendChild(shade);document.body.appendChild(modal);
  document.getElementById('wd7-add-form').addEventListener('submit',function(ev){ev.preventDefault();searchProperty();});
}
function openAdd(){ensureAddModal();candidate=null;var r=document.getElementById('wd7-add-result');if(r)r.innerHTML='';setStatus('');document.getElementById('wd7-add-shade').classList.add('open');document.getElementById('wd7-add-modal').classList.add('open');setTimeout(function(){var i=document.getElementById('wd7-add-input');if(i)i.focus();},40);}
function closeAdd(){var s=document.getElementById('wd7-add-shade'),m=document.getElementById('wd7-add-modal');if(s)s.classList.remove('open');if(m)m.classList.remove('open');}

function geocode(address){
  var q=/\bNJ\b|NEW JERSEY/i.test(address)?address:address+', New Jersey';
  var p=new URLSearchParams({SingleLine:q,outSR:'4326',maxLocations:'5',f:'json'});
  return timeoutFetch(NJ_GEOCODE+'?'+p,9000).then(function(d){var list=d&&d.candidates||[];for(var i=0;i<list.length;i++){var c=list[i],lat=num(c.location&&c.location.y),lon=num(c.location&&c.location.x);if(lat!=null&&lon!=null&&validNj(lat,lon))return{lat:lat,lon:lon,matched:c.address||address};}return null;});
}
function parcelAt(lat,lon){
  var p=new URLSearchParams({geometry:JSON.stringify({x:lon,y:lat,spatialReference:{wkid:4326}}),geometryType:'esriGeometryPoint',inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:FIELDS,returnGeometry:'false',resultRecordCount:'1',f:'json'});
  return timeoutFetch(NJ_PARCEL+'?'+p,15000).then(function(d){return d&&d.features&&d.features[0]?d.features[0].attributes:null;});
}
function townRatio(town,county){
  if(!town||!county)return Promise.resolve(null);
  var where="MUN_NAME = '"+String(town).replace(/'/g,"''")+"' AND COUNTY = '"+String(county).replace(/'/g,"''")+"' AND PROP_CLASS = '2' AND SALE_PRICE > 50000 AND NET_VALUE > 10000";
  var p=new URLSearchParams({where:where,outFields:'NET_VALUE,SALE_PRICE',returnGeometry:'false',resultRecordCount:'1200',f:'json'});
  return timeoutFetch(NJ_PARCEL+'?'+p,15000).then(function(d){var ratios=[];(d&&d.features||[]).forEach(function(f){var a=f.attributes||{},r=num(a.NET_VALUE),s=num(a.SALE_PRICE);if(r&&s){var x=r/s;if(x>=.15&&x<=2.5)ratios.push(x);}});if(ratios.length<10)return null;var med=median(ratios),abs=ratios.map(function(x){return Math.abs(x-med);}),mad=median(abs)||0,trim=mad?ratios.filter(function(x){return Math.abs(x-med)<=mad*3.5;}):ratios;return trim.length>=8?median(trim):med;}).catch(function(){return null;});
}
function realtimeScore(row){
  return db.rpc('get_public_realtime_watchdog_scores',{p_rows:[{pams_pin:row.pams_pin,assessment:row.assessed,tax:row.tax,town:row.town,county:row.county}]}).then(function(res){var d=res&&res.data,first=Array.isArray(d)?d[0]:d;return first&&num(first.watchdog_score)!=null?{score:num(first.watchdog_score),source:first.score_source||''}:{score:null,source:''};}).catch(function(){return{score:null,source:''};});
}
function saleYear(v){if(v==null||v==='')return null;if(typeof v==='number'&&v>1e11){var d=new Date(v);return Number.isFinite(d.getTime())?d.getUTCFullYear():null;}var s=String(v),m=s.match(/(19|20)\d{2}/);if(m)return Number(m[0]);var n=s.replace(/\D/g,'');if(n.length===6){var y=Number(n.slice(0,2));return y>40?1900+y:2000+y;}return null;}

function searchProperty(){
  if(searching)return;var input=document.getElementById('wd7-add-input'),addr=(input&&input.value||'').trim();if(!addr){if(input)input.focus();return;}
  searching=true;candidate=null;var submit=document.querySelector('#wd7-add-form button[type="submit"]');if(submit){submit.disabled=true;submit.innerHTML='<i class="fas fa-spinner fa-spin"></i><span>Searching</span>';}
  var out=document.getElementById('wd7-add-result');if(out)out.innerHTML='';setStatus('Matching the address to New Jersey parcel records…','busy');
  geocode(addr).then(function(g){if(!g)throw new Error('No New Jersey address match was found.');return parcelAt(g.lat,g.lon).then(function(a){if(!a)throw new Error('The address matched, but no NJ parcel record was found there.');var assessed=num(a.NET_VALUE)||0,tax=num(a.LAST_YR_TX)||0,row={pams_pin:String(a.PAMS_PIN||''),address:String(a.PROP_LOC||g.matched||addr),town:String(a.MUN_NAME||''),county:String(a.COUNTY||''),zip:String(a.ZIP5||''),block:String(a.PCLBLOCK||''),lot:String(a.PCLLOT||''),qualifier:String(a.PCLQCODE||''),prop_class:String(a.PROP_CLASS||''),building_desc:String(a.BLDG_DESC||''),year_built:num(a.YR_CONSTR),acres:num(a.CALC_ACRE),dwelling_units:num(a.DWELL),land_value:num(a.LAND_VAL),improvement_value:num(a.IMPRVT_VAL),assessed:assessed,tax:tax,effective_rate:assessed>0?tax/assessed*100:null,last_sale_price:num(a.SALE_PRICE),last_sale_year:saleYear(a.DEED_DATE),lat:g.lat,lon:g.lon,matched:g.matched};if(!row.pams_pin)throw new Error('The state parcel record is missing its parcel identifier.');return Promise.all([townRatio(row.town,row.county),realtimeScore(row),db.from('saved_properties').select('id').eq('pams_pin',row.pams_pin).limit(1)]).then(function(parts){var ratio=parts[0],score=parts[1],dup=parts[2]&&Array.isArray(parts[2].data)&&parts[2].data.length>0;row.watchdog_value=ratio&&assessed>0?Math.round(assessed/ratio):(row.last_sale_price||null);row.ratio=ratio;row.score=score.score;row.score_source=score.source;row.duplicate=dup;candidate=row;renderCandidate(row);setStatus('Official NJ parcel match found. Review it below before adding.','ok');});});}).catch(function(err){setStatus((err&&err.message)||'The property lookup did not complete. Please try again.','error');}).finally(function(){searching=false;if(submit){submit.disabled=false;submit.innerHTML='<i class="fas fa-magnifying-glass"></i><span>Search</span>';}});
}
function renderCandidate(r){
  var out=document.getElementById('wd7-add-result');if(!out)return;var score=r.score==null?'—':Math.round(r.score),scoreTone=r.score==null?'':r.score>=65?'good':r.score<45?'risk':'watch';
  out.innerHTML='<article class="wd7-match"><div class="wd7-match-head"><div><small>OFFICIAL NJ PARCEL MATCH</small><h3>'+esc(r.address)+'</h3><p>'+esc([r.town,r.county,r.zip].filter(Boolean).join(' · '))+'</p></div><i class="fas fa-location-dot"></i></div>'+
    '<div class="wd7-match-metrics"><div><span>Watchdog Score</span><strong class="'+scoreTone+'">'+esc(score)+'</strong><small>'+esc(r.score_source?String(r.score_source).replace(/_/g,' '):'current property signal')+'</small></div><div><span>Tax Assessment</span><strong>'+esc(money(r.assessed))+'</strong><small>official assessment record</small></div><div><span>Watchdog Value</span><strong>'+esc(money(r.watchdog_value))+'</strong><small>'+(r.ratio?'town sales-ratio estimate':'latest supported value')+'</small></div><div><span>Annual Tax</span><strong>'+esc(money(r.tax))+'</strong><small>latest recorded annual tax</small></div></div>'+
    '<div class="wd7-match-foot"><span>Block '+esc(r.block||'—')+' · Lot '+esc(r.lot||'—')+'</span><button type="button" data-wd7="commit-add" '+(r.duplicate?'disabled':'')+'><i class="fas '+(r.duplicate?'fa-check':'fa-plus')+'"></i>'+(r.duplicate?'Already monitored':'Add to dashboard')+'</button></div></article>';
}
function commitAdd(){
  if(!candidate||candidate.duplicate)return;var btn=document.querySelector('[data-wd7="commit-add"]');if(btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Adding';}
  var r=candidate,lookup={pams_pin:r.pams_pin,address:r.address,town:r.town,county:r.county,zip:r.zip,block:r.block,lot:r.lot,qualifier:r.qualifier,prop_class:r.prop_class,building_desc:r.building_desc,year_built:r.year_built,acres:r.acres,dwelling_units:r.dwelling_units,land_value:r.land_value,improvement_value:r.improvement_value,assessed_value:r.assessed,last_year_tax:r.tax,effective_rate:r.effective_rate,last_sale_price:r.last_sale_price,last_sale_year:r.last_sale_year,lat:r.lat,lon:r.lon};
  var save={kind:'watch',pams_pin:r.pams_pin,address:r.address,town:r.town,county:r.county,zip:r.zip,block:r.block,lot:r.lot,assessed:r.assessed,last_year_tax:r.tax,effective_rate:r.effective_rate,watchdog_value:r.watchdog_value,has_appeal_case:false};
  Promise.allSettled([db.rpc('record_lookup',{p:lookup}),db.rpc('save_property',{p:save})]).then(function(parts){var saved=parts[1]&&parts[1].status==='fulfilled'&&parts[1].value&&!parts[1].value.error&&parts[1].value.data;if(!saved)throw new Error('Watchdog could not save this property.');try{sessionStorage.setItem('wd7-added-property',r.address);}catch(_){}setStatus('Property added. Refreshing your dashboard…','ok');setTimeout(function(){location.reload();},650);}).catch(function(err){setStatus((err&&err.message)||'Could not add the property.','error');if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-plus"></i> Add to dashboard';}});
}

function showAddedToast(){var text='';try{text=sessionStorage.getItem('wd7-added-property')||'';if(text)sessionStorage.removeItem('wd7-added-property');}catch(_){}if(!text)return;var t=document.createElement('div');t.className='wd7-success-toast';t.innerHTML='<i class="fas fa-circle-check"></i><span><b>Property added</b><small>'+esc(text)+'</small></span>';document.body.appendChild(t);requestAnimationFrame(function(){t.classList.add('show');});setTimeout(function(){t.classList.remove('show');setTimeout(function(){t.remove();},240);},3200);}

function polish(){insertAddPropertyButton();scatterCards();switchify();wireScrollers();}
function queue(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;polish();});}

document.addEventListener('click',function(ev){var hit=ev.target.closest&&ev.target.closest('[data-wd7]');if(!hit)return;var a=hit.dataset.wd7;if(a==='add-property'){ev.preventDefault();openAdd();}else if(a==='close-add'){ev.preventDefault();closeAdd();}else if(a==='commit-add'){ev.preventDefault();commitAdd();}},true);
document.addEventListener('keydown',function(ev){if(ev.key==='Escape')closeAdd();});
new MutationObserver(queue).observe(root,{childList:true,subtree:true});
showAddedToast();queue();
})();
export {};
