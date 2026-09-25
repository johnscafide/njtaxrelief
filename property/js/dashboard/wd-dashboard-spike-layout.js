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
     2. SCORE PANEL (hero, right side)
     270 degree arc, opening at the bottom, starting at 135 degrees. The
     panel node is created once and then updated in place, so the arc and
     the number animate from the last value on every repaint.
     ------------------------------------------------------------------ */

  var CX = 70, CY = 70, R = 56, START = 135, SWEEP = 270;

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
    var WD = w.WD;
    if (WD && typeof WD.verdict === 'function') return WD.verdict(score);
    return score == null ? { label: 'Not scored yet', tone: '' } : { label: 'Scored', tone: '' };
  }

  var popoverOK = typeof HTMLElement !== 'undefined' && Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover');

  function scorePanel() {
    var node = d.createElement('section');
    node.className = 'wdd-h27-score';
    node.setAttribute('aria-labelledby', 'wdd-h27-score-title');
    node.innerHTML =
      '<div class="wdd-h27-score-head"><h2 id="wdd-h27-score-title">Watchdog Score</h2>' +
        (popoverOK ? '<button class="wdd-h27-info" type="button" popovertarget="wdd-h27-score-pop" aria-label="How to read the Watchdog Score">' +
          '<i class="fas fa-question" aria-hidden="true"></i></button>' : '') +
      '</div>' +
      '<div class="wdd-h27-ring" role="img">' +
        '<svg viewBox="0 0 140 140" aria-hidden="true" focusable="false">' +
          '<defs><linearGradient id="wddH27Arc" x1="0" y1="1" x2="1" y2="0">' +
            '<stop offset="0" class="wdd-h27-stop-a"></stop><stop offset="1" class="wdd-h27-stop-b"></stop>' +
          '</linearGradient></defs>' +
          '<circle class="wdd-h27-track" cx="70" cy="70" r="56" pathLength="100" stroke-dasharray="75 100" transform="rotate(135 70 70)"></circle>' +
          '<circle class="wdd-h27-arc" cx="70" cy="70" r="56" pathLength="100" stroke-dasharray="0 100" transform="rotate(135 70 70)"></circle>' +
          '<circle class="wdd-h27-mark" cx="70" cy="14" r="5.5"></circle>' +
          '<text class="wdd-h27-end" x="30" y="129" text-anchor="middle">0</text>' +
          '<text class="wdd-h27-end" x="110" y="129" text-anchor="middle">100</text>' +
        '</svg>' +
        '<div class="wdd-h27-num" aria-hidden="true"><b class="is-empty"></b><small>out of 100</small></div>' +
      '</div>' +
      '<div class="wdd-h27-facts">' +
        '<span class="wdd-h27-verdict"></span>' +
        '<div class="wdd-h27-peer"><div class="wdd-h27-peer-row"><span>Town median</span><b></b></div><p class="wdd-h27-delta"></p></div>' +
      '</div>' +
      (popoverOK ? '<div class="wdd-h27-pop" id="wdd-h27-score-pop" popover>' +
        '<h3>How to read this</h3>' +
        '<p>The Watchdog Score, powered by the ROBUST Framework, is a 0 to 100 view of a property\'s current tax position. Higher is better.</p>' +
        '<p>The big number is the average across the properties you watch. The gold ring marks the median score for the towns those properties are in.</p>' +
      '</div>' : '');
    return node;
  }

  function buildGauge() {
    var WD = w.WD;
    var slot = q('#wdd-hero-score');
    if (!WD || !slot) return;

    var st = WD.stats();
    var score = st.score == null ? null : Math.round(st.score);
    var peer = score == null ? null : peerMedian(WD.filtered());
    var v = verdict(score);

    var panel = q('.wdd-h27-score', slot);
    var fresh = !panel;
    if (fresh) { panel = scorePanel(); slot.appendChild(panel); }

    panel.setAttribute('data-tone', v.tone || 'none');
    q('.wdd-h27-verdict', panel).textContent = v.label;
    q('.wdd-h27-ring', panel).setAttribute('aria-label', score == null ? 'No Watchdog Score yet'
      : 'Watchdog Score ' + score + ' out of 100' + (peer != null ? ', town median ' + Math.round(peer) : ''));

    var num = q('.wdd-h27-num b', panel);
    var arc = q('.wdd-h27-arc', panel);
    var mark = q('.wdd-h27-mark', panel);
    function paintValue() {
      num.classList.toggle('is-empty', score == null);
      num.style.setProperty('--wdd-n', score == null ? 0 : score);
      // set as inline style (not only the attribute) so CSS transitions run
      arc.style.strokeDasharray = ((score || 0) * SWEEP / 360).toFixed(2) + ' 100';
    }
    if (peer != null) {
      var pt = onArc(peer / 100);
      mark.setAttribute('cx', pt.x.toFixed(2));
      mark.setAttribute('cy', pt.y.toFixed(2));
    }
    mark.style.display = peer != null ? '' : 'none';
    // first paint: start from zero so the arc sweeps in once
    if (fresh) requestAnimationFrame(function () { requestAnimationFrame(paintValue); });
    else paintValue();

    var peerBox = q('.wdd-h27-peer', panel), delta = q('.wdd-h27-delta', panel);
    if (score == null) {
      peerBox.hidden = false;
      q('.wdd-h27-peer-row', panel).hidden = true;
      delta.removeAttribute('data-dir');
      delta.textContent = 'Your score appears once a saved property is scored.';
    } else if (peer != null) {
      var diff = score - Math.round(peer);
      peerBox.hidden = false;
      q('.wdd-h27-peer-row', panel).hidden = false;
      q('.wdd-h27-peer-row b', panel).textContent = Math.round(peer);
      delta.setAttribute('data-dir', diff > 0 ? 'up' : diff < 0 ? 'down' : 'even');
      delta.innerHTML = diff === 0 ? 'Right at the median for your towns.'
        : '<strong>' + Math.abs(diff) + (Math.abs(diff) === 1 ? ' point ' : ' points ') + (diff > 0 ? 'above' : 'below') + '</strong> the median for your towns.';
    } else {
      peerBox.hidden = false;
      q('.wdd-h27-peer-row', panel).hidden = true;
      delta.removeAttribute('data-dir');
      delta.textContent = 'Town comparison appears once peer coverage is built.';
    }
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
