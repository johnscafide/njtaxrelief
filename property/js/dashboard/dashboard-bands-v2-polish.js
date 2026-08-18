/* dashboard-bands-v2-polish.js
   Post-mount patches for the v2 band dashboard.
   Classic script. Load LAST, after dashboard-bands-v2.js.
   Everything here waits for body.wdv2-mounted and is idempotent.
*/
(function () {
  'use strict';

  var COUNTY_COLORS = ['#2f6df6', '#18a966', '#f0a12a', '#d84658', '#7a5bd3', '#0f9aa8', '#8896ab'];

  function ready(fn) {
    if (document.body && document.body.classList.contains('wdv2-mounted')) { fn(); return; }
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (document.body && document.body.classList.contains('wdv2-mounted')) { clearInterval(t); fn(); }
      else if (tries > 200) clearInterval(t);
    }, 100);
  }

  function money(v) {
    if (v == null || isNaN(v)) return '—';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(2).replace(/\.00$/, '') + 'M';
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

  /* ---------------------------------------------------------------------
     1. Partner Desk is permanent. No dismiss control, no session memory.
     --------------------------------------------------------------------- */
  function pinPartner() {
    try { sessionStorage.removeItem('wdv2PartnerDismissed'); } catch (_) {}
    function strip() {
      document.querySelectorAll('.wdv2-partner-close').forEach(function (b) { b.remove(); });
    }
    strip();
    var rail = document.querySelector('.wdv2-primary-rail');
    if (rail) new MutationObserver(strip).observe(rail, { childList: true, subtree: true });
  }

  /* ---------------------------------------------------------------------
     2. Score sparkline: the cloned SVG lost its scoped styles and rendered
        as a solid black shape. Paint fills and strokes inline on the clone.
     --------------------------------------------------------------------- */
  function fixScoreSpark() {
    var wrap = document.querySelector('.wdv2-score-spark');
    if (!wrap) return;
    var svg = wrap.querySelector('svg');
    if (!svg) return;
    svg.removeAttribute('style');
    svg.setAttribute('preserveAspectRatio', 'none');
    wrap.querySelectorAll('text, .grid, circle').forEach(function (el) { el.remove(); });
    wrap.querySelectorAll('path').forEach(function (p) {
      var cls = p.getAttribute('class') || '';
      if (/area/.test(cls)) {
        p.setAttribute('fill', 'rgba(47,109,246,.13)');
        p.setAttribute('stroke', 'none');
      } else {
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', '#2f6df6');
        p.setAttribute('stroke-width', '2');
        p.setAttribute('stroke-linecap', 'round');
        p.setAttribute('stroke-linejoin', 'round');
        p.setAttribute('vector-effect', 'non-scaling-stroke');
      }
    });
  }

  /* ---------------------------------------------------------------------
     3. County Tax Exposure becomes a donut.
        Also merges duplicate county keys — the source data has both
        "CAMDEN" and "Camden", which were rendering as two separate rows.
     --------------------------------------------------------------------- */
  function readCounties(card) {
    var out = {}, rows = card.querySelectorAll('.wd5-county-row');
    rows.forEach(function (r) {
      var kids = Array.prototype.slice.call(r.children);
      var label = '', amount = null;
      kids.forEach(function (k) {
        var txt = (k.textContent || '').trim();
        if (!txt) return;
        if (/\$/.test(txt) && amount == null) amount = parseMoney(txt);
        else if (!label && !/\$/.test(txt)) label = txt;
      });
      if (!label) return;
      var key = String(label).trim().toUpperCase();
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
      var color = COUNTY_COLORS[i % COUNTY_COLORS.length];
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
          '" data-slice="' + i + '"><title>' + d.label + ' ' + money(d.value) + '</title></path>');
      }
      start = end;
    });
    return '<svg viewBox="0 0 136 136" class="wdv2-donut-svg" role="img" aria-label="County tax exposure by share">' +
      parts.join('') +
      '<text x="68" y="64" text-anchor="middle" class="wdv2-donut-total">' + money(total) + '</text>' +
      '<text x="68" y="79" text-anchor="middle" class="wdv2-donut-sub">total tax</text></svg>';
  }

  function buildDonut() {
    var card = document.querySelector('[data-card-id="county-extra"]');
    if (!card || card.dataset.wdv2Donut === '1') return;
    var data = readCounties(card);
    if (!data.length) return;
    var total = data.reduce(function (a, d) { return a + d.value; }, 0);
    if (!total) return;

    var top = data.slice(0, 6);
    var rest = data.slice(6);
    if (rest.length) {
      top.push({ label: 'Other (' + rest.length + ')', value: rest.reduce(function (a, d) { return a + d.value; }, 0) });
    }

    var list = card.querySelector('.wd5-county-list');
    if (!list) return;
    list.classList.add('wdv2-donut-wrap');
    list.innerHTML = donutSvg(top, total) +
      '<ul class="wdv2-donut-legend">' + top.map(function (d, i) {
        var pct = Math.round((d.value / total) * 100);
        return '<li><i style="background:' + COUNTY_COLORS[i % COUNTY_COLORS.length] + '"></i>' +
          '<span>' + d.label + '</span><b>' + money(d.value) + '</b><em>' + pct + '%</em></li>';
      }).join('') + '</ul>';
    card.dataset.wdv2Donut = '1';
  }

  /* ---------------------------------------------------------------------
     4. Scores load after mount. Show a "Scoring" state instead of an
        em dash, and repaint the score cells once the data lands.
     --------------------------------------------------------------------- */
  function scoringState() {
    var card = document.querySelector('[data-card-id="properties"]');
    if (!card) return;
    var tbody = card.querySelector('tbody');
    if (!tbody) return;

    function paint() {
      var pending = 0;
      tbody.querySelectorAll('tr').forEach(function (tr) {
        var cell = tr.children[2];
        if (!cell) return;
        if (cell.querySelector('.wd5-score-pill')) { cell.classList.remove('wdv2-scoring'); return; }
        var txt = (cell.textContent || '').trim();
        if (txt === '—' || txt === '') {
          if (!cell.classList.contains('wdv2-scoring')) {
            cell.classList.add('wdv2-scoring');
            cell.innerHTML = '<span class="wdv2-scoring-chip"><i></i>Scoring</span>';
          }
          pending++;
        }
      });
      return pending;
    }
    paint();

    new MutationObserver(function () { paint(); }).observe(tbody, { childList: true, subtree: true });

    // Stop advertising "Scoring" if nothing has arrived after a while.
    setTimeout(function () {
      tbody.querySelectorAll('td.wdv2-scoring').forEach(function (cell) {
        cell.classList.remove('wdv2-scoring');
        cell.innerHTML = '<span class="wdv2-score-na" title="No Watchdog Score available for this parcel yet">Not scored</span>';
      });
    }, 25000);
  }

  /* ---------------------------------------------------------------------
     5. Sortable portfolio headers.
     --------------------------------------------------------------------- */
  function sortablePortfolio() {
    var card = document.querySelector('[data-card-id="properties"]');
    if (!card || card.dataset.wdv2Sort === '1') return;
    var table = card.querySelector('table');
    if (!table) return;
    var thead = table.querySelector('thead');
    var tbody = table.querySelector('tbody');
    if (!thead || !tbody) return;

    var ths = Array.prototype.slice.call(thead.querySelectorAll('th'));
    var numeric = { 2: true, 3: true, 4: true, 5: true };

    function cellValue(tr, i) {
      var td = tr.children[i];
      if (!td) return numeric[i] ? -Infinity : '';
      var txt = (td.textContent || '').trim();
      if (!numeric[i]) return txt.toUpperCase();
      var v = parseMoney(txt);
      if (v == null) {
        var digits = txt.replace(/[^0-9.]/g, '');
        v = digits ? parseFloat(digits) : null;
      }
      return v == null || isNaN(v) ? -Infinity : v;
    }

    function sortBy(i, dir) {
      var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
      rows.sort(function (a, b) {
        var va = cellValue(a, i), vb = cellValue(b, i);
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
      var frag = document.createDocumentFragment();
      rows.forEach(function (r) { frag.appendChild(r); });
      tbody.appendChild(frag);
    }

    ths.forEach(function (th, i) {
      th.classList.add('wdv2-sortable');
      th.setAttribute('tabindex', '0');
      th.setAttribute('role', 'columnheader');
      th.setAttribute('aria-sort', 'none');
      if (!th.querySelector('.wdv2-sort-ind')) {
        var ind = document.createElement('i');
        ind.className = 'wdv2-sort-ind fas fa-sort';
        ind.setAttribute('aria-hidden', 'true');
        th.appendChild(ind);
      }
      function activate() {
        var current = th.getAttribute('aria-sort');
        // default: text ascending, numbers descending (biggest first is what you want)
        var dir = current === 'ascending' ? -1 : current === 'descending' ? 1 : (numeric[i] ? -1 : 1);
        ths.forEach(function (o) {
          o.setAttribute('aria-sort', 'none');
          var oi = o.querySelector('.wdv2-sort-ind');
          if (oi) oi.className = 'wdv2-sort-ind fas fa-sort';
        });
        th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending');
        var myInd = th.querySelector('.wdv2-sort-ind');
        if (myInd) myInd.className = 'wdv2-sort-ind fas ' + (dir === 1 ? 'fa-sort-up' : 'fa-sort-down');
        sortBy(i, dir);
      }
      th.addEventListener('click', activate);
      th.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activate(); }
      });
    });
    card.dataset.wdv2Sort = '1';
  }

  /* ---------------------------------------------------------------------
     6. Expand button disappears after a collapse because the card body
        gets repainted and the button goes with it. Re-attach it.
     --------------------------------------------------------------------- */
  function keepExpandButtons() {
    var ids = ['taxvalue', 'county-extra', 'municipality'];

    function attach(card) {
      if (!card || card.querySelector('.wdv2-expand')) return;
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
        try {
          var raw = JSON.parse(localStorage.getItem('wdv2Prefs') || '{}');
          raw.expanded = Array.isArray(raw.expanded) ? raw.expanded : [];
          var id = card.dataset.cardId;
          if (on) { if (raw.expanded.indexOf(id) < 0) raw.expanded.push(id); }
          else raw.expanded = raw.expanded.filter(function (x) { return x !== id; });
          localStorage.setItem('wdv2Prefs', JSON.stringify(raw));
        } catch (_) {}
      });
      card.appendChild(b);
    }

    function sweep() {
      ids.forEach(function (id) { attach(document.querySelector('[data-card-id="' + id + '"]')); });
    }
    sweep();
    var band = document.querySelector('[data-band="analysis"]');
    if (band) new MutationObserver(sweep).observe(band, { childList: true, subtree: true });
    setInterval(sweep, 2000);
  }

  /* ---------------------------------------------------------------------
     7. Marketing Studio card: restore its gradient treatment.
     --------------------------------------------------------------------- */
  function restoreMarketing() {
    var card = document.querySelector('[data-card-id="marketing"]');
    if (!card) return;
    card.classList.add('wdv2-marketing-card');
    var link = card.querySelector('.wd5-marketing-link');
    if (link) link.classList.add('wdv2-marketing-link');
  }

  /* ---------------------------------------------------------------------
     8. Drill-down: clicking a municipality row filters the portfolio table.
     --------------------------------------------------------------------- */
  function muniDrilldown() {
    var muni = document.querySelector('[data-card-id="municipality"]');
    var props = document.querySelector('[data-card-id="properties"]');
    if (!muni || !props || muni.dataset.wdv2Drill === '1') return;
    var tbody = props.querySelector('tbody');
    if (!tbody) return;

    muni.addEventListener('click', function (ev) {
      var tr = ev.target.closest('tr');
      if (!tr || tr.closest('thead')) return;
      var name = (tr.children[0] && tr.children[0].textContent || '').trim().toUpperCase();
      if (!name) return;
      var active = props.dataset.wdv2Filter === name;
      props.dataset.wdv2Filter = active ? '' : name;
      tbody.querySelectorAll('tr').forEach(function (row) {
        var town = (row.getAttribute('data-town') || (row.children[1] && row.children[1].textContent) || '').trim().toUpperCase();
        row.hidden = active ? false : town !== name;
      });
      var chip = document.getElementById('wdv2-filter-chip');
      if (chip) {
        var span = chip.querySelector('span');
        if (active) chip.classList.remove('open');
        else { chip.classList.add('open'); if (span) span.textContent = titleCase(name); }
        var btn = chip.querySelector('button');
        if (btn && !btn.dataset.wdv2Bound) {
          btn.dataset.wdv2Bound = '1';
          btn.addEventListener('click', function () {
            props.dataset.wdv2Filter = '';
            tbody.querySelectorAll('tr').forEach(function (r) { r.hidden = false; });
            chip.classList.remove('open');
          });
        }
      }
    });
    muni.dataset.wdv2Drill = '1';
  }

  ready(function () {
    pinPartner();
    fixScoreSpark();
    restoreMarketing();
    keepExpandButtons();
    sortablePortfolio();
    scoringState();
    muniDrilldown();
    // County data may arrive slightly after mount; retry briefly.
    var tries = 0;
    var t = setInterval(function () {
      buildDonut();
      if (++tries > 40 || document.querySelector('[data-card-id="county-extra"][data-wdv2-donut="1"]')) clearInterval(t);
    }, 250);
  });
})();
