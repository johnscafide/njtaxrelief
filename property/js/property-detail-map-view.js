/* Watchdog property-detail aerial map.
 * Keeps the ROBUST property hero and adds a location visual beneath it.
 * Uses saved lookup coordinates when available, otherwise NJ's public geocoder.
 */
(function(){
  'use strict';
  if(window.__WATCHDOG_PROPERTY_DETAIL_MAP__)return;
  window.__WATCHDOG_PROPERTY_DETAIL_MAP__=true;

  var GEOCODER='https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
  var ESRI_EXPORT='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export';
  var requestSeq=0;
  var cache=Object.create(null);
  var scheduled=false;

  function clean(v){return String(v==null?'':v).replace(/\s+/g,' ').trim();}
  function esc(v){return clean(v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function norm(v){return clean(v).toUpperCase().replace(/[^A-Z0-9]/g,'');}

  function addressContext(){
    var hero=document.querySelector('#plm-photos .wd-mapless-property-hero');
    var title=hero&&hero.querySelector('.wd-mapless-address');
    var detail=document.querySelector('#plm .plm-addr');
    if(!hero||!title)return null;
    var address=clean(title.textContent);
    var locality='';
    if(detail){
      var line=detail.querySelector(':scope > span');
      locality=clean(line&&line.textContent);
    }
    if(!address)return null;
    return{hero:hero,address:address,locality:locality};
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

  function aerialUrl(lat,lon){
    var dLat=.00205;
    var cos=Math.max(.35,Math.cos(lat*Math.PI/180));
    var dLon=dLat/cos;
    var bbox=[lon-dLon,lat-dLat,lon+dLon,lat+dLat].map(function(v){return v.toFixed(6);}).join(',');
    var p=new URLSearchParams({bbox:bbox,bboxSR:'4326',imageSR:'4326',size:'1400,520',format:'jpg',f:'image'});
    return ESRI_EXPORT+'?'+p.toString();
  }

  function mapsUrl(lat,lon,address){
    var q=address||[lat,lon].join(',');
    return'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q+', New Jersey');
  }

  function removeStale(){
    document.querySelectorAll('#plm-photos .wd-property-map-view').forEach(function(node){node.remove();});
  }

  function render(ctx,coords,seq){
    if(seq!==requestSeq||!ctx.hero.isConnected)return;
    removeStale();
    if(!coords)return;
    var link=mapsUrl(coords.lat,coords.lon,ctx.address);
    var card=document.createElement('section');
    card.className='wd-property-map-view';
    card.dataset.address=ctx.address;
    card.setAttribute('aria-label','Aerial map of '+ctx.address);
    card.innerHTML='<a class="wd-property-map-canvas" href="'+esc(link)+'" target="_blank" rel="noopener" aria-label="Open '+esc(ctx.address)+' in Google Maps">'+
      '<img src="'+esc(aerialUrl(coords.lat,coords.lon))+'" alt="Aerial map around '+esc(ctx.address)+'" loading="eager" decoding="async">'+
      '<span class="wd-property-map-pin" aria-hidden="true"><i class="fas fa-location-dot"></i></span>'+ 
      '<span class="wd-property-map-shade" aria-hidden="true"></span>'+ 
      '<span class="wd-property-map-label"><small>PROPERTY LOCATION</small><strong>'+esc(ctx.address)+'</strong>'+(ctx.locality?'<em>'+esc(ctx.locality)+'</em>':'')+'</span>'+ 
      '<span class="wd-property-map-open"><i class="fas fa-arrow-up-right-from-square"></i> Open map</span>'+ 
      '</a><div class="wd-property-map-credit">Aerial imagery · Esri World Imagery</div>';
    ctx.hero.insertAdjacentElement('afterend',card);
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
    if(!ctx)return;
    var existing=document.querySelector('#plm-photos .wd-property-map-view');
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
