(function () {
  'use strict';

  var PARCEL_URL = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';

  function money(value) {
    var n = Number(value);
    return n > 0 ? '$' + Math.round(n).toLocaleString() : 'Not on file';
  }
  function pct(value, digits) {
    var n = Number(value);
    return isFinite(n) ? n.toFixed(digits == null ? 1 : digits) + '%' : 'Not on file';
  }
  function median(values) {
    var list = values.filter(function (v) { return isFinite(v) && v > 0; }).sort(function (a,b) { return a-b; });
    if (!list.length) return null;
    var m = Math.floor(list.length / 2);
    return list.length % 2 ? list[m] : (list[m-1] + list[m]) / 2;
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
  }
  function stat(value, label) {
    return '<div class="awd-stat"><div class="awd-value">' + value + '</div><div class="awd-label">' + label + '</div></div>';
  }
  function track(name, params) {
    if (window.AnchorFunnel) window.AnchorFunnel.track(name, params || {});
  }
  function nearby(lat, lon, meters) {
    var dLat = meters / 111320;
    var dLon = meters / (111320 * Math.cos(lat * Math.PI / 180));
    var envelope = { xmin:lon-dLon,ymin:lat-dLat,xmax:lon+dLon,ymax:lat+dLat,spatialReference:{wkid:4326} };
    var p = new URLSearchParams({
      geometry: JSON.stringify(envelope), geometryType:'esriGeometryEnvelope', inSR:'4326',
      spatialRel:'esriSpatialRelIntersects', where:"PROP_CLASS = '2' AND NET_VALUE > 10000",
      outFields:'NET_VALUE,LAST_YR_TX,SALE_PRICE,YR_CONSTR', returnGeometry:'false',
      resultRecordCount:'160', f:'json'
    });
    return fetch(PARCEL_URL + '?' + p.toString())
      .then(function (r) { if (!r.ok) throw new Error('Nearby parcel lookup failed'); return r.json(); })
      .then(function (data) {
        return (data.features || []).map(function (f) {
          var a = f.attributes || {};
          var assessed = Number(a.NET_VALUE) || 0;
          var tax = Number(a.LAST_YR_TX) || 0;
          return { assessed:assessed,tax:tax,rate:assessed ? tax/assessed*100 : null,sale:Number(a.SALE_PRICE)||0,built:Number(a.YR_CONSTR)||0 };
        }).filter(function (x) { return x.assessed > 10000; });
      }).catch(function () { return []; });
  }
  function shell(title, place, body) {
    return '<section class="awd-shell"><div class="awd-head"><div class="awd-brand"><div class="awd-mark"><i class="fas fa-dog"></i></div><div><div class="awd-eyebrow">Property Watchdog preview</div><div class="awd-title">' + esc(title) + '</div><div class="awd-place">' + esc(place || 'New Jersey') + '</div></div></div><div class="awd-public">NJ public records</div></div>' + body + '</section>';
  }
  function loading(el, tenure, address) {
    var title = tenure === 'rent' ? 'Building your nearby ownership snapshot' : 'Building your Homeowner Snapshot';
    el.innerHTML = shell(title, address, '<div class="awd-loading"><span class="awd-spinner"></span><span>Matching the address to New Jersey property records…</span></div>');
  }
  function ownerView(subject, homes, address) {
    var land = Number(subject.landValue)||0, improvement = Number(subject.improvementValue)||0;
    var compositionTotal = land + improvement;
    var improvementShare = compositionTotal ? improvement / compositionTotal * 100 : null;
    var taxList = homes.map(function(x){return x.tax;}).filter(function(v){return v>100;});
    var lower = taxList.filter(function(v){return v < Number(subject.lastYearTax||0);}).length;
    var taxPercentile = taxList.length && subject.lastYearTax ? Math.round(lower / taxList.length * 100) : null;
    var signal = taxPercentile == null
      ? 'This is the beginning of the property record. Open Watchdog for deeper assessment, tax and town context.'
      : 'This tax bill is higher than about <strong>' + taxPercentile + '%</strong> of the nearby residential parcels sampled. That is context—not a judgment on the home or an appeal conclusion.';
    var html = '<div class="awd-body"><p class="awd-lede">A quick property check using the address you just verified. Keep the estimator simple here; Watchdog can do the deeper work when you want it.</p><div class="awd-grid">'
      + stat(money(subject.assessedValue),'Assessed value')
      + stat(money(subject.lastYearTax),'Prior-year tax')
      + stat(pct(subject.effectiveTaxRatePct,2),'Effective tax rate')
      + stat(improvementShare == null ? 'Not on file' : pct(improvementShare,0),'Assessment in improvements')
      + stat(subject.yearBuilt ? esc(subject.yearBuilt) : 'Not on file','Year built')
      + stat(subject.lastSalePrice > 0 ? money(subject.lastSalePrice) : 'Not on file','Recorded sale')
      + '</div><div class="awd-signal"><i class="fas fa-wave-square"></i><div>' + signal + '</div></div>'
      + '<div class="awd-actions"><a class="awd-cta" data-awd-cta="owner" href="/property/?address=' + encodeURIComponent(address) + '"><i class="fas fa-dog"></i> Open my full Watchdog report</a><div class="awd-note">Public assessment data can lag real-world changes. Watchdog keeps source context with the record.</div></div></div>';
    return shell('Your Homeowner Snapshot', subject.municipality ? subject.propertyLocation + ' · ' + subject.municipality : address, html);
  }
  function renterView(subject, homes, address) {
    var assessed = median(homes.map(function(x){return x.assessed;}));
    var taxes = median(homes.map(function(x){return x.tax;}));
    var rates = median(homes.map(function(x){return x.rate;}));
    var years = median(homes.map(function(x){return x.built > 1700 ? x.built : null;}));
    var count = homes.length;
    var place = subject && subject.municipality ? subject.municipality + ', NJ' : address;
    var html = '<div class="awd-body"><p class="awd-lede">Because you rent, we are not treating this address as your property. Instead, here is a simple look at nearby residential ownership costs.</p><div class="awd-grid">'
      + stat(taxes ? money(taxes) : 'Not on file','Typical nearby tax / year')
      + stat(assessed ? money(assessed) : 'Not on file','Median nearby assessment')
      + stat(rates ? pct(rates,2) : 'Not on file','Typical effective tax rate')
      + stat(count ? String(count) : '0','Homes sampled')
      + stat(years ? String(Math.round(years)) : 'Not on file','Median year built')
      + stat('Not assumed','Affordability')
      + '</div><div class="awd-signal"><i class="fas fa-key"></i><div><strong>Buying context, not an affordability promise.</strong> Property taxes are one piece of a future housing payment. A real buy-vs-rent plan should add price, financing, insurance and your timeline.</div></div>'
      + '<div class="awd-actions"><a class="awd-cta" data-awd-cta="renter" href="index.html#contact"><i class="fas fa-key"></i> Build my rent-vs-own plan</a><div class="awd-note">Nearby figures are aggregated from NJ residential parcel records and are not a listing search.</div></div></div>';
    return shell('What ownership looks like near you', place, html);
  }
  function fallback(el, tenure, address) {
    var isRent = tenure === 'rent';
    var body = '<div class="awd-body"><p class="awd-lede">We could not confidently match this address to the state parcel layer. Your ANCHOR result is unaffected.</p><div class="awd-actions"><a class="awd-cta" href="' + (isRent ? 'index.html#contact' : '/property/?address=' + encodeURIComponent(address)) + '">' + (isRent ? 'Explore a buying plan' : 'Look it up in Watchdog') + '</a></div></div>';
    el.innerHTML = shell(isRent ? 'Nearby ownership context' : 'Your Homeowner Snapshot', address, body);
  }
  function hydrate(options) {
    options = options || {};
    var el = document.getElementById(options.targetId || 'est-watchdog-bridge');
    var address = (options.address || '').trim();
    var tenure = options.tenure === 'rent' ? 'rent' : 'own';
    if (!el || !address || typeof window.enrichLead !== 'function') return;
    loading(el, tenure, address);
    track('anchor_watchdog_preview_started',{tenure:tenure});
    window.enrichLead(address).then(function(subject){
      if (!subject || (subject.status !== 'ok' && !subject.lat)) { fallback(el,tenure,address); return; }
      return nearby(subject.lat,subject.lon,550).then(function(homes){
        el.innerHTML = tenure === 'rent' ? renterView(subject,homes,address) : ownerView(subject,homes,address);
        track(tenure === 'rent' ? 'anchor_renter_ownership_context' : 'anchor_homeowner_snapshot_loaded',{
          town:subject.municipality || '',nearby_sample_count:homes.length,parcel_matched:subject.status === 'ok'
        });
        el.querySelectorAll('[data-awd-cta]').forEach(function(link){
          link.addEventListener('click',function(){track('anchor_watchdog_cta_click',{tenure:tenure,cta:link.dataset.awdCta});});
        });
      });
    }).catch(function(){fallback(el,tenure,address);});
  }
  window.AnchorWatchdog = { hydrate:hydrate };
})();
