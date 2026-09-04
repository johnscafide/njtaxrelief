/* Watchdog landing recent-property intelligence.
   Adds the canonical Watchdog Score to recent property cards, repairs familiar
   mailing locality for signed-in rows, and keeps the public index mapless while
   preserving real property imagery. ROBUST details remain on the property page. */
(function(){
  'use strict';
  if(window.__WATCHDOG_LANDING_RECENT_INTELLIGENCE__)return;
  window.__WATCHDOG_LANDING_RECENT_INTELLIGENCE__=true;

  var pathname=(location.pathname||'').replace(/\/+$/,'');
  var hostname=String(location.hostname||'').toLowerCase();
  var root=(hostname==='watchdogindex.com'||hostname==='www.watchdogindex.com')&&pathname==='';
  if(pathname!=='/property'&&pathname!=='/property/index.html'&&!root)return;

  var GEOCODER='https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
  var SCORE_MARKER='watchdog.watchdog_score';
  var SCORE_MODEL='ROBUST-v1';
  var sb=null,rowsByAddress=Object.create(null),scoresByPin=Object.create(null),syncPromise=null,scanTimer=0;

  function clean(v){return String(v==null?'':v).trim();}
  function norm(v){return clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function esc(v){return clean(v).replace(/[&<>\"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c];});}
  function njZip(v){return /^0[78]\d{3}$/.test(clean(v));}
  function titleCase(v){
    var raw=clean(v);
    if(!raw||raw!==raw.toUpperCase())return raw;
    return raw.toLowerCase().replace(/\b([a-z])/g,function(m){return m.toUpperCase();});
  }
  function shortMunicipality(v){return titleCase(v).replace(/\bTownship\b/gi,'Twp').replace(/\bBorough\b/gi,'Boro');}
  function suspiciousLocality(row){
    var city=clean(row&&row.city),town=clean(row&&row.town);
    return !city||!njZip(row&&row.zip)||/\b(?:TWP|TOWNSHIP|BORO|BOROUGH)\b/i.test(city)||(city&&town&&norm(city)===norm(town)&&/\b(?:TWP|TOWNSHIP|BORO|BOROUGH)\b/i.test(town));
  }
  function getClient(){
    if(sb)return sb;
    try{
      if(window.NJPTRSupabaseRuntime&&typeof window.NJPTRSupabaseRuntime.createClient==='function')sb=window.NJPTRSupabaseRuntime.createClient();
      if(!sb&&window.__njwSB)sb=window.__njwSB;
    }catch(_error){}
    return sb;
  }
  function enableMaplessMode(){
    document.documentElement.classList.add('wd-index-mapless');
    window.__WATCHDOG_INDEX_MAPS_DISABLED__=true;
  }
  function ensureStyles(){
    if(document.getElementById('wd-landing-recent-intelligence-style'))return;
    var style=document.createElement('style');
    style.id='wd-landing-recent-intelligence-style';
    style.textContent=[
      'html.wd-index-mapless #plm-map,html.wd-index-mapless #hd-map,html.wd-index-mapless .leaflet-container{display:none!important;visibility:hidden!important;pointer-events:none!important;max-height:0!important;overflow:hidden!important}',
      'html.wd-index-mapless #plm section:has(#plm-map),html.wd-index-mapless #plm .plm-sec:has(#plm-map),html.wd-index-mapless .hd-mapwrap:has(#hd-map){display:none!important}',
      '#wd-consumer-recents .wd-property-copy>p[data-watchdog-locality]{text-transform:none!important}'
    ].join('');
    document.head.appendChild(style);
  }

  function localityLine(row){
    var city=titleCase(clean(row&&row.city)||clean(row&&row.town));
    var town=shortMunicipality(row&&row.town);
    var zip=njZip(row&&row.zip)?clean(row.zip):'';
    var line=city?(city+', NJ'+(zip?' '+zip:'')):('NJ'+(zip?' '+zip:''));
    if(city&&town&&norm(city)!==norm(town))line+=' · '+town;
    return line;
  }
  function geocode(row){
    if(!row||!clean(row.address))return Promise.resolve(null);
    var query=[clean(row.address),clean(row.town),'NJ',njZip(row.zip)?clean(row.zip):''].filter(Boolean).join(', ');
    var params=new URLSearchParams({SingleLine:query,outFields:'City,Postal,Addr_type',outSR:'4326',maxLocations:'1',f:'json'});
    var ctl=typeof AbortController!=='undefined'?new AbortController():null;
    var timer=ctl?setTimeout(function(){ctl.abort();},7000):null;
    return fetch(GEOCODER+'?'+params.toString(),ctl?{signal:ctl.signal}:undefined).then(function(r){if(timer)clearTimeout(timer);if(!r.ok)throw new Error(String(r.status));return r.json();}).then(function(data){
      var c=data&&data.candidates&&data.candidates[0];
      if(!c||Number(c.score||0)<80)return null;
      var a=c.attributes||{},city=clean(a.City||a.city),postal=clean(a.Postal||a.postal),loc=c.location||{};
      if(!city)return null;
      return{city:city,zip:njZip(postal)?postal:(njZip(row.zip)?clean(row.zip):''),lat:Number.isFinite(Number(loc.y))?Number(loc.y):null,lon:Number.isFinite(Number(loc.x))?Number(loc.x):null};
    }).catch(function(){if(timer)clearTimeout(timer);return null;});
  }
  function repairLocality(row){
    if(!suspiciousLocality(row))return Promise.resolve(row);
    return geocode(row).then(function(hit){
      if(!hit)return row;
      row.city=hit.city||row.city;
      if(hit.zip)row.zip=hit.zip;
      if(hit.lat!=null)row.lat=hit.lat;
      if(hit.lon!=null)row.lon=hit.lon;
      var client=getClient();
      if(client&&row.id){
        var patch={city:row.city,zip:row.zip};
        if(hit.lat!=null)patch.lat=hit.lat;
        if(hit.lon!=null)patch.lon=hit.lon;
        client.from('saved_properties').update(patch).eq('id',row.id).then(function(){}).catch(function(){});
      }
      return row;
    });
  }

  function latestScoreRows(client,pins){
    if(!client||!pins.length)return Promise.resolve([]);
    return client.from('score_observations')
      .select('pams_pin,score,evidence_coverage,inputs,observed_at,observed_on')
      .in('pams_pin',pins).eq('marker_id',SCORE_MARKER).eq('model_version',SCORE_MODEL)
      .order('observed_at',{ascending:false}).limit(Math.max(24,pins.length*10))
      .then(function(res){return res&&Array.isArray(res.data)?res.data:[];}).catch(function(){return[];});
  }
  function publicScores(client,pins){
    if(!client||!pins.length)return Promise.resolve([]);
    return client.rpc('get_public_property_watchdog_scores',{p_pins:pins}).then(function(res){return res&&Array.isArray(res.data)?res.data:[];}).catch(function(){return[];});
  }
  function indexScores(ownRows,publicRows){
    scoresByPin=Object.create(null);
    (ownRows||[]).forEach(function(x){var pin=clean(x&&x.pams_pin);if(pin&&!scoresByPin[pin])scoresByPin[pin]=x;});
    (publicRows||[]).forEach(function(x){var pin=clean(x&&x.pams_pin);if(!pin)return;if(!scoresByPin[pin])scoresByPin[pin]={pams_pin:pin,score:x.watchdog_score};});
  }
  function scoreMarkup(summary){
    var value=summary&&Number(summary.score);
    if(!Number.isFinite(value))return'<span class="wd-recent-score pending" aria-label="Watchdog Score pending"><b>--</b><small>Score<br>pending</small></span>';
    value=Math.round(value);
    return'<span class="wd-recent-score" aria-label="Watchdog Score '+esc(value)+' of 100"><b>'+esc(value)+'</b><small>Watchdog<br>Score</small></span>';
  }

  function findRow(card){
    var h=card&&card.querySelector('.wd-property-copy h3');
    return h?rowsByAddress[norm(h.textContent)]||null:null;
  }
  function publicPinsFromCards(){
    var seen=Object.create(null),pins=[];
    document.querySelectorAll('#wd-property-grid .wd-property-card[data-pams-pin]').forEach(function(card){
      var pin=clean(card.dataset.pamsPin);if(pin&&!seen[pin]){seen[pin]=true;pins.push(pin);}
    });
    return pins;
  }
  function decorateCard(card){
    if(!card)return;
    var row=findRow(card);
    var photo=card.querySelector('.wd-property-photo');
    var copy=card.querySelector('.wd-property-copy>p');
    if(row&&copy){var line=localityLine(row);if(line)copy.textContent=line;copy.dataset.watchdogLocality='1';if(row.town&&row.city&&norm(row.town)!==norm(row.city))copy.title='Municipality: '+shortMunicipality(row.town);}
    if(!photo)return;
    photo.classList.remove('wd-score-visual');
    var pin=row?clean(row.pams_pin):clean(card.dataset.pamsPin);
    var summary=pin?scoresByPin[pin]||null:null;
    var oldScore=photo.querySelector('.wd-recent-score'),oldRobust=photo.querySelector('.wd-recent-robust');
    if(oldScore)oldScore.remove();if(oldRobust)oldRobust.remove();
    photo.insertAdjacentHTML('beforeend',scoreMarkup(summary));
    var footer=card.querySelector('.wd-property-open');
    if(footer)footer.textContent=summary&&Number.isFinite(Number(summary.score))?'Open property':'Open property and build score';
  }
  function scan(){
    clearTimeout(scanTimer);scanTimer=setTimeout(function(){document.querySelectorAll('#wd-property-grid .wd-property-card').forEach(decorateCard);},10);
  }

  function sync(){
    if(syncPromise)return syncPromise;
    var client=getClient();
    if(!client){scan();setTimeout(sync,180);return Promise.resolve();}
    syncPromise=client.auth.getSession().then(function(auth){
      var session=auth&&auth.data&&auth.data.session;
      if(!session){
        var publicPins=publicPinsFromCards();
        return publicScores(client,publicPins).then(function(publicRows){indexScores([],publicRows);scan();return null;});
      }
      return client.from('saved_properties')
        .select('id,pams_pin,address,city,town,county,zip,assessed,last_year_tax,lat,lon,updated_at')
        .order('updated_at',{ascending:false}).limit(3).then(function(res){
          var rows=res&&Array.isArray(res.data)?res.data:[];
          return Promise.all(rows.map(repairLocality)).then(function(repaired){
            rowsByAddress=Object.create(null);
            repaired.forEach(function(row){if(row&&row.address)rowsByAddress[norm(row.address)]=row;});
            var pins=repaired.map(function(row){return clean(row.pams_pin);}).filter(Boolean);
            return Promise.all([latestScoreRows(client,pins),publicScores(client,pins)]).then(function(parts){indexScores(parts[0],parts[1]);scan();return repaired;});
          });
        });
    }).catch(function(){scan();return null;}).finally(function(){syncPromise=null;});
    return syncPromise;
  }

  function observeGrid(grid){
    if(!grid||typeof MutationObserver==='undefined')return;
    new MutationObserver(function(){scan();setTimeout(sync,0);}).observe(grid,{childList:true});
  }
  function boot(){
    enableMaplessMode();
    ensureStyles();
    scan();
    sync();
    var grid=document.getElementById('wd-property-grid');
    if(grid)observeGrid(grid);
    if(typeof MutationObserver!=='undefined'&&!grid){
      var rootObserver=new MutationObserver(function(){var next=document.getElementById('wd-property-grid');if(!next)return;rootObserver.disconnect();observeGrid(next);scan();sync();});
      rootObserver.observe(document.documentElement,{childList:true,subtree:true});
    }
    window.addEventListener('watchdog:context-refresh',sync);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)sync();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();