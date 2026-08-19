(function(){
  'use strict';
  if(window.__watchdogNjAddressAutocomplete)return;
  window.__watchdogNjAddressAutocomplete=true;

  var GMAPS_KEY='AIzaSyCZBo_mj5WXyR-Bsb5yHdekxAxauTYNmlU';
  var NJ_BOUNDS={west:-75.62,north:41.38,east:-73.85,south:38.88};
  var countyMapPromise=null;

  function q(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c];});}
  function text(v){try{return String(v&&v.toString?v.toString():v||'').trim();}catch(_){return'';}}

  function normalizeLocality(value){
    return String(value||'')
      .toUpperCase()
      .replace(/\b(TOWNSHIP|TWP|BOROUGH|BORO|CITY|TOWN|VILLAGE)\b/g,' ')
      .replace(/[^A-Z0-9]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function loadCountyMap(){
    if(countyMapPromise)return countyMapPromise;
    countyMapPromise=fetch('/towns/').then(function(r){return r.text();}).then(function(html){
      var map={},doc=new DOMParser().parseFromString(html,'text/html');
      Array.prototype.slice.call(doc.querySelectorAll('.tp-county-group')).forEach(function(group){
        var h=group.querySelector('h2 a');
        var county=h?String(h.textContent||'').replace(/\s+County\s*$/i,'').trim():'';
        if(!county)return;
        Array.prototype.slice.call(group.querySelectorAll('.tp-town-card')).forEach(function(card){
          var label=card.querySelector('span');
          var name=String(label?label.textContent:card.textContent||'').trim();
          var key=normalizeLocality(name);
          if(key)map[key]=county;
        });
      });
      return map;
    }).catch(function(){return{};});
    return countyMapPromise;
  }

  function countyForPrediction(prediction,map){
    var source=text(prediction&&prediction.secondaryText)||text(prediction&&prediction.text);
    var parts=source.split(',').map(function(x){return x.trim();}).filter(Boolean);
    for(var i=0;i<parts.length;i++){
      if(/^NJ$/i.test(parts[i])||/^NEW JERSEY$/i.test(parts[i])){
        for(var j=i-1;j>=0;j--){
          var key=normalizeLocality(parts[j]);
          if(key&&map[key])return map[key];
        }
      }
    }
    for(var k=0;k<parts.length;k++){
      var candidate=normalizeLocality(parts[k]);
      if(candidate&&map[candidate])return map[candidate];
    }
    return'';
  }

  function explicitState(prediction){
    var source=text(prediction&&prediction.text)+' '+text(prediction&&prediction.secondaryText);
    var m=source.match(/(?:^|,|\s)(NJ|NY|PA|DE)(?:,|\s|$)/i);
    if(m)return String(m[1]||'').toUpperCase();
    if(/\bNEW JERSEY\b/i.test(source))return'NJ';
    if(/\bNEW YORK\b/i.test(source))return'NY';
    if(/\bPENNSYLVANIA\b/i.test(source))return'PA';
    if(/\bDELAWARE\b/i.test(source))return'DE';
    return'';
  }

  function isNjPrediction(prediction,map){
    var state=explicitState(prediction);
    if(state)return state==='NJ';
    return !!countyForPrediction(prediction,map);
  }

  function stateFromPlace(place){
    var rows=place&&place.addressComponents||[];
    for(var i=0;i<rows.length;i++){
      if((rows[i].types||[]).indexOf('administrative_area_level_1')!==-1){
        return String(rows[i].shortText||rows[i].longText||'').toUpperCase();
      }
    }
    return'';
  }

  function stateFromLegacyPlace(place){
    var rows=place&&place.address_components||[];
    for(var i=0;i<rows.length;i++){
      if((rows[i].types||[]).indexOf('administrative_area_level_1')!==-1){
        return String(rows[i].short_name||rows[i].long_name||'').toUpperCase();
      }
    }
    return'';
  }

  function ensureStyles(){
    if(q('wd-nj-address-autocomplete-style'))return;
    var style=document.createElement('style');
    style.id='wd-nj-address-autocomplete-style';
    style.textContent=[
      '.pl-input-wrap,.ssearch-pill{position:relative}',
      '.wd-nj-predictions{background:#fff;border:1px solid #e4eaee;border-radius:18px;box-shadow:0 22px 55px rgba(8,31,55,.22);display:none;left:0;max-height:min(520px,62vh);overflow:auto;position:absolute;right:0;top:calc(100% + 8px);z-index:7300;text-align:left;font-family:"Plus Jakarta Sans",system-ui,sans-serif}',
      '.wd-nj-predictions.open{display:block}',
      '.wd-nj-county{background:#f7faf9;border-top:1px solid #e8eeee;color:#078486;font-size:11px;font-weight:900;letter-spacing:.09em;padding:12px 14px 7px;text-transform:uppercase}',
      '.wd-nj-county:first-child{border-top:0}',
      '.wd-nj-option{appearance:none;background:#fff;border:0;border-top:1px solid #edf1f3;color:#122845;cursor:pointer;display:grid;gap:10px;grid-template-columns:32px minmax(0,1fr);padding:12px 15px;text-align:left;width:100%}',
      '.wd-nj-county+.wd-nj-option{border-top:0}',
      '.wd-nj-option:hover,.wd-nj-option.active,.wd-nj-option:focus-visible{background:#f1f7f6;outline:none}',
      '.wd-nj-option>i{align-items:center;background:#eef6f5;border-radius:50%;color:#078486;display:flex;height:30px;justify-content:center;margin-top:1px;width:30px}',
      '.wd-nj-main{display:block;font-size:15px;font-weight:850;line-height:1.25}',
      '.wd-nj-secondary{color:#718094;display:block;font-size:12px;font-weight:600;line-height:1.35;margin-top:3px}',
      '.wd-nj-empty{color:#718094;font-size:13px;font-weight:650;padding:15px}',
      '.wd-google-credit{background:#fff url("https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png") no-repeat right 10px center;background-size:120px auto;border-top:1px solid #edf1f3;height:28px}',
      '.pac-container{z-index:7300!important;border-radius:14px!important}',
      '@media(max-width:560px){.wd-nj-predictions{border-radius:14px;max-height:55vh}.wd-nj-option{padding:12px}.wd-nj-main{font-size:14px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function getBox(input){
    var id=input.id+'-wd-nj-predictions';
    var box=q(id);
    if(box)return box;
    box=document.createElement('div');
    box.id=id;
    box.className='wd-nj-predictions';
    box.setAttribute('role','listbox');
    box.setAttribute('aria-label','New Jersey address suggestions');
    (input.parentNode||input).appendChild(box);
    input.setAttribute('role','combobox');
    input.setAttribute('aria-autocomplete','list');
    input.setAttribute('aria-controls',id);
    input.setAttribute('aria-expanded','false');
    return box;
  }

  function closeBox(input){
    if(!input)return;
    var box=q(input.id+'-wd-nj-predictions');
    if(box){box.classList.remove('open');box.innerHTML='';}
    input.setAttribute('aria-expanded','false');
    input.__wdPredictions=[];
    input.__wdPredictionIndex=-1;
  }

  function syncAddress(input,formatted,placeId){
    input.value=formatted;
    input.setCustomValidity('');
    input.dataset.googleAddress='1';
    input.dataset.googlePlaceId=placeId||'';
    var other=input.id==='pl-addr'?q('ss-addr'):q('pl-addr');
    if(other){
      other.value=formatted;
      other.setCustomValidity('');
      other.dataset.googleAddress='1';
      other.dataset.googlePlaceId=placeId||'';
    }
  }

  function selectPrediction(input,prediction){
    closeBox(input);
    var place;
    try{place=prediction.toPlace();}catch(_){return;}
    Promise.resolve(place.fetchFields({fields:['formattedAddress','addressComponents']})).then(function(){
      var formatted=String(place.formattedAddress||text(prediction.text)||input.value||'').trim();
      var state=stateFromPlace(place);
      if(state!=='NJ'){
        input.dataset.googleAddress='0';
        delete input.dataset.googlePlaceId;
        input.setCustomValidity('Please choose a New Jersey property address.');
        input.reportValidity();
        return;
      }
      if(formatted)syncAddress(input,formatted,String(prediction.placeId||''));
      if(typeof input.__wdResetSession==='function')input.__wdResetSession();
      input.focus();
    }).catch(function(){
      var fallback=text(prediction.text);
      if(fallback)syncAddress(input,fallback,String(prediction.placeId||''));
      if(typeof input.__wdResetSession==='function')input.__wdResetSession();
    });
  }

  function render(input,predictions,map){
    var box=getBox(input),groups=[],byCounty={};
    predictions.forEach(function(prediction){
      var county=countyForPrediction(prediction,map)||'New Jersey';
      var label=county==='New Jersey'?'New Jersey':county+' County';
      if(!byCounty[label]){byCounty[label]=[];groups.push(label);}
      byCounty[label].push(prediction);
    });

    if(!groups.length){
      box.innerHTML='<div class="wd-nj-empty">No matching New Jersey addresses yet. Keep typing.</div><div class="wd-google-credit" aria-label="Powered by Google"></div>';
      box.classList.add('open');
      input.setAttribute('aria-expanded','true');
      input.__wdPredictions=[];
      input.__wdPredictionIndex=-1;
      return;
    }

    var rows=[],html='';
    groups.forEach(function(label){
      html+='<div class="wd-nj-county">'+esc(label)+'</div>';
      byCounty[label].forEach(function(prediction){
        var idx=rows.length;
        var main=text(prediction.mainText)||text(prediction.text);
        var secondary=text(prediction.secondaryText);
        rows.push(prediction);
        html+='<button type="button" class="wd-nj-option" role="option" aria-selected="false" data-wd-index="'+idx+'"><i class="fas fa-location-dot"></i><span><span class="wd-nj-main">'+esc(main)+'</span><span class="wd-nj-secondary">'+esc(secondary)+'</span></span></button>';
      });
    });
    html+='<div class="wd-google-credit" aria-label="Powered by Google"></div>';
    box.innerHTML=html;
    box.classList.add('open');
    input.setAttribute('aria-expanded','true');
    input.__wdPredictions=rows;
    input.__wdPredictionIndex=-1;

    Array.prototype.slice.call(box.querySelectorAll('.wd-nj-option')).forEach(function(button){
      button.addEventListener('mousedown',function(e){e.preventDefault();});
      button.addEventListener('click',function(){
        var idx=Number(button.getAttribute('data-wd-index'));
        if(rows[idx])selectPrediction(input,rows[idx]);
      });
    });
  }

  function moveActive(input,delta){
    var box=q(input.id+'-wd-nj-predictions');
    var buttons=box?Array.prototype.slice.call(box.querySelectorAll('.wd-nj-option')):[];
    if(!buttons.length)return false;
    var next=Number(input.__wdPredictionIndex);
    if(!Number.isFinite(next)||next<0)next=delta>0?0:buttons.length-1;
    else next=(next+delta+buttons.length)%buttons.length;
    buttons.forEach(function(button,i){
      var on=i===next;
      button.classList.toggle('active',on);
      button.setAttribute('aria-selected',on?'true':'false');
      if(on)button.scrollIntoView({block:'nearest'});
    });
    input.__wdPredictionIndex=next;
    return true;
  }

  function bindCustom(input,lib){
    if(!input||input.dataset.wdGoogleAutocomplete==='2')return;
    var Suggestion=lib&&lib.AutocompleteSuggestion;
    var SessionToken=lib&&lib.AutocompleteSessionToken;
    if(!Suggestion||!SessionToken)return;

    input.dataset.wdGoogleAutocomplete='2';
    input.setAttribute('autocomplete','off');
    getBox(input);
    var timer=null,seq=0,token=null;
    input.__wdResetSession=function(){token=null;};

    function request(){
      var value=String(input.value||'').trim();
      if(value.length<3){closeBox(input);return;}
      if(!token)token=new SessionToken();
      var thisSeq=++seq;
      Promise.all([
        Suggestion.fetchAutocompleteSuggestions({
          input:value,
          sessionToken:token,
          includedRegionCodes:['us'],
          includedPrimaryTypes:['street_address','premise','subpremise'],
          locationRestriction:NJ_BOUNDS,
          language:'en-US',
          region:'us'
        }),
        loadCountyMap()
      ]).then(function(results){
        if(thisSeq!==seq||String(input.value||'').trim()!==value)return;
        var suggestions=results[0]&&results[0].suggestions||[];
        var map=results[1]||{};
        var predictions=suggestions.map(function(s){return s&&s.placePrediction;}).filter(function(p){return p&&isNjPrediction(p,map);}).slice(0,8);
        render(input,predictions,map);
      }).catch(function(){closeBox(input);});
    }

    input.addEventListener('input',function(){
      input.setCustomValidity('');
      input.dataset.googleAddress='0';
      delete input.dataset.googlePlaceId;
      clearTimeout(timer);
      timer=setTimeout(request,180);
    });

    input.addEventListener('keydown',function(e){
      if(e.key==='ArrowDown'&&moveActive(input,1)){e.preventDefault();e.stopImmediatePropagation();return;}
      if(e.key==='ArrowUp'&&moveActive(input,-1)){e.preventDefault();e.stopImmediatePropagation();return;}
      if(e.key==='Escape'){closeBox(input);return;}
      if(e.key==='Enter'){
        var rows=input.__wdPredictions||[];
        var idx=Number(input.__wdPredictionIndex);
        if(idx>=0&&rows[idx]){
          e.preventDefault();
          e.stopImmediatePropagation();
          selectPrediction(input,rows[idx]);
          token=null;
        }
      }
    },true);

    input.addEventListener('blur',function(){setTimeout(function(){closeBox(input);},140);});
    input.addEventListener('focus',function(){
      if(String(input.value||'').trim().length>=3&&input.dataset.googleAddress!=='1'){
        clearTimeout(timer);
        timer=setTimeout(request,80);
      }
    });
  }

  function bindLegacy(input){
    if(!input||input.dataset.wdGoogleAutocomplete||!window.google||!google.maps||!google.maps.places||!google.maps.places.Autocomplete)return;
    input.dataset.wdGoogleAutocomplete='1';
    input.setAttribute('autocomplete','off');
    var ac=new google.maps.places.Autocomplete(input,{componentRestrictions:{country:'us'},types:['address'],fields:['formatted_address','place_id','address_components']});
    try{
      var bounds=new google.maps.LatLngBounds(new google.maps.LatLng(NJ_BOUNDS.south,NJ_BOUNDS.west),new google.maps.LatLng(NJ_BOUNDS.north,NJ_BOUNDS.east));
      ac.setBounds(bounds);
      ac.setOptions({strictBounds:true});
    }catch(_){}
    ac.addListener('place_changed',function(){
      var place=ac.getPlace()||{};
      var formatted=String(place.formatted_address||input.value||'').trim();
      if(!formatted)return;
      if(stateFromLegacyPlace(place)!=='NJ'){
        input.dataset.googleAddress='0';
        delete input.dataset.googlePlaceId;
        input.setCustomValidity('Please choose a New Jersey property address.');
        input.reportValidity();
        return;
      }
      syncAddress(input,formatted,String(place.place_id||''));
    });
    input.addEventListener('input',function(){input.setCustomValidity('');input.dataset.googleAddress='0';delete input.dataset.googlePlaceId;});
  }

  function initPlaces(){
    ensureStyles();
    if(!window.google||!google.maps)return;
    if(typeof google.maps.importLibrary==='function'){
      google.maps.importLibrary('places').then(function(lib){
        if(lib&&lib.AutocompleteSuggestion&&lib.AutocompleteSessionToken){
          bindCustom(q('pl-addr'),lib);
          bindCustom(q('ss-addr'),lib);
        }else{
          bindLegacy(q('pl-addr'));
          bindLegacy(q('ss-addr'));
        }
      }).catch(function(){bindLegacy(q('pl-addr'));bindLegacy(q('ss-addr'));});
      return;
    }
    bindLegacy(q('pl-addr'));
    bindLegacy(q('ss-addr'));
  }

  function boot(){
    if(!q('pl-addr')&&!q('ss-addr'))return;
    ensureStyles();
    window.WatchdogNJAddressGoogleReady=initPlaces;
    if(window.google&&google.maps){initPlaces();return;}
    if(q('wd-google-places-script'))return;
    var script=document.createElement('script');
    script.id='wd-google-places-script';
    script.async=true;
    script.defer=true;
    script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(GMAPS_KEY)+'&loading=async&libraries=places&region=US&v=weekly&callback=WatchdogNJAddressGoogleReady';
    document.head.appendChild(script);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();