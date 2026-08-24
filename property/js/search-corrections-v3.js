/* NJW-102: statewide search corrections without retired peer-gap scoring. */
(function(){
  'use strict';
  var GEOCODE='https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
  var googleSubmitKey='',googleSubmitAt=0;

  function updateVisibleCount(){
    var c=document.getElementById('hd-countline');
    if(c){var n=document.querySelectorAll('#hd-list .hd-card:not([hidden])').length;c.innerHTML='<strong>'+n+' properties</strong>';}
  }

  function shareCard(card){
    var addr=(card.querySelector('.hd-addr')||{}).textContent||card.textContent.trim().split('\n').slice(0,3).join(' '),url=location.href;
    if(navigator.share){navigator.share({title:addr,text:addr,url:url}).catch(function(){});return;}
    if(navigator.clipboard)navigator.clipboard.writeText(addr+' — '+url);
  }

  function installGlobalSearch(){
    if(window.__njwGlobalSearchInstalled)return;
    window.__njwGlobalSearchInstalled=true;
    document.addEventListener('input',function(e){if(e.target&&e.target.id==='hd-result-search')e.stopImmediatePropagation();},true);
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
    var q=String(raw||'').trim();if(!q)return;
    var map=window.__njw96HoodMap;if(!map)return;
    var p=new URLSearchParams({SingleLine:/\bNJ\b/i.test(q)?q:(q+', NJ'),outSR:'4326',maxLocations:'1',f:'json'});
    var count=document.getElementById('hd-countline');if(count)count.innerHTML='<strong>Searching New Jersey…</strong>';
    fetch(GEOCODE+'?'+p.toString()).then(function(r){return r.json();}).then(function(d){
      var c=d&&d.candidates&&d.candidates[0];if(!c||!c.location)throw new Error('no match');
      map.setView([c.location.y,c.location.x],/\d/.test(q)?15:12,{animate:false});
      setTimeout(function(){map.fire('moveend');},80);
    }).catch(function(){if(count)count.innerHTML='<strong>No New Jersey match found</strong>';});
  }

  function ensureMenus(){
    document.querySelectorAll('#hd-list .hd-card').forEach(function(card){
      var body=card.querySelector('.hd-body'),val=card.querySelector('.hd-val');if(!body||!val)return;
      var row=body.querySelector('.njw-val-row');
      if(!row){row=document.createElement('div');row.className='njw-val-row';val.parentNode.insertBefore(row,val);row.appendChild(val);}
      var btn=card.querySelector('.njw-card-menu-btn'),menu=card.querySelector('.njw-card-menu');
      if(!btn){btn=document.createElement('button');btn.type='button';btn.className='njw-card-menu-btn';btn.setAttribute('aria-label','Property options');btn.innerHTML='<i class="fas fa-ellipsis"></i>';row.appendChild(btn);}else if(btn.parentNode!==row)row.appendChild(btn);
      if(!menu){menu=document.createElement('div');menu.className='njw-card-menu';menu.innerHTML='<button type="button" data-card-hide><i class="far fa-eye-slash"></i> Hide</button><button type="button" data-card-share><i class="fas fa-share-nodes"></i> Share</button>';body.appendChild(menu);}
      if(btn.dataset.bound==='1')return;
      btn.dataset.bound='1';
      btn.addEventListener('click',function(e){e.stopPropagation();document.querySelectorAll('.njw-card-menu.open').forEach(function(m){if(m!==menu)m.classList.remove('open');});menu.classList.toggle('open');});
      menu.addEventListener('click',function(e){e.stopPropagation();if(e.target.closest('[data-card-hide]')){card.hidden=true;menu.classList.remove('open');updateVisibleCount();}if(e.target.closest('[data-card-share]')){shareCard(card);menu.classList.remove('open');}});
    });
  }

  function installSliders(){
    var cfg={a:{min:0,max:5000000,step:10000},t:{min:0,max:75000,step:250}};
    Object.keys(cfg).forEach(function(k){
      var panel=document.querySelector('[data-range-panel="'+k+'"]');if(!panel||panel.querySelector('.njw-dual-slider'))return;
      var inputs=panel.querySelector('.njw-range-inputs'),c=cfg[k],wrap=document.createElement('div');wrap.className='njw-dual-slider';
      wrap.innerHTML='<div class="njw-slider-labels"><span>Min</span><span>Max</span></div><div class="njw-slider-track"><i></i><input class="njw-slider-min" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+c.min+'"><input class="njw-slider-max" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+c.max+'"></div>';
      panel.insertBefore(wrap,inputs);
      var lo=wrap.querySelector('.njw-slider-min'),hi=wrap.querySelector('.njw-slider-max'),loText=panel.querySelector('[data-range-min="'+k+'"]'),hiText=panel.querySelector('[data-range-max="'+k+'"]'),fill=wrap.querySelector('i');
      function paint(){var a=+lo.value,b=+hi.value;if(a>b){if(document.activeElement===lo)lo.value=b;else hi.value=a;a=+lo.value;b=+hi.value;}fill.style.left=((a-c.min)/(c.max-c.min)*100)+'%';fill.style.right=(100-(b-c.min)/(c.max-c.min)*100)+'%';}
      function fromSlider(){paint();if(loText)loText.value=(+lo.value===c.min?'':lo.value);if(hiText)hiText.value=(+hi.value===c.max?'':hi.value);}
      function fromText(){lo.value=loText&&loText.value!==''?Math.max(c.min,Math.min(c.max,+loText.value)):c.min;hi.value=hiText&&hiText.value!==''?Math.max(c.min,Math.min(c.max,+hiText.value)):c.max;paint();}
      lo.addEventListener('input',fromSlider);hi.addEventListener('input',fromSlider);if(loText)loText.addEventListener('input',fromText);if(hiText)hiText.addEventListener('input',fromText);paint();
      var clear=panel.querySelector('[data-range-clear="'+k+'"]');if(clear)clear.addEventListener('click',function(){lo.value=c.min;hi.value=c.max;paint();});
    });
  }

  function removeRetiredScoreUi(){
    document.querySelectorAll('.njw-card-score').forEach(function(el){el.remove();});
    document.querySelectorAll('[data-watchdog-score]').forEach(function(el){el.removeAttribute('data-watchdog-score');});
    var scorePanel=document.querySelector('[data-range-panel="s"]');if(scorePanel)scorePanel.hidden=true;
    var sort=document.getElementById('njw-sort-select');
    if(sort)Array.prototype.slice.call(sort.options||[]).forEach(function(o){if(/score/i.test(o.value+' '+o.text))o.remove();});
  }

  function fixScrollEnd(){
    var right=document.querySelector('#pl-hood .hd-right'),art=document.getElementById('njw-search-art');if(!right||!art)return;
    if(art.parentNode!==right)right.appendChild(art);if(art!==right.lastElementChild)right.appendChild(art);
  }

  function ensureSearchUxStyle(){
    if(document.getElementById('njw-property-search-ux-style'))return;
    var style=document.createElement('style');style.id='njw-property-search-ux-style';style.textContent='body.hood-on #wd-intelligence-glance{display:none!important}.njw-card-score{display:none!important}';(document.head||document.documentElement).appendChild(style);
  }

  function maybeSubmitGoogleSelection(input){
    if(!input||input.dataset.googleAddress!=='1')return;
    var placeId=String(input.dataset.googlePlaceId||'').trim(),value=String(input.value||'').trim();if(!placeId||!value)return;
    var now=Date.now(),key=placeId+'|'+value;if(key===googleSubmitKey&&now-googleSubmitAt<1500)return;
    googleSubmitKey=key;googleSubmitAt=now;window.setTimeout(function(){if(typeof window.plLookup==='function')window.plLookup();},0);
  }

  function watchGoogleAddressInputs(){
    ['pl-addr','ss-addr'].forEach(function(id){var input=document.getElementById(id);if(!input||input.dataset.njwGoogleAutoSubmit==='1')return;input.dataset.njwGoogleAutoSubmit='1';var observer=new MutationObserver(function(){maybeSubmitGoogleSelection(input);});observer.observe(input,{attributes:true,attributeFilter:['data-google-address','data-google-place-id']});});
  }

  function scan(){ensureSearchUxStyle();watchGoogleAddressInputs();installSliders();ensureMenus();removeRetiredScoreUi();fixScrollEnd();}
  installGlobalSearch();
  var maxWait=null;
  var obs=new MutationObserver(function(){clearTimeout(window.__njwV3Scan);window.__njwV3Scan=setTimeout(scan,90);if(!maxWait){maxWait=setTimeout(function(){maxWait=null;clearTimeout(window.__njwV3Scan);scan();},500);}});
  obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('load',scan);scan();
})();