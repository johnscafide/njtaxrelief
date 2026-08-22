/* Canonical ROBUST Watchdog Score adapter for the public property lookup.
   The retired peer-gap comparison may contribute evidence to O, but can never become the Watchdog Score itself. */
(function (root) {
  'use strict';
  if (root.WatchdogScorePublic) return;

  var Core = root.WatchdogScoreCore;
  if (!Core) return;

  var BURDEN_BEST = 0.012;
  var BURDEN_WORST = 0.036;
  var refs = {};
  var activeRecord = null;
  var generation = 0;
  var hookTimer = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(value) {
    var n = Number(value);
    return Number.isFinite(n) ? '$' + Math.round(n).toLocaleString() : '—';
  }

  function loadJSON(path) {
    if (!refs[path]) {
      refs[path] = fetch(path, { credentials: 'same-origin' }).then(function (response) {
        if (!response.ok) throw new Error('Reference data unavailable: ' + path);
        return response.json();
      }).catch(function () { return null; });
    }
    return refs[path];
  }

  function district(record) {
    var match = String(record && record.pin || '').match(/^(\d{4})/);
    return match ? match[1] : '';
  }

  function countyCode(record) {
    return district(record).slice(0, 2);
  }

  function latestOfficial(record, data) {
    if (!data || !data.ratios || !record) return null;
    var town = String(record.town || record.city || '').toUpperCase().trim();
    var county = String(record.county || '').toUpperCase().trim();
    var exact = town && county ? town + ' (' + county + ')' : '';
    var row = exact && data.ratios[exact];
    if (!row) {
      Object.keys(data.ratios).some(function (key) {
        var upper = key.toUpperCase();
        if (county && upper.slice(-(county.length + 3)) !== '(' + county + ')') return false;
        if (upper.indexOf(town) !== 0) return false;
        row = data.ratios[key];
        return true;
      });
    }
    if (!row) return null;
    var years = Object.keys(row).map(Number).filter(Number.isFinite).sort(function (a, b) { return a - b; });
    if (!years.length) return null;
    var year = years[years.length - 1];
    var value = row[String(year)];
    if (!value || !Number(value.ratio)) return null;
    return { year: year, ratio: Number(value.ratio) / 100, lower: Number(value.lower) / 100, upper: Number(value.upper) / 100 };
  }

  function add(detail, key, value, note) {
    var meta = Core.DIMENSIONS[key];
    var normalized = value == null ? null : Core.clamp01(value);
    detail[key] = {
      key: key,
      publicKey: meta.publicKey,
      letter: meta.letter,
      name: meta.name,
      slug: meta.slug,
      label: meta.letter + ' · ' + meta.name,
      score: normalized == null ? null : Math.round(normalized * 100),
      weight: meta.weight,
      note: note || (normalized == null ? 'evidence not available' : '')
    };
  }

  function overassessmentPosition(record, assessed, ratio) {
    var fair = null;
    var basis = '';
    var sale = Number(record.verifiedSale);
    var saleYear = Number(record.verifiedSaleYear);
    var appreciation = Number(record.valuation && record.valuation.appreciation);
    var nowYear = new Date().getFullYear();

    if (sale > 1000 && saleYear > 1900 && ratio > 0) {
      var years = Math.max(0, Math.min(12, nowYear - saleYear));
      if (!Number.isFinite(appreciation)) appreciation = 0;
      var supportedMarket = sale * Math.pow(1 + appreciation, years);
      fair = supportedMarket * ratio;
      basis = 'verified sale carried forward to the current assessment ratio';
    } else if (record.appeal && Number(record.appeal.peerMed) > 0) {
      fair = Number(record.appeal.peerMed);
      basis = 'comparable nearby assessment evidence';
    }

    if (!(fair > 0)) return null;
    var limit = fair * 1.15;
    var over = (assessed - limit) / limit;
    var score = over <= 0
      ? Core.clamp01(1 - ((assessed - fair) / Math.max(fair, 1)) * 0.5)
      : Core.clamp01(1 - over / 0.30) * 0.5;
    return {
      value: score,
      note: assessed > limit
        ? money(assessed - limit) + ' above the Chapter 123 screening limit using ' + basis
        : 'within the Chapter 123 screening cushion using ' + basis
    };
  }

  function stability(record, official, uniformity) {
    var valuation = record && record.valuation;
    if (!valuation || valuation.ratioSource !== 'sr1a' || !Number(valuation.ratio) || !official) return null;
    var pub = official.ratio;
    var ver = Number(valuation.ratio);
    var coeff = uniformity && Number.isFinite(Number(uniformity.coefficient)) ? Number(uniformity.coefficient) : null;
    var drift = pub - ver;
    var level = Core.clamp01((0.85 - pub) / 0.35);
    var spread = coeff == null ? null : Core.clamp01((coeff - 15) / 20);
    var decay = Core.clamp01(drift / 0.20);
    var parts = [[level, 0.45], [decay, 0.25]];
    if (spread != null) parts.push([spread, 0.30]);
    var weight = parts.reduce(function (sum, part) { return sum + part[1]; }, 0);
    var pressure = parts.reduce(function (sum, part) { return sum + part[0] * part[1]; }, 0) / weight;
    var pressureScore = Math.round(pressure * 100);
    if (pub >= 0.98) pressureScore = Math.min(pressureScore, 8);
    return {
      value: 1 - Core.clamp01(pressureScore / 100),
      note: 'revaluation pressure ' + pressureScore + ' of 100 from ratio drift' + (coeff == null ? '' : ' and COD')
    };
  }

  function trajectory(record, assessed, ratio) {
    var sale = Number(record.verifiedSale);
    if (!(sale > 1000) || !(ratio > 0) || !(assessed > 0)) return null;
    var implied = assessed / sale;
    var rel = implied / ratio;
    var value = rel < 0.85 ? Core.clamp01(0.35 + rel * 0.4)
              : rel > 1.15 ? Core.clamp01(1.15 - (rel - 1) * 0.8)
              : 1;
    return {
      value: value,
      note: 'assessed at ' + (implied * 100).toFixed(0) + '% of its verified sale; town verified ratio is ' + (ratio * 100).toFixed(0) + '%'
    };
  }

  function evaluate(record, uniformityData, appealsData, officialData) {
    if (!record || !Core) return null;
    var detail = {};
    var assessed = Number(record.assessed || record.assessed_value);
    var tax = Number(record.tax || record.last_year_tax);
    var valuation = record.valuation || {};
    var ratio = Number(valuation.ratio);
    var d = district(record);
    var u = uniformityData && uniformityData.districts && d ? uniformityData.districts[d] : null;
    var a = appealsData && appealsData.counties ? appealsData.counties[countyCode(record)] : null;
    var official = latestOfficial(record, officialData);

    // B - Burden
    if (assessed > 0 && tax > 0 && ratio > 0) {
      var market = assessed / ratio;
      var effective = tax / market;
      add(detail, 'burden', (BURDEN_WORST - effective) / (BURDEN_WORST - BURDEN_BEST),
          '$' + (effective * 1000).toFixed(2) + ' per $1,000 of ratio-implied market value');
    } else {
      add(detail, 'burden', null);
    }

    // O - Overassessment Position. Peer comparison is evidence here, never a standalone Watchdog Score.
    var over = assessed > 0 && ratio > 0 ? overassessmentPosition(record, assessed, ratio) : null;
    add(detail, 'fairness', over && over.value, over && over.note || 'needs verified sale or comparable assessment evidence');

    // U - Uniformity
    if (u && u.coefficient != null) {
      add(detail, 'uniformity', 1 - Core.clamp01((Number(u.coefficient) - 7) / 23),
          'municipal coefficient ' + Number(u.coefficient).toFixed(2) + ', residential standard is 15');
    } else {
      add(detail, 'uniformity', null);
    }

    // S - Stability
    var stable = stability(record, official, u);
    add(detail, 'stability', stable && stable.value, stable && stable.note || 'needs verified sales ratio and published ratio');

    // T - Trajectory
    var trend = valuation.ratioSource === 'sr1a' ? trajectory(record, assessed, ratio) : null;
    add(detail, 'trajectory', trend && trend.value, trend && trend.note || 'needs a verified sale on this parcel');

    // R - Recourse
    if (a && a.latest && a.latest.win_rate_filed != null) {
      var winRate = Number(a.latest.win_rate_filed);
      add(detail, 'recourse', Core.clamp01((winRate - 20) / 45),
          winRate.toFixed(1) + '% of filed appeals reduced in ' + String(a.county || record.county || 'this county').toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }) + ' County');
    } else {
      add(detail, 'recourse', null);
    }

    return Core.aggregate(detail);
  }

  function ensureStyles() {
    if (document.getElementById('wd-robust-public-score-style')) return;
    var style = document.createElement('style');
    style.id = 'wd-robust-public-score-style';
    style.textContent =
      '#plm-robust-score-sec{margin:22px 0}' +
      '.wdps{background:#fff;border:1px solid #e2e7ef;border-radius:18px;padding:22px;color:#111d38}' +
      '.wdps-head{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center;margin-bottom:18px}' +
      '.wdps-k{font:800 10px/1.2 "Plus Jakarta Sans",sans-serif;letter-spacing:.11em;text-transform:uppercase;color:#2f6df6}' +
      '.wdps h3{font:800 24px/1.15 "Plus Jakarta Sans",sans-serif;margin:5px 0 6px;color:#111d38}' +
      '.wdps-sub{font:500 14px/1.55 "Source Sans 3",sans-serif;color:#5d6d82;margin:0}' +
      '.wdps-score{width:92px;height:92px;border-radius:50%;display:grid;place-items:center;background:#edf1f6;text-align:center}' +
      '.wdps-score b{font:800 34px/1 "Plus Jakarta Sans",sans-serif;color:#183b84}.wdps-score span{display:block;font:700 10px/1.2 "Source Sans 3",sans-serif;color:#748198;margin-top:4px}' +
      '.wdps-meta{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 18px}.wdps-meta span{background:#f5f7fb;border-radius:999px;padding:7px 10px;font:700 12px/1 "Source Sans 3",sans-serif;color:#31435c}' +
      '.wdps-grid{display:grid;gap:9px}.wdps-row{display:grid;grid-template-columns:minmax(150px,1fr) minmax(90px,1.1fr) 38px;gap:12px;align-items:center}' +
      '.wdps-label a{font:800 13px/1.25 "Source Sans 3",sans-serif;color:#111d38;text-decoration:none}.wdps-label small{display:block;font:500 11px/1.3 "Source Sans 3",sans-serif;color:#748198;margin-top:2px}' +
      '.wdps-bar{height:8px;border-radius:999px;background:#edf1f6;overflow:hidden}.wdps-bar i{display:block;height:100%;background:#2f6df6;border-radius:inherit}' +
      '.wdps-n{font:800 13px/1 "Plus Jakarta Sans",sans-serif;text-align:right;color:#183b84}.wdps-row.off{opacity:.58}.wdps-foot{margin-top:17px;padding-top:15px;border-top:1px solid #e2e7ef;font:500 12px/1.55 "Source Sans 3",sans-serif;color:#5d6d82}.wdps-foot a{font-weight:800;color:#183b84}' +
      '@media(max-width:620px){.wdps{padding:18px}.wdps-head{grid-template-columns:1fr 76px}.wdps-score{width:76px;height:76px}.wdps-score b{font-size:28px}.wdps-row{grid-template-columns:1fr 74px 32px}.wdps-label small{grid-column:1/-1}.wdps-bar{height:7px}}';
    document.head.appendChild(style);
  }

  function quarantineLegacyPeerScore() {
    var host = document.getElementById('plm-score-sec');
    if (!host || host.querySelector('[data-score-model="' + Core.VERSION + '"]')) return;
    var heading = host.querySelector('h3.plm-sec-h');
    if (!heading || heading.textContent.trim() !== 'Watchdog Score') return;
    host.setAttribute('data-retired-score-model', 'peer-gap-v1');
    host.innerHTML = '<h3 class="plm-sec-h">O · Overassessment Position evidence</h3>' +
      '<p class="plm-sec-s">The old peer-only score has been retired. Comparable nearby assessments can still inform the O dimension, but they no longer produce a standalone Watchdog Score. The canonical ROBUST Watchdog Score appears above.</p>';
  }

  function render(score) {
    if (!score || !Core.isCanonicalVersion(score.modelVersion)) return false;
    var anchor = document.getElementById('plm-score-sec');
    if (!anchor || !anchor.parentNode) return false;
    ensureStyles();
    var host = document.getElementById('plm-robust-score-sec');
    if (!host) {
      host = document.createElement('div');
      host.id = 'plm-robust-score-sec';
      host.className = 'plm-sec';
      anchor.parentNode.insertBefore(host, anchor);
    }
    host.setAttribute('data-score-model', score.modelVersion);
    host.innerHTML = '<section class="wdps" data-score-model="' + score.modelVersion + '">' +
      '<div class="wdps-head"><div><div class="wdps-k">Watchdog Score · ROBUST Framework</div><h3>' + esc(score.verdict) + '</h3>' +
      '<p class="wdps-sub">One score built from six tax-position dimensions. This is not a home-quality or neighborhood desirability grade.</p></div>' +
      '<div class="wdps-score"><div><b>' + score.score + '</b><span>/ 100</span></div></div></div>' +
      '<div class="wdps-meta"><span>' + Math.round(score.covered * 100) + '% evidence weight</span><span>' + esc(score.confidence) + ' confidence</span><span>' + esc(score.modelVersion) + '</span></div>' +
      '<div class="wdps-grid">' + Core.ORDER.map(function (key) {
        var row = score.detail[key];
        var has = row && row.score != null;
        return '<div class="wdps-row' + (has ? '' : ' off') + '"><div class="wdps-label"><a href="/property/robust/' + row.slug + '/">' + esc(row.label) + '</a><small>' + esc(row.note || '') + '</small></div>' +
          '<div class="wdps-bar"><i style="width:' + (has ? row.score : 0) + '%"></i></div><div class="wdps-n">' + (has ? row.score : '—') + '</div></div>';
      }).join('') + '</div>' +
      '<div class="wdps-foot">Missing evidence lowers coverage and confidence. It is never replaced with the retired peer-gap score or a neutral guess. <a href="/property/robust/">How the ROBUST Framework works</a>.</div></section>';
    quarantineLegacyPeerScore();
    return true;
  }

  function scoreRecord(record, token, attempt) {
    if (!record || token !== generation) return;
    Promise.all([
      loadJSON('/property/uniformity.json'),
      loadJSON('/property/appeals.json'),
      loadJSON('/equalization-ratios.json')
    ]).then(function (data) {
      if (token !== generation) return;
      var score = evaluate(record, data[0], data[1], data[2]);
      if (score) render(score);
      quarantineLegacyPeerScore();
      if (attempt < 24 && (!score || score.covered < 0.999 || !record.appeal || !record.valuation)) {
        window.setTimeout(function () { scoreRecord(record, token, attempt + 1); }, 400);
      }
    });
  }

  function observe(record) {
    if (!record) return;
    activeRecord = record;
    generation += 1;
    scoreRecord(activeRecord, generation, 0);
  }

  function installRememberHook() {
    var nav = root.WatchdogPublicNav;
    if (!nav || typeof nav.remember !== 'function') return false;
    if (nav.remember.__robustScoreHook) return true;
    var original = nav.remember;
    function wrapped(record) {
      observe(record);
      return original.apply(this, arguments);
    }
    wrapped.__robustScoreHook = true;
    nav.remember = wrapped;
    return true;
  }

  function boot() {
    if (!installRememberHook()) {
      var attempts = 0;
      hookTimer = window.setInterval(function () {
        attempts += 1;
        if (installRememberHook() || attempts > 40) {
          window.clearInterval(hookTimer);
          hookTimer = null;
        }
      }, 100);
    }
    new MutationObserver(quarantineLegacyPeerScore).observe(document.documentElement, { childList: true, subtree: true });
  }

  root.WatchdogScorePublic = Object.freeze({ observe: observe, evaluate: evaluate, render: render, quarantineLegacyPeerScore: quarantineLegacyPeerScore });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
