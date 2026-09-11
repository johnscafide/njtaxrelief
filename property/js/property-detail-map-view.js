/* Watchdog property-detail aerial map.
 * Keeps the ROBUST property hero focused and adds a compact location card to
 * the supporting property rail. Uses saved coordinates when available,
 * otherwise New Jersey's public geocoder.
 */
(function(){
  'use strict';
  if(window.__WATCHDOG_PROPERTY_DETAIL_MAP__)return;
  window.__WATCHDOG_PROPERTY_DETAIL_MAP__=true;

  var GEOCODER='https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
  var ESRI_TILES='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  var requestSeq=0;
  var cache=Object.create(null);
  var scheduled=false;
  var propertyMap=null;

  function clean(v){return String(v==null?'':v).replace(/\s+/g,' ').trim();}
  function esc(v){return clean(v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function norm(v){return clean(v).toUpperCase().replace(/[^A-Z0-9]/g,'');}

  function addressContext(){
    var hero=document.querySelector('#plm-photos .wd-mapless-property-hero');
    var title=hero&&hero.querySelector('.wd-mapless-address');
    var detail=document.querySelector('#plm .plm-addr');
    var rail=document.getElementById('plm-rail');
    if(!hero||!title||!rail)return null;
    var address=clean(title.textContent);
    var locality='';
    if(detail){
      var line=detail.querySelector(':scope > span');
      locality=clean(line&&line.textContent);
    }
    if(!address)return null;
    return{hero:hero,rail:rail,address:address,locality:locality};
  }

  function recentCoordinates(address){
    try{
      var rows=JSON.parse(localStorage.getItem('watchdogRecentProperties')||'[]');
      if(!Array.isArray(rows))return null;
      var key=norm(address);
      for(var i=0;i<rows.length;i++){
        var row=rows[i]||{};
        if(norm(row.address)!==key)continue;
        var lat=Number(row.lat),lon=Number(row.lon);
        if(Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=38.8&&lat<=41.4&&lon>=-75.8&&lon<=-73.7)return{lat:lat,lon:lon,source:'recent'};
      }
    }catch(_error){}
    return null;
  }

  function geocode(address,locality){
    var key=norm(address+'|'+locality);
    if(cache[key])return cache[key];
    var query=[address,locality,'NJ'].filter(Boolean).join(', ');
    var params=new URLSearchParams({SingleLine:query,outSR:'4326',maxLocations:'1',f:'json'});
    cache[key]=fetch(GEOCODER+'?'+params.toString(),{headers:{Accept:'application/json'}})
      .then(function(r){if(!r.ok)throw new Error('NJ geocoder '+r.status);return r.json();})
      .then(function(data){
        var c=data&&data.candidates&&data.candidates[0];
        var lat=Number(c&&c.location&&c.location.y),lon=Number(c&&c.location&&c.location.x);
        if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<38.8||lat>41.4||lon<-75.8||lon>-73.7)return null;
        return{lat:lat,lon:lon,source:'geocoder'};
      }).catch(function(){return null;});
    return cache[key];
  }

  function mapsUrl(lat,lon,address){
    var q=address||[lat,lon].join(',');
    return'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q+', New Jersey');
  }

  function destroyMap(){
    if(propertyMap){
      try{propertyMap.remove();}catch(_error){}
      propertyMap=null;
    }
  }

  function removeStale(){
    destroyMap();
    document.querySelectorAll('#plm .wd-property-map-view').forEach(function(node){node.remove();});
  }

  function initLeafletMap(node,coords,address){
    if(!node||typeof L==='undefined')return;
    try{
      propertyMap=L.map(node,{
        zoomControl:false,
        attributionControl:false,
        scrollWheelZoom:false,
        doubleClickZoom:true,
        dragging:true,
        tap:true
      }).setView([coords.lat,coords.lon],18);
      L.tileLayer(ESRI_TILES,{maxZoom:20,minZoom:1}).addTo(propertyMap);
      var icon=L.divIcon({
        className:'wd-property-leaflet-pin-wrap',
        html:'<span class="wd-property-leaflet-pin"><i class="fas fa-location-dot"></i></span>',
        iconSize:[46,46],
        iconAnchor:[23,23]
      });
      L.marker([coords.lat,coords.lon],{icon:icon,title:address,keyboard:false}).addTo(propertyMap);
      requestAnimationFrame(function(){if(propertyMap)try{propertyMap.invalidateSize(false);}catch(_error){}});
      setTimeout(function(){if(propertyMap)try{propertyMap.invalidateSize(false);}catch(_error){}},180);
    }catch(_error){destroyMap();}
  }

  function render(ctx,coords,seq){
    if(seq!==requestSeq||!ctx.hero.isConnected||!ctx.rail.isConnected)return;
    removeStale();
    if(!coords)return;
    var link=mapsUrl(coords.lat,coords.lon,ctx.address);
    var mapId='wd-property-map-'+seq;
    var card=document.createElement('section');
    card.className='wd-property-map-view';
    card.dataset.address=ctx.address;
    card.setAttribute('aria-label','Property location for '+ctx.address);
    card.innerHTML='<div class="wd-property-map-head">'+
      '<div><small>PROPERTY LOCATION</small><strong>Map view</strong>'+(ctx.locality?'<span>'+esc(ctx.locality)+'</span>':'')+'</div>'+ 
      '<a href="'+esc(link)+'" target="_blank" rel="noopener" aria-label="Open '+esc(ctx.address)+' in Google Maps"><i class="fas fa-arrow-up-right-from-square"></i> Open</a>'+ 
      '</div>'+ 
      '<div class="wd-property-map-canvas"><div class="wd-property-map-leaflet" id="'+mapId+'" role="img" aria-label="Interactive aerial map around '+esc(ctx.address)+'"></div></div>'+ 
      '<div class="wd-property-map-credit">Esri World Imagery</div>';
    var track=document.getElementById('pl-track-card');
    if(track&&track.parentNode===ctx.rail)track.insertAdjacentElement('afterend',card);
    else ctx.rail.prepend(card);
    initLeafletMap(document.getElementById(mapId),coords,ctx.address);
  }

  function syncCopy(){
    document.querySelectorAll('#plm-estimate a').forEach(function(a){
      if(/have me check it properly/i.test(clean(a.textContent)))a.textContent='Have Watchdog check the property';
    });
  }

  function sync(){
    scheduled=false;
    syncCopy();
    var ctx=addressContext();
    if(!ctx){removeStale();return;}
    var existing=document.querySelector('#plm-rail .wd-property-map-view');
    if(existing&&existing.dataset.address===ctx.address)return;
    var seq=++requestSeq;
    var recent=recentCoordinates(ctx.address);
    if(recent){render(ctx,recent,seq);return;}
    geocode(ctx.address,ctx.locality).then(function(coords){render(ctx,coords,seq);});
  }

  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(sync);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
})();
