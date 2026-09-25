/* ==========================================================================
   wd-dashboard-spike-layout.js
   NJW-402b · layout additions for the Spike dashboard skin

   Only runs when the Spike skin is active (html[data-ui="spike"]). Under the
   approved V3 layout this file returns immediately and touches nothing.

   It adds three things the base renderers do not emit, all from data that is
   already in memory on window.WD. Nothing here fetches, and nothing here
   invents a number:

     1. Score gauge in the page header, with the real town peer median as a
        marker (WD.S.scores[pin].peer).
     2. Gap-by-property chart from WD.gapFor(p), on a domain measured from
        the actual values rather than a fixed scale.

   Navigation is intentionally not created here. The shared Watchdog header,
   universal menu and public-nav runtime own dashboard navigation on every
   viewport (NJW-403 / NJW-404).

   Deliberately NOT here: a score-over-time chart. score_observations stopped
   receiving ROBUST-v1 rows on 2026-08-21, so the series is six points ending
   a month ago. Once that job writes daily again this is the place to add it.
   ========================================================================== */

(function (w, d) {
  'use strict';
  if (w.__WDD_SPIKE_LAYOUT__) return;
  if (d.documentElement.getAttribute('data-ui') !== 'spike') return;
  w.__WDD_SPIKE_LAYOUT__ = true;

  function q(s, r) { return (r || d).querySelector(s); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function valid(v) { if (v == null || v === '') return null; var n = Number(v); return Number.isFinite(n) ? n : null; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ------------------------------------------------------------------
     1. SIDEBAR
     ------------------------------------------------------------------ */

  function navItems() {
    var M = w.WatchdogUniversalMenu;
    if (!M || typeof M.items !== 'function') return [];
    var out = [];
    try { out = M.items() || []; } catch (e) { return []; }
    if (typeof M.developerItems === 'function') {
      try {
        var WD = w.WD;
        if (WD && WD.S && WD.S.plan === 'developer') {
          out = out.concat(M.developerItems() || []);
        }
      } catch (e) { /* developer items are optional */ }
    }
    return out;
  }

  function here(href) {
    var a = d.createElement('a');
    a.href = href || '/';
    var path = a.pathname.replace(/\/index\.html$/, '/').replace(/\/+$/, '/') || '/';
    var now = location.pathname.replace(/\/index\.html$/, '/').replace(/\/+$/, '/') || '/';
    return path === now;
  }

  function buildSidebar() {
    if (q('#wdd-side')) return;
    var app = q('.wdd-app');
    var shell = q('.wdd-shell');
    if (!app || !shell) return;

    var items = navItems();
    if (!items.length) return;          // no menu, no sidebar, rather than a broken one

    var groups = [
      { cap: 'Workspace', keys: ['dashboard', 'home', 'lookup', 'town-compare', 'pulse'] },
      { cap: 'Analysis', keys: ['robust', 'scan', 'data-workbench', 'data-center'] },
      { cap: 'Business', keys: ['agent-desk', 'transaction', 'pro', 'account'] }
    ];
    var placed = {};
    var html = '';

    groups.forEach(function (g) {
      var rows = items.filter(function (it) {
        return g.keys.indexOf(it.key) > -1 && !placed[it.key];
      });
      if (!rows.length) return;
      html += '<div class="wdd-side-cap">' + esc(g.cap) + '</div>';
      rows.forEach(function (it) {
        placed[it.key] = true;
        html += link(it);
      });
    });

    var rest = items.filter(function (it) { return !placed[it.key]; });
    if (rest.length) {
      html += '<div class="wdd-side-cap">More</div>';
      rest.forEach(function (it) { html += link(it); });
    }

    function link(it) {
      return '<a class="wdd-side-link' + (here(it.href) ? ' is-active' : '') + '" href="' + esc(it.href) + '">' +
        '<i class="fas ' + esc(it.icon || 'fa-circle') + '" aria-hidden="true"></i>' +
        '<span>' + esc(it.label) + '</span></a>';
    }

    var side = d.createElement('aside');
    side.className = 'wdd-side';
    side.id = 'wdd-side';
    side.setAttribute('aria-label', 'Watchdog sections');
    side.innerHTML =
      '<a class="wdd-side-brand" href="/property/" aria-label="Watchdog property lookup">' +
        '<span class="wdd-side-mark"><i class="fas fa-dog" aria-hidden="true"></i></span>' +
        '<span class="wdd-side-word">Watchdog</span></a>' +
      '<nav class="wdd-side-nav">' + html + '</nav>';

    app.insertBefore(side, shell);
    d.body.classList.add('wdd-has-side');

    var burger = d.createElement('button');
    burger.type = 'button';
    burger.className = 'wdd-side-toggle';
    burger.setAttribute('aria-label', 'Show sections');
    burger.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
    burger.addEventListener('click', function () { d.body.classList.toggle('wdd-side-open'); });
    side.insertAdjacentElement('beforebegin', burger);

    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') d.body.classList.remove('wdd-side-open');
    });
  }

  /* ------------------------------------------------------------------
     2. SCORE GAUGE
     270 degree arc, opening at the bottom, starting at 135 degrees.
     ------------------------------------------------------------------ */

  var CX = 100, CY = 105, R = 74, START = 135, SWEEP = 270;

  function onArc(fraction) {
    var rad = (START + clamp(fraction, 0, 1) * SWEEP) * Math.PI / 180;
    return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
  }

  function peerMedian(props) {
    var WD = w.WD, vals = [], seen = {};
    props.forEach(function (p) {
      var s = WD.S.scores[p.pams_pin];
      var peer = s && valid(s.peer);
      var townKey = String((s && s.town) || p.town || '').trim().toUpperCase() + '|' + String((s && s.county) || p.county || '').trim().toUpperCase();
      if (seen[townKey]) return;
      seen[townKey] = true;
      if (peer != null && peer > 0) vals.push(peer);
    });
    if (!vals.length) return null;
    vals.sort(function (a, b) { return a - b; });
    var mid = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  }

  function verdict(score) {
    if (score == null) return { label: 'Not scored yet', tone: '' };
    if (score >= 80) return { label: 'Strong', tone: 'wdd-ok' };
    if (score >= 60) return { label: 'Typical for New Jersey', tone: 'wdd-ok' };
    if (score >= 40) return { label: 'Worth a look', tone: 'wdd-warn' };
    return { label: 'Needs review', tone: 'wdd-bad' };
  }

  function buildGauge() {
    var WD = w.WD;
    var intro = q('.wdd-page-intro');
    if (!WD || !intro) return;

    intro.classList.add('wdd-hero');

    var st = WD.stats();
    var score = st.score == null ? null : Math.round(st.score);
    if (score == null) return;

    var props = WD.filtered();
    var peer = peerMedian(props);
    var v = verdict(score);

    var old = q('.wdd-heroscore', intro);
    if (old) old.remove();

    // the context block carries the date; keep that as an eyebrow rather than
    // hiding the information along with the layout it came in
    var ctx = q('.wdd-page-context', intro);
    if (ctx && !q('.wdd-hero-eyebrow', intro)) {
      var dateText = (q('b', ctx) || {}).textContent || '';
      var head = q('h1', intro);
      if (dateText && head) {
        var eyebrow = d.createElement('span');
        eyebrow.className = 'wdd-hero-eyebrow';
        eyebrow.textContent = dateText;
        head.insertAdjacentElement('beforebegin', eyebrow);
      }
    }
    if (ctx) ctx.hidden = true;

    var marker = '';
    if (peer != null) {
      var pt = onArc(peer / 100);
      marker = '<circle cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="4.5" ' +
        'fill="var(--sp-surface)" stroke="var(--sp-gold)" stroke-width="3"></circle>';
    }

    var node = d.createElement('div');
    node.className = 'wdd-heroscore';
    node.innerHTML =
      '<div class="wdd-gauge">' +
        '<svg viewBox="0 0 200 186" role="img" aria-label="Watchdog Score ' + score + ' out of 100' +
          (peer != null ? ', town median ' + Math.round(peer) : '') + '">' +
          '<defs><linearGradient id="wddGaugeGrad" x1="0" y1="1" x2="1" y2="0">' +
            '<stop offset="0%" stop-color="var(--sp-deep)"></stop>' +
            '<stop offset="55%" stop-color="var(--sp-primary)"></stop>' +
            '<stop offset="100%" stop-color="var(--sp-ok)"></stop>' +
          '</linearGradient></defs>' +
          '<path d="M 47.7 157.3 A 74 74 0 1 1 152.3 157.3" fill="none" ' +
            'stroke="var(--sp-line)" stroke-width="15" stroke-linecap="round"></path>' +
          '<path d="M 47.7 157.3 A 74 74 0 1 1 152.3 157.3" pathLength="100" ' +
            'stroke-dasharray="' + score + ' 100" fill="none" ' +
            'stroke="url(#wddGaugeGrad)" stroke-width="15" stroke-linecap="round"></path>' +
          marker +
          '<text class="wdd-gauge-end" x="34" y="177" text-anchor="middle">0</text>' +
          '<text class="wdd-gauge-end" x="166" y="177" text-anchor="middle">100</text>' +
        '</svg>' +
        '<div class="wdd-gauge-val"><b>' + score + '</b><span>OUT OF 100</span></div>' +
      '</div>' +
      '<span class="wdd-gauge-verdict ' + v.tone + '"><i></i>' + esc(v.label) + '</span>' +
      (peer != null
        ? '<p class="wdd-gauge-note"><span>Town median</span><b>' + Math.round(peer) + '</b><em>' +
          Math.abs(score - Math.round(peer)) + (score >= peer ? ' points above' : ' points below') + '</em></p>'
        : '<p class="wdd-gauge-note is-unavailable"><span>Town median</span><b>—</b><em>Building peer coverage</em></p>');

    intro.appendChild(node);
  }

  /* ------------------------------------------------------------------
     3. GAP BY PROPERTY
     Domain is measured from the data, so the zero line lands where the
     real numbers put it rather than on a fixed scale.
     ------------------------------------------------------------------ */

  function buildGapChart() {
    var WD = w.WD;
    var rail = q('.wdd-rail-scroll') || q('.wdd-rail-sticky') || q('.wdd-rail');
    if (!WD || !rail) return;

    var rows = WD.filtered().map(function (p) {
      var g = WD.gapFor(p);
      return g == null ? null : { p: p, pct: num(g.pct), dollars: num(g.dollars) };
    }).filter(Boolean).sort(function (a, b) { return b.pct - a.pct; });

    var panel = q('#wdd-gapchart');
    if (!rows.length) { if (panel) panel.remove(); return; }

    var top = rows.slice(0, 8);
    var lo = Math.min(0, Math.min.apply(null, top.map(function (r) { return r.pct; })));
    var hi = Math.max(0, Math.max.apply(null, top.map(function (r) { return r.pct; })));
    var pad = Math.max(1, (hi - lo) * 0.08);
    lo -= pad; hi += pad;
    var span = hi - lo || 1;
    var zero = (0 - lo) / span * 100;

    var bars = top.map(function (r) {
      var tone = r.pct >= 15 ? 'bad' : r.pct >= 5 ? 'warn' : 'ok';
      var at = (r.pct - lo) / span * 100;
      var left = Math.min(zero, at), width = Math.abs(at - zero);
      var addr = r.p.address || r.p.pams_pin || 'Saved property';
      return '<div class="wdd-gaprow">' +
        '<div class="wdd-gaphead"><span title="' + esc(addr) + '">' + esc(addr) + '</span>' +
          '<b class="wdd-' + tone + '">' + (r.pct > 0 ? '+' : '') + r.pct.toFixed(1) + '%</b></div>' +
        '<div class="wdd-gaptrack"><i class="wdd-gapzero" style="left:' + zero.toFixed(2) + '%"></i>' +
          '<i class="wdd-gapfill is-' + tone + '" style="left:' + left.toFixed(2) + '%;width:' +
          Math.max(width, 0.6).toFixed(2) + '%"></i></div>' +
      '</div>';
    }).join('');

    var over = rows.filter(function (r) { return r.pct > 0; }).length;
    if (!panel) {
      panel = d.createElement('div');
      panel.className = 'wdd-panel';
      panel.id = 'wdd-gapchart';
      rail.insertBefore(panel, rail.firstChild);
    }
    panel.innerHTML =
      '<div class="wdd-panel-head"><div><h2>Gap by property</h2>' +
        '<p>' + (rows.length > 8 ? 'Widest 8 of ' + rows.length : rows.length + ' with a calculated gap') + '</p></div></div>' +
      '<div class="wdd-gapchart">' + bars +
        '<div class="wdd-gapaxis"><span>' + lo.toFixed(0) + '%</span>' +
          '<span class="mid" style="left:' + zero.toFixed(2) + '%">Even</span>' +
          '<span>+' + hi.toFixed(0) + '%</span></div>' +
      '</div>' +
      '<p class="wdd-gapnote">' +
        (over ? 'Only bars right of the line carry a case. ' + over + ' of ' + rows.length + ' sit above the evidence.'
              : 'Every property sits at or under the market evidence.') +
      '</p>';
  }

  /* ------------------------------------------------------------------ */

  function paint() {
    try { buildGauge(); } catch (e) { console.warn('[watchdog] spike gauge', e); }
    try { buildGapChart(); } catch (e) { console.warn('[watchdog] spike gap chart', e); }
  }

  function start() {
    paint();
    var WD = w.WD;
    if (WD && WD.onRepaint) WD.onRepaint(function () { requestAnimationFrame(paint); });
  }

  if (w.WD && w.WD.S && w.WD.S.user) start();
  else d.addEventListener('wd:ready', start, { once: true });
})(window, document);
