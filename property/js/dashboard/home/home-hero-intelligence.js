/* Property Home hero intelligence.
   Keeps the premium property identity Watchdog-first, preserves municipality as
   tax-jurisdiction context, and renders Street View with the Maps JavaScript API
   so Property Home does not depend on unsigned Street View Static API images. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_HERO_INTELLIGENCE__)return;
window.__WATCHDOG_HOME_HERO_INTELLIGENCE__=true;

var GMAPS_KEY='AIzaSyCZBo_mj5WXyR-Bsb5yHdekxAxauTYNmlU';
var observer=null,scorePromise=null,mapsPromise=null,retryTimer=0;

function esc(v){return String(v==null?'':v).replace(/[&<>\"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]});}
function title(v){return String(v||'').toLowerCase().replace(/\b\w/g,function(c){return c.toUpperCase();});}
function num(v){v=Number(v);return Number.isFinite(v)?v:null;}
function resolvePin(){try{return new URL(location.href).searchParams.get('pin')||((document.getElementById('hm-switch')||{}).value||'');}catch(_){return((document.getElementById('hm-switch')||{}).value||'');}}
function currentRow(){
  var rows=window.rows,pin=resolvePin();
  if(!Array.isArray(rows)||!rows.length)return null;
  if(pin){for(var i=0;i<rows.length;i++)if(String(rows[i].pams_pin||'')===String(pin))return rows[i];}
  var sw=document.getElementById('hm-switch');
  if(sw&&sw.value){for(var j=0;j<rows.length;j++)if(String(rows[j].pams_pin||'')===String(sw.value))return rows[j];}
  return rows[0]||null;
}

function ensureStyles(){
  if(document.getElementById('wd-home-hero-intelligence-style'))return;
  var style=document.createElement('style');
  style.id='wd-home-hero-intelligence-style';
  style.textContent=[
    '.hm-id>.hm-locality{margin:8px 0 0!important;color:#5f7291!important;font-size:clamp(15px,1.15vw,19px)!important;font-weight:700!important;letter-spacing:-.01em!important}',
    '.hm-id>.hm-jurisdiction{margin:5px 0 0!important;color:#8796aa!important;font-size:clamp(11px,.78vw,13px)!important;font-weight:650!important;line-height:1.45!important}',
    '.hm-id>.hm-score-hero{margin-top:clamp(22px,2.2vw,34px)!important;padding-top:clamp(20px,1.8vw,28px)!important;border-top:1px solid #e5ebf3!important}',
    '.hm-score-top{display:grid;grid-template-columns:auto minmax(0,1fr);gap:clamp(15px,1.5vw,22px);align-items:center}',
    '.hm-score-badge{width:clamp(104px,8.3vw,132px);height:clamp(104px,8.3vw,132px);border-radius:30px;display:grid;grid-template-columns:1fr auto;grid-template-rows:auto 1fr auto;align-items:center;padding:14px 16px;background:linear-gradient(145deg,#10294b 0%,#1f5cc7 100%);box-shadow:0 16px 34px rgba(21,64,130,.2);color:#fff;position:relative;overflow:hidden}',
    '.hm-score-badge:after{content:"";position:absolute;width:74px;height:74px;border-radius:50%;right:-28px;top:-26px;background:rgba(255,255,255,.09)}',
    '.hm-score-badge>i{grid-column:1/-1;justify-self:start;width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.14);font-size:14px}',
    '.hm-score-badge>b{font:800 clamp(43px,3.7vw,58px)/.92 "Plus Jakarta Sans",sans-serif;letter-spacing:-.065em;align-self:end}',
    '.hm-score-badge>small{font:800 11px/1 "Plus Jakarta Sans",sans-serif;opacity:.75;align-self:end;padding-bottom:7px;margin-left:5px}',
    '.hm-score-copy{min-width:0}',
    '.hm-score-kicker{display:block;color:#2d6df6;font:850 10px/1.2 "Plus Jakarta Sans",sans-serif;letter-spacing:.115em;text-transform:uppercase}',
    '.hm-score-copy>strong{display:block;margin-top:7px;color:#10213f;font:800 clamp(19px,1.55vw,25px)/1.18 "Plus Jakarta Sans",sans-serif;letter-spacing:-.035em}',
    '.hm-score-copy>small{display:block;margin-top:8px;color:#73849c;font-size:12px;font-weight:650;line-height:1.5}',
    '.hm-score-copy>small b{color:#425774;font-weight:800}',
    '.hm-robust-mini{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;margin-top:16px}',
    '.hm-robust-cell{min-width:0;padding:9px 7px 8px;border:1px solid #e5ebf3;border-radius:12px;background:#f8fafd;text-align:center}',
    '.hm-robust-cell>b{display:block;color:#2d6df6;font:900 11px/1 "Plus Jakarta Sans",sans-serif}',
    '.hm-robust-cell>em{display:block;margin-top:5px;color:#10213f;font:800 14px/1 "Plus Jakarta Sans",sans-serif;font-style:normal}',
    '.hm-robust-cell>small{display:block;margin-top:5px;overflow:hidden;text-overflow:ellipsis;color:#8a98aa;font-size:8px;font-weight:800;letter-spacing:.02em;white-space:nowrap}',
    '.hm-score-link{display:inline-flex;align-items:center;gap:7px;margin-top:13px;color:#2d6df6!important;font:800 11px/1.2 "Plus Jakarta Sans",sans-serif;text-decoration:none!important}',
    '.hm-score-link:hover{text-decoration:underline!important}',
    '.hm-score-empty{display:flex;gap:13px;align-items:center;padding:17px 0 1px}',
    '.hm-score-empty>i{width:46px;height:46px;border-radius:15px;display:grid;place-items:center;background:#edf3ff;color:#2d6df6;font-size:18px}',
    '.hm-score-empty b{display:block;color:#10213f;font:800 17px/1.2 "Plus Jakarta Sans",sans-serif}',
    '.hm-score-empty span{display:block;margin-top:4px;color:#78889d;font-size:12px;line-height:1.45}',
    '.hm-shot.wd-streetview-host{position:relative!important;overflow:hidden!important;background-image:none!important;background-color:#e9eef5!important}',
    '.hm-shot.wd-streetview-host .wd-streetview-state{position:absolute;inset:0;display:grid;place-items:center;padding:26px;text-align:center;background:linear-gradient(145deg,#eef3f8,#dde7f0);color:#53677f}',
    '.wd-streetview-state>div{max-width:340px}',
    '.wd-streetview-state i{display:grid;place-items:center;margin:0 auto 12px;width:52px;height:52px;border-radius:16px;background:#fff;color:#2d6df6;box-shadow:0 8px 24px rgba(36,62,91,.08);font-size:20px}',
    '.wd-streetview-state b{display:block;color:#17304f;font:800 15px/1.25 "Plus Jakarta Sans",sans-serif}',
    '.wd-streetview-state span{display:block;margin-top:6px;font-size:12px;line-height:1.45}',
    '.wd-streetview-state a{display:inline-flex;margin-top:12px;color:#2d6df6;font-weight:800;text-decoration:none}',
    '.hm-shot.wd-streetview-live .gm-style{border-radius:inherit}',
    '@media(max-width:760px){.hm-id>.hm-score-hero{margin-top:20px!important;padding-top:18px!important}.hm-score-badge{width:100px;height:100px;border-radius:25px}.hm-robust-mini{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.hm-robust-cell{padding:8px 6px}.hm-score-copy>small{font-size:11px}}',
    '@media(max-width:430px){.hm-score-top{grid-template-columns:88px minmax(0,1fr);gap:13px}.hm-score-badge{width:88px;height:88px;padding:11px 12px;border-radius:22px}.hm-score-badge>i{width:25px;height:25px;border-radius:8px;font-size:12px}.hm-score-badge>b{font-size:39px}.hm-score-copy>strong{font-size:18px}}'
  ].join('');
  document.head.appendChild(style);
}

function localityMarkup(row){
  var city=String(row.city||'').trim(),zip=String(row.zip||'').trim();
  var locality=[city||row.town||'', 'NJ', zip].filter(Boolean).join(' ').replace('NJ '+zip,'NJ '+zip);
  var jurisdiction=[];
  if(row.town)jurisdiction.push(title(row.town));
  if(row.county)jurisdiction.push(title(row.county)+' County');
  if(row.block)jurisdiction.push('Block '+row.block+(row.lot?' · Lot '+row.lot:''));
  if(row.pams_pin)jurisdiction.push(row.pams_pin);
  return{locality:locality,jurisdiction:jurisdiction.join(' · ')};
}

function enhanceLocality(hero,row){
  var id=hero.querySelector('.hm-id');if(!id)return;
  var p=id.querySelector(':scope > p:not(.hm-jurisdiction)');
  if(!p){p=document.createElement('p');var h=id.querySelector('h1');if(h)h.insertAdjacentElement('afterend',p);else id.insertBefore(p,id.firstChild);}
  var copy=localityMarkup(row);
  p.className='hm-locality';
  p.textContent=copy.locality;
  var jurisdiction=id.querySelector(':scope > .hm-jurisdiction');
  if(!jurisdiction){jurisdiction=document.createElement('p');jurisdiction.className='hm-jurisdiction';p.insertAdjacentElement('afterend',jurisdiction);}
  jurisdiction.textContent=copy.jurisdiction;
}

function ensureScoreEngine(){
  if(typeof window.watchdogScore==='function')return Promise.resolve();
  if(scorePromise)return scorePromise;
  if(window.NJPropertyModules&&typeof window.NJPropertyModules.loadTool==='function'){
    scorePromise=window.NJPropertyModules.loadTool('watchdog-score').then(function(){return undefined;}).catch(function(){scorePromise=null;});
    return scorePromise;
  }
  scorePromise=new Promise(function(resolve){
    var tries=0,t=setInterval(function(){tries++;if(typeof window.watchdogScore==='function'||tries>80){clearInterval(t);resolve();}},100);
  });
  return scorePromise;
}

function robustCells(w){
  var order=(window.WatchdogScoreCore&&window.WatchdogScoreCore.ORDER)||['recourse','fairness','burden','uniformity','stability','trajectory'];
  return order.map(function(key){
    var d=w&&w.detail&&w.detail[key]||{},letter=d.letter||({recourse:'R',fairness:'O',burden:'B',uniformity:'U',stability:'S',trajectory:'T'}[key]||'?');
    var name=d.name||({recourse:'Recourse',fairness:'Overassessment',burden:'Burden',uniformity:'Uniformity',stability:'Stability',trajectory:'Trajectory'}[key]||key);
    var value=d.score==null?'—':Math.round(Number(d.score));
    return '<span class="hm-robust-cell" title="'+esc(letter+' · '+name)+'"><b>'+esc(letter)+'</b><em>'+esc(value)+'</em><small>'+esc(name)+'</small></span>';
  }).join('');
}

function paintScore(hero,row){
  var id=hero.querySelector('.hm-id');if(!id)return;
  var old=id.querySelector(':scope > .hm-val');
  var box=id.querySelector(':scope > .hm-score-hero');
  if(!box){box=document.createElement('div');box.className='hm-score-hero';if(old)old.replaceWith(box);else id.appendChild(box);}else if(old)old.remove();
  var w=null;
  try{if(typeof window.watchdogScore==='function')w=window.watchdogScore(row);}catch(e){console.warn('Watchdog hero score unavailable',e);}
  if(!w||w.score==null){
    box.innerHTML='<div class="hm-score-empty"><i class="fas fa-dog"></i><div><b>Watchdog Score is building</b><span>ROBUST will publish a score here when this property has enough governed evidence. No fallback score is substituted.</span></div></div><a class="hm-score-link" href="/property/robust/">How ROBUST works <i class="fas fa-arrow-right"></i></a>';
    box.dataset.scoreModel='none';
    return;
  }
  var coverage=Math.max(0,Math.min(100,Math.round(Number(w.covered||0)*100)));
  var confidence=String(w.confidence||'low').toLowerCase();
  box.dataset.scoreModel=w.modelVersion||w.frameworkVersion||'ROBUST-v1';
  box.innerHTML='<div class="hm-score-top">'+
    '<div class="hm-score-badge" title="Watchdog Score '+esc(w.score)+' of 100"><i class="fas fa-dog"></i><b>'+esc(w.score)+'</b><small>/100</small></div>'+
    '<div class="hm-score-copy"><span class="hm-score-kicker">Watchdog Score</span><strong>'+esc(w.verdict||'Current property position')+'</strong><small>Powered by <b>'+esc(w.frameworkVersion||'ROBUST-v1')+'</b> · '+esc(confidence)+' confidence · '+coverage+'% evidence coverage</small></div>'+
    '</div><div class="hm-robust-mini" aria-label="ROBUST component scores">'+robustCells(w)+'</div>'+
    '<a class="hm-score-link" href="/property/robust/">See the ROBUST framework <i class="fas fa-arrow-right"></i></a>';
}

function mapsReady(){return !!(window.google&&window.google.maps&&window.google.maps.StreetViewPanorama&&window.google.maps.StreetViewService);}
function ensureGoogleMaps(){
  if(mapsReady())return Promise.resolve(window.google.maps);
  if(mapsPromise)return mapsPromise;
  mapsPromise=new Promise(function(resolve,reject){
    var done=false,tries=0;
    function finish(ok){if(done)return;done=true;clearInterval(poll);clearTimeout(timeout);ok?resolve(window.google.maps):reject(new Error('Google Maps JavaScript API unavailable'));}
    var poll=setInterval(function(){tries++;if(mapsReady())finish(true);else if(tries>120)finish(false);},100);
    var timeout=setTimeout(function(){finish(mapsReady());},12500);
    var existing=document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if(existing)return;
    window.WatchdogHomeGoogleMapsReady=function(){finish(mapsReady());};
    var script=document.createElement('script');
    script.id='wd-home-google-maps-script';
    script.async=true;script.defer=true;
    script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(GMAPS_KEY)+'&loading=async&region=US&v=weekly&callback=WatchdogHomeGoogleMapsReady';
    script.onerror=function(){finish(false);};
    document.head.appendChild(script);
  }).catch(function(err){mapsPromise=null;throw err;});
  return mapsPromise;
}

function bearing(from,to){
  if(!from||!to)return 0;
  var a=from.lat()*Math.PI/180,b=to.lat()*Math.PI/180,d=(to.lng()-from.lng())*Math.PI/180;
  var y=Math.sin(d)*Math.cos(b),x=Math.cos(a)*Math.sin(b)-Math.sin(a)*Math.cos(b)*Math.cos(d);
  return(Math.atan2(y,x)*180/Math.PI+360)%360;
}
function streetQuery(row){return[row.address,row.city||row.town,'NJ',row.zip].filter(Boolean).join(', ');}
function fallbackStreet(host,row,message){
  if(!host)return;host.classList.remove('wd-streetview-live');host.classList.add('wd-streetview-host');
  var q=streetQuery(row);
  host.innerHTML='<div class="wd-streetview-state"><div><i class="fas fa-street-view"></i><b>Street View is unavailable here</b><span>'+esc(message||'Google does not have a usable panorama for this address right now.')+'</span><a href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q)+'" target="_blank" rel="noopener">Open in Google Maps</a></div></div>';
}
function loadingStreet(host){host.classList.add('wd-streetview-host');host.style.backgroundImage='none';host.innerHTML='<div class="wd-streetview-state"><div><i class="fas fa-street-view"></i><b>Opening Street View</b><span>Finding the closest current panorama for this property.</span></div></div>';}
function geocodeTarget(maps,row){
  var lat=num(row.lat),lon=num(row.lon);
  if(lat!=null&&lon!=null)return Promise.resolve(new maps.LatLng(lat,lon));
  return new Promise(function(resolve,reject){new maps.Geocoder().geocode({address:streetQuery(row)},function(results,status){if(status==='OK'&&results&&results[0])resolve(results[0].geometry.location);else reject(new Error('Address could not be geocoded'));});});
}
function findPanorama(maps,target,source){
  return new Promise(function(resolve,reject){
    var service=new maps.StreetViewService();
    service.getPanorama({location:target,radius:100,preference:maps.StreetViewPreference.NEAREST,source:source},function(data,status){if(status===maps.StreetViewStatus.OK&&data&&data.location)resolve(data);else reject(new Error(String(status||'ZERO_RESULTS')));});
  });
}
function mountStreetView(hero,row){
  var host=hero.querySelector('.hm-shot');if(!host)return;
  var pin=String(row.pams_pin||streetQuery(row));
  if(host.dataset.wdStreetviewPin===pin)return;
  host.dataset.wdStreetviewPin=pin;host.style.backgroundImage='none';loadingStreet(host);
  ensureGoogleMaps().then(function(maps){return geocodeTarget(maps,row).then(function(target){
    return findPanorama(maps,target,maps.StreetViewSource.OUTDOOR).catch(function(){return findPanorama(maps,target,maps.StreetViewSource.DEFAULT);}).then(function(data){return{maps:maps,target:target,data:data};});
  });}).then(function(result){
    if(!document.body.contains(host)||host.dataset.wdStreetviewPin!==pin)return;
    var maps=result.maps,data=result.data,target=result.target,heading=bearing(data.location.latLng,target);
    host.innerHTML='';host.classList.add('wd-streetview-host','wd-streetview-live');
    new maps.StreetViewPanorama(host,{pano:data.location.pano,position:data.location.latLng,pov:{heading:heading,pitch:4},zoom:1,visible:true,addressControl:false,fullscreenControl:true,linksControl:true,panControl:false,zoomControl:false,clickToGo:true,scrollwheel:false,motionTracking:false,motionTrackingControl:false,enableCloseButton:false});
  }).catch(function(err){
    if(!document.body.contains(host)||host.dataset.wdStreetviewPin!==pin)return;
    fallbackStreet(host,row,err&&err.message==='Google Maps JavaScript API unavailable'?'Google Maps could not load for this site. The property report remains available below.':'No outdoor Street View panorama was found close enough to this property.');
  });
}

function enhanceHero(){
  clearTimeout(retryTimer);
  ensureStyles();
  var hero=document.querySelector('#hm-body .hm-hero'),row=currentRow();
  if(!hero||!row){retryTimer=setTimeout(enhanceHero,180);return;}
  var pin=String(row.pams_pin||resolvePin()||'current');
  if(hero.dataset.wdIdentityPin!==pin){enhanceLocality(hero,row);hero.dataset.wdIdentityPin=pin;}
  mountStreetView(hero,row);
  ensureScoreEngine().then(function(){
    var active=currentRow();if(!active||String(active.pams_pin||'')!==String(row.pams_pin||''))return;
    if(!document.body.contains(hero))return;
    paintScore(hero,row);
  });
}
function schedule(){clearTimeout(retryTimer);retryTimer=setTimeout(enhanceHero,40);}
function boot(){
  ensureStyles();
  var body=document.getElementById('hm-body');
  if(body){observer=new MutationObserver(function(mutations){
    for(var i=0;i<mutations.length;i++){
      if(mutations[i].target&&mutations[i].target.closest&&mutations[i].target.closest('.hm-shot.wd-streetview-live'))continue;
      schedule();break;
    }
  });observer.observe(body,{childList:true,subtree:true});}
  document.addEventListener('change',function(e){if(e.target&&e.target.id==='hm-switch')setTimeout(enhanceHero,90);});
  window.addEventListener('watchdog:context-refresh',schedule);
  enhanceHero();
}

window.WatchdogHomeHeroIntelligence={refresh:enhanceHero};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
