(function () {
  'use strict';

  var path = (window.location.pathname || '').replace(/\/+$/, '');
  var host = String(window.location.hostname || '').toLowerCase();
  var cleanWatchdogRoot = (host === 'www.watchdogindex.com' || host === 'watchdogindex.com') && path === '';
  if (path !== '/property' && path !== '/property/index.html' && !cleanWatchdogRoot) return;

  var PARCEL = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
  var NJ_AERIAL = 'https://maps.nj.gov/arcgis/rest/services/Basemap/Orthos_Natural_2020_NJ_WM/MapServer/export';
  var PHOTO_BUCKET = 'property-photos';
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
  function validCoord(lat, lon) {
    lat = Number(lat); lon = Number(lon);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 38.8 && lat <= 41.4 && lon >= -75.7 && lon <= -73.8;
  }
  function aerial(x) {
    var lat = Number(x && x.lat), lon = Number(x && x.lon);
    if (!validCoord(lat, lon)) return '';
    var dx = .00145, dy = .001;
    return NJ_AERIAL + '?' + new URLSearchParams({
      bbox: [lon - dx, lat - dy, lon + dx, lat + dy].join(','),
      bboxSR: '4326', imageSR: '3857', size: '760,460', format: 'jpg', transparent: 'false', f: 'image'
    }).toString();
  }
  window.wdLandingPhotoFail = function (img) {
    if (!img) return;
    var parent = img.parentNode;
    if (parent) parent.classList.add('no-photo');
    img.remove();
  };
  function propertyPhoto(x) {
    var src = aerial(x);
    var placeholder = '<div class="wd-property-placeholder" aria-hidden="true"><i class="fas fa-house"></i><span>Property view unavailable</span></div>';
    if (!src) return placeholder;
    return placeholder + '<img src="' + esc(src) + '" alt="Aerial view of ' + esc(x.address) + '" loading="lazy" decoding="async" onerror="wdLandingPhotoFail(this)">';
  }
  function freeImagery(x) {
    if (!x || !validCoord(x.lat, x.lon)) return Promise.resolve(null);
    var url = '/api/property-imagery?lat=' + encodeURIComponent(x.lat) + '&lon=' + encodeURIComponent(x.lon) + '&street=1';
    return fetch(url, { headers: { accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('imagery unavailable');
      return r.json();
    }).catch(function () { return null; });
  }
  function ownPrimaryPhoto(x) {
    var sb = getClient();
    if (!sb || !x || !x.pams_pin) return Promise.resolve(null);
    return sb.from('property_photos')
      .select('storage_path,is_primary,created_at')
      .eq('pams_pin', x.pams_pin)
      .order('is_primary', { ascending: false }).order('created_at', { ascending: false }).limit(1)
      .then(function (res) {
        var row = res && res.data && res.data[0];
        if (!row || !row.storage_path) return null;
        return sb.storage.from(PHOTO_BUCKET).createSignedUrl(row.storage_path, 3600).then(function (signed) {
          return signed && signed.data && signed.data.signedUrl ? signed.data.signedUrl : null;
        });
      }).catch(function () { return null; });
  }
  function hydratePropertyImages(rows, signedIn) {
    var cards = qa('#wd-property-grid .wd-property-card');
    (rows || []).forEach(function (x, index) {
      var card = cards[index];
      var host = card && q('.wd-property-photo', card);
      if (!host) return;
      var image = q('img', host);
      var baseline = aerial(x);
      function use(url, source) {
        if (!url) return;
        if (!image) {
          image = document.createElement('img');
          image.loading = 'lazy'; image.decoding = 'async';
          image.onerror = function () { window.wdLandingPhotoFail(image); };
          host.appendChild(image);
        }
        image.src = url;
        image.alt = (source === 'owner' ? 'Property photo of ' : source === 'street' ? 'Street-level view of ' : 'Aerial view of ') + (x.address || 'New Jersey property');
        host.dataset.imagerySource = source;
        host.classList.remove('no-photo');
      }
      if (baseline) use(baseline, 'aerial');
      var own = signedIn ? ownPrimaryPhoto(x) : Promise.resolve(null);
      own.then(function (ownUrl) {
        if (ownUrl) { use(ownUrl, 'owner'); return null; }
        return freeImagery(x).then(function (free) {
          if (free && free.street && free.street.image_url) use(free.street.image_url, 'street');
          else if (!baseline && free && free.aerial && free.aerial.image_url) use(free.aerial.image_url, 'aerial');
          return free;
        });
      }).catch(function () {});
    });
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
    var facts = [];
    if (money(x.assessed)) facts.push('<span>' + esc(money(x.assessed)) + ' assessed</span>');
    if (money(x.last_year_tax)) facts.push('<span>' + esc(money(x.last_year_tax)) + ' annual tax</span>');
    if (x.year_built) facts.push('<span>Built ' + esc(x.year_built) + '</span>');
    return '<a class="wd-property-card" href="' + href + '">' +
      '<div class="wd-property-photo">' + propertyPhoto(x) +
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
      sec.innerHTML = '<div class="wd-consumer-wrap"><div class="wd-section-head"><div><h2 id="wd-recent-title">Recently explored</h2></div><a href="/property/dashboard" class="wd-section-link">My properties <i class="fas fa-arrow-right"></i></a></div><div class="wd-property-grid" id="wd-property-grid"><div class="wd-card-loading"></div><div class="wd-card-loading"></div><div class="wd-card-loading"></div></div></div>';
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
    hydratePropertyImages(rows, signedIn);
  }

  function loadPublicExamples() {
    var offset = Math.floor(Math.random() * 12000);
    var params = new URLSearchParams({
      where: "PROP_CLASS = '2' AND NET_VALUE > 100000 AND PROP_LOC IS NOT NULL",
      outFields: 'PAMS_PIN,PROP_LOC,MUN_NAME,COUNTY,ZIP5,NET_VALUE,LAST_YR_TX,YR_CONSTR',
      returnGeometry: 'false', returnCentroid: 'true', outSR: '4326', resultRecordCount: '2', resultOffset: String(offset), f: 'json'
    });
    return fetch(PARCEL + '?' + params.toString()).then(function (r) { return r.json(); }).then(function (data) {
      return (data.features || []).map(function (f) {
        var a = f.attributes || {}, c = f.centroid || {};
        return { pams_pin: a.PAMS_PIN || '', address: a.PROP_LOC || '', town: a.MUN_NAME || '', county: a.COUNTY || '', zip: a.ZIP5 || '', assessed: a.NET_VALUE || '', last_year_tax: a.LAST_YR_TX || '', year_built: a.YR_CONSTR || '', lat: c.y, lon: c.x };
      }).filter(function (x) { return x.address && validCoord(x.lat, x.lon); });
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
    qa('.wd-insights-intro', section || document).forEach(function (node) { node.remove(); });
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

  var AD_SLOT = 'property_landing_bottom';
  var AD_DISCLOSURE_GREENTREE = 'Advertisement. Greentree Mortgage, an HMA Company, is a separate company and is not affiliated with Opus Elite Real Estate. You are never required to use any particular lender, and you are free to shop for a mortgage. Nothing here is a loan commitment, an offer of credit, or a guarantee of terms.';
  var AD_DISCLOSURE_JOHN = 'Advertisement. John Scafide is a licensed New Jersey real estate agent, NJ License #2079591, with The McKenty Team at Opus Elite Real Estate. If a property shown on Watchdog is listed by another brokerage, this is not a solicitation of that listing.';
  var AD_DISCLOSURE_HEATHER = 'Advertisement. Heather Scafide is a licensed New Jersey real estate agent, NJ License #2192318, with The McKenty Team at Opus Elite Real Estate. If a property shown on Watchdog is listed by another brokerage, this is not a solicitation of that listing.';
  var AD_DISCLOSURE_RELIEF = 'Advertisement for NJPropertyTaxRelief.com. This website is not affiliated with the State of New Jersey or any government agency. Estimates are informational and final eligibility depends on the official program rules and application.';
  var ADS = [
    {
      id: 'greentree-payment-before-house', advertiser: 'Greentree Mortgage', campaign: 'financing_context',
      eyebrow: 'Greentree Mortgage, an HMA Company · John Varano, Branch Manager',
      headline: 'Know the payment before you fall in love with the house.',
      sub: 'Taxes are only half of what you pay every month. John Varano, Branch Manager at Greentree Mortgage, an HMA Company, will tell you what the real number looks like, including escrow, before you make a move.',
      cta: 'Talk Financing', href: 'https://johnvarano.com/?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=greentree_financing&utm_content=payment_before_house',
      photo: '/johnvarano.jpg', alt: 'John Varano, Branch Manager, Greentree Mortgage an HMA Company', disclosure: AD_DISCLOSURE_GREENTREE, theme: 'greentree'
    },
    {
      id: 'greentree-full-monthly-number', advertiser: 'Greentree Mortgage', campaign: 'financing_context',
      eyebrow: 'Greentree Mortgage, an HMA Company · John Varano, Branch Manager',
      headline: 'Know the full monthly number before you start making offers.',
      sub: 'Principal and interest are only part of the payment. John Varano can walk through taxes, insurance and escrow so the budget is clear before the search gets serious.',
      cta: 'Run the Numbers', href: 'https://johnvarano.com/?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=greentree_financing&utm_content=full_monthly_number',
      photo: '/johnvarano.jpg', alt: 'John Varano, Branch Manager, Greentree Mortgage an HMA Company', disclosure: AD_DISCLOSURE_GREENTREE, theme: 'greentree'
    },
    {
      id: 'greentree-comfortable-payment', advertiser: 'Greentree Mortgage', campaign: 'financing_context',
      eyebrow: 'Greentree Mortgage, an HMA Company · John Varano, Branch Manager',
      headline: 'A better home search starts with a payment you are comfortable with.',
      sub: 'Before you stretch for the next house, see what the monthly payment could look like with taxes and escrow included.',
      cta: 'Plan the Payment', href: 'https://johnvarano.com/?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=greentree_financing&utm_content=comfortable_payment',
      photo: '/johnvarano.jpg', alt: 'John Varano, Branch Manager, Greentree Mortgage an HMA Company', disclosure: AD_DISCLOSURE_GREENTREE, theme: 'greentree'
    },
    {
      id: 'greentree-payment-matters-more', advertiser: 'Greentree Mortgage', campaign: 'financing_context',
      eyebrow: 'Greentree Mortgage, an HMA Company · John Varano, Branch Manager',
      headline: 'The rate matters. The payment matters more.',
      sub: 'John Varano can help translate rate, taxes, insurance and escrow into the monthly number you actually have to live with.',
      cta: 'Talk Financing', href: 'https://johnvarano.com/?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=greentree_financing&utm_content=payment_matters_more',
      photo: '/johnvarano.jpg', alt: 'John Varano, Branch Manager, Greentree Mortgage an HMA Company', disclosure: AD_DISCLOSURE_GREENTREE, theme: 'greentree'
    },
    {
      id: 'greentree-offer-eyes-open', advertiser: 'Greentree Mortgage', campaign: 'financing_context',
      eyebrow: 'Greentree Mortgage, an HMA Company · John Varano, Branch Manager',
      headline: 'Offer with your eyes open, not just your preapproval in hand.',
      sub: 'A preapproval can tell you what you may qualify for. A payment conversation helps you decide what you actually want to spend each month.',
      cta: 'Get Payment Context', href: 'https://johnvarano.com/?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=greentree_financing&utm_content=offer_eyes_open',
      photo: '/johnvarano.jpg', alt: 'John Varano, Branch Manager, Greentree Mortgage an HMA Company', disclosure: AD_DISCLOSURE_GREENTREE, theme: 'greentree'
    },
    {
      id: 'john-buyer-mls', advertiser: 'John Scafide Realtor', campaign: 'realtor_buyer',
      eyebrow: 'John Scafide · Licensed NJ Real Estate Agent · Opus Elite Real Estate',
      headline: 'Found a property worth watching? See what is actually for sale.',
      sub: 'Public records tell you about the property. MLS access tells you what you can buy right now. Search New Jersey homes with John Scafide.',
      cta: 'Search Homes', href: '/search-homes.html?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=john_buyer&utm_content=mls_search',
      photo: '/johnprofile.jpg', alt: 'John Scafide, licensed New Jersey real estate agent', disclosure: AD_DISCLOSURE_JOHN, theme: 'john'
    },
    {
      id: 'john-seller-value', advertiser: 'John Scafide Realtor', campaign: 'realtor_seller',
      eyebrow: 'John Scafide · Licensed NJ Real Estate Agent · Opus Elite Real Estate',
      headline: 'Your tax record is one piece of your home’s story. Market value is another.',
      sub: 'If selling is on your radar, start with a home-value estimate and a real conversation about what today’s market could mean for your move.',
      cta: 'Check Home Value', href: '/home-value.html?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=john_seller&utm_content=home_value',
      photo: '/johnprofile.jpg', alt: 'John Scafide, licensed New Jersey real estate agent', disclosure: AD_DISCLOSURE_JOHN, theme: 'john'
    },
    {
      id: 'heather-buyer-guidance', advertiser: 'Heather Scafide Realtor', campaign: 'realtor_buyer',
      eyebrow: 'Heather Scafide · Licensed NJ Real Estate Agent · Opus Elite Real Estate',
      headline: 'Buying a home should feel informed, not rushed.',
      sub: 'Heather Scafide can help you move from online research to a focused South Jersey home search with a real person on your side.',
      cta: 'Ask Heather', href: 'mailto:heather@heatherscafide.com?subject=Watchdog%20Buyer%20Inquiry',
      photo: '/heatherheadshot.png', alt: 'Heather Scafide, licensed New Jersey real estate agent', disclosure: AD_DISCLOSURE_HEATHER, theme: 'heather'
    },
    {
      id: 'heather-seller-strategy', advertiser: 'Heather Scafide Realtor', campaign: 'realtor_seller',
      eyebrow: 'Heather Scafide · Licensed NJ Real Estate Agent · Opus Elite Real Estate',
      headline: 'Thinking about selling? Start with the facts, then build the plan.',
      sub: 'Heather Scafide can help you turn property data, timing and your goals into a practical selling strategy.',
      cta: 'Talk About Selling', href: 'mailto:heather@heatherscafide.com?subject=Watchdog%20Seller%20Inquiry',
      photo: '/heatherheadshot.png', alt: 'Heather Scafide, licensed New Jersey real estate agent', disclosure: AD_DISCLOSURE_HEATHER, theme: 'heather'
    },
    {
      id: 'relief-check-benefit', advertiser: 'NJ Property Tax Relief', campaign: 'relief_estimator',
      eyebrow: 'NJ Property Tax Relief · Free estimator',
      headline: 'Your property tax relief may be worth a few minutes to check.',
      sub: 'Run the free estimator to see how ANCHOR, Stay NJ and Senior Freeze may fit your household before you assume you do or do not qualify.',
      cta: 'Estimate My Relief', href: '/anchor-estimator.html?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=relief_estimator&utm_content=check_benefit',
      photo: '/favicon.svg', alt: 'NJ Property Tax Relief', disclosure: AD_DISCLOSURE_RELIEF, theme: 'relief', logo: true
    },
    {
      id: 'relief-dont-leave-money', advertiser: 'NJ Property Tax Relief', campaign: 'relief_estimator',
      eyebrow: 'NJ Property Tax Relief · Free estimator',
      headline: 'Before you leave property tax relief on the table, run the estimate.',
      sub: 'New Jersey relief programs can overlap and eligibility can be confusing. Answer a few questions to get a plain-language starting point.',
      cta: 'Start the Estimator', href: '/anchor-estimator.html?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=relief_estimator&utm_content=dont_leave_money',
      photo: '/favicon.svg', alt: 'NJ Property Tax Relief', disclosure: AD_DISCLOSURE_RELIEF, theme: 'relief', logo: true
    }
  ];
  var adState = { current: -1, queue: [], timer: null, visible: false, tracked: false };

  function adTheme(name) {
    if (name === 'john') return { bg: 'linear-gradient(120deg,#0b1732,#15345f 58%,#24547e)', shadow: 'rgba(8,27,56,.28)', accent: '#e6c355', sub: '#d7e3f2', button: 'linear-gradient(135deg,#e0bb52,#b8972a)', buttonText: '#17203a' };
    if (name === 'heather') return { bg: 'linear-gradient(120deg,#17243b,#294866 58%,#3b647e)', shadow: 'rgba(17,44,68,.28)', accent: '#f0cf74', sub: '#d9e7ef', button: 'linear-gradient(135deg,#efd07c,#c6a347)', buttonText: '#17203a' };
    if (name === 'relief') return { bg: 'linear-gradient(120deg,#0b3640,#0d6870 58%,#168d96)', shadow: 'rgba(8,77,83,.28)', accent: '#f0d16c', sub: '#d3eef0', button: 'linear-gradient(135deg,#f0d16c,#c5a23d)', buttonText: '#102d35' };
    return { bg: 'linear-gradient(120deg,#14361f,#1e6b3a 58%,#2b8a4d)', shadow: 'rgba(16,60,32,.28)', accent: '#e6c355', sub: '#bfe0cb', button: 'linear-gradient(135deg,#e0bb52,#b8972a)', buttonText: '#17203a' };
  }
  function promotionParams(ad) {
    return {
      creative_name: ad.id,
      creative_slot: AD_SLOT,
      promotion_id: ad.id,
      promotion_name: ad.campaign,
      items: [{ item_id: ad.id, item_name: ad.headline, item_brand: ad.advertiser, item_category: 'watchdog_internal_ad' }]
    };
  }
  function trackAd(eventName, ad) {
    if (!ad || typeof window.gtag !== 'function') return;
    try {
      window.gtag('event', eventName, {
        ad_id: ad.id,
        advertiser: ad.advertiser,
        campaign: ad.campaign,
        creative_slot: AD_SLOT,
        destination: ad.href
      });
      if (eventName === 'watchdog_ad_impression') window.gtag('event', 'view_promotion', promotionParams(ad));
      if (eventName === 'watchdog_ad_click') window.gtag('event', 'select_promotion', promotionParams(ad));
    } catch (_error) {}
  }
  function trackCurrentAdIfVisible() {
    if (!adState.visible || adState.tracked || adState.current < 0) return;
    adState.tracked = true;
    trackAd('watchdog_ad_impression', ADS[adState.current]);
  }
  function renderAd(index) {
    var banner = q('.gt-banner');
    if (!banner || !ADS[index]) return false;
    var ad = ADS[index];
    var inner = q('.gt-banner-inner', banner);
    var image = q('.gt-photo img', banner);
    var photo = q('.gt-photo', banner);
    var eyebrow = q('.gt-eyebrow', banner);
    var headline = q('.gt-headline', banner);
    var sub = q('.gt-sub', banner);
    var cta = q('.gt-cta', banner);
    var disc = q('.gt-disc', banner);
    var theme = adTheme(ad.theme);

    adState.current = index;
    adState.tracked = false;
    banner.dataset.adId = ad.id;
    banner.dataset.advertiser = ad.advertiser;
    banner.dataset.campaign = ad.campaign;
    banner.href = ad.href;
    banner.setAttribute('aria-label', ad.advertiser + ': ' + ad.headline);
    if (/^https?:\/\//i.test(ad.href)) {
      banner.target = '_blank';
      banner.rel = 'noopener';
    } else {
      banner.removeAttribute('target');
      banner.removeAttribute('rel');
    }

    if (photo) photo.style.display = '';
    if (image) {
      image.src = ad.photo;
      image.alt = ad.alt;
      image.style.display = 'block';
      image.style.objectFit = ad.logo ? 'contain' : 'cover';
      image.style.background = ad.logo ? '#fff' : 'transparent';
      image.style.padding = ad.logo ? '10px' : '0';
      image.style.borderColor = theme.accent;
    }
    if (eyebrow) { eyebrow.textContent = ad.eyebrow; eyebrow.style.color = theme.accent; }
    if (headline) headline.textContent = ad.headline;
    if (sub) { sub.textContent = ad.sub; sub.style.color = theme.sub; }
    if (cta) {
      cta.innerHTML = esc(ad.cta) + ' <i class="fas fa-arrow-right"></i>';
      cta.style.background = theme.button;
      cta.style.color = theme.buttonText;
    }
    if (disc) disc.textContent = ad.disclosure;
    if (inner) {
      inner.style.background = theme.bg;
      inner.style.boxShadow = '0 20px 50px ' + theme.shadow;
      inner.style.borderColor = theme.accent + '59';
    }
    trackCurrentAdIfVisible();
    return true;
  }
  function shuffleAds() {
    var order = ADS.map(function (_ad, index) { return index; });
    for (var i = order.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    if (adState.current >= 0 && order.length > 1 && order[0] === adState.current) {
      var swap = order[0]; order[0] = order[1]; order[1] = swap;
    }
    adState.queue = order;
  }
  function nextAd() {
    if (!adState.queue.length) shuffleAds();
    var next = adState.queue.shift();
    renderAd(next);
  }
  function scheduleAdRotation() {
    clearTimeout(adState.timer);
    adState.timer = setTimeout(function () {
      if (document.visibilityState !== 'hidden') nextAd();
      scheduleAdRotation();
    }, 20000 + Math.floor(Math.random() * 10001));
  }
  function startAdRotation() {
    var banner = q('.gt-banner');
    if (!banner || banner.dataset.wdAdRotator === '1') return;
    banner.dataset.wdAdRotator = '1';
    banner.addEventListener('click', function () {
      if (adState.current >= 0) trackAd('watchdog_ad_click', ADS[adState.current]);
    });
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.target !== banner) return;
          adState.visible = entry.isIntersecting && entry.intersectionRatio >= .25;
          trackCurrentAdIfVisible();
        });
      }, { threshold: [0, .25, .5, 1] });
      observer.observe(banner);
    } else {
      adState.visible = true;
    }
    shuffleAds();
    nextAd();
    scheduleAdRotation();
  }

  var counties = [
    ['Atlantic','atlantic'],['Bergen','bergen'],['Burlington','burlington'],['Camden','camden'],['Cape May','cape-may'],['Cumberland','cumberland'],['Essex','essex'],['Gloucester','gloucester'],['Hudson','hudson'],['Hunterdon','hunterdon'],['Mercer','mercer'],['Middlesex','middlesex'],['Monmouth','monmouth'],['Morris','morris'],['Ocean','ocean'],['Passaic','passaic'],['Salem','salem'],['Somerset','somerset'],['Sussex','sussex'],['Union','union'],['Warren','warren']
  ];
  var professionalGuides = [
    ['Real estate agents','/property/real-estate-agents/'],['Mortgage lenders','/property/mortgage-lenders/'],['Tax attorneys','/property/tax-attorneys/'],['Title & closing professionals','/property/title-closing-professionals/'],['Real estate appraisers','/property/real-estate-appraisers/'],['Real estate investors','/property/real-estate-investors/'],['Contractors & developers','/property/contractors-developers/'],['Municipal professionals','/property/municipal-professionals/'],['Insurance & risk professionals','/property/insurance-risk-professionals/'],['Property tax professionals','/property/property-tax-professionals/'],['Accountants & CPAs','/property/accountants-cpas/'],['Home inspectors','/property/home-inspectors/']
  ];
  var homeownerGuides = [
    ['ANCHOR benefits','/anchor-program.html'],['Stay NJ & Senior Freeze','/senior-programs.html'],['Property tax appeals','/property-tax-appeal.html'],['Veterans property-tax benefits','/veterans-benefits.html'],['NJ tax calendar','/tax-calendar.html'],['Assessment Fairness Index','/property/fairness'],['Compare New Jersey towns','/property/town-compare'],['How Watchdog uses public data','/property/data-methodology'],['How to hire a real estate agent','/property/hiring-a-real-estate-agent/']
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

  function upgradeDesktopNav() {
    var nav = q('#wd-nav .wd-nav-in');
    if (!nav) return;
    var menu = q('#wd-menu-trigger', nav);
    var logo = q('.wd-logo', nav);
    var profile = q('#wd-profile-trigger', nav);
    var left = q('.wd-left', nav) || document.createElement('div');
    var right = q('.wd-right', nav) || document.createElement('div');
    left.className = 'wd-left';
    right.className = 'wd-right';
    left.textContent = '';
    right.textContent = '';
    if (menu) left.appendChild(menu);
    if (profile) right.appendChild(profile);
    nav.textContent = '';
    nav.appendChild(left);
    if (logo) nav.appendChild(logo);
    nav.appendChild(right);
  }

  function fixFaqLinks() {
    qa('a').forEach(function (link) {
      var href = link.getAttribute('href') || '';
      if (href === '/property/faq.html' || href === 'https://njpropertytaxrelief.com/property/faq.html') {
        link.setAttribute('href', '/property/faq');
      }
    });
  }

  function placeSections() {
    document.body.classList.add('wd-consumer-mode');
    upgradeDesktopNav();
    qa('.wd-insights-intro').forEach(function (node) { node.remove(); });
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
    fixFaqLinks();
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
    startAdRotation();
    handleSignupQuery();
    var sb = getClient();
    if (sb && sb.auth && typeof sb.auth.onAuthStateChange === 'function') {
      sb.auth.onAuthStateChange(function () { setTimeout(loadRecent, 0); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();