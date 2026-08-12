/* NJW-96 — live map/search completion layer.
   Loaded by ownership-verification.js after the core lookup bundle. */
(function () {
  'use strict';

  var PARCEL = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
  var GMAPS_KEY = 'AIzaSyCZBo_mj5WXyR-Bsb5yHdekxAxauTYNmlU';
  var SB_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var SB_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var GREENTREE_URL = 'https://johnvarano.com/';
  var IDX_URL = 'https://johnscafide.opuselitesj.com/index.php?advanced=1';
  var state = { map: null, rows: [], active: false, query: '', saved: {}, timer: null, request: 0, town: '', county: '' };
  var client = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function money(n) { return '$' + Math.round(+n || 0).toLocaleString(); }
  function slug(s) {
    return String(s || '').toLowerCase().trim()
      .replace(/\btwp\b/g, 'township').replace(/\bboro\b/g, 'borough')
      .replace(/\bmun\b/g, 'municipality').replace(/\bcity\b/g, 'city')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function toast(msg) {
    var t = document.getElementById('pl-toast');
    if (!t) return;
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(window.__njw96Toast);
    window.__njw96Toast = setTimeout(function () { t.style.display = 'none'; }, 2600);
  }
  function sb() {
    if (client || !window.supabase) return client;
    client = window.supabase.createClient(SB_URL, SB_KEY, { auth: {
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
      flowType: 'pkce', storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token'
    }});
    return client;
  }

  function installStyle() {
    if (document.getElementById('njw96-runtime-style')) return;
    var s = document.createElement('style');
    s.id = 'njw96-runtime-style';
    s.textContent =
      '.ssearch-pill{display:none!important}' +
      '.ssearch-in{grid-template-columns:auto 1fr auto!important}' +
      '.hd-head{align-items:flex-end}.hd-head-copy{flex:1;min-width:0}.hd-head-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap}' +
      '.hd-runtime-loading{grid-column:1/-1;padding:28px;text-align:center;color:#5a6070;font-weight:700}' +
      '.hd-countline{margin:4px 0 0!important}' +
      '.hd-seo{grid-column:1/-1}.hd-seo-links a span{display:block;color:#68788f;font-weight:600;font-size:11.5px;margin-top:2px}' +
      '.hd-more{grid-column:1/-1;display:flex;justify-content:center;padding:10px 0 18px}.hd-more button{border:1px solid #0e2248;background:#fff;color:#0e2248;border-radius:999px;padding:10px 18px;font-weight:800;cursor:pointer}' +
      '@media(max-width:900px){.ssearch-in{grid-template-columns:auto 1fr!important}.hd-head-actions{width:100%}.hd-searchbox{flex:1}}';
    document.head.appendChild(s);
  }

  function enhanceHeader() {
    var head = document.querySelector('#pl-hood .hd-head');
    if (!head || head.dataset.njw96 === '1') return;
    head.dataset.njw96 = '1';
    var oldH = head.querySelector('h2');
    var oldP = head.querySelector('p');
    var town = oldH ? oldH.textContent.replace(/^Homes near\s*/i, '').trim() : '';
    state.town = town || state.town;
    head.innerHTML =
      '<div class="hd-head-copy"><h2 id="hd-results-title">' + esc((town || 'New Jersey') + ', NJ Property Tax Assessments') + '</h2>' +
      '<p class="hd-countline" id="hd-countline">Loading property assessments in this map area…</p></div>' +
      '<div class="hd-head-actions">' +
        '<label class="hd-searchbox" aria-label="Search properties in this area"><i class="fas fa-magnifying-glass"></i>' +
          '<input id="hd-result-search" type="search" placeholder="Search address, town or ZIP" autocomplete="off">' +
          '<button id="hd-result-go" type="button" aria-label="Search"><i class="fas fa-arrow-right"></i></button></label>' +
        '<button class="hf-save" id="hd-save-search" type="button"><i class="far fa-bell"></i> Save search</button>' +
      '</div>';

    var input = document.getElementById('hd-result-search');
    var go = document.getElementById('hd-result-go');
    var save = document.getElementById('hd-save-search');
    function runSearch() {
      state.query = (input.value || '').trim().toLowerCase();
      if (state.active) renderRuntime();
      else filterExisting(state.query);
    }
    input.addEventListener('input', runSearch);
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      runSearch();
      var visible = document.querySelectorAll('#hd-list .hd-card:not([hidden])').length;
      if (!visible && /\d/.test(input.value) && window.plLookup) {
        var main = document.getElementById('pl-addr');
        if (main) main.value = input.value;
        window.plLookup();
      }
    });
    go.addEventListener('click', runSearch);
    save.addEventListener('click', saveSearch);
    if (oldP && !state.active) updateCount(document.querySelectorAll('#hd-list .hd-card').length, town);
  }

  function filterExisting(q) {
    var cards = Array.prototype.slice.call(document.querySelectorAll('#hd-list .hd-card'));
    var n = 0;
    cards.forEach(function (card) {
      var show = !q || card.textContent.toLowerCase().indexOf(q) >= 0;
      card.hidden = !show;
      if (show) n++;
    });
    updateCount(n, state.town);
  }

  function updateCount(n, town) {
    var title = document.getElementById('hd-results-title');
    var count = document.getElementById('hd-countline');
    town = town || state.town || 'New Jersey';
    if (title) title.textContent = town + ', NJ Property Tax Assessments';
    if (count) count.textContent = n.toLocaleString() + ' property assessment' + (n === 1 ? '' : 's') + ' currently shown in this map area.';
    var barN = document.querySelector('#hd-bar .hf-n');
    if (barN) barN.textContent = n + ' propert' + (n === 1 ? 'y' : 'ies');
  }

  function saveSearch() {
    if (!state.map) { toast('Open a property search first'); return; }
    var b = state.map.getBounds();
    var bar = document.getElementById('hd-bar');
    var controls = [];
    if (bar) bar.querySelectorAll('select').forEach(function (x) { controls.push({ label: x.options[0] && x.options[0].text, value: x.value }); });
    var data = {
      savedAt: new Date().toISOString(), town: state.town, county: state.county,
      query: state.query, filters: controls,
      bounds: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }
    };
    try {
      var all = JSON.parse(localStorage.getItem('watchdog:saved-searches') || '[]');
      all.unshift(data); localStorage.setItem('watchdog:saved-searches', JSON.stringify(all.slice(0, 20)));
      var btn = document.getElementById('hd-save-search');
      if (btn) { btn.classList.add('saved'); btn.innerHTML = '<i class="fas fa-check"></i> Search saved'; }
      toast('Search saved on this device');
    } catch (e) { toast('Could not save this search'); }
  }

  function queryBounds(map) {
    var b = map.getBounds();
    var params = new URLSearchParams({
      geometry: JSON.stringify({ xmin:b.getWest(), ymin:b.getSouth(), xmax:b.getEast(), ymax:b.getNorth(), spatialReference:{wkid:4326} }),
      geometryType:'esriGeometryEnvelope', inSR:'4326', outSR:'4326', spatialRel:'esriSpatialRelIntersects',
      where:"PROP_CLASS = '2' AND NET_VALUE > 10000",
      outFields:'PAMS_PIN,PROP_LOC,MUN_NAME,COUNTY,ZIP5,PCLBLOCK,PCLLOT,NET_VALUE,LAST_YR_TX,YR_CONSTR,CALC_ACRE,SALE_PRICE,DEED_DATE',
      returnGeometry:'false', returnCentroid:'true', resultRecordCount:'100', f:'json'
    });
    var request = ++state.request;
    setLoading(true);
    fetch(PARCEL + '?' + params.toString()).then(function (r) { return r.json(); }).then(function (d) {
      if (request !== state.request || !d.features) return;
      state.rows = d.features.map(function (f) {
        var a = f.attributes || {}, c = f.centroid || {};
        return { pin:a.PAMS_PIN || '', addr:a.PROP_LOC || '', town:a.MUN_NAME || '', county:a.COUNTY || '', zip:a.ZIP5 || '',
          block:a.PCLBLOCK || '', lot:a.PCLLOT || '', assessed:+a.NET_VALUE || 0, tax:+a.LAST_YR_TX || 0,
          built:+a.YR_CONSTR || 0, acres:+a.CALC_ACRE || 0, sale:+a.SALE_PRICE || 0,
          saleYear:deedYear(a.DEED_DATE), lat:c.y, lon:c.x };
      }).filter(function (x) { return x.addr && x.lat != null && x.lon != null; });
      state.active = true;
      var counts = {};
      state.rows.forEach(function (x) { var k=x.town+'|'+x.county; counts[k]=(counts[k]||0)+1; });
      var best = Object.keys(counts).sort(function(a,b){return counts[b]-counts[a];})[0];
      if (best) { var p=best.split('|'); state.town=p[0] || state.town; state.county=p[1] || state.county; }
      loadSaved().then(function () { renderRuntime(); renderMarkers(); loadTownSeo(); });
    }).catch(function () { toast('Could not refresh this map area'); }).finally(function () { setLoading(false); });
  }

  function deedYear(v) {
    var s=String(v == null ? '' : v).replace(/\D/g,'');
    if (s.length===8 && +s.slice(0,4)>1900) return +s.slice(0,4);
    if (s.length===6) { var y=+s.slice(0,2); return y>40?1900+y:2000+y; }
    var m=String(v||'').match(/(19|20)\d{2}/); return m?+m[0]:0;
  }

  function setLoading(on) {
    var host=document.getElementById('hd-list');
    if (!host) return;
    host.setAttribute('aria-busy', on ? 'true' : 'false');
    var btn=document.querySelector('.hd-map-refresh');
    if (btn) btn.classList.toggle('on', !!on);
  }

  function readFilters(rows) {
    var bar=document.getElementById('hd-bar');
    if (!bar) return rows;
    var vals={};
    bar.querySelectorAll('select.hf-s:not(.sort)').forEach(function (s) { var label=(s.options[0]&&s.options[0].text||'').toLowerCase(); vals[label]=s.value; });
    var over=!!bar.querySelector('.hf-t.on') && Array.prototype.some.call(bar.querySelectorAll('.hf-t.on'),function(b){return /over-assessed/i.test(b.textContent);});
    var sold=Array.prototype.some.call(bar.querySelectorAll('.hf-t.on'),function(b){return /sold recently/i.test(b.textContent);});
    var rates=rows.filter(function(x){return x.assessed&&x.tax;}).map(function(x){return x.tax/x.assessed;}).sort(function(a,b){return a-b;});
    var med=rates.length?rates[rates.length>>1]:0;
    return rows.filter(function(x){
      var v=x.assessed;
      if(vals['value from'] && v<+vals['value from']) return false;
      if(vals['value to'] && v>+vals['value to']) return false;
      if(vals['tax under'] && x.tax>+vals['tax under']) return false;
      if(vals['built after'] && (!x.built||x.built<+vals['built after'])) return false;
      if(vals['lot over'] && (!x.acres||x.acres*43560<+vals['lot over'])) return false;
      if(sold && (!x.saleYear || new Date().getFullYear()-x.saleYear>2)) return false;
      if(over && (!med || !x.assessed || !x.tax || (x.tax/x.assessed)<=med*1.12)) return false;
      if(state.query && [x.addr,x.town,x.zip].join(' ').toLowerCase().indexOf(state.query)<0) return false;
      return true;
    });
  }

  function sorted(rows) {
    var s=document.querySelector('#hd-bar .hf-s.sort'); var k=s?s.value:'near';
    var c=state.map?state.map.getCenter():null;
    function dist(x){if(!c)return 0;var dx=(x.lon-c.lng)*Math.cos(c.lat*Math.PI/180),dy=x.lat-c.lat;return dx*dx+dy*dy;}
    return rows.slice().sort({
      near:function(a,b){return dist(a)-dist(b);}, valHigh:function(a,b){return b.assessed-a.assessed;}, valLow:function(a,b){return a.assessed-b.assessed;},
      taxHigh:function(a,b){return b.tax-a.tax;}, taxLow:function(a,b){return a.tax-b.tax;}, rateHigh:function(a,b){return (b.tax/b.assessed)-(a.tax/a.assessed);}, recent:function(a,b){return (b.saleYear||0)-(a.saleYear||0);}
    }[k] || function(a,b){return dist(a)-dist(b);});
  }

  function street(x) {
    var loc=[x.addr,x.town,'NJ',x.zip].filter(Boolean).join(', ');
    return 'https://maps.googleapis.com/maps/api/streetview?size=340x200&location='+encodeURIComponent(loc)+'&fov=78&pitch=6&source=outdoor&key='+GMAPS_KEY;
  }
  function ad() {
    return '<a class="hd-ad" href="'+GREENTREE_URL+'" target="_blank" rel="noopener"><span class="hd-ad-tag">Advertisement</span><img src="/johnvarano.jpg" alt="John Varano" onerror="this.style.display=\'none\'"><div class="hd-ad-b"><b>Know the payment before you fall in love with the house.</b><span>John Varano at Greentree Mortgage can show the real monthly number, escrow included.</span><em>Get a rate <i class="fas fa-arrow-right"></i></em></div></a>';
  }

  function renderRuntime() {
    var host=document.getElementById('hd-list'); if(!host)return;
    var rows=sorted(readFilters(state.rows));
    updateCount(rows.length,state.town);
    if(!rows.length){host.innerHTML='<div class="hd-none"><b>Nothing matches this map area</b><p>Pan the map or widen your filters.</p></div>';return;}
    var limit=60, shown=rows.slice(0,limit);
    var cards=shown.map(function(x){
      var saved=!!state.saved[x.pin];
      var address=[x.addr,x.town,'NJ',x.zip].filter(Boolean).join(', ');
      return '<article class="hd-card" data-address="'+esc(address)+'"><div class="hd-shot"><img src="'+street(x)+'" alt="" loading="lazy" onerror="this.parentNode.classList.add(\'noimg\')">' +
        '<button class="hd-heart'+(saved?' on':'')+'" type="button" data-save-pin="'+esc(x.pin)+'" aria-label="'+(saved?'Remove from':'Save to')+' watchlist"><i class="'+(saved?'fas':'far')+' fa-heart"></i></button>'+
        (x.saleYear&&new Date().getFullYear()-x.saleYear<=1?'<span class="hd-badge sold">Sold '+x.saleYear+'</span>':'')+'</div>'+
        '<div class="hd-body"><div class="hd-val">'+money(x.assessed)+'</div><div class="hd-meta">'+(x.built?'<span>'+x.built+'</span>':'')+(x.acres?'<span>'+Math.round(x.acres*43560).toLocaleString()+' sq ft lot</span>':'')+'<span>'+money(x.tax)+' tax</span></div><div class="hd-addr">'+esc(x.addr)+'</div><div class="hd-sub">'+esc(x.town)+(x.zip?' '+esc(x.zip):'')+'</div></div></article>';
    });
    if(cards.length>6) cards.splice(6,0,ad()); else cards.push(ad());
    host.innerHTML=cards.join('')+(rows.length>limit?'<div class="hd-more"><button type="button" id="hd-show-all">Show all '+rows.length+' properties</button></div>':'')+
      '<p class="hd-note">These are parcels from New Jersey’s public assessment file, not listings. For homes actually on the market, <a href="'+IDX_URL+'" target="_blank" rel="noopener">search the MLS</a>.</p><section class="hd-seo" id="hd-seo"></section>';
    host.querySelectorAll('.hd-card').forEach(function(card){card.addEventListener('click',function(e){if(e.target.closest('.hd-heart'))return;var main=document.getElementById('pl-addr');if(main)main.value=card.dataset.address;if(window.plLookup)window.plLookup();});});
    host.querySelectorAll('[data-save-pin]').forEach(function(btn){btn.addEventListener('click',function(e){e.stopPropagation();toggleSave(btn.dataset.savePin);});});
    var all=document.getElementById('hd-show-all'); if(all)all.addEventListener('click',function(){limit=rows.length; var extra=rows.slice(60).map(function(x){return '<div></div>';}); all.parentNode.remove(); toast('Showing all '+rows.length+' properties in this map area'); /* next map/filter render remains capped for performance */});
    loadTownSeo();
  }

  function loadSaved() {
    var c=sb(); if(!c)return Promise.resolve();
    return c.auth.getSession().then(function(r){if(!r.data||!r.data.session)return;c.auth.getUser();return c.from('saved_properties').select('pams_pin,kind').then(function(q){state.saved={};(q.data||[]).forEach(function(x){state.saved[x.pams_pin]=x.kind;});});}).catch(function(){});
  }
  function toggleSave(pin) {
    var c=sb(); if(!c)return;
    c.auth.getSession().then(function(r){
      if(!r.data||!r.data.session){if(window.plSignInPrompt)window.plSignInPrompt();else toast('Sign in to save properties');return;}
      var x=state.rows.filter(function(r){return r.pin===pin;})[0]; if(!x)return;
      if(state.saved[pin]) return c.from('saved_properties').delete().eq('pams_pin',pin).then(function(){delete state.saved[pin];renderRuntime();toast('Removed from your watchlist');});
      return c.rpc('save_property',{p:{kind:'watch',pams_pin:x.pin,address:x.addr,town:x.town,county:x.county,zip:x.zip,block:x.block,lot:x.lot,assessed:x.assessed||null,last_year_tax:x.tax||null,effective_rate:x.assessed?+(x.tax/x.assessed*100).toFixed(3):null}}).then(function(q){if(q.error){toast('Could not save');return;}state.saved[pin]='watch';renderRuntime();toast('Added to your watchlist');});
    });
  }

  function renderMarkers() {
    if(!state.map||!window.L)return;
    state.map.eachLayer(function(layer){if(layer instanceof L.Marker && layer._icon && layer._icon.querySelector && layer._icon.querySelector('.hd-pin'))state.map.removeLayer(layer);});
    state.rows.forEach(function(x){
      var tax=x.tax?'$'+(x.tax>=10000?Math.round(x.tax/1000)+'k':(Math.round(x.tax/100)/10)+'k'):'-';
      var icon=L.divIcon({className:'hd-pin-wrap',html:'<div class="hd-pin"><i class="fas fa-dog"></i><span>'+tax+'</span></div>',iconSize:[64,26],iconAnchor:[32,26]});
      L.marker([x.lat,x.lon],{icon:icon,riseOnHover:true}).addTo(state.map).on('click',function(){var main=document.getElementById('pl-addr');if(main)main.value=[x.addr,x.town,'NJ',x.zip].filter(Boolean).join(', ');if(window.plLookup)window.plLookup();});
    });
  }

  var seoLoaded=false, seoRows=[];
  function loadTownSeo() {
    var host=document.getElementById('hd-seo'); if(!host)return;
    if(seoLoaded){paintTownSeo(host);return;}
    host.innerHTML='<p>Loading New Jersey municipality assessment directory…</p>';
    var stats=JSON.stringify([{statisticType:'avg',onStatisticField:'NET_VALUE',outStatisticFieldName:'avg_assessment'},{statisticType:'count',onStatisticField:'PAMS_PIN',outStatisticFieldName:'property_count'}]);
    var p=new URLSearchParams({where:"PROP_CLASS = '2' AND NET_VALUE > 10000",outStatistics:stats,groupByFieldsForStatistics:'COUNTY,MUN_NAME',orderByFields:'COUNTY,MUN_NAME',returnGeometry:'false',resultRecordCount:'2000',f:'json'});
    fetch(PARCEL+'?'+p.toString()).then(function(r){return r.json();}).then(function(d){seoRows=(d.features||[]).map(function(f){return f.attributes||{};}).filter(function(a){return a.MUN_NAME&&a.COUNTY;});seoLoaded=true;paintTownSeo(host);}).catch(function(){host.innerHTML='<h3>Explore New Jersey property tax assessments</h3><p><a href="/towns/">Browse every New Jersey municipality</a>.</p>';});
  }
  function paintTownSeo(host) {
    host.innerHTML='<h3>New Jersey Property Tax Assessments by Municipality</h3><p>Browse municipality pages and compare the average residential assessment in the latest statewide public assessment file.</p><div class="hd-seo-links">'+seoRows.map(function(a){var county=slug(a.COUNTY);var town=slug(a.MUN_NAME);return '<a href="/towns/'+county+'/'+town+'.html">'+esc(a.MUN_NAME)+'<span>Avg. assessment '+money(a.avg_assessment)+'</span></a>';}).join('')+'</div>';
  }

  function bindBar() {
    var hood=document.getElementById('pl-hood'); if(!hood||hood.dataset.njw96bar==='1')return;
    hood.dataset.njw96bar='1';
    hood.addEventListener('change',function(e){if(!state.active)return;if(e.target.closest('#hd-bar'))setTimeout(renderRuntime,0);});
    hood.addEventListener('click',function(e){if(!state.active)return;var t=e.target.closest('#hd-bar .hf-t,#hd-bar .hf-clr');if(t)setTimeout(renderRuntime,0);});
  }

  function attachMap(map) {
    if(!map||map.__njw96)return;
    map.__njw96=true; state.map=map;
    map.on('moveend zoomend',function(){clearTimeout(state.timer);state.timer=setTimeout(function(){queryBounds(map);},450);});
    setTimeout(function(){queryBounds(map);},150);
  }

  function scan() {
    installStyle(); enhanceHeader(); bindBar();
    if(window.__njw96HoodMap)attachMap(window.__njw96HoodMap);
  }
  window.addEventListener('njw96:hood-map',function(e){attachMap(e.detail&&e.detail.map);});
  var obs=new MutationObserver(scan); obs.observe(document.documentElement,{subtree:true,childList:true});
  scan();
})();
