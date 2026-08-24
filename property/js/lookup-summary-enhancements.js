/* Watchdog property lookup summary enhancements.
   Fills the intentionally open mobile summary cells with governed Watchdog data,
   adds the ROBUST Burden component to Tax Snapshot, and shows familiar city + ZIP
   beside the street address while preserving municipality as jurisdiction context. */
(function(){
  'use strict';
  if(window.__WATCHDOG_LOOKUP_SUMMARY_ENHANCEMENTS__)return;
  window.__WATCHDOG_LOOKUP_SUMMARY_ENHANCEMENTS__=true;

  var GEOCODER='https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
  var cityCache=Object.create(null);
  var scheduled=false;

  function clean(v){return String(v==null?'':v).trim();}
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
      '@media(max-width:640px){#plm .wd-pl-proprietary b{font-size:inherit}}'
    ].join('');
    document.head.appendChild(s);
  }

  function ensureQuickTiles(){
    var grid=document.querySelector('#plm .plm-quick');
    if(!grid)return;
    if(!document.getElementById('plm-q-watchdog-score')){
      grid.insertAdjacentHTML('beforeend','<div class="plm-q wd-pl-proprietary" id="plm-q-watchdog-score"><i class="fas fa-dog"></i><div><b>—</b><span>Watchdog score</span></div></div>');
    }
    if(!document.getElementById('plm-q-tax-value')){
      grid.insertAdjacentHTML('beforeend','<div class="plm-q wd-pl-proprietary" id="plm-q-tax-value"><i class="fas fa-scale-balanced"></i><div><b>—</b><span>Watchdog tax value</span></div></div>');
    }
  }

  function ensureTaxBurden(){
    var grid=document.querySelector('#plm .plm-kpis');
    if(!grid||document.getElementById('plm-kpi-burden'))return;
    grid.insertAdjacentHTML('beforeend','<div class="plm-kpi wd-pl-proprietary" id="plm-kpi-burden"><div class="plm-kpi-n">—</div><div class="plm-kpi-l">B · Tax burden</div></div>');
  }

  function syncWatchdogScore(){
    var tile=document.getElementById('plm-q-watchdog-score');
    if(!tile)return;
    var n=tile.querySelector('b');
    var score=document.querySelector('#plm-robust-score-sec .wdps-score b');
    if(score&&clean(score.textContent)){
      setText(n,clean(score.textContent)+'/100');
      tile.dataset.ready='1';
      tile.title='Canonical Watchdog Score powered by the ROBUST Framework';
    }else{
      setText(n,'—');
      delete tile.dataset.ready;
      tile.title='Score publishes when governed ROBUST evidence is sufficient';
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
      setText(n,'—');
      delete tile.dataset.ready;
      tile.title='Watchdog Tax Value appears when enough defensible sale evidence is available';
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
    if(score&&clean(score.textContent)&&clean(score.textContent)!=='—'){
      setText(value,clean(score.textContent)+'/100');
      tile.dataset.ready='1';
      tile.title='ROBUST B · Burden component. Higher is a more favorable tax-burden position.';
    }else{
      setText(value,'—');
      delete tile.dataset.ready;
      tile.title='ROBUST Burden publishes only when the required governed evidence is available';
    }
  }

  function addressText(node){
    if(!node)return'';
    for(var i=0;i<node.childNodes.length;i++)if(node.childNodes[i].nodeType===3&&clean(node.childNodes[i].nodeValue))return clean(node.childNodes[i].nodeValue);
    return'';
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
    });
  }

  function sync(){
    scheduled=false;
    ensureStyles();
    ensureQuickTiles();
    ensureTaxBurden();
    syncWatchdogScore();
    syncTaxValue();
    syncBurden();
    syncCity();
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(sync);}

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
  if(typeof MutationObserver!=='undefined')new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  window.WatchdogLookupSummaryEnhancements={sync:sync};
})();
