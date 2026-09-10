/* NJW-320: persistent map-first property visuals.
 * Keeps the free NJ Office of GIS map authoritative after later async imagery
 * runtimes settle, and adds the same map context to the public property lookup
 * hero without removing Watchdog Score / ROBUST.
 */
(function(){
  'use strict';
  if(window.__WATCHDOG_MAP_PERSISTENCE__)return;
  window.__WATCHDOG_MAP_PERSISTENCE__=true;

  var NJ_MAP='https://maps.nj.gov/arcgis/rest/services/Basemap/LtGray_NJ_WM/MapServer/export';
  var NJ_GEOCODE='https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
  var cache=Object.create(null),pending=Object.create(null),timer=0,painting=false;

  function text(v){return String(v==null?'':v).replace(/\s+/g,' ').trim();}
  function valid(lat,lon){lat=Number(lat);lon=Number(lon);return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=38.8&&lat<=41.4&&lon>=-75.7&&lon<=-73.8;}
  function mapUrl(lat,lon,w,h){
    w=Math.max(320,Math.min(1200,Number(w)||900));h=Math.max(180,Math.min(800,Number(h)||520));
    var half=.0027,aspect=w/h,cos=Math.max(.45,Math.cos(Number(lat)*Math.PI/180)),lonHalf=half*aspect/cos;
    return NJ_MAP+'?'+new URLSearchParams({bbox:[Number(lon)-lonHalf,Number(lat)-half,Number(lon)+lonHalf,Number(lat)+half].join(','),bboxSR:'4326',imageSR:'3857',size:Math.round(w)+','+Math.round(h),format:'jpg',transparent:'false',f:'image'}).toString();
  }
  function geocode(q){
    q=text(q);if(!q)return Promise.resolve(null);var key=q.toUpperCase();
    if(Object.prototype.hasOwnProperty.call(cache,key))return Promise.resolve(cache[key]);
    if(pending[key])return pending[key];
    var p=new URLSearchParams({SingleLine:q,outFields:'Match_addr,City,Postal',outSR:'4326',maxLocations:'1',f:'json'});
    pending[key]=fetch(NJ_GEOCODE+'?'+p.toString()).then(function(r){return r.ok?r.json():null;}).then(function(d){
      var c=d&&d.candidates&&d.candidates[0],loc=c&&c.location;
      var hit=c&&Number(c.score||0)>=75&&loc&&valid(loc.y,loc.x)?{lat:Number(loc.y),lon:Number(loc.x)}:null;
      cache[key]=hit;delete pending[key];return hit;
    }).catch(function(){cache[key]=null;delete pending[key];return null;});
    return pending[key];
  }
  function style(){
    if(document.getElementById('wd-map-persistence-style'))return;
    var s=document.createElement('style');s.id='wd-map-persistence-style';s.textContent=[
      '.hm-shot.wd-map-persistent{position:relative!important;overflow:hidden!important;background:#eef2f4!important;background-image:none!important}',
      '.hm-shot.wd-map-persistent>.wd-persistent-map-image{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;object-fit:cover!important;z-index:0!important}',
      '.wd-persistent-map-pin{position:absolute;left:50%;top:50%;z-index:2;width:34px;height:34px;border-radius:50% 50% 50% 0;background:#1677ff;box-shadow:0 4px 12px rgba(15,34,72,.25);transform:translate(-50%,-92%) rotate(-45deg);pointer-events:none}',
      '.wd-persistent-map-pin:after{content:"";position:absolute;left:50%;top:50%;width:11px;height:11px;border-radius:50%;background:#fff;transform:translate(-50%,-50%)}',
      '.wd-persistent-map-source{position:absolute;left:10px;bottom:10px;z-index:3;padding:5px 8px;border-radius:8px;background:rgba(255,255,255,.9);color:#52627a;font:800 9px/1.1 Inter,Arial,sans-serif;box-shadow:0 1px 5px rgba(15,34,72,.1);pointer-events:none}',
      '.hm-shot.wd-map-persistent>.wd-photo-add{z-index:4!important}',
      '#plm-photos .wd-search-map-preview{position:relative;height:210px;margin-top:22px;border-radius:20px;overflow:hidden;background:#e9eef3;box-shadow:0 12px 30px rgba(2,12,31,.18)}',
      '#plm-photos .wd-search-map-preview img{width:100%;height:100%;display:block;object-fit:cover}',
      '#plm-photos .wd-search-map-preview .wd-persistent-map-pin{width:30px;height:30px}',
      '#plm-photos .wd-search-map-preview .wd-persistent-map-source{left:8px;bottom:8px;font-size:8px}',
      '@media(max-width:760px){#plm-photos .wd-search-map-preview{height:190px;margin-top:16px}.wd-persistent-map-pin{width:30px;height:30px}}'
    ].join('');document.head.appendChild(s);
  }
  function queryFromHome(){
    var h=document.querySelector('#hm-body .hm-id h1,#hm-body .hm-id h2');
    var p=document.querySelector('#hm-body .hm-id .hm-locality,#hm-body .hm-id p');
    var a=h&&text(h.textContent),loc=p&&text(p.textContent);
    if(!a)return'';return[a,loc,/\bNJ\b/i.test(loc||'')?'':'NJ'].filter(Boolean).join(', ');
  }
  function decorateHost(host,query,hit){
    if(!host||!document.body.contains(host)||!hit)return;
    painting=true;
    var add=host.querySelector('.wd-photo-add');
    host.className=host.className.replace(/\bwd-streetview-(?:host|live)\b/g,'').replace(/\s+/g,' ').trim();
    host.classList.add('wd-map-persistent');host.dataset.wdMapPersistent='1';host.dataset.wdMapQuery=query;
    host.style.backgroundImage='none';
    Array.prototype.slice.call(host.children).forEach(function(n){if(n!==add)n.remove();});
    var img=document.createElement('img');img.className='wd-persistent-map-image';img.alt='Map of '+query;img.loading='lazy';img.decoding='async';img.src=mapUrl(hit.lat,hit.lon,900,540);host.insertBefore(img,host.firstChild||null);
    var pin=document.createElement('span');pin.className='wd-persistent-map-pin';pin.setAttribute('aria-hidden','true');host.appendChild(pin);
    var src=document.createElement('span');src.className='wd-persistent-map-source';src.textContent='NJ Office of GIS';host.appendChild(src);
    if(add)host.appendChild(add);
    host.dataset.wdImageryDone='1';host.dataset.wdImageryAddress=(document.querySelector('#hm-body .hm-id h1')||{}).textContent||'';
    painting=false;
  }
  function syncHome(){
    var host=document.querySelector('#hm-body .hm-shot');if(!host)return;
    var query=queryFromHome();if(!query)return;
    if(host.classList.contains('wd-map-persistent')&&host.querySelector('.wd-persistent-map-image')&&host.dataset.wdMapQuery===query)return;
    geocode(query).then(function(hit){decorateHost(host,query,hit);});
  }
  function lookupQuery(hero){
    var a=hero&&hero.querySelector('.wd-mapless-address');
    var locality=document.querySelector('#plm .plm-addr>span');
    var addr=a&&text(a.textContent),loc=locality&&text(locality.textContent);
    if(!addr)return'';return[addr,loc,/\bNJ\b/i.test(loc||'')?'':'NJ'].filter(Boolean).join(', ');
  }
  function syncLookup(){
    var hero=document.querySelector('#plm-photos .wd-mapless-property-hero');if(!hero)return;
    var left=hero.querySelector('.wd-mapless-property-in>div:first-child');if(!left)return;
    var query=lookupQuery(hero);if(!query)return;
    var existing=left.querySelector('.wd-search-map-preview');if(existing&&existing.dataset.query===query)return;
    if(existing)existing.remove();
    var box=document.createElement('div');box.className='wd-search-map-preview';box.dataset.query=query;box.innerHTML='<span class="wd-persistent-map-source">NJ Office of GIS</span>';
    left.appendChild(box);
    geocode(query).then(function(hit){
      if(!hit||!document.body.contains(box))return;
      var img=document.createElement('img');img.alt='Map of '+query;img.loading='lazy';img.decoding='async';img.src=mapUrl(hit.lat,hit.lon,720,360);box.insertBefore(img,box.firstChild||null);
      var pin=document.createElement('span');pin.className='wd-persistent-map-pin';pin.setAttribute('aria-hidden','true');box.appendChild(pin);
    });
  }
  function sync(){if(painting)return;style();syncHome();syncLookup();}
  function schedule(){clearTimeout(timer);timer=setTimeout(sync,30);}

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
  new MutationObserver(function(records){
    if(painting)return;
    for(var i=0;i<records.length;i++){
      var t=records[i].target;
      if(t&&t.closest&&t.closest('.wd-map-persistent')&&records[i].addedNodes.length===0)continue;
      schedule();break;
    }
  }).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('change',function(e){if(e.target&&e.target.id==='hm-switch')setTimeout(sync,80);});
  window.addEventListener('watchdog:context-refresh',schedule);
  window.addEventListener('load',function(){setTimeout(sync,150);setTimeout(sync,800);setTimeout(sync,2200);});

  window.WatchdogMapPersistence={refresh:sync};
})();