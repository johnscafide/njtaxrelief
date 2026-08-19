(function () {
  'use strict';

  var path = (window.location.pathname || '').replace(/\/+$/, '');
  if (path !== '/property' && path !== '/property/index.html') return;

  var PARCEL = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
  var client = null;

  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(value) {
    var n = Number(value);
    return Number.isFinite(n) && n > 0 ? '$' + Math.round(n).toLocaleString() : '';
  }
  function getClient() {
    if (client) return client;
    try {
      if (window.NJPTRSupabaseRuntime && typeof window.NJPTRSupabaseRuntime.createClient === 'function') {
        client = window.NJPTRSupabaseRuntime.createClient();
      }
    } catch (_error) {}
    return client;
  }
  function queryFor(x) {
    return [x.address, x.town, 'NJ', x.zip].filter(Boolean).join(', ');
  }
  function aerial(x) {
    var lat = Number(x.lat), lon = Number(x.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
    var dx = .00145, dy = .001;
    return 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?' + new URLSearchParams({
      bbox: [lon - dx, lat - dy, lon + dx, lat + dy].join(','),
      bboxSR: '4326', imageSR: '3857', size: '760,460', format: 'jpg', f: 'image'
    }).toString();
  }
  function localRecent(limit) {
    try {
      return JSON.parse(localStorage.getItem('watchdogRecentProperties') || '[]').slice(0, limit || 3).map(function (x) {
        return {
          pams_pin: x.pin || '', address: x.address || '', town: x.city || x.town || '', zip: x.zip || '',
          assessed: x.assessed || '', last_year_tax: x.tax || '', year_built: x.yearBuilt || '', lat: x.lat, lon: x.lon
        };
      }).filter(function (x) { return x.address; });
    } catch (_error) { return []; }
  }

  function propertyCard(x, label) {
    var href = '/property/?address=' + encodeURIComponent(queryFor(x));
    var img = aerial(x);
    var facts = [];
    if (money(x.assessed)) facts.push('<span>' + esc(money(x.assessed)) + ' assessed</span>');
    if (money(x.last_year_tax)) facts.push('<span>' + esc(money(x.last_year_tax)) + ' annual tax</span>');
    if (x.year_built) facts.push('<span>Built ' + esc(x.year_built) + '</span>');
    return '<a class="wd-property-card" href="' + href + '">' +
      '<div class="wd-property-photo">' +
        (img ? '<img src="' + esc(img) + '" alt="Aerial view of ' + esc(x.address) + '" loading="lazy">' : '<div class="wd-property-placeholder"><i class="fas fa-house"></i></div>') +
        '<span class="wd-property-label">' + esc(label || 'Property record') + '</span>' +
      '</div>' +
      '<div class="wd-property-copy">' +
        '<h3>' + esc(x.address || 'New Jersey property') + '</h3>' +
        '<p>' + esc([x.town, 'NJ', x.zip].filter(Boolean).join(' ')) + '</p>' +
        '<div class="wd-property-facts">' + facts.join('') + '</div>' +
        '<b class="wd-property-open">Open property <i class="fas fa-arrow-right"></i></b>' +
      '</div>' +
    '</a>';
  }

  function freeCard() {
    return '<a class="wd-free-card" href="/property/free/">' +
      '<div><span class="wd-free-label">Free Watchdog account</span>' +
      '<h3>Keep the homes you care about in one place.</h3>' +
      '<p>Save properties, claim your home, build a watchlist and come back to the same research from your account.</p></div>' +
      '<b>See what is included <i class="fas fa-arrow-right"></i></b>' +
    '</a>';
  }

  function ensureRecentSection() {
    var hero = q('.pl-hero');
    if (!hero) return null;
    var sec = document.getElementById('wd-consumer-recents');
    if (!sec) {
      sec = document.createElement('section');
      sec.id = 'wd-consumer-recents';
      sec.className = 'wd-consumer-recents';
      sec.setAttribute('aria-labelledby', 'wd-recent-title');
      sec.innerHTML = '<div class="wd-consumer-wrap"><div class="wd-section-head"><div><span class="wd-section-kicker">Property records</span><h2 id="wd-recent-title">Recently explored</h2></div><a href="/property/dashboard" class="wd-section-link">My properties <i class="fas fa-arrow-right"></i></a></div><div class="wd-property-grid" id="wd-property-grid"><div class="wd-card-loading"></div><div class="wd-card-loading"></div><div class="wd-card-loading"></div></div></div>';
      hero.insertAdjacentElement('afterend', sec);
    }
    return sec;
  }

  function paintRecent(rows, signedIn) {
    var sec = ensureRecentSection();
    if (!sec) return;
    var grid = document.getElementById('wd-property-grid');
    var title = document.getElementById('wd-recent-title');
    var topLink = q('.wd-section-link', sec);
    if (title) title.textContent = signedIn ? 'Your recent properties' : 'Explore a few New Jersey homes';
    if (topLink) {
      topLink.href = signedIn ? '/property/dashboard' : '/towns/';
      topLink.innerHTML = signedIn ? 'My properties <i class="fas fa-arrow-right"></i>' : 'Browse New Jersey towns <i class="fas fa-arrow-right"></i>';
    }
    rows = (rows || []).slice(0, signedIn ? 3 : 2);
    var html = rows.map(function (x) { return propertyCard(x, signedIn ? 'Saved or recent' : 'Public NJ record'); }).join('');
    if (signedIn) {
      if (!html) html = '<a class="wd-empty-card" href="#pl-addr" onclick="document.getElementById(\'pl-addr\').focus();return false;"><i class="fas fa-magnifying-glass"></i><h3>Search your first property</h3><p>Your saved and recently viewed homes will appear here.</p></a>';
    } else {
      html += freeCard();
    }
    grid.innerHTML = html;
  }

  function loadPublicExamples() {
    var offset = Math.floor(Math.random() * 12000);
    var params = new URLSearchParams({
      where: "PROP_CLASS = '2' AND NET_VALUE > 100000 AND PROP_LOC IS NOT NULL",
      outFields: 'PAMS_PIN,PROP_LOC,MUN_NAME,COUNTY,ZIP5,NET_VALUE,LAST_YR_TX,YR_CONSTR',
      returnGeometry: 'false', returnCentroid: 'true', resultRecordCount: '2', resultOffset: String(offset), f: 'json'
    });
    return fetch(PARCEL + '?' + params.toString()).then(function (r) { return r.json(); }).then(function (data) {
      return (data.features || []).map(function (f) {
        var a = f.attributes || {}, c = f.centroid || {};
        return { pams_pin: a.PAMS_PIN || '', address: a.PROP_LOC || '', town: a.MUN_NAME || '', county: a.COUNTY || '', zip: a.ZIP5 || '', assessed: a.NET_VALUE || '', last_year_tax: a.LAST_YR_TX || '', year_built: a.YR_CONSTR || '', lat: c.y, lon: c.x };
      }).filter(function (x) { return x.address; });
    }).catch(function () { return []; });
  }

  function loadRecent() {
    var sb = getClient();
    if (!sb) {
      loadPublicExamples().then(function (rows) { paintRecent(rows, false); });
      return;
    }
    sb.auth.getUser().then(function (result) {
      var user = result && result.data && result.data.user;
      if (!user) {
        return loadPublicExamples().then(function (rows) { paintRecent(rows, false); });
      }
      return sb.from('saved_properties')
        .select('pams_pin,address,town,county,zip,assessed,last_year_tax,lat,lon,updated_at')
        .order('updated_at', { ascending: false }).limit(3)
        .then(function (res) {
          var rows = res && res.data && res.data.length ? res.data : localRecent(3);
          paintRecent(rows, true);
        }).catch(function () { paintRecent(localRecent(3), true); });
    }).catch(function () {
      loadPublicExamples().then(function (rows) { paintRecent(rows, false); });
    });
  }

  function articleUrl(slug) { return '/property/insights/' + encodeURIComponent(slug) + '.html'; }
  function articleDate(value) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
    catch (_error) { return ''; }
  }
  function paintInsights(rows) {
    var grid = q('.ins-grid');
    if (!grid || !rows || !rows.length) return;
    var section = grid.closest('.section');
    var heading = section && q('.lp-h2', section);
    if (heading) heading.textContent = 'Latest from Watchdog';
    if (heading && !q('.wd-insights-intro', section)) heading.insertAdjacentHTML('afterend', '<p class="wd-insights-intro">New Jersey property taxes, housing and public records, explained in plain language.</p>');
    var lead = rows[0], rest = rows.slice(1, 4);
    grid.innerHTML = '<div class="wd-insights-layout">' +
      '<a class="wd-insight-lead" href="' + articleUrl(lead.slug) + '">' +
        '<div class="wd-insight-image"><img src="' + esc(lead.hero_image_url || '') + '" alt="' + esc(lead.hero_image_alt || lead.title) + '" loading="lazy"></div>' +
        '<div class="wd-insight-copy"><span>' + esc(lead.kicker || 'Watchdog Insight') + (articleDate(lead.published_at) ? ' · ' + esc(articleDate(lead.published_at)) : '') + '</span><h3>' + esc(lead.title) + '</h3><p>' + esc(lead.dek || '') + '</p><b>Read the story <i class="fas fa-arrow-right"></i></b></div>' +
      '</a>' +
      '<div class="wd-insight-list">' + rest.map(function (a) {
        return '<a href="' + articleUrl(a.slug) + '"><div class="wd-insight-thumb"><img src="' + esc(a.hero_image_url || '') + '" alt="' + esc(a.hero_image_alt || a.title) + '" loading="lazy"></div><div><span>' + esc(a.kicker || 'Watchdog Insight') + (articleDate(a.published_at) ? ' · ' + esc(articleDate(a.published_at)) : '') + '</span><h3>' + esc(a.title) + '</h3><p>' + esc(a.dek || '') + '</p></div></a>';
      }).join('') + '<a class="wd-all-insights" href="/property/insights/">Browse all Watchdog Insights <i class="fas fa-arrow-right"></i></a></div>' +
    '</div>';
  }
  function loadInsights() {
    var sb = getClient();
    if (!sb) return;
    sb.from('insights_articles')
      .select('slug,kicker,title,dek,hero_image_url,hero_image_alt,published_at')
      .eq('published', true).order('published_at', { ascending: false }).limit(4)
      .then(function (res) { if (res && res.data) paintInsights(res.data); })
      .catch(function () {});
  }

  var counties = [
    ['Atlantic','atlantic'],['Bergen','bergen'],['Burlington','burlington'],['Camden','camden'],['Cape May','cape-may'],['Cumberland','cumberland'],['Essex','essex'],['Gloucester','gloucester'],['Hudson','hudson'],['Hunterdon','hunterdon'],['Mercer','mercer'],['Middlesex','middlesex'],['Monmouth','monmouth'],['Morris','morris'],['Ocean','ocean'],['Passaic','passaic'],['Salem','salem'],['Somerset','somerset'],['Sussex','sussex'],['Union','union'],['Warren','warren']
  ];
  var professionalGuides = [
    ['Real estate agents','/property/real-estate-agents/'],['Mortgage lenders','/property/mortgage-lenders/'],['Tax attorneys','/property/tax-attorneys/'],['Title & closing professionals','/property/title-closing-professionals/'],['Real estate appraisers','/property/real-estate-appraisers/'],['Real estate investors','/property/real-estate-investors/'],['Contractors & developers','/property/contractors-developers/'],['Municipal professionals','/property/municipal-professionals/'],['Insurance & risk professionals','/property/insurance-risk-professionals/'],['Property tax professionals','/property/property-tax-professionals/'],['Accountants & CPAs','/property/accountants-cpas/']
  ];
  var homeownerGuides = [
    ['ANCHOR benefits','/anchor-program.html'],['Stay NJ & Senior Freeze','/senior-programs.html'],['Property tax appeals','/property-tax-appeal.html'],['Veterans property-tax benefits','/veterans-benefits.html'],['NJ tax calendar','/tax-calendar.html'],['Assessment Fairness Index','/property/fairness'],['Compare New Jersey towns','/property/town-compare'],['How Watchdog uses public data','/property/data-methodology']
  ];

  function fallbackCountyHtml() {
    return counties.map(function (c) {
      return '<div class="wd-county"><h3><a href="/towns/' + c[1] + '/">' + esc(c[0]) + ' County</a></h3><div class="wd-town-links"><a href="/towns/' + c[1] + '/">Browse every ' + esc(c[0]) + ' County town</a></div></div>';
    }).join('');
  }
  function countyHtmlFromDirectory(doc) {
    var groups = qa('.tp-county-group', doc);
    if (!groups.length) return fallbackCountyHtml();
    return groups.map(function (group) {
      var countyLink = q('h2 a', group);
      if (!countyLink) return '';
      var townLinks = qa('.tp-town-card', group).slice(0, 8).map(function (a) {
        var name = q('span', a);
        return '<a href="' + esc(a.getAttribute('href') || '#') + '">' + esc(name ? name.textContent.trim() : a.textContent.trim()) + '</a>';
      }).join('');
      return '<div class="wd-county"><h3><a href="' + esc(countyLink.getAttribute('href') || '#') + '">' + esc(countyLink.textContent.trim()) + '</a></h3><div class="wd-town-links">' + townLinks + '</div><a class="wd-county-all" href="' + esc(countyLink.getAttribute('href') || '#') + '">All towns <i class="fas fa-arrow-right"></i></a></div>';
    }).join('');
  }
  function guideLinks(items) {
    return items.map(function (x) { return '<a href="' + esc(x[1]) + '">' + esc(x[0]) + ' <i class="fas fa-arrow-right"></i></a>'; }).join('');
  }
  function ensureDirectory() {
    if (document.getElementById('wd-seo-directory')) return document.getElementById('wd-seo-directory');
    var insights = q('.ins-grid');
    var insightSection = insights && insights.closest('.section');
    var gt = q('.gt-banner');
    var gtSection = gt && gt.closest('.section');
    var sec = document.createElement('section');
    sec.id = 'wd-seo-directory';
    sec.className = 'wd-seo-directory';
    sec.innerHTML = '<div class="wd-consumer-wrap"><div class="wd-directory-head"><span class="wd-section-kicker">Explore New Jersey</span><h2>Property information, town by town.</h2><p>Start with your county, then open the local property-tax report for the municipality you care about.</p></div><div class="wd-county-grid" id="wd-county-grid">' + fallbackCountyHtml() + '</div><div class="wd-directory-more"><a href="/towns/">Browse all 564 New Jersey municipal reports <i class="fas fa-arrow-right"></i></a></div><div class="wd-guide-band"><div><span class="wd-section-kicker">Professional library</span><h2>Property guides built for the work you do.</h2><p>Practical ways to use New Jersey property records, assessments and Watchdog data in a professional workflow.</p></div><div class="wd-guide-links">' + guideLinks(professionalGuides) + '</div><a class="wd-guide-all" href="/property/professionals/">Browse the professional resource library <i class="fas fa-arrow-right"></i></a></div><div class="wd-homeowner-links"><div><span class="wd-section-kicker">Homeowner resources</span><h2>Start with the question you have.</h2></div><div class="wd-guide-links">' + guideLinks(homeownerGuides) + '</div></div></div>';
    if (gtSection) gtSection.insertAdjacentElement('beforebegin', sec);
    else if (insightSection) insightSection.insertAdjacentElement('afterend', sec);
    return sec;
  }
  function loadTownDirectory() {
    ensureDirectory();
    fetch('/towns/').then(function (r) { return r.text(); }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var host = document.getElementById('wd-county-grid');
      if (host) host.innerHTML = countyHtmlFromDirectory(doc);
    }).catch(function () {});
  }

  function placeSections() {
    document.body.classList.add('wd-consumer-mode');
    var recentSec = ensureRecentSection();
    var insights = q('.ins-grid');
    var insightSection = insights && insights.closest('.section');
    if (recentSec && insightSection && recentSec.nextElementSibling !== insightSection) recentSec.insertAdjacentElement('afterend', insightSection);
    var faq = q('.landing-faq');
    var gt = q('.gt-banner');
    var gtSection = gt && gt.closest('.section');
    var directory = ensureDirectory();
    if (faq && gtSection && faq.nextElementSibling !== gtSection) gtSection.insertAdjacentElement('beforebegin', faq);
    if (directory && faq && directory.nextElementSibling !== faq) directory.insertAdjacentElement('afterend', faq);
  }

  function handleSignupQuery() {
    var params;
    try { params = new URLSearchParams(window.location.search || ''); } catch (_error) { return; }
    if (params.get('signup') !== '1') return;
    var tries = 0;
    function open() {
      tries += 1;
      if (typeof window.plSignInPrompt === 'function') {
        window.plSignInPrompt();
        try {
          var clean = new URL(window.location.href);
          clean.searchParams.delete('signup');
          history.replaceState({}, document.title, clean.pathname + clean.search + clean.hash);
        } catch (_error) {}
        return;
      }
      if (tries < 50) setTimeout(open, 100);
    }
    open();
  }

  function init() {
    placeSections();
    loadRecent();
    loadInsights();
    loadTownDirectory();
    handleSignupQuery();
    var sb = getClient();
    if (sb && sb.auth && typeof sb.auth.onAuthStateChange === 'function') {
      sb.auth.onAuthStateChange(function () { setTimeout(loadRecent, 0); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
