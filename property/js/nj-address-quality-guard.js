/* Watchdog public address quality guard.
   1) Preserve canonical score missingness: NULL is "Score building", never 0.
   2) Fail closed when NJ geocoding lands on a neighboring parcel and recover an
      exact house-number/street match from the nearby official parcel layer. */
(function(){
  'use strict';
  if(window.__WATCHDOG_NJ_ADDRESS_QUALITY_GUARD__)return;
  window.__WATCHDOG_NJ_ADDRESS_QUALITY_GUARD__=true;

  var NJ_GEOCODE_MARK='geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
  var NJ_PARCEL_MARK='services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
  var targets=Object.create(null);
  var activeLookup='';

  var SUFFIX={
    AVENUE:'AVE',AVE:'AVE',AV:'AVE',STREET:'ST',ST:'ST',STR:'ST',ROAD:'RD',RD:'RD',
    DRIVE:'DR',DR:'DR',COURT:'CT',CT:'CT',LANE:'LN',LN:'LN',PLACE:'PL',PL:'PL',
    BOULEVARD:'BLVD',BLVD:'BLVD',CIRCLE:'CIR',CIR:'CIR',TERRACE:'TER',TER:'TER',
    PARKWAY:'PKWY',PKWY:'PKWY',HIGHWAY:'HWY',HWY:'HWY',TRAIL:'TRL',TRL:'TRL',
    SQUARE:'SQ',SQ:'SQ',TURNPIKE:'TPKE',TPKE:'TPKE'
  };
  var DIR={NORTH:'N',SOUTH:'S',EAST:'E',WEST:'W',NORTHEAST:'NE',NORTHWEST:'NW',SOUTHEAST:'SE',SOUTHWEST:'SW'};

  function text(v){return String(v==null?'':v).trim();}
  function streetNumber(v){var m=text(v).match(/^(\d+[A-Z-]?)/i);return m?m[1].toUpperCase():'';}
  function streetKey(v){
    var first=text(v).split(',')[0].toUpperCase().replace(/^\d+[A-Z-]?\s+/,'').replace(/[^A-Z0-9 ]+/g,' ');
    return first.split(/\s+/).filter(Boolean).map(function(part){return DIR[part]||SUFFIX[part]||part;}).join(' ');
  }
  function sameAddress(a,b){
    var an=streetNumber(a),bn=streetNumber(b),as=streetKey(a),bs=streetKey(b);
    return !!an&&!!bn&&an===bn&&!!as&&as===bs;
  }
  function coordinateKey(lat,lon){return Number(lat).toFixed(6)+','+Number(lon).toFixed(6);}
  function rememberTarget(lat,lon,address){
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||!streetNumber(address))return;
    targets[coordinateKey(lat,lon)]={address:text(address),at:Date.now()};
    Object.keys(targets).forEach(function(key){if(Date.now()-targets[key].at>30000)delete targets[key];});
  }
  function takeTarget(lat,lon){
    var key=coordinateKey(lat,lon),row=targets[key]||null;
    if(row)delete targets[key];
    return row;
  }
  function requestUrl(input){
    if(typeof input==='string')return input;
    if(typeof URL!=='undefined'&&input instanceof URL)return input.toString();
    return input&&input.url?String(input.url):'';
  }
  function jsonResponseLike(response,data){
    try{
      var headers=new Headers(response.headers||{});
      headers.set('content-type','application/json');
      return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers:headers});
    }catch(_error){return response;}
  }
  function exactNearby(originalFetch,parcelUrl,lat,lon,address){
    var number=streetNumber(address),street=streetKey(address);
    if(!number||!street)return Promise.resolve(null);
    var original;
    try{original=new URL(parcelUrl,location.href);}catch(_error){return Promise.resolve(null);}
    var delta=0.005;
    var params=new URLSearchParams({
      where:"PROP_LOC LIKE '"+number.replace(/'/g,"''")+"%'",
      geometry:JSON.stringify({xmin:lon-delta,ymin:lat-delta,xmax:lon+delta,ymax:lat+delta,spatialReference:{wkid:4326}}),
      geometryType:'esriGeometryEnvelope',
      inSR:'4326',
      outSR:original.searchParams.get('outSR')||'4326',
      spatialRel:'esriSpatialRelIntersects',
      outFields:original.searchParams.get('outFields')||'*',
      returnGeometry:original.searchParams.get('returnGeometry')||'true',
      resultRecordCount:'50',
      f:'json'
    });
    var url=original.origin+original.pathname+'?'+params.toString();
    return originalFetch(url).then(function(r){if(!r.ok)return null;return r.json();}).then(function(data){
      var rows=data&&Array.isArray(data.features)?data.features:[];
      for(var i=0;i<rows.length;i++){
        var loc=rows[i]&&rows[i].attributes&&rows[i].attributes.PROP_LOC;
        if(loc&&sameAddress(address,loc))return rows[i];
      }
      return null;
    }).catch(function(){return null;});
  }

  function installFetchGuard(){
    if(typeof window.fetch!=='function'||window.__watchdogExactParcelFetchGuard)return;
    var originalFetch=window.fetch.bind(window);
    window.fetch=function(input,init){
      var url=requestUrl(input);
      if(url.indexOf(NJ_GEOCODE_MARK)!==-1){
        var requested='';
        try{requested=new URL(url,location.href).searchParams.get('SingleLine')||'';}catch(_error){}
        return originalFetch(input,init).then(function(response){
          if(!response.ok||!requested)return response;
          try{
            response.clone().json().then(function(data){
              var c=data&&data.candidates&&data.candidates[0],loc=c&&c.location;
              if(loc)rememberTarget(Number(loc.y),Number(loc.x),requested);
            }).catch(function(){});
          }catch(_error){}
          return response;
        });
      }
      if(url.indexOf(NJ_PARCEL_MARK)!==-1){
        var parsed,geometry;
        try{
          parsed=new URL(url,location.href);
          if(parsed.searchParams.get('geometryType')!=='esriGeometryPoint')return originalFetch(input,init);
          geometry=JSON.parse(parsed.searchParams.get('geometry')||'{}');
        }catch(_error){return originalFetch(input,init);}
        var lat=Number(geometry.y),lon=Number(geometry.x),target=takeTarget(lat,lon);
        if(!target)return originalFetch(input,init);
        return originalFetch(input,init).then(function(response){
          if(!response.ok)return response;
          return response.clone().json().then(function(data){
            var current=data&&Array.isArray(data.features)&&data.features[0];
            var loc=current&&current.attributes&&current.attributes.PROP_LOC;
            if(loc&&sameAddress(target.address,loc))return response;
            return exactNearby(originalFetch,url,lat,lon,target.address).then(function(exact){
              var next=Object.assign({},data||{}, {features:exact?[exact]:[]});
              if(!exact)next.watchdog_exact_address_mismatch=true;
              return jsonResponseLike(response,next);
            });
          }).catch(function(){return response;});
        });
      }
      return originalFetch(input,init);
    };
    window.__watchdogExactParcelFetchGuard=true;
  }

  function markBuildingBadges(){
    document.querySelectorAll('.wd-nj-option').forEach(function(button){
      var record=button.querySelector('.wd-nj-record'),score=button.querySelector('.wd-nj-score');
      if(!record||!score||!score.hidden)return;
      var value=score.querySelector('b'),label=score.querySelector('span');
      if(value)value.textContent='—';
      if(label)label.textContent='Score building';
      score.hidden=false;
      score.setAttribute('data-score-state','insufficient-canonical-evidence');
    });
  }
  function installScoreNullGuard(){
    var runtime=window.NJPTRSupabaseRuntime;
    if(!runtime||typeof runtime.createClient!=='function')return false;
    var client;
    try{client=runtime.createClient();}catch(_error){return false;}
    if(!client||typeof client.rpc!=='function')return false;
    if(client.__watchdogScoreNullGuard)return true;
    var originalRpc=client.rpc.bind(client);
    client.rpc=function(name,args,options){
      var request=originalRpc(name,args,options);
      if(name!=='get_public_realtime_watchdog_scores'||!request||typeof request.then!=='function')return request;
      return request.then(function(result){
        var insufficient=false;
        if(!result||!Array.isArray(result.data))return result;
        var rows=result.data.map(function(row){
          if(row&&row.watchdog_score==null&&row.score_source==='insufficient_canonical_evidence'){
            insufficient=true;
            return Object.assign({},row,{watchdog_score:NaN});
          }
          return row;
        });
        if(insufficient)setTimeout(markBuildingBadges,0);
        return Object.assign({},result,{data:rows});
      });
    };
    try{Object.defineProperty(client,'__watchdogScoreNullGuard',{value:true});}catch(_error){client.__watchdogScoreNullGuard=true;}
    return true;
  }

  function cleanupExactFlag(){
    try{
      var url=new URL(location.href);
      if(url.searchParams.get('wd_exact')==='1'){
        url.searchParams.delete('wd_exact');
        history.replaceState({},document.title,url.pathname+url.search+url.hash);
      }
    }catch(_error){}
  }
  function installLookupGuard(){
    if(typeof window.plLookup!=='function')return false;
    if(window.plLookup.__watchdogAddressQualityGuard)return true;
    var original=window.plLookup;
    function wrapped(){
      var input=document.getElementById('pl-addr');
      activeLookup=text(input&&input.value);
      return original.apply(this,arguments);
    }
    wrapped.__watchdogAddressQualityGuard=true;
    window.plLookup=wrapped;
    return true;
  }
  document.addEventListener('watchdog:recent-property',function(event){
    var actual=text(event&&event.detail&&event.detail.address),wanted=activeLookup;
    if(!wanted||!actual)return;
    if(sameAddress(wanted,actual)){
      activeLookup='';
      cleanupExactFlag();
      return;
    }
    var wantedNo=streetNumber(wanted),actualNo=streetNumber(actual);
    if(!wantedNo||!actualNo||wantedNo===actualNo)return;
    activeLookup='';
    try{
      var url=new URL(location.href);
      if(url.searchParams.get('wd_exact')==='1'){
        if(typeof window.plCloseModal==='function')window.plCloseModal();
        var inline=document.getElementById('pl-inline');
        if(inline)inline.innerHTML='<div class="pl-state"><i class="fas fa-circle-question"></i><div class="pl-state-title">No exact parcel matched</div><div class="pl-state-sub">We found a nearby parcel, but it did not match the house number you selected. Watchdog will not substitute a neighboring property.</div></div>';
        return;
      }
      url.searchParams.set('address',wanted);
      url.searchParams.set('wd_exact','1');
      location.replace(url.pathname+url.search+url.hash);
    }catch(_error){}
  });

  installFetchGuard();
  var attempts=0,timer=setInterval(function(){
    attempts+=1;
    var scoreReady=installScoreNullGuard(),lookupReady=installLookupGuard();
    if((scoreReady&&lookupReady)||attempts>60)clearInterval(timer);
  },100);
  installScoreNullGuard();
  installLookupGuard();
})();
