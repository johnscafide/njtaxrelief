/* Canonical ROBUST Watchdog Score adapter for the public property lookup.
   Public property surfaces must never recompute a second unqualified Watchdog
   Score from a different evidence shape. The governed ROBUST-v1 observation is
   the single source of truth; if it does not exist, the score remains building. */
(function (root) {
  'use strict';
  if (root.WatchdogScorePublic) return;

  var Core = root.WatchdogScoreCore;
  if (!Core) return;

  var activeRecord = null;
  var generation = 0;
  var hookTimer = null;
  var client = null;
  var DETAIL_RPC = 'get_public_property_watchdog_score_details';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pinFor(record) {
    return String(record && (record.pin || record.pams_pin) || '').trim();
  }

  function getClient() {
    if (client) return client;
    try {
      if (root.NJPTRSupabaseRuntime && typeof root.NJPTRSupabaseRuntime.createClient === 'function') {
        client = root.NJPTRSupabaseRuntime.createClient();
      }
      if (!client && root.__njwSB) client = root.__njwSB;
    } catch (_error) {}
    return client;
  }

  function component(key, value) {
    var meta = Core.DIMENSIONS[key];
    var n = value == null ? null : Number(value);
    var score = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
    return {
      key: key,
      publicKey: meta.publicKey,
      letter: meta.letter,
      name: meta.name,
      slug: meta.slug,
      label: meta.letter + ' · ' + meta.name,
      score: score,
      weight: meta.weight,
      note: score == null ? 'evidence not available in the canonical observation' : 'governed ROBUST-v1 observation'
    };
  }

  function fromCanonicalRow(row) {
    if (!row || !Core.isCanonicalVersion(row.model_version || row.modelVersion)) return null;
    var detail = {
      recourse: component('recourse', row.recourse_score),
      fairness: component('fairness', row.overassessment_score),
      burden: component('burden', row.burden_score),
      uniformity: component('uniformity', row.uniformity_score),
      stability: component('stability', row.stability_score),
      trajectory: component('trajectory', row.trajectory_score)
    };
    var score = Core.aggregate(detail);
    if (!score) return null;

    var governed = Number(row.watchdog_score);
    if (Number.isFinite(governed)) {
      score.score = Math.max(0, Math.min(100, Math.round(governed)));
      score.verdict = Core.verdict(score.score);
      score.grade = score.score >= 80 ? 'A' : score.score >= 65 ? 'B' : score.score >= 50 ? 'C' : score.score >= 35 ? 'D' : 'E';
      score.band = score.score >= 65 ? 'good' : score.score >= 45 ? 'mid' : 'bad';
    }

    var coverage = Number(row.evidence_coverage);
    if (Number.isFinite(coverage)) {
      score.covered = Math.max(0, Math.min(1, coverage > 1 ? coverage / 100 : coverage));
      score.confidence = Core.confidence(score.covered);
    }
    score.framework = 'ROBUST';
    score.frameworkVersion = Core.VERSION;
    score.modelVersion = Core.VERSION;
    score.observedOn = row.observed_on || null;
    score.observedAt = row.observed_at || null;
    score.pamsPin = row.pams_pin || null;
    return score;
  }

  function fetchCanonical(record) {
    var pin = pinFor(record);
    var sb = getClient();
    if (!pin || !sb || typeof sb.rpc !== 'function') return Promise.resolve(null);
    return sb.rpc(DETAIL_RPC, { p_pins: [pin] }).then(function (res) {
      if (res && res.error) throw res.error;
      var rows = res && Array.isArray(res.data) ? res.data : [];
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i] && rows[i].pams_pin || '') === pin) return fromCanonicalRow(rows[i]);
      }
      return null;
    });
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
      '.wdps-n{font:800 13px/1 "Plus Jakarta Sans",sans-serif;text-align:right;color:#183b84}.wdps-row.off{opacity:.58}' +
      '.wdps-foot{margin-top:17px;padding-top:15px;border-top:1px solid #e2e7ef;font:500 12px/1.55 "Source Sans 3",sans-serif;color:#5d6d82}.wdps-foot a{font-weight:800;color:#183b84}' +
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
      '<p class="plm-sec-s">The old peer-only score has been retired. Comparable nearby assessments may inform evidence, but they do not produce a standalone Watchdog Score. The canonical ROBUST Watchdog Score appears above when a governed observation exists.</p>';
  }

  function clearCanonicalScore() {
    var host = document.getElementById('plm-robust-score-sec');
    if (host) host.remove();
    quarantineLegacyPeerScore();
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
    host.innerHTML = '<section class="wdps" data-score-model="' + esc(score.modelVersion) + '">' +
      '<div class="wdps-head"><div><div class="wdps-k">Watchdog Score · ROBUST Framework</div><h3>' + esc(score.verdict) + '</h3>' +
      '<p class="wdps-sub">One governed score built from six tax-position dimensions. This is not a home-quality or neighborhood desirability grade.</p></div>' +
      '<div class="wdps-score"><div><b>' + esc(score.score) + '</b><span>/ 100</span></div></div></div>' +
      '<div class="wdps-meta"><span>' + Math.round(score.covered * 100) + '% evidence weight</span><span>' + esc(score.confidence) + ' confidence</span><span>' + esc(score.modelVersion) + '</span></div>' +
      '<div class="wdps-grid">' + Core.ORDER.map(function (key) {
        var d = score.detail[key];
        var has = d && d.score != null;
        return '<div class="wdps-row' + (has ? '' : ' off') + '">' +
          '<div class="wdps-label"><a href="/property/robust/' + esc(d.slug) + '/">' + esc(d.label) + '</a><small>' + esc(d.note || '') + '</small></div>' +
          '<div class="wdps-bar"><i style="width:' + (has ? d.score : 0) + '%"></i></div>' +
          '<div class="wdps-n">' + (has ? esc(d.score) : '—') + '</div>' +
        '</div>';
      }).join('') + '</div>' +
      '<div class="wdps-foot">This is the latest governed ROBUST-v1 observation for this parcel. Missing evidence lowers coverage and is never replaced with a parallel client-side score. <a href="/property/robust/">How the ROBUST Framework works</a>.</div></section>';
    quarantineLegacyPeerScore();
    return true;
  }

  function renderWhenReady(score, token, attempt) {
    if (token !== generation) return;
    if (render(score)) return;
    if (attempt < 30) {
      window.setTimeout(function () { renderWhenReady(score, token, attempt + 1); }, 120);
    }
  }

  function scoreRecord(record, token, attempt) {
    if (!record || token !== generation) return;
    var pin = pinFor(record);
    if (!pin) {
      clearCanonicalScore();
      return;
    }
    if (!getClient()) {
      if (attempt < 40) window.setTimeout(function () { scoreRecord(record, token, attempt + 1); }, 100);
      return;
    }
    fetchCanonical(record).then(function (score) {
      if (token !== generation) return;
      if (!score) {
        clearCanonicalScore();
        return;
      }
      renderWhenReady(score, token, 0);
    }).catch(function (error) {
      if (token !== generation) return;
      if (attempt < 4) {
        window.setTimeout(function () { scoreRecord(record, token, attempt + 1); }, 350);
      } else {
        console.warn('Canonical Watchdog Score unavailable', error);
        clearCanonicalScore();
      }
    });
  }

  function observe(record) {
    if (!record) return;
    activeRecord = record;
    generation += 1;
    clearCanonicalScore();
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

  root.WatchdogScorePublic = Object.freeze({
    observe: observe,
    evaluate: fromCanonicalRow,
    render: render,
    fetchCanonical: fetchCanonical,
    quarantineLegacyPeerScore: quarantineLegacyPeerScore
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
