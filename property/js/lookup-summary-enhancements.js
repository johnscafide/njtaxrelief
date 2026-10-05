/* Watchdog property lookup summary enhancements.
   Fills the intentionally open mobile summary cells with governed Watchdog data,
   adds the ROBUST Burden component to Tax Snapshot, shows familiar city + ZIP,
   and replaces index maps / rendered property imagery with a branded score panel. */
(function(){
  'use strict';
  if(window.__WATCHDOG_LOOKUP_SUMMARY_ENHANCEMENTS__)return;
  window.__WATCHDOG_LOOKUP_SUMMARY_ENHANCEMENTS__=true;

  var GEOCODER='https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
  var cityCache=Object.create(null);
  var scheduled=false;

  function clean(v){return String(v==null?'':v).trim();}
  function esc(v){return clean(v).replace(/[&<>\"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c];});}
  function setText(node,value){value=String(value==null?'':value);if(node&&node.textContent!==value)node.textContent=value;}
  function njZip(v){var m=clean(v).match(/\b(0[78]\d{3})(?:-\d{4})?\b/);return m?m[1]:'';}

  function ensureStyles(){
    if(document.getElementById('wd-lookup-summary-enhancements-style'))return;
    var s=document.createElement('style');
    s.id='wd-lookup-summary-enhancements-style';
    s.textContent=[
      '#plm .wd-pl-proprietary>i{color:#24498b!important}',
      '#plm .wd-pl-proprietary b{color:#142a56}',
      '#plm .wd-pl-proprietary[data-ready="1"]{background:linear-gradient(145deg,#fff,#f4f7fc)}',
      '#plm #plm-kpi-burden .plm-kpi-n{color:#24498b}',
      '#plm .plm-addr>span[data-wd-city="1"]{display:block}',
      'html.wd-index-mapless #plm-map,html.wd-index-mapless #hd-map,html.wd-index-mapless .leaflet-container{display:none!important;visibility:hidden!important;pointer-events:none!important;max-height:0!important;overflow:hidden!important}',
      'html.wd-index-mapless #plm section:has(#plm-map),html.wd-index-mapless #plm .plm-sec:has(#plm-map),html.wd-index-mapless .hd-mapwrap:has(#hd-map){display:none!important}',
      '#plm-photos .wd-mapless-property-hero{position:relative;min-height:320px;width:100%;overflow:hidden;display:grid;align-items:stretch;background:radial-gradient(circle at 78% 14%,rgba(92,161,255,.48),transparent 34%),linear-gradient(145deg,#071a35 0%,#123e82 52%,#2468d8 100%);color:#fff}',
      '#plm-photos .wd-mapless-property-hero:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(0,8,24,.28))}',
      '#plm-photos .wd-mapless-property-in{position:relative;z-index:2;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(260px,.75fr);gap:28px;align-items:center;padding:36px clamp(24px,4vw,54px)}',
      '#plm-photos .wd-mapless-kicker{display:inline-flex;align-items:center;gap:9px;color:#9eece4;font:850 11px/1.2 "Libre Franklin",sans-serif;letter-spacing:.105em;text-transform:uppercase}',
      '#plm-photos .wd-mapless-address{margin:13px 0 7px;color:#fff;font:850 clamp(24px,3.3vw,40px)/1.05 "Libre Franklin",sans-serif;letter-spacing:-.045em}',
      '#plm-photos .wd-mapless-copy{max-width:670px;margin:0;color:rgba(255,255,255,.72);font-size:15px;line-height:1.55}',
      '#plm-photos .wd-mapless-status{display:inline-flex;margin-top:18px;padding:8px 11px;border:1px solid rgba(255,255,255,.2);border-radius:999px;background:rgba(255,255,255,.08);font-size:12px;font-weight:800}',
      '#plm-photos .wd-mapless-scorebox{justify-self:end;width:min(100%,330px);padding:22px;border:1px solid rgba(255,255,255,.24);border-radius:24px;background:rgba(4,22,51,.97);box-shadow:0 2px 6px rgba(15,23,42,.08);}',
      '#plm-photos .wd-mapless-scorelabel{display:flex;align-items:center;gap:9px;color:rgba(255,255,255,.74);font:850 10px/1.1 "Libre Franklin",sans-serif;letter-spacing:.08em;text-transform:uppercase}',
      '#plm-photos .wd-mapless-score{display:flex;align-items:flex-end;gap:5px;margin-top:10px;color:#fff;font:900 clamp(46px,7vw,72px)/.86 "Libre Franklin",sans-serif;letter-spacing:-.07em}',
      '#plm-photos .wd-mapless-score em{padding-bottom:7px;color:rgba(255,255,255,.55);font:800 14px/1 "Libre Franklin",sans-serif;font-style:normal;letter-spacing:0}',
      '#plm-photos .wd-mapless-score.building{font-size:28px;line-height:1;letter-spacing:-.025em}',
      '#plm-photos .wd-mapless-robust-title{margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.14);color:#9eece4;font:900 10px/1 "Libre Franklin",sans-serif;letter-spacing:.12em}',
      '#plm-photos .wd-mapless-components{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin-top:10px}',
      '#plm-photos .wd-mapless-components span{text-align:center;min-width:0;padding:8px 3px;border-radius:10px;background:rgba(255,255,255,.07)}',
      '#plm-photos .wd-mapless-components b{display:block;color:#9eece4;font:900 9px/1 "Libre Franklin",sans-serif}',
      '#plm-photos .wd-mapless-components em{display:block;margin-top:5px;color:#fff;font:850 11px/1 "Libre Franklin",sans-serif;font-style:normal}',
      '#plm-photos .wd-mapless-photo-note{grid-column:1/-1;display:flex;align-items:center;gap:9px;margin-top:2px;color:rgba(255,255,255,.62);font-size:12px;line-height:1.4}',
      '#plm-photos .wd-mapless-photo-link{color:#9eece4;font-weight:850;text-decoration:underline;text-underline-offset:3px}',
      '#plm-photos .wd-mapless-photo-link:hover,#plm-photos .wd-mapless-photo-link:focus-visible{color:#fff}',
      'html body #plm-photos.wd-has-lot-map{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)!important;gap:0!important}',
      'html body #plm-photos.wd-has-lot-map .wd-mapless-property-hero{grid-column:auto!important;width:auto!important;min-width:0}',
      'html body #plm-photos.wd-has-lot-map .wd-mapless-property-in{grid-template-columns:minmax(0,1fr) minmax(240px,300px);gap:22px}',
      'html body #plm-photos.wd-has-lot-map .wd-mapless-address{font-size:clamp(24px,2.5vw,36px);overflow-wrap:anywhere}',
      '#plm-photos .wd-lot-map{position:relative;min-height:320px;overflow:hidden;background:#eef2f4}',
      '#plm-photos .wd-lot-map img,#plm-photos .wd-lot-map svg{position:absolute;inset:0;width:100%;height:100%;display:block}',
      '#plm-photos .wd-lot-map img{object-fit:cover}',
      '#plm-photos .wd-lot-map .wd-lot-neighbors path{fill:none;stroke:#8f9bab;stroke-width:1;opacity:.75;vector-effect:non-scaling-stroke}',
      '#plm-photos .wd-lot-map .wd-lot-shape{fill:rgba(36,104,216,.2);stroke:#1452a4;stroke-width:3;stroke-linejoin:round;vector-effect:non-scaling-stroke}',
      '#plm-photos .wd-lot-map .wd-lot-pin{fill:#1452a4;stroke:#fff;stroke-width:2;vector-effect:non-scaling-stroke}',
      '#plm-photos .wd-lot-map-label{position:absolute;left:12px;top:12px;padding:6px 10px;border-radius:10px;background:rgba(7,26,53,.78);color:#fff;font:800 12px/1.2 "Libre Franklin",sans-serif}',
      '#plm-photos .wd-lot-map-source{position:absolute;right:10px;bottom:10px;padding:4px 8px;border-radius:8px;background:rgba(255,255,255,.88);color:#52627a;font:700 10px/1.1 Libre Franklin,Arial,sans-serif}',
      '@media(max-width:1020px){html body #plm-photos.wd-has-lot-map .wd-mapless-property-in{grid-template-columns:1fr}html body #plm-photos.wd-has-lot-map .wd-mapless-scorebox{justify-self:stretch;width:auto}}',
      '@media(max-width:700px){html body #plm-photos.wd-has-lot-map{grid-template-columns:1fr!important}#plm-photos .wd-lot-map{min-height:240px}}',
      '@media(max-width:760px){#plm-photos .wd-mapless-property-hero{min-height:360px}#plm-photos .wd-mapless-property-in{grid-template-columns:1fr;gap:22px;padding:28px 20px}#plm-photos .wd-mapless-scorebox{justify-self:stretch;width:auto}#plm-photos .wd-mapless-score{font-size:58px}}',
      '@media(max-width:640px){#plm .wd-pl-proprietary b{font-size:inherit}}'
    ].join('');
    document.head.appendChild(s);
  }

  function ensureQuickTiles(){
    var grid=document.querySelector('#plm .plm-quick');
    if(!grid)return;
    if(!document.getElementById('plm-q-watchdog-score')){
      grid.insertAdjacentHTML('beforeend','<div class="plm-q wd-pl-proprietary" id="plm-q-watchdog-score"><i class="fas fa-dog"></i><div><b>-</b><span>Watchdog score</span></div></div>');
    }
    if(!document.getElementById('plm-q-tax-value')){
      grid.insertAdjacentHTML('beforeend','<div class="plm-q wd-pl-proprietary" id="plm-q-tax-value"><i class="fas fa-scale-balanced"></i><div><b>-</b><span>Watchdog tax value</span></div></div>');
    }
  }

  function ensureTaxBurden(){
    var grid=document.querySelector('#plm .plm-kpis');
    if(!grid||document.getElementById('plm-kpi-burden'))return;
    grid.insertAdjacentHTML('beforeend','<div class="plm-kpi wd-pl-proprietary" id="plm-kpi-burden"><div class="plm-kpi-n">-</div><div class="plm-kpi-l">B · Tax burden</div></div>');
  }

  function canonicalScore(){
    var score=document.querySelector('#plm-robust-score-sec .wdps-score b');
    var value=score&&clean(score.textContent);
    return value&&value!=='-'?value:'';
  }
  function syncWatchdogScore(){
    var tile=document.getElementById('plm-q-watchdog-score');
    if(!tile)return;
    var n=tile.querySelector('b');
    var value=canonicalScore();
    if(value){
      setText(n,value+'/100');
      tile.dataset.ready='1';
      tile.title='Canonical Watchdog Score powered by the ROBUST Framework';
    }else{
      setText(n,'-');
      delete tile.dataset.ready;
      tile.title='Score publishes when checked ROBUST evidence is sufficient';
    }
  }

  function syncTaxValue(){
    var tile=document.getElementById('plm-q-tax-value');
    if(!tile)return;
    var n=tile.querySelector('b');
    var value=document.querySelector('#plm-estimate .plm-est-hero');
    if(value&&clean(value.textContent)){
      setText(n,clean(value.textContent));
      tile.dataset.ready='1';
      tile.title='Watchdog Tax Value: appeal-screening estimate, not a listing price or appraisal';
    }else{
      setText(n,'-');
      delete tile.dataset.ready;
      tile.title='Watchdog Tax Value appears when enough solid sale evidence is available';
    }
  }

  function syncBurden(){
    var tile=document.getElementById('plm-kpi-burden');
    if(!tile)return;
    var value=tile.querySelector('.plm-kpi-n');
    var rows=document.querySelectorAll('#plm-robust-score-sec .wdps-row');
    var found=null;
    for(var i=0;i<rows.length;i++){
      var label=rows[i].querySelector('.wdps-label a');
      if(label&&/^B\s*·\s*/i.test(clean(label.textContent))){found=rows[i];break;}
    }
    var score=found&&found.querySelector('.wdps-n');
    if(score&&clean(score.textContent)&&clean(score.textContent)!=='-'){
      setText(value,clean(score.textContent)+'/100');
      tile.dataset.ready='1';
      tile.title='ROBUST B · Burden component. Higher is a more favorable tax-burden position.';
    }else{
      setText(value,'-');
      delete tile.dataset.ready;
      tile.title='ROBUST Burden publishes only when the required checked evidence is available';
    }
  }

  function addressText(node){
    if(!node)return'';
    for(var i=0;i<node.childNodes.length;i++)if(node.childNodes[i].nodeType===3&&clean(node.childNodes[i].nodeValue))return clean(node.childNodes[i].nodeValue);
    return'';
  }

  function componentRows(){
    var order=['R','O','B','U','S','T'];
    var values=Object.create(null);
    document.querySelectorAll('#plm-robust-score-sec .wdps-row').forEach(function(row){
      var label=row.querySelector('.wdps-label a'),score=row.querySelector('.wdps-n');
      var match=clean(label&&label.textContent).match(/^([ROBUST])\s*·/i);
      if(match)values[match[1].toUpperCase()]=clean(score&&score.textContent)||'-';
    });
    return order.map(function(letter){return{letter:letter,value:values[letter]||'-'};});
  }
  function componentsMarkup(rows){
    return rows.map(function(item){return'<span><b>'+esc(item.letter)+'</b><em>'+esc(item.value)+'</em></span>';}).join('');
  }
  /* Street-level map of the searched property with its lot outlined, filling
     the right side of the property header. Uses the NJ Office of GIS light-gray
     basemap (the site's standard free map; free-imagery-grid-runtime.js keeps
     aerials and Street View off property surfaces) plus the statewide parcel
     layer for neighboring lot lines. The searched lot's shape comes from the
     lookup itself (window.WatchdogLookupParcel). */
  var NJ_MAP='https://maps.nj.gov/arcgis/rest/services/Basemap/LtGray_NJ_WM/MapServer/export';
  var NJ_PARCELS='https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
  var MAP_W=760,MAP_H=560;
  var neighborCache=Object.create(null);
  function mercX(lon){return Number(lon)*Math.PI/180*6378137;}
  function mercY(lat){return Math.log(Math.tan(Math.PI/4+Number(lat)*Math.PI/360))*6378137;}
  function lotParcel(){
    /* lookup.js sets this right before it paints #plm-photos for a property,
       so it always belongs to the property the header is showing. */
    var p=window.WatchdogLookupParcel;
    if(!p||!isFinite(p.lat)||!isFinite(p.lon))return null;
    return p;
  }
  function lotFrame(p){
    var rings=Array.isArray(p.rings)?p.rings.filter(function(r){return Array.isArray(r)&&r.length>2;}):[];
    var cx=mercX(p.lon),cy=mercY(p.lat),mpp=0.4;
    if(rings.length){
      var x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
      rings.forEach(function(r){r.forEach(function(pt){var x=mercX(pt[0]),y=mercY(pt[1]);if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;});});
      cx=(x0+x1)/2;cy=(y0+y1)/2;
      /* Lot fills about a third of the frame so the street and neighbors show. */
      mpp=Math.min(4,Math.max(0.3,Math.max((x1-x0)/MAP_W,(y1-y0)/MAP_H)*3.4));
    }
    return{rings:rings,mpp:mpp,box:[cx-mpp*MAP_W/2,cy-mpp*MAP_H/2,cx+mpp*MAP_W/2,cy+mpp*MAP_H/2]};
  }
  function ringPath(rings,f,project){
    return rings.map(function(r){return'M'+r.map(function(pt){var xy=project(pt);return((xy[0]-f.box[0])/f.mpp).toFixed(1)+' '+((f.box[3]-xy[1])/f.mpp).toFixed(1);}).join('L')+'Z';}).join('');
  }
  function lonLat(pt){return[mercX(pt[0]),mercY(pt[1])];}
  function lotMapMarkup(p){
    var f=lotFrame(p);
    var url=NJ_MAP+'?'+new URLSearchParams({bbox:f.box.join(','),bboxSR:'3857',imageSR:'3857',size:MAP_W+','+MAP_H,format:'jpg',transparent:'false',f:'image'}).toString();
    var shape=f.rings.length
      ?'<path class="wd-lot-shape" fill-rule="evenodd" d="'+ringPath(f.rings,f,lonLat)+'"/>'
      :'<circle class="wd-lot-pin" cx="'+((mercX(p.lon)-f.box[0])/f.mpp).toFixed(1)+'" cy="'+((f.box[3]-mercY(p.lat))/f.mpp).toFixed(1)+'" r="9"/>';
    var label=(p.block||p.lot)?'Block '+esc(p.block||'?')+', Lot '+esc(p.lot||'?'):'Property location';
    return'<div class="wd-lot-map" data-pin="'+esc(p.pin)+'">'+
      '<img src="'+esc(url)+'" data-wd-map-image="1" alt="Street map of '+esc(p.address)+' with its lot outlined" decoding="async" onerror="this.remove()">'+
      '<svg viewBox="0 0 '+MAP_W+' '+MAP_H+'" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><g class="wd-lot-neighbors"></g>'+shape+'</svg>'+
      '<span class="wd-lot-map-label">'+label+'</span>'+
      '<span class="wd-lot-map-source">Map: NJ Office of GIS. Lot lines are approximate.</span>'+
    '</div>';
  }
  /* Neighboring lot lines, drawn after the header paints. Cached per lot so a
     header refresh (score or city arriving) doesn't refetch. */
  function drawNeighbors(p){
    var host=document.querySelector('#plm-photos .wd-lot-map .wd-lot-neighbors');
    if(!host||host.dataset.pin===String(p.pin))return;
    host.dataset.pin=String(p.pin);
    var f=lotFrame(p),key=String(p.pin||'')+'|'+f.box.join(',');
    if(!neighborCache[key]){
      var q=new URLSearchParams({
        geometry:JSON.stringify({xmin:f.box[0],ymin:f.box[1],xmax:f.box[2],ymax:f.box[3],spatialReference:{wkid:3857}}),
        geometryType:'esriGeometryEnvelope',inSR:'3857',outSR:'3857',spatialRel:'esriSpatialRelIntersects',
        outFields:'PAMS_PIN',returnGeometry:'true',maxAllowableOffset:String(f.mpp/2),resultRecordCount:'250',f:'json'
      });
      neighborCache[key]=fetch(NJ_PARCELS+'?'+q.toString()).then(function(r){return r.ok?r.json():null;}).then(function(d){
        return(d&&d.features||[]).filter(function(x){return x.geometry&&x.geometry.rings&&String(x.attributes&&x.attributes.PAMS_PIN)!==String(p.pin);});
      }).catch(function(){return[];});
    }
    neighborCache[key].then(function(features){
      if(!document.body.contains(host)||!features.length)return;
      host.innerHTML='<path d="'+features.map(function(x){return ringPath(x.geometry.rings,f,function(pt){return pt;});}).join('')+'"/>';
    });
  }
  function syncBrandedHero(){
    var photos=document.getElementById('plm-photos');
    var addrBox=document.querySelector('#plm .plm-addr');
    if(!photos||!addrBox)return;
    var address=addressText(addrBox)||'New Jersey property';
    var score=canonicalScore();
    var rows=componentRows();
    var statusNode=photos.querySelector('.plm-tag');
    var status=clean(statusNode&&statusNode.textContent);
    var parcel=lotParcel();
    var signature=[address,score,status,rows.map(function(x){return x.letter+':'+x.value;}).join(','),parcel?parcel.pin+'@'+parcel.lat+','+parcel.lon:''].join('|');
    var existing=photos.querySelector('.wd-mapless-property-hero');
    if(existing&&existing.dataset.signature===signature)return;
    photos.querySelectorAll('img').forEach(function(img){try{img.removeAttribute('srcset');img.removeAttribute('data-fallback');img.removeAttribute('src');}catch(_error){}img.remove();});
    var scoreHtml=score?'<div class="wd-mapless-score">'+esc(score)+'<em>/100</em></div>':'<div class="wd-mapless-score building">Score building</div>';
    var statusHtml=status?'<span class="wd-mapless-status">'+esc(status)+'</span>':'';
    photos.innerHTML='<div class="wd-mapless-property-hero" data-signature="'+esc(signature)+'"><div class="wd-mapless-property-in">'+
      '<div><h2 class="wd-mapless-address">'+esc(address)+'</h2><p class="wd-mapless-copy">Rendered maps and third-party property imagery are temporarily disabled on this page. The property record, Watchdog Score and checked ROBUST evidence remain available.</p>'+statusHtml+'</div>'+
      '<div class="wd-mapless-scorebox"><span class="wd-mapless-scorelabel"><i class="fas fa-shield-dog"></i> Watchdog Score</span>'+scoreHtml+'<div class="wd-mapless-robust-title">ROBUST FRAMEWORK</div><div class="wd-mapless-components">'+componentsMarkup(rows)+'</div></div>'+
      '<div class="wd-mapless-photo-note"><i class="fas fa-camera"></i><span>Owner-submitted property photos are planned as the replacement for third-party rendered imagery.</span></div>'+
      '</div></div>'+(parcel?lotMapMarkup(parcel):'');
    photos.classList.toggle('wd-has-lot-map',!!parcel);
    if(parcel)drawNeighbors(parcel);
  }

  function geocodeLocality(address,municipality){
    var key=(clean(address)+'|'+clean(municipality)).toUpperCase();
    if(cityCache[key])return cityCache[key];
    var p=new URLSearchParams({SingleLine:[address,municipality,'NJ'].filter(Boolean).join(', '),outFields:'City,Postal,Addr_type',outSR:'4326',maxLocations:'1',f:'json'});
    cityCache[key]=fetch(GEOCODER+'?'+p.toString()).then(function(r){return r.ok?r.json():null;}).then(function(j){
      var c=j&&j.candidates&&j.candidates[0];
      if(!c||Number(c.score||0)<70)return null;
      var a=c.attributes||{};
      var city=clean(a.City||a.city),zip=njZip(a.Postal||a.postal||'');
      if(!city&&!zip)return null;
      return{city:city,zip:zip};
    }).catch(function(){return null;});
    return cityCache[key];
  }

  function syncCity(){
    var box=document.querySelector('#plm .plm-addr');
    var line=box&&box.querySelector(':scope > span');
    if(!box||!line||line.dataset.wdCity==='1')return;
    var address=addressText(box),old=clean(line.textContent);
    if(!address||!old)return;
    var municipality=clean(old.split(',')[0]);
    if(!municipality)return;
    var key=(address+'|'+municipality).toUpperCase();
    if(line.dataset.wdCityKey===key)return;
    line.dataset.wdCityKey=key;
    geocodeLocality(address,municipality).then(function(loc){
      if(!loc||line.dataset.wdCityKey!==key)return;
      var county='';
      var cm=old.match(/,\s*([^,\d]+?)\s+County/i);if(cm)county=clean(cm[1]);
      var familiar=[loc.city,'NJ',loc.zip].filter(Boolean).join(' ');
      if(!familiar)return;
      setText(line,familiar);
      line.dataset.wdCity='1';
      line.title='Municipality: '+municipality+(county?' · '+county+' County':'');
      syncBrandedHero();
    });
  }

  function sync(){
    scheduled=false;
    document.documentElement.classList.add('wd-index-mapless');
    ensureStyles();
    ensureQuickTiles();
    ensureTaxBurden();
    syncWatchdogScore();
    syncTaxValue();
    syncBurden();
    syncCity();
    syncBrandedHero();
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(sync);}

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
  if(typeof MutationObserver!=='undefined')new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  window.WatchdogLookupSummaryEnhancements={sync:sync};
})();