(function () {
  'use strict';

  var path = (window.location.pathname || '').replace(/\/+$/, '');
  var host = String(window.location.hostname || '').toLowerCase();
  var cleanWatchdogRoot = (host === 'www.watchdogindex.com' || host === 'watchdogindex.com') && path === '';
  var isIndex = path === '/property' || path === '/property/index.html' || cleanWatchdogRoot;
  var isPro = path === '/property/pro' || path === '/pro';
  if (!isIndex && !isPro) return;

  var attempts = 0;
  var client = null;
  var resourcesAdded = false;

  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function num(value, decimals) {
    var n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('en-US', { minimumFractionDigits: decimals || 0, maximumFractionDigits: decimals || 0 });
  }
  function pct(value) {
    var n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
  }
  function dateLabel(value) {
    if (!value) return 'Refreshing';
    try { return new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', year:'numeric' }).format(new Date(value + (String(value).length === 10 ? 'T12:00:00' : ''))); }
    catch (_error) { return String(value); }
  }
  function timeLabel(value) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZone:'America/New_York' }).format(new Date(value)); }
    catch (_error) { return ''; }
  }
  function getClient() {
    if (client) return client;
    try {
      if (window.NJPTRSupabaseRuntime && typeof window.NJPTRSupabaseRuntime.createClient === 'function') {
        client = window.NJPTRSupabaseRuntime.createClient();
      } else if (window.WatchdogBilling && typeof window.WatchdogBilling.client === 'function') {
        client = window.WatchdogBilling.client();
      }
    } catch (_error) {}
    return client;
  }
  function track(name, detail) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, detail || {}); } catch (_error) {}
  }

  function ensureSection() {
    var existing = document.getElementById('wd-intelligence-glance');
    if (existing) return existing;

    var sec = document.createElement('section');
    sec.id = 'wd-intelligence-glance';

    if (isPro) {
      var pricing = document.getElementById('pricing');
      if (!pricing) return null;
      sec.setAttribute('aria-labelledby', 'wdi-title');
      sec.innerHTML =
        '<div class="wdi-shell">' +
          '<div class="wdi-head">' +
            '<div><div class="wdi-kicker">Watchdog Intelligence</div>' +
            '<h2 id="wdi-title">Watchdog <em>right now.</em></h2>' +
            '<p class="wdi-lead">Evidence first backed sources.</p></div>' +
            '<div class="wdi-stamp"><b id="wdi-asof">Live data is refreshing</b><span id="wdi-scope">Only current, defensible evidence is summarized. No customer names, addresses or private CRM data appear here.</span><a href="/property/data-methodology">See data methodology <i class="fas fa-arrow-right"></i></a></div>' +
          '</div>' +
          '<div id="wdi-live"><div class="wdi-loading"><i class="fas fa-circle-notch fa-spin"></i> Reading the latest Watchdog scoring and source-monitoring run…</div></div>' +
        '</div>';
      pricing.insertAdjacentElement('beforebegin', sec);
      return sec;
    }

    var recent = document.getElementById('wd-consumer-recents');
    var insightGrid = q('.ins-grid');
    var insights = insightGrid && insightGrid.closest('.section');
    if (!recent || !insights) return null;
    sec.setAttribute('aria-label', 'Watchdog Score methodology');
    sec.innerHTML = '<div class="wdi-shell"><div id="wdi-live"><div class="wdi-loading"><i class="fas fa-circle-notch fa-spin"></i> Reading the current Watchdog Score methodology…</div></div></div>';
    recent.insertAdjacentElement('afterend', sec);
    if (sec.nextElementSibling !== insights) sec.insertAdjacentElement('afterend', insights);
    return sec;
  }

  function interpretation(data) {
    var c = data.cohort || {};
    var share = Number(c.share_60_plus);
    var median = Number(c.median_score);
    var coverage = Number(c.evidence_coverage);
    var breadth = share >= 50 ? 'broad across this cohort' : (share >= 25 ? 'concentrated rather than universal' : 'limited to a smaller slice of this cohort');
    var confidence = coverage >= 90 ? 'very strong' : (coverage >= 75 ? 'substantial' : 'still developing');
    return 'In the current scored cohort, <strong>' + esc(num(share, 1)) + '%</strong> of properties are at 60+ and the median Watchdog Score is <strong>' + esc(num(median, 1)) + '</strong>. The higher-score signal is ' + breadth + '. Average evidence coverage is <strong>' + esc(num(coverage, 1)) + '%</strong>, so the underlying support is ' + confidence + '. Watchdog uses this as a prioritization layer for deeper research, not as a prediction, appraisal or guaranteed outcome.';
  }

  function signalCard(label, value, note, evidence) {
    var n = Number(value);
    return '<article class="wdi-signal"><div class="wdi-signal-top"><b>' + esc(label) + '</b><strong>' + esc(num(n, 1)) + '<small>/100</small></strong></div>' +
      '<p>' + esc(note) + '</p><div class="wdi-meter" aria-hidden="true"><i style="--wdi-pct:' + pct(n) + '%"></i></div>' +
      '<span class="wdi-evidence">Evidence coverage: ' + esc(num(evidence, 1)) + '%</span></article>';
  }

  function weightsHtml(methodology) {
    methodology = methodology || {};
    var components = Array.isArray(methodology.score_components) ? methodology.score_components : [];
    if (!components.length) return '';
    return components.map(function (component) {
      var weight = Number(component.weight);
      return '<div class="wdi-weight"><div class="wdi-weight-top"><b>' + esc(component.label || 'Score component') + '</b><strong>' + esc(num(weight)) + '%</strong></div>' +
        '<div class="wdi-weight-bar" aria-hidden="true"><i style="--wdi-weight:' + pct(weight * 3.333333) + '%"></i></div></div>';
    }).join('');
  }

  function renderPro(data) {
    var host = document.getElementById('wdi-live');
    if (!host || !data) return;
    var c = data.cohort || {}, e = data.engine || {}, w = data.source_watch || {}, s = data.signals || {};
    var tax = s.tax_pressure || {}, rev = s.revaluation_risk || {}, uni = s.uniformity || {};
    var sourceFacts = (Number(w.unchanged_observations) || 0) + (Number(w.changed_observations) || 0);
    var sourceCopy = num(w.eligible_properties) + ' eligible properties · ' + num(w.provider_records) + ' provider records · ' + num(w.changed_observations) + ' changes detected · ' + num(w.candidates_created) + ' candidates escalated.';
    var asof = document.getElementById('wdi-asof');
    var scope = document.getElementById('wdi-scope');
    if (asof) asof.textContent = 'Scored ' + dateLabel(data.as_of) + ' · refreshed ' + timeLabel(data.generated_at);
    if (scope) scope.textContent = num(c.properties) + ' properties · ' + num(c.towns) + ' towns · ' + num(c.counties) + ' counties in the current live scored cohort.';

    host.innerHTML =
      '<div class="wdi-primary-grid">' +
        '<article class="wdi-primary"><div class="wdi-number"><strong>' + esc(num(c.properties)) + '</strong><small>properties</small></div><div class="wdi-mini"><span>' + esc(num(c.towns)) + ' towns</span><span>' + esc(num(c.counties)) + ' counties</span><span>' + esc(num(c.evidence_coverage,1)) + '% avg. evidence coverage</span></div></article>' +
        '<article class="wdi-primary"><span class="wdi-label">Median Watchdog Score</span><div class="wdi-number"><strong>' + esc(num(c.median_score,1)) + '</strong><small>/ 100</small></div></article>' +
        '<article class="wdi-primary"><div class="wdi-number"><strong>' + esc(num(sourceFacts)) + '</strong><small>source facts checked</small></div><p>' + esc(sourceCopy) + '</p><div class="wdi-mini"><span>Checked ' + esc(timeLabel(w.completed_at) || 'recently') + '</span><span>' + esc(num(e.runs_24h)) + ' downstream analyses / 24h</span></div></article>' +
      '</div>' +
      '<div class="wdi-signals"><div class="wdi-signals-head"><h3>Signals inside the score.</h3></div>' +
        '<div class="wdi-signal-grid">' +
          signalCard('Municipal tax pressure', tax.median_score, 'Tax rate changes measured as stress.', tax.evidence_coverage) +
          signalCard('Revaluation pressure', rev.median_score, 'Tax fairness lost over time.', rev.evidence_coverage) +
          signalCard('Assessment uniformity', uni.median_score, 'How consistent is the assessment among properties over time.', uni.evidence_coverage) +
        '</div>' +
      '</div>' +
      '<div class="wdi-read">' +
        '<article class="wdi-read-card"><h3>What the score actually means</h3><p>' + interpretation(data) + '</p><div class="wdi-note">Live cohort metrics can change as new properties are scored, new official files arrive or Watchdog rejects weak evidence.</div></article>' +
        '<article class="wdi-read-card"><span class="wdi-label">How do we get there?</span><div class="wdi-method">' +
          '<div><i class="fas fa-building-columns"></i><span><b>1 · We start with what is public.</b>Parcel, assessment, tax-rate, equalization and verified sales records.</span></div>' +
          '<div><i class="fas fa-filter"></i><span><b>2 · We throw out certain sales</b>Non arm’s length or unusable records are separated instead of silently treated as normal sales.</span></div>' +
          '<div><i class="fas fa-calculator"></i><span><b>3 · We score six things and weight them</b>Six weighted components are calculated; missing inputs are dropped and remaining weights are renormalized.</span></div>' +
          '<div><i class="fas fa-shield-halved"></i><span><b>4 · Thin data lowers the score, but not our certainty.</b>Coverage is carried with the result. Weak evidence lowers confidence instead of becoming a made-up number.</span></div>' +
        '</div></article>' +
      '</div>';
  }

  function renderIndex(data) {
    var host = document.getElementById('wdi-live');
    if (!host || !data) return;
    var c = data.cohort || {}, m = data.methodology || {};
    host.innerHTML =
      '<div class="wdi-weights"><div class="wdi-weights-copy"><h3>Exactly what the current Watchdog Score weighs.</h3></div><div class="wdi-weight-grid">' + weightsHtml(m) + '<div class="wdi-weight-rule"><i class="fas fa-scale-balanced"></i><span><b>Missing evidence rule</b>' + esc(m.missing_input_rule || 'Missing inputs are dropped and the remaining weights are renormalized.') + '</span></div></div></div>' +
      '<div class="wdi-cta"><div><h3>Unlock deeper findings, monitoring, professional workflows and the evidence behind each recommendation.</h3></div><div class="wdi-cta-actions"><a class="wdi-btn secondary" href="/property/data-methodology">How the scoring works</a><a class="wdi-btn primary" id="wdi-plans" href="/property/pro#plans">See Watchdog Intelligence plans <i class="fas fa-arrow-right"></i></a></div></div>';

    var plans = document.getElementById('wdi-plans');
    if (plans) plans.addEventListener('click', function () {
      track('landing_intelligence_plan_click', { placement:'score_methodology', cohort_as_of:data.as_of || '', properties:Number(c.properties)||0, model:m.score_model || '' });
    });
  }

  function render(data) {
    if (isPro) renderPro(data);
    else renderIndex(data);
  }

  function renderUnavailable() {
    var host = document.getElementById('wdi-live');
    if (!host) return;
    if (isPro) {
      host.innerHTML = '<div class="wdi-read"><article class="wdi-read-card"><span class="wdi-label">Live metrics refreshing</span><h3>Watchdog will not substitute stale numbers.</h3><p>The current scoring snapshot could not be verified in this browser session, so the numeric sample is withheld. The paid product follows the same rule: unavailable evidence does not quietly become zero, safe or favorable.</p></article><article class="wdi-read-card"><span class="wdi-label">Still available</span><div class="wdi-method"><div><i class="fas fa-book-open"></i><span><b>Methodology</b>See the governed score components and public-data sources.</span></div><div><i class="fas fa-arrow-up-right-dots"></i><span><b>Plans</b>Pricing remains available directly below this sample.</span></div></div></article></div>';
      return;
    }
    host.innerHTML = '<div class="wdi-weights"><div class="wdi-weights-copy"><h3>Exactly what the current Watchdog Score weighs.</h3></div><div class="wdi-weight-grid"><div class="wdi-weight-rule"><i class="fas fa-scale-balanced"></i><span><b>Current methodology refreshing</b>The live score components could not be verified in this browser session.</span></div></div></div><div class="wdi-cta"><div><h3>Unlock deeper findings, monitoring, professional workflows and the evidence behind each recommendation.</h3></div><div class="wdi-cta-actions"><a class="wdi-btn secondary" href="/property/data-methodology">How the scoring works</a><a class="wdi-btn primary" href="/property/pro#plans">See Watchdog Intelligence plans <i class="fas fa-arrow-right"></i></a></div></div>';
  }

  var HOMEOWNER_RESOURCES = [
    ['How to read an NJ property tax bill','/property/how-to-read-nj-property-tax-bill/'],
    ['Assessed value vs. market value','/property/assessed-value-vs-market-value/'],
    ['Revaluation & reassessment guide','/property/revaluation-reassessment-guide/'],
    ['Added assessments after improvements','/property/added-assessments/'],
    ['Block, lot & qualifier explained','/property/block-lot-qualifier/']
  ];

  function simplifyLandingCopy() {
    if (!isIndex) return true;
    var directory = document.getElementById('wd-seo-directory');
    if (!directory) return false;

    var townHead = q('.wd-directory-head', directory);
    if (townHead) {
      var townKicker = q('.wd-section-kicker', townHead);
      var townTitle = q('h2', townHead);
      var townSub = q('p', townHead);
      if (townKicker) townKicker.remove();
      if (townTitle) townTitle.textContent = 'Town by Town';
      if (townSub) townSub.remove();
      townHead.style.maxWidth = 'none';
      townHead.style.textAlign = 'center';
    }

    var guideHead = q('.wd-guide-band > div:first-child', directory);
    if (guideHead) {
      var guideKicker = q('.wd-section-kicker', guideHead);
      var guideTitle = q('h2', guideHead);
      var guideSub = q('p', guideHead);
      if (guideKicker) guideKicker.remove();
      if (guideTitle) guideTitle.textContent = 'Property Guides';
      if (guideSub) guideSub.remove();
    }

    var homeownerHead = q('.wd-homeowner-links > div:first-child', directory);
    if (homeownerHead) {
      var homeownerKicker = q('.wd-section-kicker', homeownerHead);
      var homeownerTitle = q('h2', homeownerHead);
      if (homeownerKicker) homeownerKicker.remove();
      if (homeownerTitle) homeownerTitle.textContent = 'Homeowner Topics';
    }
    return true;
  }

  function addResources() {
    if (!isIndex) return true;
    if (resourcesAdded) return true;
    var host = q('.wd-homeowner-links .wd-guide-links');
    if (!host) return false;
    HOMEOWNER_RESOURCES.forEach(function (item) {
      var exists = qa('a', host).some(function (a) { return (a.getAttribute('href') || '') === item[1]; });
      if (!exists) host.insertAdjacentHTML('beforeend', '<a href="' + esc(item[1]) + '">' + esc(item[0]) + ' <i class="fas fa-arrow-right"></i></a>');
    });
    resourcesAdded = true;
    return true;
  }

  function loadMetrics() {
    var sb = getClient();
    if (!sb || typeof sb.rpc !== 'function') { renderUnavailable(); return; }
    sb.rpc('get_public_intelligence_glance').then(function (result) {
      if (result && !result.error && result.data) render(result.data);
      else renderUnavailable();
    }).catch(renderUnavailable);
  }

  function boot() {
    attempts += 1;
    var sec = ensureSection();
    var copyReady = simplifyLandingCopy();
    var resourcesReady = addResources();
    if (!sec || !copyReady || !resourcesReady) {
      if (attempts < 80) window.setTimeout(boot, 80);
      return;
    }
    if (sec.dataset.wdiLoaded === '1') return;
    sec.dataset.wdiLoaded = '1';
    loadMetrics();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
