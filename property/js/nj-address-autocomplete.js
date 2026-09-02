(function(){
  'use strict';
  if(window.__watchdogNjAddressAutocomplete)return;
  window.__watchdogNjAddressAutocomplete=true;

  var GMAPS_KEY='AIzaSyCZBo_mj5WXyR-Bsb5yHdekxAxauTYNmlU';
  var NJ_BOUNDS={west:-75.62,north:41.38,east:-73.85,south:38.88};
  var NJ_GEOCODE='https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
  var NJ_PARCEL='https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
  var PARCEL_FIELDS='PAMS_PIN,COUNTY,MUN_NAME,PROP_LOC,PROP_CLASS,BLDG_DESC,NET_VALUE,LAST_YR_TX,ZIP5,YR_CONSTR';
  var countyMapPromise=null;
  var savedPromise=null;
  var supabaseClient=null;
  var enrichCache={};

  var PROPERTY_TYPES={
    '1':'Vacant land','2':'Single family / 1–4 units','3A':'Farm','3B':'Qualified farm',
    '4A':'Commercial','4B':'Industrial','4C':'Apartment 5+ units','15A':'Public property',
    '15B':'Exempt','15C':'Cemetery','15D':'Exempt','15E':'Exempt','15F':'Exempt'
  };

  function q(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c];});}
  function text(v){try{return String(v&&v.toString?v.toString():v||'').trim();}catch(_){return'';}}
  function money(v){var n=Number(v);return Number.isFinite(n)&&n>0?'$'+Math.round(n).toLocaleString():'';}
  function normalizedAddress(v){return String(v||'').toUpperCase().replace(/\bNEW JERSEY\b/g,'NJ').replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function streetNumber(v){var m=String(v||'').trim().match(/^(\d+[A-Z-]?)/i);return m?m[1].toUpperCase():'';}
  function formatTownZip(row){return [row.town||'',row.zip||''].filter(Boolean).join(' ').trim();}
  function queryFor(row){return [row.address,row.town,'NJ',row.zip].filter(Boolean).join(', ');}

  function coordsFromPlace(place,legacy){
    var loc=legacy?(place&&place.geometry&&place.geometry.location):(place&&place.location);
    if(!loc)return null;
    var lat=typeof loc.lat==='function'?Number(loc.lat()):Number(loc.lat);
    var lon=typeof loc.lng==='function'?Number(loc.lng()):Number(loc.lng);
    return Number.isFinite(lat)&&Number.isFinite(lon)?{lat:lat,lon:lon}:null;
  }

  function clearGoogleSelection(input){
    if(!input)return;
    input.dataset.googleAddress='0';
    delete input.dataset.googlePlaceId;
    delete input.dataset.googleLat;
    delete input.dataset.googleLon;
  }

  function getClient(){
    if(supabaseClient)return supabaseClient;
    try{
      if(window.NJPTRSupabaseRuntime&&typeof window.NJPTRSupabaseRuntime.createClient==='function'){
        supabaseClient=window.NJPTRSupabaseRuntime.createClient();
      }
    }catch(_){ }
    return supabaseClient;
  }

  function localRecent(){
    try{
      return JSON.parse(localStorage.getItem('watchdogRecentProperties')||'[]').slice(0,5).map(function(x){
        return {
          pams_pin:x.pin||'',address:x.address||'',town:x.city||x.town||'',zip:x.zip||'',
          assessed:x.assessed||'',last_year_tax:x.tax||'',prop_class:x.propClass||'',year_built:x.yearBuilt||''
        };
      }).filter(function(x){return x.address;});
    }catch(_){return[];}
  }

  function loadSaved(){
    if(savedPromise)return savedPromise;
    var sb=getClient();
    if(!sb){savedPromise=Promise.resolve([]);return savedPromise;}
    savedPromise=sb.auth.getUser().then(function(result){
      var user=result&&result.data&&result.data.user;
      if(!user)return[];
      return sb.from('saved_properties')
        .select('pams_pin,address,town,county,zip,assessed,last_year_tax,updated_at')
        .order('updated_at',{ascending:false}).limit(20)
        .then(function(res){return res&&Array.isArray(res.data)?res.data:[];})
        .catch(function(){return[];});
    }).catch(function(){return[];});
    return savedPromise;
  }

  function scoreRows(rows){
    rows=(rows||[]).filter(function(r){return r&&r.pams_pin;});
    if(!rows.length)return Promise.resolve({});
    var sb=getClient();
    if(!sb)return Promise.resolve({});
    var payload=rows.map(function(r){return{
      pams_pin:r.pams_pin,
      assessment:Number(r.assessed||r.assessment)||null,
      tax:Number(r.last_year_tax||r.tax)||null,
      town:r.town||'',county:r.county||''
    };});
    return sb.rpc('get_public_realtime_watchdog_scores',{p_rows:payload}).then(function(res){
      var out={};
      (res&&res.data||[]).forEach(function(row){
        if(row&&row.pams_pin)out[row.pams_pin]={score:Number(row.watchdog_score),source:row.score_source||''};
      });
      return out;
    }).catch(function(){return{};});
  }

  function normalizeLocality(value){
    return String(value||'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }

  function loadCountyMap(){
    if(countyMapPromise)return countyMapPromise;
    countyMapPromise=fetch('/towns/').then(function(r){return r.text();}).then(function(html){
      var buckets={},map={},doc=new DOMParser().parseFromString(html,'text/html');
      Array.prototype.slice.call(doc.querySelectorAll('.tp-county-group')).forEach(function(group){
        var h=group.querySelector('h2 a');
        var county=h?String(h.textContent||'').replace(/\s+County\s*$/i,'').trim():'';
        if(!county)return;
        Array.prototype.slice.call(group.querySelectorAll('.tp-town-card')).forEach(function(card){
          var label=card.querySelector('span');
          var name=String(label?label.textContent:card.textContent||'').trim();
          var key=normalizeLocality(name);
          if(!key)return;
          if(!buckets[key])buckets[key]={};
          buckets[key][county]=1;
        });
      });
      Object.keys(buckets).forEach(function(key){
        var counties=Object.keys(buckets[key]);
        if(counties.length===1)map[key]=counties[0];
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

  function highlight(value,needle){
    var raw=String(value||''),n=String(needle||'').trim();
    if(!n)return esc(raw);
    var idx=raw.toLowerCase().indexOf(n.toLowerCase());
    if(idx<0)return esc(raw);
    return esc(raw.slice(0,idx))+'<mark>'+esc(raw.slice(idx,idx+n.length))+'</mark>'+esc(raw.slice(idx+n.length));
  }

  function ensureStyles(){
    if(q('wd-nj-address-autocomplete-style'))return;
    var style=document.createElement('style');
    style.id='wd-nj-address-autocomplete-style';
    style.textContent=[
      '.pl-input-wrap,.ssearch-pill{position:relative}',
      '.wd-nj-predictions{background:#fff;border:1px solid #e4eaee;border-radius:20px;box-shadow:0 24px 65px rgba(8,31,55,.24);display:none;left:0;max-height:min(590px,68vh);overflow:auto;position:absolute;right:0;top:calc(100% + 10px);z-index:7300;text-align:left;font-family:"Plus Jakarta Sans",system-ui,sans-serif}',
      '.wd-nj-predictions.open{display:block}',
      '.wd-nj-county{align-items:center;background:#f7faf9;border-top:1px solid #e8eeee;color:#078486;display:flex;font-size:11px;font-weight:900;justify-content:space-between;letter-spacing:.09em;padding:12px 15px 8px;text-transform:uppercase}',
      '.wd-nj-county:first-child{border-top:0}',
      '.wd-nj-county small{color:#829196;font-size:10px;font-weight:800;letter-spacing:0;text-transform:none}',
      '.wd-nj-option{appearance:none;background:#fff;border:0;border-top:1px solid #edf1f3;color:#122845;cursor:pointer;display:grid;gap:11px;grid-template-columns:34px minmax(0,1fr) auto;padding:13px 15px;text-align:left;width:100%}',
      '.wd-nj-county+.wd-nj-option{border-top:0}',
      '.wd-nj-option:hover,.wd-nj-option.active,.wd-nj-option:focus-visible{background:#f1f7f6;outline:none}',
      '.wd-nj-option>i{align-items:center;background:#eef6f5;border-radius:50%;color:#078486;display:flex;height:32px;justify-content:center;margin-top:1px;width:32px}',
      '.wd-nj-copy{min-width:0}',
      '.wd-nj-main{color:#10294b;display:block;font-size:15px;font-weight:850;line-height:1.25}',
      '.wd-nj-main mark{background:transparent;color:#078486;font:inherit;padding:0}',
      '.wd-nj-secondary{color:#718094;display:block;font-size:12px;font-weight:600;line-height:1.35;margin-top:3px}',
      '.wd-nj-intel{align-items:center;color:#5a6b75;display:flex;flex-wrap:wrap;font-size:11px;font-weight:700;gap:5px 9px;line-height:1.4;margin-top:7px;min-height:0}',
      '.wd-nj-intel:empty{display:none}',
      '.wd-nj-record{align-items:center;color:#087f82;display:inline-flex;font-weight:850;gap:5px}',
      '.wd-nj-saved{color:#9b7617}',
      '.wd-nj-type{color:#67767d}',
      '.wd-nj-score{align-items:center;background:#10294b;border-radius:14px;color:#fff;display:flex;flex-direction:column;justify-content:center;min-width:64px;padding:7px 8px;text-align:center}',
      '.wd-nj-score[hidden]{display:none}',
      '.wd-nj-score b{font-size:19px;line-height:1}',
      '.wd-nj-score span{font-size:7px;font-weight:900;letter-spacing:.055em;line-height:1.15;margin-top:3px;text-transform:uppercase}',
      '.wd-nj-empty{color:#718094;font-size:13px;font-weight:650;padding:15px}',
      '.wd-nj-quick-head{align-items:center;color:#73838c;display:flex;font-size:10px;font-weight:900;justify-content:space-between;letter-spacing:.09em;padding:12px 15px 7px;text-transform:uppercase}',
      '.wd-nj-quick{appearance:none;background:#fff;border:0;border-top:1px solid #edf1f3;color:#122845;cursor:pointer;display:grid;gap:11px;grid-template-columns:34px minmax(0,1fr) auto;padding:12px 15px;text-align:left;width:100%}',
      '.wd-nj-quick:hover,.wd-nj-quick:focus-visible{background:#f1f7f6;outline:none}',
      '.wd-nj-quick>i{align-items:center;background:#f1f4f5;border-radius:50%;color:#64788b;display:flex;height:32px;justify-content:center;width:32px}',
      '.wd-nj-quick.saved>i{background:#fbf5df;color:#9b7617}',
      '.wd-nj-quick .wd-nj-main{font-size:14px}',
      '.wd-google-credit{background:#fff url("https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png") no-repeat right 11px center;background-size:120px auto;border-top:1px solid #edf1f3;height:30px}',
      '.pac-container{z-index:7300!important;border-radius:14px!important}',
      '@media(max-width:560px){.wd-nj-predictions{border-radius:16px;max-height:58vh}.wd-nj-option,.wd-nj-quick{grid-template-columns:32px minmax(0,1fr) auto;padding:12px}.wd-nj-main{font-size:14px}.wd-nj-score{min-width:56px}.wd-nj-score b{font-size:17px}.wd-nj-intel{font-size:10px}}'
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

  function syncAddress(input,formatted,placeId,coords){
    function stamp(target){
      target.value=formatted;
      target.setCustomValidity('');
      target.dataset.googlePlaceId=placeId||'';
      if(coords&&Number.isFinite(coords.lat)&&Number.isFinite(coords.lon)){
        target.dataset.googleLat=coords.lat.toFixed(7);
        target.dataset.googleLon=coords.lon.toFixed(7);
      }else{
        delete target.dataset.googleLat;
        delete target.dataset.googleLon;
      }
      // Set this last. The auto-submit MutationObserver then sees the place id
      // and the coordinates from the same selected Google result together.
      target.dataset.googleAddress='1';
    }
    stamp(input);
    var other=input.id==='pl-addr'?q('ss-addr'):q('pl-addr');
    if(other)stamp(other);
  }

  function openProperty(input,row){
    closeBox(input);
    var address=queryFor(row);
    input.value=address;
    var other=input.id==='pl-addr'?q('ss-addr'):q('pl-addr');
    if(other)other.value=address;
    if(typeof window.plLookup==='function')window.setTimeout(function(){window.plLookup();},0);
  }

  function renderQuickStart(input){
    if(String(input.value||'').trim())return;
    Promise.all([loadSaved(),Promise.resolve(localRecent())]).then(function(results){
      if(String(input.value||'').trim())return;
      var saved=results[0]||[],recent=results[1]||[];
      var seen={};
      saved=saved.filter(function(r){var key=r.pams_pin||normalizedAddress(r.address);if(!key||seen[key])return false;seen[key]=1;return true;}).slice(0,4);
      recent=recent.filter(function(r){var key=r.pams_pin||normalizedAddress(r.address);if(!key||seen[key])return false;seen[key]=1;return true;}).slice(0,4);
      if(!saved.length&&!recent.length)return;
      var all=saved.concat(recent);
      scoreRows(all).then(function(scores){
        if(String(input.value||'').trim())return;
        var box=getBox(input),html='',rows=[];
        function section(label,list,kind){
          if(!list.length)return;
          html+='<div class="wd-nj-quick-head"><span>'+esc(label)+'</span><span>'+list.length+'</span></div>';
          list.forEach(function(row){
            var idx=rows.length,score=scores[row.pams_pin]&&scores[row.pams_pin].score;
            rows.push({row:row,kind:kind});
            html+='<button type="button" class="wd-nj-quick '+(kind==='saved'?'saved':'')+'" data-wd-quick="'+idx+'">'+
              '<i class="fas '+(kind==='saved'?'fa-star':'fa-clock-rotate-left')+'"></i><span><span class="wd-nj-main">'+esc(row.address)+'</span><span class="wd-nj-secondary">'+esc(formatTownZip(row)||'New Jersey')+'</span></span>'+
              (Number.isFinite(score)?'<span class="wd-nj-score"><b>'+Math.round(score)+'</b><span>Watchdog score</span></span>':'')+
            '</button>';
          });
        }
        section('Saved properties',saved,'saved');
        section('Recently viewed',recent,'recent');
        box.innerHTML=html;
        box.classList.add('open');
        input.setAttribute('aria-expanded','true');
        Array.prototype.slice.call(box.querySelectorAll('[data-wd-quick]')).forEach(function(btn){
          btn.addEventListener('mousedown',function(e){e.preventDefault();});
          btn.addEventListener('click',function(){var item=rows[Number(btn.getAttribute('data-wd-quick'))];if(item)openProperty(input,item.row);});
        });
      });
    });
  }

  function selectPrediction(input,prediction){
    closeBox(input);
    var place;
    try{place=prediction.toPlace();}catch(_){return;}
    Promise.resolve(place.fetchFields({fields:['formattedAddress','addressComponents','location']})).then(function(){
      var formatted=String(place.formattedAddress||text(prediction.text)||input.value||'').trim();
      var state=stateFromPlace(place);
      if(state!=='NJ'){
        input.dataset.googleAddress='0';
        delete input.dataset.googlePlaceId;
        input.setCustomValidity('Please choose a New Jersey property address.');
        input.reportValidity();
        return;
      }
      if(formatted)syncAddress(input,formatted,String(prediction.placeId||''),coordsFromPlace(place,false));
      if(typeof input.__wdResetSession==='function')input.__wdResetSession();
      input.focus();
    }).catch(function(){
      var fallback=text(prediction.text);
      if(fallback)syncAddress(input,fallback,String(prediction.placeId||''));
      if(typeof input.__wdResetSession==='function')input.__wdResetSession();
    });
  }

  function render(input,predictions,map,needle){
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
      var count=byCounty[label].length;
      html+='<div class="wd-nj-county"><span>'+esc(label)+'</span><small>'+count+' match'+(count===1?'':'es')+'</small></div>';
      byCounty[label].forEach(function(prediction){
        var idx=rows.length;
        var main=text(prediction.mainText)||text(prediction.text);
        var secondary=text(prediction.secondaryText);
        rows.push(prediction);
        html+='<button type="button" class="wd-nj-option" role="option" aria-selected="false" data-wd-index="'+idx+'">'+
          '<i class="fas fa-location-dot"></i><span class="wd-nj-copy"><span class="wd-nj-main">'+highlight(main,needle)+'</span><span class="wd-nj-secondary">'+esc(secondary)+'</span><span class="wd-nj-intel" aria-live="polite"></span></span><span class="wd-nj-score" hidden><b></b><span>Watchdog score</span></span></button>';
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

  function njGeocode(address){
    var key='geo|'+normalizedAddress(address);
    if(enrichCache[key])return enrichCache[key];
    var p=new URLSearchParams({SingleLine:address,outSR:'4326',maxLocations:'1',f:'json'});
    enrichCache[key]=fetch(NJ_GEOCODE+'?'+p.toString()).then(function(r){return r.json();}).then(function(data){
      var c=data&&data.candidates&&data.candidates[0];
      if(!c||!c.location)return null;
      return {lat:Number(c.location.y),lon:Number(c.location.x),matched:c.address||'',score:Number(c.score)||0};
    }).catch(function(){return null;});
    return enrichCache[key];
  }

  function parcelAt(lat,lon,address){
    var key='parcel|'+lat.toFixed(5)+','+lon.toFixed(5);
    if(enrichCache[key])return enrichCache[key];
    var params=new URLSearchParams({
      geometry:JSON.stringify({x:lon,y:lat,spatialReference:{wkid:4326}}),geometryType:'esriGeometryPoint',inSR:'4326',outSR:'4326',
      spatialRel:'esriSpatialRelIntersects',outFields:PARCEL_FIELDS,returnGeometry:'false',resultRecordCount:'1',f:'json'
    });
    enrichCache[key]=fetch(NJ_PARCEL+'?'+params.toString()).then(function(r){return r.json();}).then(function(data){
      var f=data&&data.features&&data.features[0],a=f&&f.attributes||{};
      if(!a.PAMS_PIN)return null;
      var wanted=streetNumber(address),found=streetNumber(a.PROP_LOC);
      if(wanted&&found&&wanted!==found)return null;
      return {
        pams_pin:a.PAMS_PIN||'',address:a.PROP_LOC||address,town:a.MUN_NAME||'',county:a.COUNTY||'',zip:a.ZIP5||'',
        assessed:a.NET_VALUE||'',last_year_tax:a.LAST_YR_TX||'',prop_class:a.PROP_CLASS||'',building_desc:a.BLDG_DESC||'',year_built:a.YR_CONSTR||''
      };
    }).catch(function(){return null;});
    return enrichCache[key];
  }

  function enrichPrediction(prediction){
    var address=text(prediction&&prediction.text);
    var key='enrich|'+normalizedAddress(address);
    if(enrichCache[key])return enrichCache[key];
    enrichCache[key]=njGeocode(address).then(function(geo){
      if(!geo||!Number.isFinite(geo.lat)||!Number.isFinite(geo.lon)||geo.score<70)return null;
      return parcelAt(geo.lat,geo.lon,address);
    }).catch(function(){return null;});
    return enrichCache[key];
  }

  function runPool(items,limit,worker){
    var results=new Array(items.length),next=0;
    function runner(){
      var idx=next++;
      if(idx>=items.length)return Promise.resolve();
      return Promise.resolve(worker(items[idx],idx)).then(function(value){results[idx]=value;},function(){results[idx]=null;}).then(runner);
    }
    var runners=[];
    for(var i=0;i<Math.min(limit,items.length);i++)runners.push(runner());
    return Promise.all(runners).then(function(){return results;});
  }

  function paintIntel(input,index,row,score,savedSet){
    var box=q(input.id+'-wd-nj-predictions');
    var button=box&&box.querySelector('.wd-nj-option[data-wd-index="'+index+'"]');
    if(!button||!row)return;
    var intel=button.querySelector('.wd-nj-intel'),scoreEl=button.querySelector('.wd-nj-score');
    var saved=!!(savedSet[row.pams_pin]||savedSet[normalizedAddress(row.address)]);
    var bits=[];
    bits.push('<span class="wd-nj-record '+(saved?'wd-nj-saved':'')+'"><i class="fas '+(saved?'fa-star':'fa-circle-check')+'"></i> '+(saved?'Saved property':'Watchdog record')+'</span>');
    if(money(row.assessed))bits.push('<span>'+esc(money(row.assessed))+' assessed</span>');
    if(money(row.last_year_tax))bits.push('<span>'+esc(money(row.last_year_tax))+' tax</span>');
    var type=PROPERTY_TYPES[String(row.prop_class||'').toUpperCase()]||'';
    if(type)bits.push('<span class="wd-nj-type">'+esc(type)+'</span>');
    intel.innerHTML=bits.join('<span aria-hidden="true">·</span>');
    if(scoreEl&&Number.isFinite(score)){
      scoreEl.hidden=false;
      var b=scoreEl.querySelector('b');if(b)b.textContent=String(Math.round(score));
    }
  }

  function enrichVisible(input,predictions,requestSeq){
    var items=(predictions||[]).slice(0,6);
    if(!items.length)return;
    Promise.all([runPool(items,3,enrichPrediction),loadSaved()]).then(function(results){
      if(input.__wdRequestSeq!==requestSeq)return;
      var rows=results[0]||[],savedRows=results[1]||[],savedSet={};
      savedRows.forEach(function(r){if(r.pams_pin)savedSet[r.pams_pin]=1;if(r.address)savedSet[normalizedAddress(r.address)]=1;});
      var matched=rows.filter(Boolean);
      scoreRows(matched).then(function(scores){
        if(input.__wdRequestSeq!==requestSeq)return;
        rows.forEach(function(row,index){
          if(!row)return;
          var score=scores[row.pams_pin]&&scores[row.pams_pin].score;
          paintIntel(input,index,row,score,savedSet);
        });
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
      if(value.length<3){closeBox(input);if(!value)renderQuickStart(input);return;}
      if(!token)token=new SessionToken();
      var thisSeq=++seq;
      input.__wdRequestSeq=thisSeq;
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
        render(input,predictions,map,value);
        enrichVisible(input,predictions,thisSeq);
      }).catch(function(){closeBox(input);});
    }

    input.addEventListener('input',function(){
      input.setCustomValidity('');
      clearGoogleSelection(input);
      clearTimeout(timer);
      timer=setTimeout(request,190);
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

    input.addEventListener('blur',function(){setTimeout(function(){closeBox(input);},160);});
    input.addEventListener('focus',function(){
      var value=String(input.value||'').trim();
      if(!value){renderQuickStart(input);return;}
      if(value.length>=3&&input.dataset.googleAddress!=='1'){
        clearTimeout(timer);
        timer=setTimeout(request,80);
      }
    });
  }

  function bindLegacy(input){
    if(!input||input.dataset.wdGoogleAutocomplete||!window.google||!google.maps||!google.maps.places||!google.maps.places.Autocomplete)return;
    input.dataset.wdGoogleAutocomplete='1';
    input.setAttribute('autocomplete','off');
    var ac=new google.maps.places.Autocomplete(input,{componentRestrictions:{country:'us'},types:['address'],fields:['formatted_address','place_id','address_components','geometry']});
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
      syncAddress(input,formatted,String(place.place_id||''),coordsFromPlace(place,true));
    });
    input.addEventListener('input',function(){input.setCustomValidity('');clearGoogleSelection(input);});
  }

  function initPlaces(){
    ensureStyles();
    loadSaved();
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