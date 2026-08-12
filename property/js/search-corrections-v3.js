/* NJW-96 correction v3: statewide search, persisted peer scores, sliders, card actions. */
(function(){
  'use strict';
  var PARCEL='https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
  var GEOCODE='https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
  var SB_URL='https://uvkvaxljhhngydvlrzom.supabase.co';
  var SB_KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var client=null,scoreBusy=false,lastScoreSig='';

  function sb(){
    if(client)return client;
    if(window.__njwSB){client=window.__njwSB;return client;}
    if(!window.supabase)return null;
    client=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}});
    window.__njwSB=client;
    return client;
  }
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function pinOf(card){var b=card.querySelector('[data-save-pin]');return b?b.getAttribute('data-save-pin'):'';}
  function median(a){if(!a.length)return 0;var b=a.slice().sort(function(x,y){return x-y;}),m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2;}
  function townFromTitle(){var h=document.getElementById('hd-results-title');return h?h.textContent.replace(/,\s*NJ\s+Property Tax Assessments.*$/i,'').trim():'';}

  /* Statewide search: never filter only the already-rendered cards. */
  function installGlobalSearch(){
    if(window.__njwGlobalSearchInstalled)return; window.__njwGlobalSearchInstalled=true;
    document.addEventListener('input',function(e){
      if(e.target&&e.target.id==='hd-result-search') e.stopImmediatePropagation();
    },true);
    document.addEventListener('keydown',function(e){
      if(!e.target||e.target.id!=='hd-result-search'||e.key!=='Enter')return;
      e.preventDefault();e.stopImmediatePropagation();runGlobalSearch(e.target.value);
    },true);
    document.addEventListener('click',function(e){
      var go=e.target.closest&&e.target.closest('#hd-result-go,.njw-search-slot .hd-searchbox button');
      if(!go)return;
      var input=document.getElementById('hd-result-search')||document.querySelector('.njw-search-slot input');
      if(!input)return;
      e.preventDefault();e.stopImmediatePropagation();runGlobalSearch(input.value);
    },true);
  }
  function runGlobalSearch(raw){
    var q=String(raw||'').trim(); if(!q)return;
    var map=window.__njw96HoodMap; if(!map)return;
    var p=new URLSearchParams({SingleLine:/\bNJ\b/i.test(q)?q:(q+', NJ'),outSR:'4326',maxLocations:'1',f:'json'});
    var count=document.getElementById('hd-countline'); if(count)count.innerHTML='<strong>Searching New Jersey…</strong>';
    fetch(GEOCODE+'?'+p.toString()).then(function(r){return r.json();}).then(function(d){
      var c=d&&d.candidates&&d.candidates[0]; if(!c||!c.location)throw new Error('no match');
      var addressLike=/\d/.test(q),zoom=addressLike?15:12;
      map.setView([c.location.y,c.location.x],zoom,{animate:false});
      setTimeout(function(){map.fire('moveend');},80);
    }).catch(function(){if(count)count.innerHTML='<strong>No New Jersey match found</strong>';});
  }

  function ensureMenus(){
    document.querySelectorAll('#hd-list .hd-card').forEach(function(card){
      var body=card.querySelector('.hd-body'),val=card.querySelector('.hd-val'); if(!body||!val)return;
      var row=body.querySelector('.njw-val-row');
      if(!row){row=document.createElement('div');row.className='njw-val-row';val.parentNode.insertBefore(row,val);row.appendChild(val);}
      var btn=card.querySelector('.njw-card-menu-btn'),menu=card.querySelector('.njw-card-menu');
      if(!btn){btn=document.createElement('button');btn.type='button';btn.className='njw-card-menu-btn';btn.setAttribute('aria-label','Property options');btn.innerHTML='<i class="fas fa-ellipsis"></i>';row.appendChild(btn);}
      else if(btn.parentNode!==row)row.appendChild(btn);
      if(!menu){menu=document.createElement('div');menu.className='njw-card-menu';menu.innerHTML='<button type="button" data-card-hide><i class="far fa-eye-slash"></i> Hide</button><button type="button" data-card-share><i class="fas fa-share-nodes"></i> Share</button>';body.appendChild(menu);}
      if(btn.dataset.bound!=='1'){
        btn.dataset.bound='1';
        btn.addEventListener('click',function(e){e.stopPropagation();document.querySelectorAll('.njw-card-menu.open').forEach(function(m){if(m!==menu)m.classList.remove('open');});menu.classList.toggle('open');});
        menu.addEventListener('click',function(e){e.stopPropagation();if(e.target.closest('[data-card-hide]')){card.hidden=true;menu.classList.remove('open');updateVisibleCount();}if(e.target.closest('[data-card-share]')){shareCard(card);menu.classList.remove('open');}});
      }
    });
  }
  function updateVisibleCount(){var c=document.getElementById('hd-countline');if(c){var n=document.querySelectorAll('#hd-list .hd-card:not([hidden])').length;c.innerHTML='<strong>'+n+' properties</strong>';}}
  function shareCard(card){
    var addr=(card.querySelector('.hd-addr')||{}).textContent||card.textContent.trim().split('\n').slice(0,3).join(' '),url=location.href;
    if(navigator.share){navigator.share({title:addr,text:addr,url:url}).catch(function(){});return;}
    if(navigator.clipboard){navigator.clipboard.writeText(addr+' — '+url);}
  }

  /* Add dual-handle sliders to every range panel while retaining manual entry. */
  function installSliders(){
    var cfg={a:{min:0,max:5000000,step:10000},t:{min:0,max:75000,step:250},s:{min:0,max:100,step:1}};
    Object.keys(cfg).forEach(function(k){
      var panel=document.querySelector('[data-range-panel="'+k+'"]');if(!panel||panel.querySelector('.njw-dual-slider'))return;
      var inputs=panel.querySelector('.njw-range-inputs'),c=cfg[k],wrap=document.createElement('div');wrap.className='njw-dual-slider';
      wrap.innerHTML='<div class="njw-slider-labels"><span>Min</span><span>Max</span></div><div class="njw-slider-track"><i></i><input class="njw-slider-min" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+c.min+'"><input class="njw-slider-max" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+c.max+'"></div>';
      panel.insertBefore(wrap,inputs);
      var lo=wrap.querySelector('.njw-slider-min'),hi=wrap.querySelector('.njw-slider-max'),loText=panel.querySelector('[data-range-min="'+k+'"]'),hiText=panel.querySelector('[data-range-max="'+k+'"]'),fill=wrap.querySelector('i');
      function paint(){var a=+lo.value,b=+hi.value;if(a>b){if(document.activeElement===lo)lo.value=b;else hi.value=a;a=+lo.value;b=+hi.value;}fill.style.left=((a-c.min)/(c.max-c.min)*100)+'%';fill.style.right=(100-(b-c.min)/(c.max-c.min)*100)+'%';}
      function fromSlider(){paint();if(loText)loText.value=(+lo.value===c.min?'':lo.value);if(hiText)hiText.value=(+hi.value===c.max?'':hi.value);}
      function fromText(){if(loText&&loText.value!=='')lo.value=Math.max(c.min,Math.min(c.max,+loText.value));else lo.value=c.min;if(hiText&&hiText.value!=='')hi.value=Math.max(c.min,Math.min(c.max,+hiText.value));else hi.value=c.max;paint();}
      lo.addEventListener('input',fromSlider);hi.addEventListener('input',fromSlider);if(loText)loText.addEventListener('input',fromText);if(hiText)hiText.addEventListener('input',fromText);paint();
      var clear=panel.querySelector('[data-range-clear="'+k+'"]');if(clear)clear.addEventListener('click',function(){lo.value=c.min;hi.value=c.max;paint();});
    });
  }

  function scoreFromPeers(subject,rows){
    if(!subject||!subject.assessed)return null;
    var peers=rows.filter(function(c){if(c.pin===subject.pin||!c.assessed||c.assessed<10000)return false;if(subject.built&&c.built&&Math.abs(c.built-subject.built)>18)return false;if(subject.acres&&c.acres&&(c.acres<subject.acres*.5||c.acres>subject.acres*2))return false;return true;});
    if(peers.length<8)peers=rows.filter(function(c){return c.pin!==subject.pin&&c.assessed>10000;});
    if(peers.length<8)return null;
    var med=median(peers.map(function(c){return c.assessed;}));if(!med)return null;
    var gap=(subject.assessed-med)/med;
    return {score:Math.round(50+Math.max(-45,Math.min(45,gap*180))),peerCount:peers.length,peerMedian:med};
  }

  function fetchPeerRows(){
    var map=window.__njw96HoodMap;if(!map)return Promise.resolve([]);var b=map.getBounds(),latPad=Math.max(.015,(b.getNorth()-b.getSouth())*.65),lonPad=Math.max(.02,(b.getEast()-b.getWest())*.65);
    var geom={xmin:b.getWest()-lonPad,ymin:b.getSouth()-latPad,xmax:b.getEast()+lonPad,ymax:b.getNorth()+latPad,spatialReference:{wkid:4326}};
    var p=new URLSearchParams({geometry:JSON.stringify(geom),geometryType:'esriGeometryEnvelope',inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',where:"PROP_CLASS = '2' AND NET_VALUE > 10000",outFields:'PAMS_PIN,MUN_NAME,COUNTY,NET_VALUE,LAST_YR_TX,YR_CONSTR,CALC_ACRE',returnGeometry:'false',resultRecordCount:'2000',f:'json'});
    return fetch(PARCEL+'?'+p.toString()).then(function(r){return r.json();}).then(function(d){return(d.features||[]).map(function(f){var a=f.attributes||{};return{pin:a.PAMS_PIN||'',town:a.MUN_NAME||'',county:a.COUNTY||'',assessed:+a.NET_VALUE||0,tax:+a.LAST_YR_TX||0,built:+a.YR_CONSTR||0,acres:+a.CALC_ACRE||0};});});
  }
  function paintScore(card,val,title){var b=card.querySelector('.njw-card-score b');if(!b)return;b.textContent=val==null?'Calculating…':String(Math.round(val));if(title)b.title=title;card.dataset.watchdogScore=val==null?'':String(val);}
  function ensureScoreLine(card){var body=card.querySelector('.hd-body');if(!body)return;var line=body.querySelector('.njw-card-score');if(!line){line=document.createElement('div');line.className='njw-card-score';line.innerHTML='<i class="fas fa-shield-dog"></i> Watchdog Score <b>Calculating…</b>';body.appendChild(line);}return line;}

  function scoreCards(){
    console.log('[WD DEBUG] scoreCards() entered. scoreBusy=',scoreBusy,' sb()=',!!sb(),' hood-on=',document.body.classList.contains('hood-on'));
    if(scoreBusy||!sb()||!document.body.classList.contains('hood-on')){console.log('[WD DEBUG] scoreCards() blocked by guard, returning early');return;}
    var cards=Array.prototype.slice.call(document.querySelectorAll('#hd-list .hd-card'));
    console.log('[WD DEBUG] card count found:',cards.length);
    if(!cards.length){console.log('[WD DEBUG] no cards, returning early');return;}
    cards.forEach(function(c){ensureScoreLine(c);});
    var pins=cards.map(pinOf).filter(Boolean),sig=pins.join('|');if(sig===lastScoreSig&&cards.every(function(c){return c.dataset.njwPeerScoreDone==='1';}))return;lastScoreSig=sig;scoreBusy=true;
    console.log('[WD DEBUG] about to call get_public_watchdog_score_cache with pins:',pins);
    sb().rpc('get_public_watchdog_score_cache',{p_pins:pins}).then(function(cacheRes){
      console.log('[WD DEBUG] cache RPC resolved:',cacheRes);
      var cache=Object.create(null);if(!cacheRes.error)(cacheRes.data||[]).forEach(function(x){cache[x.pams_pin]=+x.watchdog_score;});
      cards.forEach(function(c){var v=cache[pinOf(c)];if(v!=null){paintScore(c,v,'Saved Watchdog peer score');c.dataset.njwPeerScoreDone='1';}else paintScore(c,null);});
      var missing=cards.filter(function(c){return !c.dataset.njwPeerScoreDone;});if(!missing.length)return [];
      return fetchPeerRows().then(function(rows){
        var byPin=Object.create(null);rows.forEach(function(x){byPin[x.pin]=x;});var saves=[];
        missing.forEach(function(card){var subject=byPin[pinOf(card)],sc=scoreFromPeers(subject,rows);if(!sc){paintScore(card,50,'Neutral fallback: insufficient peer evidence');card.dataset.njwPeerScoreDone='1';return;}paintScore(card,sc.score,'Calculated on demand from nearby comparable assessments');card.dataset.njwPeerScoreDone='1';saves.push({pams_pin:subject.pin,watchdog_score:sc.score,town:subject.town,county:subject.county,peer_count:sc.peerCount,peer_median:sc.peerMedian,assessed_value:subject.assessed});});
        if(saves.length)return sb().rpc('save_public_watchdog_score_cache',{p_rows:saves});return [];
      });
    }).catch(function(e){console.error('[WD DEBUG] scoreCards promise chain rejected:',e);cards.forEach(function(c){if(!c.dataset.njwPeerScoreDone){paintScore(c,50,'Neutral fallback');c.dataset.njwPeerScoreDone='1';}});}).finally(function(){scoreBusy=false;var sel=document.getElementById('njw-sort-select');if(sel&&/score/i.test(sel.value))sel.dispatchEvent(new Event('change'));});
  }

  function fixScrollEnd(){
    var right=document.querySelector('#pl-hood .hd-right'),art=document.getElementById('njw-search-art');if(!right||!art)return;
    if(art.parentNode!==right)right.appendChild(art);if(art!==right.lastElementChild)right.appendChild(art);
  }

  function scan(){
    console.log('[WD DEBUG] scan() called');
    try{installSliders();}catch(e){console.error('[WD DEBUG] installSliders threw:',e);}
    try{ensureMenus();}catch(e){console.error('[WD DEBUG] ensureMenus threw:',e);}
    try{scoreCards();}catch(e){console.error('[WD DEBUG] scoreCards threw:',e);}
    try{fixScrollEnd();}catch(e){console.error('[WD DEBUG] fixScrollEnd threw:',e);}
  }
  installGlobalSearch();
  var obs=new MutationObserver(function(){clearTimeout(window.__njwV3Scan);window.__njwV3Scan=setTimeout(scan,90);});obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('load',scan);scan();
})();
