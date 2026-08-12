/* NJW-96 correction layer. Runs after search-polish-runtime.js. */
(function(){
  'use strict';
  var PARCEL='https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
  var SB_URL='https://uvkvaxljhhngydvlrzom.supabase.co';
  var SB_KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var client=null, scoreBusy=false, nearKey='';

  function sb(){
    if(client||!window.supabase)return client;
    client=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}});
    return client;
  }
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function norm(v){return String(v||'').toUpperCase().replace(/\bTOWNSHIP\b/g,'TWP').replace(/\bBOROUGH\b/g,'BORO').replace(/[^A-Z0-9]/g,'');}
  function pinOf(card){var b=card.querySelector('[data-save-pin]');return b?b.getAttribute('data-save-pin'):'';}
  function distanceMiles(a,b){
    var r=3958.7613,rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLon=(b.lon-a.lon)*rad;
    var q=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)*Math.sin(dLon/2);
    return 2*r*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));
  }

  function polishHeader(){
    var nav=document.querySelector('body.hood-on .ssearch');
    if(nav){nav.style.boxShadow='none';nav.style.filter='none';}
  }

  function moveCardMenu(card){
    var btn=card.querySelector('.njw-card-menu-btn'), menu=card.querySelector('.njw-card-menu'), body=card.querySelector('.hd-body'), val=card.querySelector('.hd-val');
    if(!btn||!body||!val)return;
    var row=body.querySelector('.njw-val-row');
    if(!row){
      row=document.createElement('div');row.className='njw-val-row';
      val.parentNode.insertBefore(row,val);row.appendChild(val);
    }
    if(btn.parentNode!==row)row.appendChild(btn);
    if(menu&&menu.parentNode!==body)body.appendChild(menu);
  }

  function ensureScoreLines(){
    var cards=Array.prototype.slice.call(document.querySelectorAll('#hd-list .hd-card'));
    cards.forEach(function(card){
      moveCardMenu(card);
      var body=card.querySelector('.hd-body');if(!body)return;
      var line=body.querySelector('.njw-card-score');
      if(!line){line=document.createElement('div');line.className='njw-card-score';line.innerHTML='<i class="fas fa-shield-dog"></i> Watchdog Score <b></b>';body.appendChild(line);}
      var b=line.querySelector('b');
      if(!card.dataset.njwScoreResolved){b.textContent='Loading…';b.classList.add('loading');}
    });
    hydrateScores(cards);
  }

  function hydrateScores(cards){
    if(scoreBusy||!cards.length||!sb())return;
    var pending=cards.filter(function(c){return !c.dataset.njwScoreResolved&&pinOf(c);});
    if(!pending.length)return;
    scoreBusy=true;
    var pins=pending.map(pinOf);
    sb().rpc('get_public_property_watchdog_scores',{p_pins:pins}).then(function(r){
      var map=Object.create(null);
      if(!r.error)(r.data||[]).forEach(function(x){map[x.pams_pin]=+x.watchdog_score;});
      pending.forEach(function(card){
        var line=card.querySelector('.njw-card-score'),b=line&&line.querySelector('b'),pin=pinOf(card),score=map[pin];
        card.dataset.njwScoreResolved='1';
        if(b){b.classList.remove('loading');b.textContent=score==null?'Not scored yet':String(Math.round(score));}
      });
    }).catch(function(){
      pending.forEach(function(card){var b=card.querySelector('.njw-card-score b');card.dataset.njwScoreResolved='1';if(b){b.classList.remove('loading');b.textContent='Unavailable';}});
    }).finally(function(){scoreBusy=false;});
  }

  function restoreFooter(){
    var hood=document.getElementById('pl-hood'),footer=document.getElementById('wd-property-footer');
    if(!hood||!footer)return;
    if(footer.parentNode===document.querySelector('#pl-hood .hd-right')||footer.closest('#pl-hood')){
      hood.parentNode.insertBefore(footer,hood.nextSibling);
    }
    footer.style.display='block';footer.style.width='100%';
  }

  function directoryTownMap(){
    var map=Object.create(null);
    document.querySelectorAll('.njw-county-group').forEach(function(group){
      var h=group.querySelector('h4'),county=h?h.textContent.replace(/\s+County\s*$/i,'').trim():'';
      group.querySelectorAll('.njw-all-town-links a').forEach(function(a){
        var s=a.querySelector('span'),b=a.querySelector('b');if(!s)return;
        map[norm(county)+'|'+norm(s.textContent)]={town:s.textContent.trim(),county:county,href:a.getAttribute('href')||'#',avg:b?b.textContent.trim():'Assessment available'};
      });
    });
    return map;
  }

  function renderNearbyWithinTen(){
    var mapObj=window.__njw96HoodMap,block=document.querySelector('#hd-seo .njw-seo-block');
    if(!mapObj||!block||!document.querySelector('.njw-all-town-links'))return;
    var c=mapObj.getCenter(),key=c.lat.toFixed(3)+'|'+c.lng.toFixed(3);
    if(key===nearKey&&block.dataset.radiusFixed==='1')return;
    nearKey=key;
    var latSpan=10/69,lonSpan=10/(69*Math.max(.25,Math.cos(c.lat*Math.PI/180)));
    var params=new URLSearchParams({
      geometry:JSON.stringify({xmin:c.lng-lonSpan,ymin:c.lat-latSpan,xmax:c.lng+lonSpan,ymax:c.lat+latSpan,spatialReference:{wkid:4326}}),
      geometryType:'esriGeometryEnvelope',inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',
      where:"PROP_CLASS = '2' AND NET_VALUE > 10000",outFields:'MUN_NAME,COUNTY',returnGeometry:'false',returnCentroid:'true',resultRecordCount:'2000',f:'json'
    });
    fetch(PARCEL+'?'+params.toString()).then(function(r){return r.json();}).then(function(d){
      var groups=Object.create(null);
      (d.features||[]).forEach(function(f){var a=f.attributes||{},p=f.centroid||{};if(!a.MUN_NAME||!a.COUNTY||p.x==null||p.y==null)return;var k=norm(a.COUNTY)+'|'+norm(a.MUN_NAME),g=groups[k]||(groups[k]={town:a.MUN_NAME,county:a.COUNTY,lat:0,lon:0,n:0});g.lat+=+p.y;g.lon+=+p.x;g.n++;});
      var rows=Object.keys(groups).map(function(k){var g=groups[k];g.lat/=g.n;g.lon/=g.n;g.distance=distanceMiles({lat:c.lat,lon:c.lng},{lat:g.lat,lon:g.lon});return g;}).filter(function(x){return x.distance<=10;}).sort(function(a,b){return a.distance-b.distance;});
      var current=(document.getElementById('hd-results-title')||{}).textContent||'';current=norm(current.replace(/,\s*NJ\s+Property Tax Assessments.*$/i,''));
      rows=rows.filter(function(x){return norm(x.town)!==current;}).slice(0,10);
      var dir=directoryTownMap();
      var cards=rows.map(function(x){var data=dir[norm(x.county)+'|'+norm(x.town)]||{town:x.town,county:x.county,href:'#',avg:'Assessment available'};return '<a class="njw-town-card" href="'+esc(data.href)+'"><b>'+esc(data.town)+'</b><span>'+esc(data.county)+' County · '+x.distance.toFixed(1)+' mi</span><em>Avg. assessment '+esc(data.avg)+'</em></a>';}).join('');
      var title=block.querySelector('.njw-seo-title h4'),p=block.querySelector('.njw-seo-title p'),grid=block.querySelector('.njw-town-grid');
      if(title)title.innerHTML='Nearby towns <span class="njw-near-radius">within 10 miles</span>';
      if(p)p.textContent=rows.length>=5?'The closest municipalities within a 10-mile radius.':'Municipalities found within a 10-mile radius.';
      if(grid&&cards)grid.innerHTML=cards;
      block.dataset.radiusFixed='1';
    }).catch(function(){});
  }

  function scan(){
    if(!document.body.classList.contains('hood-on'))return;
    polishHeader();restoreFooter();renderNearbyWithinTen();
    // ensureScoreLines()/hydrateScores() removed: search-corrections-v3.js
    // now owns the visible Watchdog Score line. Running this too caused a
    // flicker/overwrite race between competing score-fetch calls.
    var cards=Array.prototype.slice.call(document.querySelectorAll('#hd-list .hd-card'));
    cards.forEach(moveCardMenu);
  }
  var obs=new MutationObserver(function(){clearTimeout(window.__njwCorrectionScan);window.__njwCorrectionScan=setTimeout(scan,90);});
  obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('load',scan);scan();
})();
