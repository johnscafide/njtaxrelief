/* ===========================================================================
   dashboard-v2.js
   Single consolidated behaviour layer for /property/dashboard.
   Replaces: dashboard-bands-v2-polish.js, dashboard-bands-v2-polish2.js
   Classic script. Load LAST, after dashboard-bands-v2.js.

   Everything is idempotent and re-runs on remount.
   =========================================================================== */
(function () {
  'use strict';

  var GREENTREE_URL = 'https://www.greentreemortgage.com/';
  var PRO_URL = '/property/pro';
  var COLORS = ['#2f6df6', '#18a966', '#f0a12a', '#d84658', '#7a5bd3', '#0f9aa8', '#8896ab'];

  function q(s, r) { return (r || document).querySelector(s); }
  function qa(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function money(v) {
    if (v == null || isNaN(v)) return '—';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (v >= 1e3) return '$' + Math.round(v).toLocaleString('en-US');
    return '$' + Math.round(v);
  }
  function parseMoney(s) {
    if (!s) return null;
    var t = String(s).replace(/[^0-9.KMB]/gi, '');
    if (!t) return null;
    var mult = /M/i.test(s) ? 1e6 : /B/i.test(s) ? 1e9 : /K/i.test(s) ? 1e3 : 1;
    var v = parseFloat(t.replace(/[KMB]/gi, ''));
    return isNaN(v) ? null : v * mult;
  }
  function titleCase(s) {
    return String(s).toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
  }
  function isFreePlan() {
    // Free tier is the only tier that gets the bottom sponsor bar.
    return !!q('.wdv2-sponsor-bar') || !q('.wdv2-primary-rail .wd5-sponsor');
  }

  /* =========================================================================
     1. County filter removed. It re-rendered the core, bands failed to
        rebuild, and every card fell back to the legacy grid.
     ========================================================================= */
  function removeCountyFilter() {
    var sel = document.getElementById('wd4-county');
    if (sel) {
      // Force back to ALL before removing, so downstream reads see no filter.
      if (sel.value !== 'ALL') {
        sel.value = 'ALL';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      var host = sel.closest('.wdv2-rail-filter') || sel.parentElement;
      if (host) host.style.display = 'none';
      sel.setAttribute('aria-hidden', 'true');
      sel.tabIndex = -1;
    }
    qa('.wdv2-rail-filter, .wdv2-filter-chip').forEach(function (el) { el.style.display = 'none'; });
  }

  /* =========================================================================
     2. Partner Desk permanent, Greentree styling
     ========================================================================= */
  function pinPartner() {
    try { sessionStorage.removeItem('wdv2PartnerDismissed'); } catch (_) {}
    qa('.wdv2-partner-close').forEach(function (b) { b.remove(); });
  }

  function styleSponsor() {
    qa('.wd5-sponsor').forEach(function (card) {
      if (card.dataset.wdv2Green === '1') return;
      var link = q('.wd5-sponsor-link', card) || q('a', card);
      var href = (link && link.getAttribute('href')) || GREENTREE_URL;
      var img = '/johnvarano.jpg';
      var photo = q('.wd5-sponsor-photo', card);
      if (photo) {
        var inner = q('img', photo);
        if (inner && inner.getAttribute('src')) img = inner.getAttribute('src');
        else {
          var m = (getComputedStyle(photo).backgroundImage || '').match(/url\(["']?([^"')]+)["']?\)/);
          if (m) img = m[1];
        }
      }
      card.classList.add('wdv2-gt');
      card.dataset.wdv2Green = '1';
      card.innerHTML =
        '<a class="wdv2-gt-link" href="' + href + '" target="_blank" rel="noopener sponsored">' +
          '<span class="wdv2-gt-tag">Advertisement</span>' +
          '<img src="' + img + '" alt="John Varano, Greentree Mortgage" loading="lazy" onerror="this.style.display=\'none\'">' +
          '<div class="wdv2-gt-body">' +
            '<b>Know the payment before you fall in love with the house.</b>' +
            '<span>John Varano, Branch Manager at Greentree Mortgage, an HMA Company, will tell you the ' +
            'real monthly number, escrow included.</span>' +
            '<em>Get a rate <i class="fas fa-arrow-right" aria-hidden="true"></i></em>' +
            '<small>NMLS #142739 &middot; Greentree Mortgage, an HMA Company, is a separate company and is ' +
            'not affiliated with Opus Elite Real Estate.</small>' +
          '</div>' +
        '</a>';
    });
  }

  function fixSponsorBar() {
    var bar = q('.wdv2-sponsor-bar');
    if (!bar) return;
    bar.classList.add('wdv2-sponsor-bar-fixed');
    document.body.classList.add('wdv2-has-sponsor-bar');
    var canvas = q('.wd4-canvas');
    if (canvas) canvas.classList.add('wdv2-free-pad');
  }

  /* =========================================================================
     3. Upgrade to Pro card (free plan only), in the secondary band
     ========================================================================= */
  function upgradeCard() {
    if (!isFreePlan()) {
      var stale = q('[data-card-id="upgrade-pro"]');
      if (stale) stale.remove();
      return;
    }
    if (q('[data-card-id="upgrade-pro"]')) return;
    var band = q('[data-band="secondary"]');
    if (!band) return;

    var card = document.createElement('section');
    card.className = 'wd4-card wdv2-card-s wdv2-span-4 wdv2-upgrade';
    card.dataset.cardId = 'upgrade-pro';
    card.dataset.wdv2Id = 'upgrade-pro';
    card.innerHTML =
      '<a class="wdv2-up-link" href="' + PRO_URL + '">' +
        '<div class="wdv2-up-copy">' +
          '<span class="wdv2-up-eyebrow"><i class="fas fa-bolt" aria-hidden="true"></i> Watchdog Pro</span>' +
          '<h3>You are seeing the surface.</h3>' +
          '<p>Pro opens appeal win rates, uniformity scores and the evidence behind every number.</p>' +
          '<span class="wdv2-up-cta">See what Pro unlocks <i class="fas fa-arrow-right" aria-hidden="true"></i></span>' +
        '</div>' +
        '<div class="wdv2-up-price"><b>$49</b><span>per month</span><em>2 months free yearly</em></div>' +
      '</a>';
    band.appendChild(card);
  }

  /* =========================================================================
     3b. Marketing Studio keeps its gradient treatment.
         The CSS also targets [data-card-id="marketing"] directly, so the
         card is styled even if this never runs. Belt and braces.
     ========================================================================= */
  function restoreMarketing() {
    var card = q('[data-card-id="marketing"]');
    if (!card) return;
    card.classList.add('wdv2-marketing-card');
    var link = q('.wd5-marketing-link', card);
    if (link) link.classList.add('wdv2-marketing-link');
  }

  /* =========================================================================
     4. County Tax Exposure donut, with an honest state for single-county
     ========================================================================= */
  function readCounties(card) {
    var out = {};
    qa('.wd5-county-row', card).forEach(function (r) {
      var label = '', amount = null;
      Array.prototype.slice.call(r.children).forEach(function (k) {
        var txt = (k.textContent || '').trim();
        if (!txt) return;
        if (/\$/.test(txt) && amount == null) amount = parseMoney(txt);
        else if (!label && !/\$/.test(txt)) label = txt;
      });
      if (!label) return;
      var key = label.trim().toUpperCase();
      if (!out[key]) out[key] = { label: titleCase(label), value: 0 };
      out[key].value += (amount || 0);
    });
    return Object.keys(out).map(function (k) { return out[k]; })
      .filter(function (d) { return d.value > 0; })
      .sort(function (a, b) { return b.value - a.value; });
  }

  function donutSvg(data, total) {
    var R = 54, r = 34, cx = 68, cy = 68, start = -Math.PI / 2, parts = [];
    data.forEach(function (d, i) {
      var frac = d.value / total, ang = frac * Math.PI * 2, end = start + ang;
      var color = COLORS[i % COLORS.length];
      if (frac > 0.9999) {
        parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + ((R + r) / 2) +
          '" fill="none" stroke="' + color + '" stroke-width="' + (R - r) + '"></circle>');
      } else {
        var x1 = cx + R * Math.cos(start), y1 = cy + R * Math.sin(start);
        var x2 = cx + R * Math.cos(end), y2 = cy + R * Math.sin(end);
        var x3 = cx + r * Math.cos(end), y3 = cy + r * Math.sin(end);
        var x4 = cx + r * Math.cos(start), y4 = cy + r * Math.sin(start);
        var big = ang > Math.PI ? 1 : 0;
        parts.push('<path d="M' + x1 + ',' + y1 + ' A' + R + ',' + R + ' 0 ' + big + ' 1 ' + x2 + ',' + y2 +
          ' L' + x3 + ',' + y3 + ' A' + r + ',' + r + ' 0 ' + big + ' 0 ' + x4 + ',' + y4 + ' Z" fill="' + color +
          '"><title>' + d.label + ' ' + money(d.value) + '</title></path>');
      }
      start = end;
    });
    return '<svg viewBox="0 0 136 136" class="wdv2-donut-svg" role="img" aria-label="County tax exposure by share">' +
      parts.join('') +
      '<text x="68" y="64" text-anchor="middle" class="wdv2-donut-total">' + money(total) + '</text>' +
      '<text x="68" y="79" text-anchor="middle" class="wdv2-donut-sub">total tax</text></svg>';
  }

  function buildDonut() {
    var card = q('[data-card-id="county-extra"]');
    if (!card || card.dataset.wdv2Donut === '1') return;
    var list = q('.wd5-county-list', card);
    if (!list) return;
    var data = readCounties(card);
    if (!data.length) return;

    if (data.length < 2) {
      list.classList.remove('wdv2-donut-wrap');
      list.innerHTML =
        '<div class="wdv2-notice">' +
          '<i class="fas fa-chart-pie" aria-hidden="true"></i>' +
          '<b>One county in view</b>' +
          '<span>This breakdown compares tax load across counties. It needs saved properties in ' +
          'more than one county to say anything useful.</span>' +
        '</div>';
      card.dataset.wdv2Donut = '1';
      return;
    }

    var total = data.reduce(function (a, d) { return a + d.value; }, 0);
    if (!total) return;
    var top = data.slice(0, 6), rest = data.slice(6);
    if (rest.length) top.push({ label: 'Other (' + rest.length + ')', value: rest.reduce(function (a, d) { return a + d.value; }, 0) });

    list.classList.add('wdv2-donut-wrap');
    list.innerHTML = donutSvg(top, total) +
      '<ul class="wdv2-donut-legend">' + top.map(function (d, i) {
        return '<li><i style="background:' + COLORS[i % COLORS.length] + '"></i>' +
          '<span>' + d.label + '</span><b>' + money(d.value) + '</b>' +
          '<em>' + Math.round((d.value / total) * 100) + '%</em></li>';
      }).join('') + '</ul>';
    card.dataset.wdv2Donut = '1';
  }

  /* =========================================================================
     5. Map coverage note. Markers only render for properties with valid NJ
        coordinates; most saved rows have none, so the pin count silently
        undercounts. Say so instead of hiding it.
     ========================================================================= */
  function mapNote() {
    var legend = q('.wd4-map-legend');
    if (!legend) return;
    var pins = qa('#wd5-map .leaflet-marker-icon').length;
    var totalEl = q('.wdv2-composition-title strong');
    var total = totalEl ? parseInt((totalEl.textContent || '0').replace(/\D/g, ''), 10) : null;
    var note = q('.wdv2-map-note', legend);

    if (!total || !pins || pins >= total) {
      if (note) note.remove();
      return;
    }
    if (!note) {
      note = document.createElement('span');
      note.className = 'wdv2-map-note';
      legend.appendChild(note);
    }
    note.textContent = 'Showing ' + pins + ' of ' + total +
      '. The rest have no coordinates on record yet.';
  }

  /* =========================================================================
     6. Recent Activity de-duplication
     ========================================================================= */
  function dedupeActivity() {
    var card = q('[data-card-id="activity"]');
    if (!card) return;
    var list = q('.wd4-activity-list', card);
    if (!list) return;
    var seen = {};
    qa('.wd4-activity-row', list).forEach(function (row) {
      if (row.classList.contains('head')) return;
      var key = Array.prototype.slice.call(row.children)
        .map(function (c) { return (c.textContent || '').trim(); }).join('|');
      if (seen[key]) {
        var badge = q('.wdv2-dupe-count', seen[key]);
        if (!badge) {
          badge = document.createElement('b');
          badge.className = 'wdv2-dupe-count';
          badge.dataset.n = '1';
          (q('.wd4-activity-property', seen[key]) || seen[key]).appendChild(badge);
        }
        var n = parseInt(badge.dataset.n, 10) + 1;
        badge.dataset.n = String(n);
        badge.textContent = '\u00d7' + n;
        badge.title = n + ' identical updates on this date';
        row.remove();
      } else seen[key] = row;
    });
    if (!list.querySelector('.wd4-activity-row:not(.head)')) {
      card.classList.add('is-empty');
      list.innerHTML = '<div class="wdv2-empty-line"><i class="fas fa-clock-rotate-left"></i>' +
        'No recent changes on your saved properties.</div>';
    }
  }

  /* =========================================================================
     7. Watchdog Score sparkline
     ========================================================================= */
  function fixScoreSpark() {
    var wrap = q('.wdv2-score-spark');
    if (!wrap) return;
    var svg = q('svg', wrap);
    if (!svg) return;
    svg.removeAttribute('style');
    svg.setAttribute('preserveAspectRatio', 'none');
    qa('text, .grid, circle', wrap).forEach(function (el) { el.remove(); });
    qa('path', wrap).forEach(function (p) {
      if (/area/.test(p.getAttribute('class') || '')) {
        p.setAttribute('fill', 'rgba(47,109,246,.13)');
        p.setAttribute('stroke', 'none');
      } else {
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', '#2f6df6');
        p.setAttribute('stroke-width', '2');
        p.setAttribute('stroke-linecap', 'round');
        p.setAttribute('vector-effect', 'non-scaling-stroke');
      }
    });
  }

  /* =========================================================================
     8. Avg Effective Rate caption trimmed to one line
     ========================================================================= */
  function trimRateCaption() {
    var card = q('[data-card-id="rate-extra"]');
    if (!card) return;
    var foot = q('.wd4-kpi-foot', card) || q('small', card);
    if (foot && /average recorded property tax rate/i.test(foot.textContent || '')) {
      foot.textContent = 'avg recorded tax rate';
      foot.title = 'Average recorded property tax rate across saved properties';
    }
  }

  /* =========================================================================
     9. Portfolio: scoring state + sortable headers
     ========================================================================= */
  function scoringState() {
    var tbody = q('[data-card-id="properties"] tbody');
    if (!tbody) return;
    function paint() {
      qa('tr', tbody).forEach(function (tr) {
        var cell = tr.children[2];
        if (!cell) return;
        if (q('.wd5-score-pill', cell)) { cell.classList.remove('wdv2-scoring'); return; }
        var txt = (cell.textContent || '').trim();
        if (txt === '—' || txt === '') {
          if (!cell.classList.contains('wdv2-scoring')) {
            cell.classList.add('wdv2-scoring');
            cell.innerHTML = '<span class="wdv2-scoring-chip"><i></i>Scoring</span>';
          }
        }
      });
    }
    paint();
    if (!tbody.dataset.wdv2ScoreObs) {
      tbody.dataset.wdv2ScoreObs = '1';
      new MutationObserver(paint).observe(tbody, { childList: true, subtree: true });
      setTimeout(function () {
        qa('td.wdv2-scoring', tbody).forEach(function (cell) {
          cell.classList.remove('wdv2-scoring');
          cell.innerHTML = '<span class="wdv2-score-na" title="No Watchdog Score on record for this parcel yet">Not scored</span>';
        });
      }, 25000);
    }
  }

  function sortablePortfolio() {
    var card = q('[data-card-id="properties"]');
    if (!card || card.dataset.wdv2Sort === '1') return;
    var table = q('table', card);
    if (!table) return;
    var thead = q('thead', table), tbody = q('tbody', table);
    if (!thead || !tbody) return;
    var ths = qa('th', thead);
    var numeric = { 2: true, 3: true, 4: true, 5: true };

    function val(tr, i) {
      var td = tr.children[i];
      if (!td) return numeric[i] ? -Infinity : '';
      var txt = (td.textContent || '').trim();
      if (!numeric[i]) return txt.toUpperCase();
      var v = parseMoney(txt);
      if (v == null) { var d = txt.replace(/[^0-9.]/g, ''); v = d ? parseFloat(d) : null; }
      return (v == null || isNaN(v)) ? -Infinity : v;
    }

    ths.forEach(function (th, i) {
      th.classList.add('wdv2-sortable');
      th.tabIndex = 0;
      th.setAttribute('role', 'columnheader');
      th.setAttribute('aria-sort', 'none');
      if (!q('.wdv2-sort-ind', th)) {
        var ind = document.createElement('i');
        ind.className = 'wdv2-sort-ind fas fa-sort';
        ind.setAttribute('aria-hidden', 'true');
        th.appendChild(ind);
      }
      function go() {
        var cur = th.getAttribute('aria-sort');
        var dir = cur === 'ascending' ? -1 : cur === 'descending' ? 1 : (numeric[i] ? -1 : 1);
        ths.forEach(function (o) {
          o.setAttribute('aria-sort', 'none');
          var oi = q('.wdv2-sort-ind', o);
          if (oi) oi.className = 'wdv2-sort-ind fas fa-sort';
        });
        th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending');
        var mine = q('.wdv2-sort-ind', th);
        if (mine) mine.className = 'wdv2-sort-ind fas ' + (dir === 1 ? 'fa-sort-up' : 'fa-sort-down');
        var rows = qa('tr', tbody).sort(function (a, b) {
          var va = val(a, i), vb = val(b, i);
          return va < vb ? -dir : va > vb ? dir : 0;
        });
        var frag = document.createDocumentFragment();
        rows.forEach(function (r) { frag.appendChild(r); });
        tbody.appendChild(frag);
      }
      th.addEventListener('click', go);
      th.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); }
      });
    });
    card.dataset.wdv2Sort = '1';
  }

  /* =========================================================================
     10. Expand buttons survive card repaints
     ========================================================================= */
  function keepExpandButtons() {
    var ids = ['taxvalue', 'county-extra', 'municipality'];
    function attach(card) {
      if (!card || q('.wdv2-expand', card)) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'wdv2-expand';
      b.setAttribute('aria-label', 'Toggle expanded card');
      b.setAttribute('aria-expanded', card.classList.contains('wdv2-expanded') ? 'true' : 'false');
      b.innerHTML = '<i class="fas fa-up-right-and-down-left-from-center" aria-hidden="true"></i>';
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var on = !card.classList.contains('wdv2-expanded');
        card.classList.toggle('wdv2-expanded', on);
        b.setAttribute('aria-expanded', on ? 'true' : 'false');
      });
      card.appendChild(b);
    }
    function sweep() { ids.forEach(function (id) { attach(q('[data-card-id="' + id + '"]')); }); }
    sweep();
    if (!window.__wdv2ExpandTimer) window.__wdv2ExpandTimer = setInterval(sweep, 2000);
  }

  /* =========================================================================
     11. Municipality drill-down
     ========================================================================= */
  function muniDrilldown() {
    var muni = q('[data-card-id="municipality"]');
    var props = q('[data-card-id="properties"]');
    if (!muni || !props || muni.dataset.wdv2Drill === '1') return;
    var tbody = q('tbody', props);
    if (!tbody) return;
    muni.addEventListener('click', function (ev) {
      var tr = ev.target.closest('tr');
      if (!tr || tr.closest('thead')) return;
      var name = ((tr.children[0] && tr.children[0].textContent) || '').trim().toUpperCase();
      if (!name) return;
      var active = props.dataset.wdv2Filter === name;
      props.dataset.wdv2Filter = active ? '' : name;
      qa('tr', tbody).forEach(function (row) {
        var town = (row.getAttribute('data-town') ||
          (row.children[1] && row.children[1].textContent) || '').trim().toUpperCase();
        row.hidden = active ? false : town !== name;
      });
    });
    muni.dataset.wdv2Drill = '1';
  }

  /* =========================================================================
     Runner
     ========================================================================= */
  function apply() {
    removeCountyFilter();
    pinPartner();
    styleSponsor();
    fixSponsorBar();
    restoreMarketing();
    upgradeCard();
    fixScoreSpark();
    trimRateCaption();
    dedupeActivity();
    keepExpandButtons();
    sortablePortfolio();
    scoringState();
    muniDrilldown();
    buildDonut();
    mapNote();
  }

  function bandsHealthy() {
    var d = q('.wdv2-dash');
    return !!d && d.children.length > 0;
  }

  function boot() {
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (bandsHealthy() || (document.body && document.body.classList.contains('wdv2-mounted'))) {
        clearInterval(t);
        apply();
        // Late-arriving data: donut rows, map pins and scores all land after mount.
        var n = 0;
        var late = setInterval(function () {
          n++;
          buildDonut();
          mapNote();
          styleSponsor();
          if (n > 40) clearInterval(late);
        }, 250);
        // Anything that re-renders the dashboard root gets the full pass again.
        var root = document.getElementById('wd4-root') || document.body;
        var pending = null;
        new MutationObserver(function () {
          if (pending) return;
          pending = setTimeout(function () { pending = null; apply(); }, 400);
        }).observe(root, { childList: true, subtree: false });
      } else if (tries > 200) clearInterval(t);
    }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();