/* NJW-96 refinement — Zillow-style public search controls, Watchdog score
   filtering, property card controls, town SEO clusters and search footer art. */
(function () {
  'use strict';

  var PARCEL = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
  var SB_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var SB_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var client = null;
  var scoreMap = Object.create(null);
  var hiddenPins = Object.create(null);
  var townRows = [];
  var townScores = [];
  var nearbyRows = [];
  var seoBusy = false;
  var seoCacheKey = '';
  var footerPlaceholder = null;
  var filters = { aMin: '', aMax: '', tMin: '', tMax: '', sMin: '', sMax: '', sort: 'default' };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function money(v) { return '$' + Math.round(+v || 0).toLocaleString(); }
  function parseMoney(v) {
    var n = String(v || '').replace(/[^0-9.]/g, '');
    return n ? +n : null;
  }
  function norm(v) {
    return String(v || '').toUpperCase().replace(/\bTOWNSHIP\b/g, 'TWP').replace(/\bBOROUGH\b/g, 'BORO')
      .replace(/[^A-Z0-9]/g, '');
  }
  function slug(v) {
    return String(v || '').toLowerCase().trim()
      .replace(/\btwp\b/g, 'township').replace(/\bboro\b/g, 'borough')
      .replace(/\bmun\b/g, 'municipality').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function townUrl(row) { return '/towns/' + slug(row.county) + '/' + slug(row.town) + '.html'; }
  function sb() {
    if (client) return client;
    if (window.__njwSB) { client = window.__njwSB; return client; }
    if (!window.supabase) return null;
    client = window.supabase.createClient(SB_URL, SB_KEY, { auth: {
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
      flowType: 'pkce', storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token'
    }});
    window.__njwSB = client;
    return client;
  }
  function toast(msg) {
    var t = document.getElementById('pl-toast');
    if (!t) return;
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(window.__njwPolishToast);
    window.__njwPolishToast = setTimeout(function () { t.style.display = 'none'; }, 2400);
  }
  function closePanels(except) {
    document.querySelectorAll('.njw-range-panel.open').forEach(function (p) {
      if (p !== except) p.classList.remove('open');
    });
    document.querySelectorAll('.njw-card-menu.open').forEach(function (p) { p.classList.remove('open'); });
  }
  function rangeControl(key, label, prefix, min, max, step) {
    var isScore = key === 's';
    return '<div class="njw-filter-wrap">' +
      '<button class="njw-filter-btn" type="button" data-range-toggle="' + key + '">' + esc(label) + ' <i class="fas fa-chevron-down"></i></button>' +
      '<div class="njw-range-panel" data-range-panel="' + key + '">' +
        '<div class="njw-range-title">' + esc(label) + ' range</div>' +
        '<div class="njw-range-inputs">' +
          '<label><span>Min</span><div>' + (prefix ? '<b>' + prefix + '</b>' : '') + '<input inputmode="numeric" type="number" min="' + min + '" max="' + max + '" step="' + step + '" data-range-min="' + key + '" placeholder="No min"></div></label>' +
          '<em>–</em>' +
          '<label><span>Max</span><div>' + (prefix ? '<b>' + prefix + '</b>' : '') + '<input inputmode="numeric" type="number" min="' + min + '" max="' + max + '" step="' + step + '" data-range-max="' + key + '" placeholder="No max"></div></label>' +
        '</div>' +
        (isScore ? '<div class="njw-score-scale"><span>0</span><i></i><span>100</span></div>' : '') +
        '<div class="njw-range-actions"><button type="button" data-range-clear="' + key + '">Clear</button><button class="apply" type="button" data-range-apply="' + key + '">Apply</button></div>' +
      '</div></div>';
  }
  function installFilterBar() {
    var hood = document.getElementById('pl-hood');
    var split = hood && hood.querySelector('.hd-split');
    if (!hood || !split || document.getElementById('njw-filterbar')) return;
    var legacy = document.getElementById('hd-bar');
    if (legacy) legacy.classList.add('njw-legacy-filterbar');
    var bar = document.createElement('div');
    bar.id = 'njw-filterbar';
    bar.className = 'njw-filterbar';
    bar.innerHTML =
      '<button class="njw-search-back" type="button" onclick="plHideHood()" aria-label="Back"><i class="fas fa-chevron-left"></i></button>' +
      '<div class="njw-search-slot"></div>' +
      rangeControl('a', 'Assessment', '$', 0, 10000000, 10000) +
      rangeControl('t', 'Tax Amount', '$', 0, 100000, 500) +
      rangeControl('s', 'Watchdog Score', '', 0, 100, 1) +
      '<label class="njw-sort"><span>Sort</span><select id="njw-sort-select">' +
        '<option value="default">Recommended</option><option value="assessmentHigh">Assessment: high to low</option><option value="assessmentLow">Assessment: low to high</option>' +
        '<option value="taxHigh">Tax: high to low</option><option value="taxLow">Tax: low to high</option>' +
        '<option value="scoreHigh">Watchdog Score: high to low</option><option value="scoreLow">Watchdog Score: low to high</option>' +
      '</select></label>' +
      '<div class="njw-save-slot"></div>';
    hood.insertBefore(bar, split);
    var search = hood.querySelector('.hd-searchbox');
    var save = document.getElementById('hd-save-search');
    if (search) bar.querySelector('.njw-search-slot').appendChild(search);
    if (save) bar.querySelector('.njw-save-slot').appendChild(save);
    var headActions = hood.querySelector('.hd-head-actions');
    if (headActions && !headActions.children.length) headActions.remove();
    bar.addEventListener('click', function (e) {
      var toggle = e.target.closest('[data-range-toggle]');
      if (toggle) {
        e.stopPropagation();
        var p = bar.querySelector('[data-range-panel="' + toggle.dataset.rangeToggle + '"]');
        var opening = !p.classList.contains('open');
        closePanels(p); p.classList.toggle('open', opening); return;
      }
      var apply = e.target.closest('[data-range-apply]');
      if (apply) { applyRange(apply.dataset.rangeApply, bar); return; }
      var clear = e.target.closest('[data-range-clear]');
      if (clear) { clearRange(clear.dataset.rangeClear, bar); }
    });
    var sort = document.getElementById('njw-sort-select');
    if (sort) sort.addEventListener('change', function () { filters.sort = sort.value; applyCardFilters(); });
  }
  function applyRange(key, bar) {
    var lo = bar.querySelector('[data-range-min="' + key + '"]');
    var hi = bar.querySelector('[data-range-max="' + key + '"]');
    filters[key + 'Min'] = lo && lo.value ? +lo.value : '';
    filters[key + 'Max'] = hi && hi.value ? +hi.value : '';
    var btn = bar.querySelector('[data-range-toggle="' + key + '"]');
    if (btn) btn.classList.toggle('active', filters[key + 'Min'] !== '' || filters[key + 'Max'] !== '');
    closePanels(); applyCardFilters();
  }
  function clearRange(key, bar) {
    var lo = bar.querySelector('[data-range-min="' + key + '"]');
    var hi = bar.querySelector('[data-range-max="' + key + '"]');
    if (lo) lo.value = ''; if (hi) hi.value = '';
    filters[key + 'Min'] = ''; filters[key + 'Max'] = '';
    var btn = bar.querySelector('[data-range-toggle="' + key + '"]');
    if (btn) btn.classList.remove('active');
    closePanels(); applyCardFilters();
  }
  function pinOf(card) {
    var b = card.querySelector('[data-save-pin]');
    return b ? b.getAttribute('data-save-pin') : '';
  }
  function cardData(card) {
    var assessed = parseMoney((card.querySelector('.hd-val') || {}).textContent);
    var tax = null;
    Array.prototype.some.call(card.querySelectorAll('.hd-meta span'), function (s) {
      if (/tax/i.test(s.textContent)) { tax = parseMoney(s.textContent); return true; }
      return false;
    });
    var pin = pinOf(card);
    var score = scoreMap[pin] == null ? null : +scoreMap[pin];
    return { pin: pin, assessed: assessed, tax: tax, score: score };
  }
  function visibleByFilters(d) {
    if (hiddenPins[d.pin]) return false;
    if (filters.aMin !== '' && (d.assessed == null || d.assessed < filters.aMin)) return false;
    if (filters.aMax !== '' && (d.assessed == null || d.assessed > filters.aMax)) return false;
    if (filters.tMin !== '' && (d.tax == null || d.tax < filters.tMin)) return false;
    if (filters.tMax !== '' && (d.tax == null || d.tax > filters.tMax)) return false;
    if (filters.sMin !== '' && (d.score == null || d.score < filters.sMin)) return false;
    if (filters.sMax !== '' && (d.score == null || d.score > filters.sMax)) return false;
    return true;
  }
  function applyCardFilters() {
    var host = document.getElementById('hd-list');
    if (!host) return;
    var cards = Array.prototype.slice.call(host.querySelectorAll('.hd-card'));
    cards.forEach(function (card) { card.hidden = !visibleByFilters(cardData(card)); });
    sortCards(cards, host); updateCount();
  }
  function sortCards(cards, host) {
    if (!filters.sort || filters.sort === 'default') return;
    var fn = {
      assessmentHigh: function (a,b) { return (cardData(b).assessed || -1) - (cardData(a).assessed || -1); },
      assessmentLow: function (a,b) { return (cardData(a).assessed || Infinity) - (cardData(b).assessed || Infinity); },
      taxHigh: function (a,b) { return (cardData(b).tax || -1) - (cardData(a).tax || -1); },
      taxLow: function (a,b) { return (cardData(a).tax || Infinity) - (cardData(b).tax || Infinity); },
      scoreHigh: function (a,b) { return (cardData(b).score == null ? -1 : cardData(b).score) - (cardData(a).score == null ? -1 : cardData(a).score); },
      scoreLow: function (a,b) { return (cardData(a).score == null ? Infinity : cardData(a).score) - (cardData(b).score == null ? Infinity : cardData(b).score); }
    }[filters.sort];
    if (!fn) return;
    var desired = cards.slice().sort(fn);
    var changed = desired.some(function (c, i) { return c !== cards[i]; });
    if (!changed) return;
    var anchor = host.querySelector('.hd-ad,.hd-note,.hd-seo,.hd-more');
    desired.forEach(function (c) { host.insertBefore(c, anchor || null); });
  }
  function updateCount() {
    var host = document.getElementById('hd-list');
    var count = document.getElementById('hd-countline');
    if (!host || !count) return;
    var n = host.querySelectorAll('.hd-card:not([hidden])').length;
    var html = '<strong>' + n.toLocaleString() + ' properties</strong>';
    if (count.innerHTML !== html) count.innerHTML = html;
  }
  function paintScores(cards) {
    cards.forEach(function (card) {
      var pin = pinOf(card), score = scoreMap[pin];
      card.dataset.watchdogScore = score == null ? '' : score;
      // Visible score line is owned by search-corrections-v3.js. Writing it
      // here too caused a flicker/overwrite race between the two scripts,
      // where this file's slower fetch would blank out a good number v3
      // had just painted. This file still tracks scoreMap internally so the
      // Watchdog Score filter and sort options keep working.
    });
  }
  function hydrateCards() {
    var host = document.getElementById('hd-list');
    if (!host) return;
    var cards = Array.prototype.slice.call(host.querySelectorAll('.hd-card'));
    if (!cards.length) return;
    cards.forEach(enhanceCard); paintScores(cards);
    var pins = cards.map(pinOf).filter(Boolean);
    var missing = pins.filter(function (pin) { return !Object.prototype.hasOwnProperty.call(scoreMap, pin); });
    if (!missing.length || !sb()) { applyCardFilters(); return; }
    missing.forEach(function (pin) { scoreMap[pin] = null; });
    sb().rpc('get_public_property_watchdog_scores', { p_pins: missing }).then(function (r) {
      if (!r.error) (r.data || []).forEach(function (x) { scoreMap[x.pams_pin] = +x.watchdog_score; });
      paintScores(cards); applyCardFilters();
    }).catch(function () { applyCardFilters(); });
  }
  function enhanceCard(card) {
    if (card.dataset.njwPolished === '1') return;
    card.dataset.njwPolished = '1';
    var shot = card.querySelector('.hd-shot'); if (!shot) return;
    var pin = pinOf(card);
    var btn = document.createElement('button'); btn.type='button'; btn.className='njw-card-menu-btn'; btn.setAttribute('aria-label','Property options'); btn.innerHTML='<i class="fas fa-ellipsis"></i>';
    var menu = document.createElement('div'); menu.className='njw-card-menu';
    menu.innerHTML='<button type="button" data-card-hide><i class="far fa-eye-slash"></i> Hide</button><button type="button" data-card-share><i class="fas fa-share-nodes"></i> Share</button>';
    shot.appendChild(btn); shot.appendChild(menu);
    btn.addEventListener('click', function(e){ e.stopPropagation(); closePanels(menu); menu.classList.toggle('open'); });
    menu.addEventListener('click', function(e){
      e.stopPropagation();
      if(e.target.closest('[data-card-hide]')){ if(pin) hiddenPins[pin]=true; card.hidden=true; menu.classList.remove('open'); updateCount(); toast('Property hidden from this view'); }
      if(e.target.closest('[data-card-share]')){ shareCard(card); menu.classList.remove('open'); }
    });
  }
  function shareCard(card) {
    var address = card.getAttribute('data-address') || ((card.querySelector('.hd-addr') || {}).textContent || 'New Jersey property');
    var url = location.origin + '/property/';
    if (navigator.share) { navigator.share({ title:address, text:address + ' on Watchdog Property Intelligence', url:url }).catch(function(){}); return; }
    var text = address + ' — ' + url;
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function(){toast('Property link copied');});
    else toast('Share: ' + address);
  }
  function currentTownName() {
    var h=document.getElementById('hd-results-title');
    return h ? h.textContent.replace(/,\s*NJ\s+Property Tax Assessments.*$/i,'').trim() : '';
  }
  function dist(a,b) {
    var r=Math.PI/180, x=(a.lon-b.lon)*Math.cos(((a.lat+b.lat)/2)*r), y=a.lat-b.lat;
    return Math.sqrt(x*x+y*y)*69;
  }
  function loadSeo() {
    var host=document.getElementById('hd-seo'), map=window.__njw96HoodMap;
    if(!host || !map || seoBusy || host.dataset.njwRich==='1') return;
    seoBusy=true; host.dataset.njwRich='1'; host.classList.add('njw-rich-seo');
    host.innerHTML='<div class="njw-seo-loading">Building nearby and similar town intelligence…</div>';
    var stats=JSON.stringify([{statisticType:'avg',onStatisticField:'NET_VALUE',outStatisticFieldName:'avg_assessment'},{statisticType:'count',onStatisticField:'PAMS_PIN',outStatisticFieldName:'property_count'}]);
    var allParams=new URLSearchParams({where:"PROP_CLASS = '2' AND NET_VALUE > 10000",outStatistics:stats,groupByFieldsForStatistics:'COUNTY,MUN_NAME',orderByFields:'COUNTY,MUN_NAME',returnGeometry:'false',resultRecordCount:'2000',f:'json'});
    var center=map.getCenter();
    var key=norm(currentTownName())+'|'+center.lat.toFixed(2)+'|'+center.lng.toFixed(2);
    if(townRows.length&&nearbyRows.length&&seoCacheKey===key){renderSeo(host);seoBusy=false;return;}
    function nearbyFetch(span){
      var p=new URLSearchParams({geometry:JSON.stringify({xmin:center.lng-span,ymin:center.lat-span,xmax:center.lng+span,ymax:center.lat+span,spatialReference:{wkid:4326}}),geometryType:'esriGeometryEnvelope',inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',where:"PROP_CLASS = '2' AND NET_VALUE > 10000",outFields:'MUN_NAME,COUNTY,NET_VALUE',returnGeometry:'false',returnCentroid:'true',resultRecordCount:'2000',f:'json'});
      return fetch(PARCEL+'?'+p.toString()).then(function(r){return r.json();}).then(function(d){
        var groups=Object.create(null);
        (d.features||[]).forEach(function(f){var a=f.attributes||{},c=f.centroid||{};if(!a.MUN_NAME||!a.COUNTY||c.x==null||c.y==null)return;var k=norm(a.COUNTY)+'|'+norm(a.MUN_NAME),g=groups[k]||(groups[k]={town:a.MUN_NAME,county:a.COUNTY,lat:0,lon:0,n:0});g.lat+=+c.y;g.lon+=+c.x;g.n++;});
        return Object.keys(groups).map(function(k){var g=groups[k];g.lat/=g.n;g.lon/=g.n;g.distance=dist({lat:center.lat,lon:center.lng},g);return g;}).sort(function(a,b){return a.distance-b.distance;});
      });
    }
    var scorePromise=sb()?sb().rpc('get_public_town_watchdog_scores').then(function(r){return r.error?[]:(r.data||[]);}).catch(function(){return [];}):Promise.resolve([]);
    Promise.all([fetch(PARCEL+'?'+allParams.toString()).then(function(r){return r.json();}),nearbyFetch(0.22).then(function(rows){return rows.length>=11?rows:nearbyFetch(0.42);}),scorePromise]).then(function(all){
      townRows=(all[0].features||[]).map(function(f){var a=f.attributes||{};return {town:a.MUN_NAME,county:a.COUNTY,avg:+a.avg_assessment||0,count:+a.property_count||0};}).filter(function(x){return x.town&&x.county;});
      nearbyRows=all[1]||[]; townScores=all[2]||[]; seoCacheKey=key; renderSeo(host);
    }).catch(function(){host.innerHTML='<h3>Explore New Jersey property tax assessments</h3><p><a href="/towns/">Browse every municipality</a>.</p>';}).finally(function(){seoBusy=false;});
  }
  function scoreFor(row) {
    var nTown=norm(row.town),nCounty=norm(row.county);
    for(var i=0;i<townScores.length;i++) if(norm(townScores[i].town)===nTown&&norm(townScores[i].county)===nCounty) return +townScores[i].avg_watchdog_score;
    return null;
  }
  function statFor(row) {
    var nTown=norm(row.town),nCounty=norm(row.county);
    for(var i=0;i<townRows.length;i++) if(norm(townRows[i].town)===nTown&&norm(townRows[i].county)===nCounty) return townRows[i];
    return null;
  }
  function townCard(row,showScore) {
    var stat=statFor(row)||row,score=scoreFor(row);
    return '<a class="njw-town-card" href="'+townUrl(stat)+'"><b>'+esc(stat.town)+'</b><span>'+esc(stat.county)+' County</span><em>Avg. assessment '+money(stat.avg||0)+'</em>'+(showScore?'<strong>Watchdog Score '+(score==null?'—':score.toFixed(1))+'</strong>':'')+'</a>';
  }
  function renderSeo(host) {
    var currentName=currentTownName(),currentNear=null;
    for(var i=0;i<nearbyRows.length;i++) if(norm(nearbyRows[i].town)===norm(currentName)){currentNear=nearbyRows[i];break;}
    if(!currentNear) currentNear=nearbyRows[0]||{town:currentName,county:''};
    var currentStat=statFor(currentNear)||null,currentScore=scoreFor(currentNear);
    var nearest=nearbyRows.filter(function(x){return norm(x.town)!==norm(currentName);}).slice(0,10);
    var similarAssess=currentStat?townRows.filter(function(x){return norm(x.town)!==norm(currentStat.town);}).sort(function(a,b){return Math.abs(a.avg-currentStat.avg)-Math.abs(b.avg-currentStat.avg);}).slice(0,5):[];
    var similarScore=currentScore==null?[]:townRows.filter(function(x){var s=scoreFor(x);return s!=null&&norm(x.town)!==norm(currentName);}).sort(function(a,b){return Math.abs(scoreFor(a)-currentScore)-Math.abs(scoreFor(b)-currentScore);}).slice(0,5);
    var counties=Object.create(null); townRows.forEach(function(x){(counties[x.county]=counties[x.county]||[]).push(x);});
    var countyHtml=Object.keys(counties).sort().map(function(c){return '<div class="njw-county-group"><h4>'+esc(c)+' County</h4><div class="njw-all-town-links">'+counties[c].sort(function(a,b){return a.town.localeCompare(b.town);}).map(function(x){return '<a href="'+townUrl(x)+'"><span>'+esc(x.town)+'</span><b>'+money(x.avg)+'</b></a>';}).join('')+'</div></div>';}).join('');
    host.innerHTML='<div class="njw-seo-intro"><span>Explore more New Jersey property intelligence</span><h3>Compare nearby and similar municipalities</h3><p>Assessment averages come from New Jersey’s statewide residential assessment file. Town Watchdog Scores are the average of the latest property-level Watchdog scores currently observed in that municipality.</p></div>'+
      '<section class="njw-seo-block"><div class="njw-seo-title"><h4>10 nearest towns</h4><p>Closest municipalities to the current map area.</p></div><div class="njw-town-grid">'+nearest.map(function(x){return townCard(x,false);}).join('')+'</div></section>'+
      '<section class="njw-seo-block"><div class="njw-seo-title"><h4>Similar assessment value towns</h4><p>Municipalities with average residential assessments closest to '+(currentStat?money(currentStat.avg):'this area')+'.</p></div><div class="njw-town-grid compact">'+similarAssess.map(function(x){return townCard(x,false);}).join('')+'</div></section>'+
      '<section class="njw-seo-block"><div class="njw-seo-title"><h4>Similar Watchdog towns</h4><p>'+(currentScore==null?'A town-average Watchdog score will appear as property score coverage grows.':'Towns with average Watchdog scores closest to '+currentScore.toFixed(1)+'.')+'</p></div><div class="njw-town-grid compact">'+(similarScore.length?similarScore.map(function(x){return townCard(x,true);}).join(''):'<div class="njw-score-pending">Not enough scored municipalities yet for a reliable similarity set.</div>')+'</div></section>'+
      '<section class="njw-seo-block"><div class="njw-seo-title"><h4>Nearby Watchdog town scores</h4><p>Average Watchdog score for the municipalities closest to this search.</p></div><div class="njw-town-grid">'+nearest.map(function(x){return townCard(x,true);}).join('')+'</div></section>'+
      '<section class="njw-seo-block njw-all-towns"><div class="njw-seo-title"><h4>All New Jersey property tax assessment towns</h4><p>Browse the statewide directory, organized by county.</p></div>'+countyHtml+'</section>';
    installSearchArtAndFooter();
  }
  function installSearchArtAndFooter() {
    var right=document.querySelector('#pl-hood .hd-right'); if(!right)return;
    var art=document.getElementById('njw-search-art');
    if(!art){art=document.createElement('div');art.id='njw-search-art';art.className='njw-search-art';art.innerHTML='<img src="/property/assets/watchdog-layout.svg" alt="Watchdog property intelligence illustration">';}
    var footer=document.getElementById('wd-property-footer');
    if(footer&&!footerPlaceholder){footerPlaceholder=document.createComment('watchdog-footer-home');footer.parentNode.insertBefore(footerPlaceholder,footer);}
    if(document.body.classList.contains('hood-on')){
      if(art.parentNode!==right)right.appendChild(art);
      if(footer&&footer.parentNode!==right)right.appendChild(footer);
      if(footer&&art.nextSibling!==footer)right.insertBefore(art,footer);
    }
  }
  function restoreFooterIfNeeded() {
    var footer=document.getElementById('wd-property-footer');
    if(!document.body.classList.contains('hood-on')&&footer&&footerPlaceholder&&footerPlaceholder.parentNode) footerPlaceholder.parentNode.insertBefore(footer,footerPlaceholder.nextSibling);
  }
  function scan() {
    if(!document.body.classList.contains('hood-on')){restoreFooterIfNeeded();return;}
    installFilterBar();hydrateCards();updateCount();if(document.getElementById('hd-seo'))loadSeo();installSearchArtAndFooter();
  }
  document.addEventListener('click',function(e){if(!e.target.closest('.njw-filter-wrap')&&!e.target.closest('.njw-card-menu-btn'))closePanels();});
  var obs=new MutationObserver(function(){clearTimeout(window.__njwPolishScan);window.__njwPolishScan=setTimeout(scan,60);});
  obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('load',scan);scan();
})();
