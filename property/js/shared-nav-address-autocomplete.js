/* Watchdog shared header address autocomplete.
   Uses the same NJ-bounded Google Places approach as the property lookup.
   This file is intentionally presentation-light so every page can share it. */
(function(){
  'use strict';
  if(window.__watchdogSharedNavAddressAutocomplete)return;
  window.__watchdogSharedNavAddressAutocomplete=true;

  var GMAPS_KEY='AIzaSyCZBo_mj5WXyR-Bsb5yHdekxAxauTYNmlU';
  var NJ_BOUNDS={west:-75.62,north:41.38,east:-73.85,south:38.88};
  var input=null,box=null,timer=null,seq=0,sessionToken=null,placesLib=null,observer=null;

  function q(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function text(v){try{return String(v&&v.toString?v.toString():v||'').trim();}catch(_){return'';}}
  function stateFromPlace(place){
    var rows=place&&place.addressComponents||[];
    for(var i=0;i<rows.length;i++){
      if((rows[i].types||[]).indexOf('administrative_area_level_1')!==-1){
        return String(rows[i].shortText||rows[i].longText||'').toUpperCase();
      }
    }
    return'';
  }
  function stateFromLegacy(place){
    var rows=place&&place.address_components||[];
    for(var i=0;i<rows.length;i++){
      if((rows[i].types||[]).indexOf('administrative_area_level_1')!==-1){
        return String(rows[i].short_name||rows[i].long_name||'').toUpperCase();
      }
    }
    return'';
  }

  function ensureStyles(){
    if(q('wd-shared-nav-autocomplete-style'))return;
    var style=document.createElement('style');
    style.id='wd-shared-nav-autocomplete-style';
    style.textContent=[
      '#wd-property-nav .wdn-search{position:relative!important;overflow:visible!important}',
      '.wdn-google-suggestions{position:absolute;left:0;right:0;top:calc(100% + 9px);z-index:7600;display:none;max-height:min(500px,62vh);overflow:auto;border:1px solid #dfe6ee;border-radius:16px;background:#fff;box-shadow:0 22px 58px rgba(11,34,66,.2);text-align:left}',
      '.wdn-google-suggestions.open{display:block}',
      '.wdn-google-option{appearance:none;display:grid;grid-template-columns:34px minmax(0,1fr);gap:11px;width:100%;padding:13px 14px;border:0;border-top:1px solid #edf1f4;background:#fff;color:#10294b;text-align:left;cursor:pointer}',
      '.wdn-google-option:first-child{border-top:0}',
      '.wdn-google-option:hover,.wdn-google-option.active,.wdn-google-option:focus-visible{background:#f2f7fb;outline:none}',
      '.wdn-google-option>i{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#eef4fb;color:#2458a6}',
      '.wdn-google-main{display:block;font:800 14px/1.25 "Plus Jakarta Sans",Arial,sans-serif;color:#10294b}',
      '.wdn-google-secondary{display:block;margin-top:3px;color:#718094;font:600 12px/1.35 "Source Sans 3",Arial,sans-serif}',
      '.wdn-google-empty{padding:14px;color:#718094;font:650 12px/1.4 "Source Sans 3",Arial,sans-serif}',
      '.wdn-google-credit{height:29px;border-top:1px solid #edf1f4;background:#fff url("https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png") no-repeat right 10px center;background-size:118px auto}',
      '@media(max-width:620px){.wdn-google-suggestions{position:fixed;left:12px;right:12px;top:72px;max-height:58vh;border-radius:14px}.wdn-google-option{padding:12px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureBox(){
    if(!input)return null;
    if(box&&document.documentElement.contains(box))return box;
    box=q('wdn-address-google-suggestions');
    if(!box){
      box=document.createElement('div');
      box.id='wdn-address-google-suggestions';
      box.className='wdn-google-suggestions';
      box.setAttribute('role','listbox');
      box.setAttribute('aria-label','New Jersey address suggestions');
      (input.closest('.wdn-search')||input.parentNode).appendChild(box);
    }
    input.setAttribute('role','combobox');
    input.setAttribute('aria-autocomplete','list');
    input.setAttribute('aria-controls',box.id);
    input.setAttribute('aria-expanded','false');
    return box;
  }

  function close(){
    if(box){box.classList.remove('open');box.innerHTML='';}
    if(input)input.setAttribute('aria-expanded','false');
    if(input){input.__wdnRows=[];input.__wdnIndex=-1;}
  }

  function markSelection(formatted,placeId,coords){
    if(!input)return;
    input.value=formatted;
    input.setCustomValidity('');
    input.dataset.googleAddress='1';
    input.dataset.googlePlaceId=placeId||'';
    if(coords&&Number.isFinite(coords.lat)&&Number.isFinite(coords.lon)){
      input.dataset.googleLat=String(coords.lat);
      input.dataset.googleLon=String(coords.lon);
    }
  }

  function coordsFromPlace(place){
    var loc=place&&place.location;if(!loc)return null;
    var lat=typeof loc.lat==='function'?Number(loc.lat()):Number(loc.lat);
    var lon=typeof loc.lng==='function'?Number(loc.lng()):Number(loc.lng);
    return Number.isFinite(lat)&&Number.isFinite(lon)?{lat:lat,lon:lon}:null;
  }

  function selectPrediction(prediction){
    close();
    var place;
    try{place=prediction.toPlace();}catch(_){return;}
    Promise.resolve(place.fetchFields({fields:['formattedAddress','addressComponents','location']})).then(function(){
      if(stateFromPlace(place)!=='NJ'){
        input.dataset.googleAddress='0';
        input.setCustomValidity('Please choose a New Jersey property address.');
        input.reportValidity();
        return;
      }
      markSelection(String(place.formattedAddress||text(prediction.text)||input.value||'').trim(),String(prediction.placeId||''),coordsFromPlace(place));
      sessionToken=null;
      input.focus();
    }).catch(function(){
      var fallback=text(prediction.text);if(fallback)markSelection(fallback,String(prediction.placeId||''),null);
      sessionToken=null;
    });
  }

  function render(rows){
    var target=ensureBox();if(!target)return;
    input.__wdnRows=rows;input.__wdnIndex=-1;
    if(!rows.length){
      target.innerHTML='<div class="wdn-google-empty">No matching New Jersey addresses yet. Keep typing.</div><div class="wdn-google-credit" aria-label="Powered by Google"></div>';
    }else{
      target.innerHTML=rows.map(function(p,i){
        var main=text(p.mainText)||text(p.text),secondary=text(p.secondaryText);
        return '<button type="button" class="wdn-google-option" data-wdn-index="'+i+'" role="option" aria-selected="false"><i class="fas fa-location-dot" aria-hidden="true"></i><span><span class="wdn-google-main">'+esc(main)+'</span><span class="wdn-google-secondary">'+esc(secondary)+'</span></span></button>';
      }).join('')+'<div class="wdn-google-credit" aria-label="Powered by Google"></div>';
      Array.prototype.slice.call(target.querySelectorAll('[data-wdn-index]')).forEach(function(button){
        button.addEventListener('mousedown',function(e){e.preventDefault();});
        button.addEventListener('click',function(){var row=rows[Number(button.dataset.wdnIndex)];if(row)selectPrediction(row);});
      });
    }
    target.classList.add('open');input.setAttribute('aria-expanded','true');
  }

  function requestSuggestions(){
    if(!input||!placesLib||!placesLib.AutocompleteSuggestion||!placesLib.AutocompleteSessionToken)return;
    var value=String(input.value||'').trim();
    if(value.length<3){close();return;}
    if(!sessionToken)sessionToken=new placesLib.AutocompleteSessionToken();
    var requestId=++seq;
    placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input:value,
      sessionToken:sessionToken,
      includedRegionCodes:['us'],
      includedPrimaryTypes:['street_address','premise','subpremise'],
      locationRestriction:NJ_BOUNDS,
      language:'en-US',
      region:'us'
    }).then(function(result){
      if(requestId!==seq||String(input.value||'').trim()!==value)return;
      var rows=(result&&result.suggestions||[]).map(function(s){return s&&s.placePrediction;}).filter(Boolean).slice(0,8);
      render(rows);
    }).catch(function(){close();});
  }

  function move(delta){
    var buttons=box?Array.prototype.slice.call(box.querySelectorAll('.wdn-google-option')):[];if(!buttons.length)return false;
    var next=Number(input.__wdnIndex);if(!Number.isFinite(next)||next<0)next=delta>0?0:buttons.length-1;else next=(next+delta+buttons.length)%buttons.length;
    buttons.forEach(function(button,i){var on=i===next;button.classList.toggle('active',on);button.setAttribute('aria-selected',on?'true':'false');if(on)button.scrollIntoView({block:'nearest'});});
    input.__wdnIndex=next;return true;
  }

  function bindModern(lib){
    placesLib=lib;if(!input||input.dataset.wdnGoogleBound==='1')return;
    input.dataset.wdnGoogleBound='1';input.setAttribute('autocomplete','off');ensureStyles();ensureBox();
    input.addEventListener('input',function(){input.setCustomValidity('');input.dataset.googleAddress='0';clearTimeout(timer);timer=setTimeout(requestSuggestions,180);});
    input.addEventListener('keydown',function(e){
      if(e.key==='ArrowDown'&&move(1)){e.preventDefault();e.stopImmediatePropagation();return;}
      if(e.key==='ArrowUp'&&move(-1)){e.preventDefault();e.stopImmediatePropagation();return;}
      if(e.key==='Escape'){close();return;}
      if(e.key==='Enter'&&input.__wdnIndex>=0){var row=(input.__wdnRows||[])[input.__wdnIndex];if(row){e.preventDefault();e.stopImmediatePropagation();selectPrediction(row);}}
    },true);
    input.addEventListener('blur',function(){setTimeout(close,160);});
    input.addEventListener('focus',function(){if(String(input.value||'').trim().length>=3&&input.dataset.googleAddress!=='1')requestSuggestions();});
  }

  function bindLegacy(){
    if(!input||input.dataset.wdnGoogleBound==='1'||!window.google||!google.maps||!google.maps.places||!google.maps.places.Autocomplete)return;
    input.dataset.wdnGoogleBound='1';input.setAttribute('autocomplete','off');ensureStyles();
    var ac=new google.maps.places.Autocomplete(input,{componentRestrictions:{country:'us'},types:['address'],fields:['formatted_address','place_id','address_components','geometry']});
    try{var b=new google.maps.LatLngBounds(new google.maps.LatLng(NJ_BOUNDS.south,NJ_BOUNDS.west),new google.maps.LatLng(NJ_BOUNDS.north,NJ_BOUNDS.east));ac.setBounds(b);ac.setOptions({strictBounds:true});}catch(_){}
    ac.addListener('place_changed',function(){
      var place=ac.getPlace()||{};var formatted=String(place.formatted_address||input.value||'').trim();if(!formatted)return;
      if(stateFromLegacy(place)!=='NJ'){input.dataset.googleAddress='0';input.setCustomValidity('Please choose a New Jersey property address.');input.reportValidity();return;}
      var loc=place.geometry&&place.geometry.location;var coords=loc?{lat:Number(loc.lat()),lon:Number(loc.lng())}:null;markSelection(formatted,String(place.place_id||''),coords);
    });
    input.addEventListener('input',function(){input.setCustomValidity('');input.dataset.googleAddress='0';});
  }

  function bindInput(){
    var next=q('wdn-address');if(!next)return false;
    input=next;ensureStyles();
    if(window.google&&google.maps){
      if(typeof google.maps.importLibrary==='function'){
        google.maps.importLibrary('places').then(function(lib){if(lib&&lib.AutocompleteSuggestion&&lib.AutocompleteSessionToken)bindModern(lib);else bindLegacy();}).catch(bindLegacy);
      }else bindLegacy();
      return true;
    }
    return false;
  }

  function googleReady(){bindInput();}
  window.WatchdogSharedNavGoogleReady=googleReady;

  function loadGoogle(){
    if(bindInput())return;
    if(q('wd-shared-nav-google-script'))return;
    var script=document.createElement('script');script.id='wd-shared-nav-google-script';script.async=true;script.defer=true;
    script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(GMAPS_KEY)+'&loading=async&libraries=places&region=US&v=weekly&callback=WatchdogSharedNavGoogleReady';
    document.head.appendChild(script);
  }

  function observe(){
    if(observer)return;
    observer=new MutationObserver(function(){if(q('wdn-address')){loadGoogle();if(input&&input.dataset.wdnGoogleBound==='1'){observer.disconnect();observer=null;}}});
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  function boot(){ensureStyles();if(q('wdn-address'))loadGoogle();else observe();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
