/* Watchdog property lookup summary enhancements.
   Fills the intentionally open mobile summary cells with governed Watchdog data,
   adds the ROBUST Burden component to Tax Snapshot, shows familiar city + ZIP,
   and replaces index maps / rendered property imagery with a branded score panel. */
(function(){
  'use strict';
  if(window.__WATCHDOG_LOOKUP_SUMMARY_ENHANCEMENTS__)return;
  window.__WATCHDOG_LOOKUP_SUMMARY_ENHANCEMENTS__=true;

  var GEOCODER='https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
  var cityCache=Object.create(null);
  var scheduled=false;

  function clean(v){return String(v==null?'':v).trim();}
  function esc(v){return clean(v).replace(/[&<>\"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c];});}
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
      'html.wd-index-mapless #plm-map,html.wd-index-mapless #hd-map,html.wd-index-mapless .leaflet-container{display:none!important;visibility:hidden!important;pointer-events:none!important;max-height:0!important;overflow:hidden!important}',
      'html.wd-index-mapless #plm section:has(#plm-map),html.wd-index-mapless #plm .plm-sec:has(#plm-map),html.wd-index-mapless .hd-mapwrap:has(#hd-map){display:none!important}',
      '#plm-photos .wd-mapless-property-hero{position:relative;min-height:320px;width:100%;overflow:hidden;display:grid;align-items:stretch;background:radial-gradient(circle at 78% 14%,rgba(92,161,255,.48),transparent 34%),linear-gradient(145deg,#071a35 0%,#123e82 52%,#2468d8 100%);color:#fff}',
      '#plm-photos .wd-mapless-property-hero:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(0,8,24,.28))}',
      '#plm-photos .wd-mapless-property-in{position:relative;z-index:2;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(260px,.75fr);gap:28px;align-items:center;padding:36px clamp(24px,4vw,54px)}',
      '#plm-photos .wd-mapless-kicker{display:inline-flex;align-items:center;gap:9px;color:#9eece4;font:850 11px/1.2 "Plus Jakarta Sans",sans-serif;letter-spacing:.105em;text-transform:uppercase}',
      '#plm-photos .wd-mapless-address{margin:13px 0 7px;color:#fff;font:850 clamp(24px,3.3vw,40px)/1.05 "Plus Jakarta Sans",sans-serif;letter-spacing:-.045em}',
      '#plm-photos .wd-mapless-copy{max-width:670px;margin:0;color:rgba(255,255,255,.72);font-size:15px;line-height:1.55}',
      '#plm-photos .wd-mapless-status{display:inline-flex;margin-top:18px;padding:8px 11px;border:1px solid rgba(255,255,255,.2);border-radius:999px;background:rgba(255,255,255,.08);font-size:12px;font-weight:800}',
      '#plm-photos .wd-mapless-scorebox{justify-self:end;width:min(100%,330px);padding:22px;border:1px solid rgba(255,255,255,.24);border-radius:24px;background:rgba(4,22,51,.38);box-shadow:0 18px 44px rgba(2,12,31,.24);backdrop-filter:blur(10px)}',
      '#plm-photos .wd-mapless-scorelabel{display:flex;align-items:center;gap:9px;color:rgba(255,255,255,.74);font:850 10px/1.1 "Plus Jakarta Sans",sans-serif;letter-spacing:.08em;text-transform:uppercase}',
      '#plm-photos .wd-mapless-score{display:flex;align-items:flex-end;gap:5px;margin-top:10px;color:#fff;font:900 clamp(46px,7vw,72px)/.86 "Plus Jakarta Sans",sans-serif;letter-spacing:-.07em}',
      '#plm-photos .wd-mapless-score em{padding-bottom:7px;color:rgba(255,255,255,.55);font:800 14px/1 "Plus Jakarta Sans",sans-serif;font-style:normal;letter-spacing:0}',
      '#plm-photos .wd-mapless-score.building{font-size:28px;line-height:1;letter-spacing:-.025em}',
      '#plm-photos .wd-mapless-robust-title{margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.14);color:#9eece4;font:900 10px/1 "Plus Jakarta Sans",sans-serif;letter-spacing:.12em}',
      '#plm-photos .wd-mapless-components{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin-top:10px}',
      '#plm-photos .wd-mapless-components span{text-align:center;min-width:0;padding:8px 3px;border-radius:10px;background:rgba(255,255,255,.07)}',
      '#plm-photos .wd-mapless-components b{display:block;color:#9eece4;font:900 9px/1 "Plus Jakarta Sans",sans-serif}',
      '#plm-photos .wd-mapless-components em{display:block;margin-top:5px;color:#fff;font:850 11px/1 "Plus Jakarta Sans",sans-serif;font-style:normal}',
      '#plm-photos .wd-mapless-photo-note{grid-column:1/-1;display:flex;align-items:center;gap:9px;margin-top:2px;color:rgba(255,255,255,.62);font-size:12px;line-height:1.4}',
      '@media(max-width:760px){#plm-photos .wd-mapless-property-hero{min-height:360px}#plm-photos .wd-mapless-property-in{grid-template-columns:1fr;gap:22px;padding:28px 20px}#plm-photos .wd-mapless-scorebox{justify-self:stretch;width:auto}#plm-photos .wd-mapless-score{font-size:58px}}',
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

  function canonicalScore(){
    var score=document.querySelector('#plm-robust-score-sec .wdps-score b');
    var value=score&&clean(score.textContent);
    return value&&value!=='—'?value:'';
  }
  function syncWatchdogScore(){
    var tile=document.getElementById('plm-q-watchdog-score');
    if(!tile)return;
    var n=tile.querySelector('b');
    var value=canonicalScore();
    if(value){
      setText(n,value+'/100');
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

  function componentRows(){
    var order=['R','O','B','U','S','T'];
    var values=Object.create(null);
    document.querySelectorAll('#plm-robust-score-sec .wdps-row').forEach(function(row){
      var label=row.querySelector('.wdps-label a'),score=row.querySelector('.wdps-n');
      var match=clean(label&&label.textContent).match(/^([ROBUST])\s*·/i);
      if(match)values[match[1].toUpperCase()]=clean(score&&score.textContent)||'—';
    });
    return order.map(function(letter){return{letter:letter,value:values[letter]||'—'};});
  }
  function componentsMarkup(rows){
    return rows.map(function(item){return'<span><b>'+esc(item.letter)+'</b><em>'+esc(item.value)+'</em></span>';}).join('');
  }
  function syncBrandedHero(){
    var photos=document.getElementById('plm-photos');
    var addrBox=document.querySelector('#plm .plm-addr');
    if(!photos||!addrBox)return;
    var address=addressText(addrBox)||'New Jersey property';
    var score=canonicalScore();
    var rows=componentRows();
    var statusNode=photos.querySelector('.plm-tag');
    var status=clean(statusNode&&statusNode.textContent);
    var signature=[address,score,status,rows.map(function(x){return x.letter+':'+x.value;}).join(',')].join('|');
    var existing=photos.querySelector('.wd-mapless-property-hero');
    if(existing&&existing.dataset.signature===signature)return;
    photos.querySelectorAll('img').forEach(function(img){try{img.removeAttribute('srcset');img.removeAttribute('data-fallback');img.removeAttribute('src');}catch(_error){}img.remove();});
    var scoreHtml=score?'<div class="wd-mapless-score">'+esc(score)+'<em>/100</em></div>':'<div class="wd-mapless-score building">Score building</div>';
    var statusHtml=status?'<span class="wd-mapless-status">'+esc(status)+'</span>':'';
    photos.innerHTML='<div class="wd-mapless-property-hero" data-signature="'+esc(signature)+'"><div class="wd-mapless-property-in">'+
      '<div><span class="wd-mapless-kicker"><i class="fas fa-dog"></i> Watchdog Property Intelligence</span><h2 class="wd-mapless-address">'+esc(address)+'</h2><p class="wd-mapless-copy">Rendered maps and third-party property imagery are temporarily disabled on this page. The property record, Watchdog Score and governed ROBUST evidence remain available.</p>'+statusHtml+'</div>'+
      '<div class="wd-mapless-scorebox"><span class="wd-mapless-scorelabel"><i class="fas fa-shield-dog"></i> Watchdog Score</span>'+scoreHtml+'<div class="wd-mapless-robust-title">ROBUST FRAMEWORK</div><div class="wd-mapless-components">'+componentsMarkup(rows)+'</div></div>'+
      '<div class="wd-mapless-photo-note"><i class="fas fa-camera"></i><span>Owner-submitted property photos are planned as the replacement for third-party rendered imagery.</span></div>'+
      '</div></div>';
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
      syncBrandedHero();
    });
  }

  function sync(){
    scheduled=false;
    document.documentElement.classList.add('wd-index-mapless');
    ensureStyles();
    ensureQuickTiles();
    ensureTaxBurden();
    syncWatchdogScore();
    syncTaxValue();
    syncBurden();
    syncCity();
    syncBrandedHero();
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(sync);}

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
  if(typeof MutationObserver!=='undefined')new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  window.WatchdogLookupSummaryEnhancements={sync:sync};
})();