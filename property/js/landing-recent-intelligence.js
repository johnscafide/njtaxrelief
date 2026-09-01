/* Watchdog landing recent-property intelligence.
   Adds the governed Watchdog Score and ROBUST component evidence to recent
   property cards, repairs familiar mailing locality, and keeps the public index
   mapless so property visuals cannot interfere with navigation or hit-testing. */
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
  var ORDER=[
    ['recourse','R'],['fairness','O'],['burden','B'],['uniformity','U'],['stability','S'],['trajectory','T']
  ];

  function clean(v){return String(v==null?'':v).trim();}
  function norm(v){return clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function esc(v){return clean(v).replace(/[&<>\"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c];});}
  function njZip(v){return /^0[78]\d{3}$/.test(clean(v));}
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
      '#wd-consumer-recents .wd-property-photo{position:relative!important;overflow:hidden!important}',
      '#wd-consumer-recents .wd-property-photo.wd-score-visual{background:radial-gradient(circle at 82% 16%,rgba(85,151,255,.42),transparent 34%),linear-gradient(145deg,#081d3b 0%,#123f86 54%,#2467d7 100%)!important}',
      '#wd-consumer-recents .wd-property-photo.wd-score-visual:before{content:"";position:absolute;z-index:3;left:18px;top:58px;color:rgba(255,255,255,.62);font:850 9px/1.1 "Plus Jakarta Sans",sans-serif;letter-spacing:.13em}',
      '#wd-consumer-recents .wd-property-photo.wd-score-visual:after{content:"";position:absolute;z-index:2;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(0,8,24,.22))}',
      '#wd-consumer-recents .wd-property-photo.wd-score-visual>img,#wd-consumer-recents .wd-property-photo.wd-score-visual>.wd-property-placeholder{display:none!important}',
      '#wd-consumer-recents .wd-property-label{z-index:6!important}',
      '.wd-recent-score{position:absolute;z-index:5;right:18px;top:18px;min-width:112px;height:84px;padding:12px 14px;border:1px solid rgba(255,255,255,.28);border-radius:22px;background:rgba(5,25,58,.42);box-shadow:0 14px 32px rgba(3,15,36,.22);color:#fff;display:grid;grid-template-columns:30px auto;grid-template-rows:1fr auto;column-gap:9px;align-items:center;backdrop-filter:blur(9px)}',
      '.wd-recent-score i{grid-row:1/-1;width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.13);font-size:13px}',
      '.wd-recent-score b{align-self:end;font:900 34px/.88 "Plus Jakarta Sans",sans-serif;letter-spacing:-.065em}',
      '.wd-recent-score small{align-self:start;margin-top:5px;color:rgba(255,255,255,.7);font:850 8px/1 "Plus Jakarta Sans",sans-serif;letter-spacing:.06em;text-transform:uppercase}',
      '.wd-recent-score.building{min-width:132px;grid-template-columns:30px 1fr}.wd-recent-score.building b{font-size:13px;line-height:1.05;letter-spacing:0}.wd-recent-score.building small{font-size:7px}',
      '.wd-recent-robust{position:absolute;z-index:5;left:18px;right:18px;bottom:14px;display:grid;grid-template-columns:auto repeat(6,minmax(0,1fr));align-items:end;gap:7px;color:#fff;pointer-events:none}',
      '.wd-recent-robust>strong{padding:0 5px 5px 0;font:900 9px/1 "Plus Jakarta Sans",sans-serif;letter-spacing:.12em}',
      '.wd-recent-robust span{min-width:0;text-align:center}',
      '.wd-recent-robust span b{display:block;color:#96f1e6;font:900 9px/1 "Plus Jakarta Sans",sans-serif}',
      '.wd-recent-robust span em{display:block;margin-top:3px;color:#fff;font:850 11px/1 "Plus Jakarta Sans",sans-serif;font-style:normal}',
      '.wd-recent-robust.wd-recent-robust-summary{grid-template-columns:auto 1fr;align-items:center}.wd-recent-robust.wd-recent-robust-summary span{text-align:left;font:750 10px/1.2 "Plus Jakarta Sans",sans-serif;color:rgba(255,255,255,.9)}',
      '#wd-consumer-recents .wd-property-copy>p[data-watchdog-locality]{text-transform:none!important}',
      '@media(max-width:640px){.wd-recent-score{right:13px;top:14px;min-width:98px;height:72px;border-radius:18px;padding:10px 11px}.wd-recent-score b{font-size:28px}.wd-recent-score.building{min-width:118px}.wd-recent-robust{left:13px;right:13px;bottom:11px;gap:5px}.wd-recent-robust>strong{font-size:8px}.wd-recent-robust span b{font-size:8px}.wd-recent-robust span em{font-size:10px}#wd-consumer-recents .wd-property-photo.wd-score-visual:before{left:13px;top:52px;font-size:8px}}',
      '@media(max-width:390px){.wd-recent-robust{gap:4px}.wd-recent-robust>strong{letter-spacing:.08em}.wd-recent-robust span em{font-size:9px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function localityLine(row){
    var city=clean(row&&row.city)||clean(row&&row.town),zip=njZip(row&&row.zip)?clean(row.zip):'';
    return [city,'NJ',zip].filter(Boolean).join(' ');
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
    (publicRows||[]).forEach(function(x){var pin=clean(x&&x.pams_pin);if(!pin)return;if(!scoresByPin[pin])scoresByPin[pin]={pams_pin:pin,score:x.watchdog_score,evidence_coverage:null,inputs:null};});
  }
  function components(summary){
    var raw=summary&&summary.inputs&&summary.inputs.components;
    if(!raw||typeof raw!=='object')return'';
    return ORDER.map(function(item){var d=raw[item[0]]||{},v=d.score==null?'—':Math.round(Number(d.score));return'<span title="'+esc(item[0])+'"><b>'+item[1]+'</b><em>'+esc(v)+'</em></span>';}).join('');
  }
  function scoreMarkup(summary){
    if(!summary||summary.score==null)return'<span class="wd-recent-score building"><i class="fas fa-dog"></i><b>Score building</b><small>ROBUST</small></span>';
    var value=Math.round(Number(summary.score));
    return'<span class="wd-recent-score" aria-label="Watchdog Score '+esc(value)+' of 100"><i class="fas fa-dog"></i><b>'+esc(value)+'</b><small>Watchdog score</small></span>';
  }
  function robustMarkup(summary){
    if(!summary||summary.score==null)return'<span class="wd-recent-robust wd-recent-robust-summary"><strong>ROBUST</strong><span>Open the property to build governed evidence</span></span>';
    var cells=components(summary);
    if(cells)return'<span class="wd-recent-robust" aria-label="ROBUST component scores"><strong>ROBUST</strong>'+cells+'</span>';
    var coverage=Number(summary.evidence_coverage),copy=Number.isFinite(coverage)?Math.round(coverage)+'% evidence coverage':'Governed score';
    return'<span class="wd-recent-robust wd-recent-robust-summary"><strong>ROBUST</strong><span>'+esc(copy)+'</span></span>';
  }

  function findRow(card){
    var h=card&&card.querySelector('.wd-property-copy h3');
    return h?rowsByAddress[norm(h.textContent)]||null:null;
  }
  function stripRenderedPropertyImage(photo){
    if(!photo)return;
    photo.classList.add('wd-score-visual');
    photo.querySelectorAll('img').forEach(function(img){
      try{img.removeAttribute('srcset');img.removeAttribute('data-fallback');img.removeAttribute('src');}catch(_error){}
      img.remove();
    });
  }
  function decorateCard(card){
    if(!card)return;
    var row=findRow(card);
    var photo=card.querySelector('.wd-property-photo');
    var copy=card.querySelector('.wd-property-copy>p');
    if(row&&copy){var line=localityLine(row);if(line)copy.textContent=line;copy.dataset.watchdogLocality='1';if(row.town&&row.city&&norm(row.town)!==norm(row.city))copy.title='Municipality: '+clean(row.town);}
    if(!photo)return;
    stripRenderedPropertyImage(photo);
    var summary=row?scoresByPin[clean(row.pams_pin)]||null:null;
    var oldScore=photo.querySelector('.wd-recent-score'),oldRobust=photo.querySelector('.wd-recent-robust');
    if(oldScore)oldScore.remove();if(oldRobust)oldRobust.remove();
    photo.insertAdjacentHTML('beforeend',scoreMarkup(summary)+robustMarkup(summary));
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
      if(!session){scan();return null;}
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

  function boot(){
    enableMaplessMode();
    ensureStyles();
    scan();
    sync();
    var grid=document.getElementById('wd-property-grid');
    if(grid&&typeof MutationObserver!=='undefined')new MutationObserver(function(){scan();}).observe(grid,{childList:true,subtree:true});
    if(typeof MutationObserver!=='undefined'&&!grid){
      var rootObserver=new MutationObserver(function(){var next=document.getElementById('wd-property-grid');if(!next)return;rootObserver.disconnect();new MutationObserver(function(){scan();}).observe(next,{childList:true,subtree:true});scan();sync();});
      rootObserver.observe(document.documentElement,{childList:true,subtree:true});
    }
    window.addEventListener('watchdog:context-refresh',sync);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)sync();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
