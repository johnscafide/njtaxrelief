// Search box for the /co lookup, its town and county pages and the embedded lookup.
// Finds a town from a name, mailing name, ZIP or street address (NJ geocoder), then opens that
// town's page: /co/<county>/<town> (or /co/embed/<county>/<town> inside the embed).
// Slugs match api/_co-town.js and the /towns reports.
(function () {
  'use strict';

  var BASE = window.CO_BASE || '/co';

  var NJ_GEOCODE = 'https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
  var TYPES = /\s+(township|borough|city|town|village)$/;
  var out = document.getElementById('out');
  if (!document.getElementById('search-tpl') || !out) return;
  var data = null, towns = [], byCode = {}, aliasList = [];
  var dataReady = fetch('/co/towns.json').then(function (r) { return r.json(); }).then(function (d) {
    data = d;
    towns = d.towns.map(function (t) {
      var o = { code: t.c, name: t.n, county: t.k, full: norm(t.n), base: base(t.n) };
      byCode[t.c] = o;
      return o;
    });
    aliasList = Object.keys(d.aliases).map(function (name) { return { name: name, key: norm(name), codes: d.aliases[name] }; });
  });

  // ---------- text helpers ----------
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[.'’]/g, '').replace(/[^a-z0-9]+/g, ' ')
      .replace(/\btwp\b/g, 'township').replace(/\bboro\b/g, 'borough').replace(/\bmt\b/g, 'mount')
      .replace(/\bft\b/g, 'fort').replace(/\bpt\b/g, 'point').replace(/\s+/g, ' ').trim();
  }
  function base(s) {
    var n = norm(s).replace(/^(township|borough|city|town|village) of /, '');
    return n.replace(TYPES, '').trim() || n;
  }
  function stripState(q) { return q.replace(/,?\s*(nj|new jersey)\s*(\d{5}(-\d{4})?)?\s*$/i, function (m, s, zip) { return zip ? ' ' + zip : ''; }).trim(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function countyLabel(c) { return String(c || '').toLowerCase().replace(/\b[a-z]/g, function (m) { return m.toUpperCase(); }) + ' County'; }

  // ---------- matching ----------
  function townsByName(q) {
    var county = null, k = q;
    var parts = q.split(',');
    if (parts.length > 1) {
      var tail = norm(parts.slice(1).join(' ')).replace(/\s*county$/, '');
      if (towns.some(function (t) { return norm(t.county) === tail; })) { county = tail; k = parts[0]; }
    }
    var full = norm(k);
    var b = base(k);
    var pool = county ? towns.filter(function (t) { return norm(t.county) === county; }) : towns;
    var exact = pool.filter(function (t) { return t.full === full; });
    if (exact.length) return exact;
    return pool.filter(function (t) { return t.base === b; });
  }
  function aliasByName(q) {
    var key = norm(q.split(',')[0]);
    return aliasList.filter(function (a) { return a.key === key; });
  }
  function suggestions(q) {
    q = stripState(q);
    var n = norm(q);
    if (!n) return [];
    if (/^\d{3,5}$/.test(n)) {
      return Object.keys(data.zips).filter(function (z) { return z.indexOf(n) === 0; }).slice(0, 6).map(function (z) {
        var list = data.zips[z].map(function (c) { return byCode[c].name; });
        return { kind: 'zip', zip: z, label: z, meta: list.slice(0, 3).join(', ') + (list.length > 3 ? '…' : '') };
      });
    }
    if (/\d/.test(n)) return [];
    var starts = [], contains = [];
    towns.forEach(function (t) {
      if (t.full.indexOf(n) === 0 || t.base.indexOf(n) === 0) starts.push(t);
      else if (n.length > 2 && t.full.indexOf(' ' + n) > -1) contains.push(t);
    });
    var items = starts.concat(contains).slice(0, 7).map(function (t) { return { kind: 'town', code: t.code, label: t.name, meta: countyLabel(t.county) }; });
    aliasList.forEach(function (a) {
      if (a.key.indexOf(n) === 0 && items.length < 8) {
        var names = a.codes.map(function (c) { return byCode[c].name; });
        items.push({ kind: 'alias', alias: a, label: a.name, meta: names.join(', ') });
      }
    });
    return items.slice(0, 8);
  }

  function geocode(address) {
    var p = new URLSearchParams({ SingleLine: address, outFields: 'City,Zone,Subregion', outSR: '4326', maxLocations: '1', f: 'json' });
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 9000) : null;
    return fetch(NJ_GEOCODE + '?' + p, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (timer) clearTimeout(timer);
        var c = d && d.candidates && d.candidates[0];
        if (!c || Number(c.score) < 80) return null;
        var a = c.attributes || {};
        var county = norm(a.Subregion), zone = norm(a.Zone);
        var pool = towns.filter(function (t) { return norm(t.county) === county; });
        var hit = pool.filter(function (t) { return t.full === zone; });
        if (hit.length !== 1) hit = pool.filter(function (t) { return t.base === base(a.Zone); });
        if (hit.length !== 1) return null;
        return { town: hit[0], city: a.City || '', matched: c.address || '' };
      })
      .catch(function () { if (timer) clearTimeout(timer); return null; });
  }

  // ---------- search boxes (home and top bar share the same text) ----------
  var boxes = [];
  Array.prototype.forEach.call(document.querySelectorAll('[data-search]'), function (el, i) {
    el.appendChild(document.getElementById('search-tpl').content.cloneNode(true));
    var input = el.querySelector('input'), list = el.querySelector('.suggest'), clear = el.querySelector('.clear');
    var id = 'q' + i;
    input.id = id; el.querySelector('label').setAttribute('for', id);
    list.id = 'sug' + i; input.setAttribute('aria-controls', list.id);
    var b = { el: el, input: input, list: list, items: [], active: -1 };
    boxes.push(b);

    function close() { el.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); b.active = -1; }
    function paint() {
      list.innerHTML = b.items.map(function (it, j) {
        return '<li role="option" id="' + list.id + '-' + j + '" aria-selected="' + (j === b.active) + '" data-j="' + j + '"><span class="s-name">' + esc(it.label) + '</span><span class="s-meta">' + esc(it.meta) + '</span></li>';
      }).join('');
      if (b.active > -1) input.setAttribute('aria-activedescendant', list.id + '-' + b.active); else input.removeAttribute('aria-activedescendant');
    }
    function refresh() {
      el.classList.toggle('has-text', !!input.value);
      if (!data) return;
      b.items = suggestions(input.value);
      b.active = -1;
      if (!b.items.length || document.activeElement !== input) return close();
      paint();
      el.classList.add('open'); input.setAttribute('aria-expanded', 'true');
    }
    b.close = close;
    input.addEventListener('input', function () { boxes.forEach(function (o) { if (o !== b) { o.input.value = input.value; o.el.classList.toggle('has-text', !!input.value); } }); refresh(); });
    input.addEventListener('focus', refresh);
    input.addEventListener('blur', function () { setTimeout(close, 150); });
    input.addEventListener('keydown', function (e) {
      var open = el.classList.contains('open');
      if (e.key === 'ArrowDown' && open) { b.active = (b.active + 1) % b.items.length; paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp' && open) { b.active = b.active <= 0 ? b.items.length - 1 : b.active - 1; paint(); e.preventDefault(); }
      else if (e.key === 'Escape') { close(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (open && b.active > -1) pick(b.items[b.active]); else run(input.value);
        close();
      }
    });
    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest('li');
      if (!li) return;
      e.preventDefault();
      pick(b.items[+li.getAttribute('data-j')]);
      close();
    });
    clear.addEventListener('click', function () { setText(''); input.focus(); });
    if (el.tagName === 'FORM') el.addEventListener('submit', function (e) { e.preventDefault(); run(input.value); close(); });
  });
  function setText(v) { boxes.forEach(function (b) { b.input.value = v; b.el.classList.toggle('has-text', !!v); }); }

  function pick(it) {
    if (!it) return;
    measure('search', { search_term: String(it.label).slice(0, 100), search_type: it.kind === 'zip' ? 'zip' : 'town', via: 'suggestion' });
    setText(it.label);
    if (it.kind === 'town') return go(byCode[it.code]);
    if (it.kind === 'alias') return showChoices(it.alias.codes, aliasIntro(it.alias.name, it.alias.codes));
    if (it.kind === 'zip') return run(it.zip);
  }
  function aliasIntro(name, codes) {
    return codes.length === 1 ? '' : esc(name) + ' is a mailing name. Pick the town:';
  }


  // ---------- measurement ----------
  // What people search for and what they get back. Google Analytics gets the standard `search`
  // event (Reports > Engagement > Events > search > search_term) once a visitor accepts cookies;
  // Clarity gets the same as custom tags; Watchdog's first-party analytics counts lookups by town.
  // House numbers are dropped from address searches so no full street address is sent.
  function searchTerm(q, kind) {
    var t = String(q || '').trim().replace(/\s+/g, ' ');
    if (kind === 'address') t = t.replace(/^\s*\d+[a-z]?(-\d+)?\s+/i, '');
    return t.slice(0, 100);
  }
  function kindOf(q) {
    var s = stripState(String(q || '').trim());
    if (/^\d{5}(-\d{4})?$/.test(s)) return 'zip';
    if (/\d/.test(s) && /[a-z]/i.test(s)) return 'address';
    return 'town';
  }
  function measure(name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params); } catch (_) {}
    try {
      if (typeof window.clarity === 'function') {
        window.clarity('event', name);
        Object.keys(params).forEach(function (k) { if (params[k] !== '' && params[k] != null) window.clarity('set', 'co_' + k, String(params[k])); });
      }
    } catch (_) {}
  }
  function trackSearch(q) {
    var kind = kindOf(q);
    measure('search', { search_term: searchTerm(q, kind), search_type: kind });
  }
  function trackMiss(q) {
    var kind = kindOf(q);
    measure('co_search_no_result', { search_term: searchTerm(q, kind), search_type: kind });
  }

  // ---------- running a search ----------
  var seq = 0;
  function run(raw) {
    var q = String(raw || '').trim();
    if (!q) return;
    trackSearch(q);
    var mine = ++seq;
    dataReady.then(function () {
      if (mine !== seq) return;
      var s = stripState(q);
      var zipOnly = /^(\d{5})(-\d{4})?$/.exec(s);
      if (zipOnly) return showZip(zipOnly[1]);
      if (/\d/.test(s) && /[a-z]/i.test(s)) return runAddress(q, s, mine);
      var hits = townsByName(s), aliases = aliasByName(s);
      var codes = hits.map(function (t) { return t.code; });
      aliases.forEach(function (a) { a.codes.forEach(function (c) { if (codes.indexOf(c) < 0) codes.push(c); }); });
      if (codes.length === 1) {
        var only = byCode[codes[0]];
        return go(only, aliases.length && !hits.length ? { city: aliases[0].name } : null);
      }
      if (codes.length > 1) {
        var intro = aliases.length && !hits.length ? aliasIntro(aliases[0].name, codes)
          : 'Pick a town:';
        return showChoices(codes, intro);
      }
      var sug = suggestions(s).filter(function (x) { return x.kind === 'town'; }).map(function (x) { return x.code; });
      if (sug.length) return showChoices(sug, 'Did you mean:');
      trackMiss(q);
      render('<p class="msg">No New Jersey town found for “' + esc(q) + '”.</p>');
    });
  }
  function runAddress(q, s, mine) {
    render('<p class="msg">Searching…</p>');
    geocode(/\bnj\b|new jersey/i.test(q) ? q : q + ', NJ').then(function (g) {
      if (mine !== seq) return;
      if (g) return go(g.town, { city: g.city });
      var zip = /\b(\d{5})(-\d{4})?\s*$/.exec(s);
      if (zip && data.zips[zip[1]]) return showZip(zip[1], 'Address not found. Towns in ZIP ' + zip[1] + ':');
      var tail = s.split(',').slice(1).join(',').trim();
      if (tail) {
        var hits = townsByName(tail).map(function (t) { return t.code; });
        aliasByName(tail).forEach(function (a) { a.codes.forEach(function (c) { if (hits.indexOf(c) < 0) hits.push(c); }); });
        if (hits.length) return showChoices(hits, 'Address not found. Pick a town:');
      }
      trackMiss(q);
      render('<p class="msg">Address not found. Try adding the town, or type just the town.</p>');
    });
  }
  function showZip(zip, intro) {
    var codes = data.zips[zip];
    if (!codes) return render('<p class="msg">No New Jersey towns found for ZIP ' + esc(zip) + '.</p>');
    if (codes.length === 1) return go(byCode[codes[0]]);
    showChoices(codes, intro || 'ZIP ' + esc(zip) + ' covers more than one town. Pick one:');
  }
  function showChoices(codes, intro) {
    var html = '<p>' + intro + '</p><div class="choices">' + codes.map(function (c) {
      var t = byCode[c];
      return '<button class="choice" type="button" data-code="' + c + '"><strong>' + esc(t.name) + '</strong><span>' + esc(countyLabel(t.county)) + '</span></button>';
    }).join('') + '</div>';
    render(html);
    Array.prototype.forEach.call(out.querySelectorAll('.choice'), function (btn) {
      btn.addEventListener('click', function () { var t = byCode[btn.getAttribute('data-code')]; setText(t.name); go(t); });
    });
  }

  // ---------- opening a town ----------
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function townUrl(t, ctx) {
    var u = BASE + '/' + slug(t.county) + '/' + slug(t.name);
    var city = ctx && ctx.city;
    if (city && norm(city) !== t.full && norm(city) !== t.base) u += '?city=' + encodeURIComponent(city);
    return u;
  }
  function go(t, ctx) {
    if (!t) return;
    seq++;
    render('<p class="msg">Loading ' + esc(t.name) + '…</p>');
    location.href = townUrl(t, ctx);
  }

  // ---------- page state ----------
  function render(html) {
    document.body.classList.add('results');
    out.innerHTML = html;
  }
  var start = new URLSearchParams(location.search);
  var startCode = start.get('town'), startQ = start.get('q');
  if (startCode && /^\d{4}$/.test(startCode)) {
    // Old /co?town=0713 links open the town's own page.
    dataReady.then(function () { var t = byCode[startCode]; if (t) location.replace(townUrl(t)); });
  } else if (startQ) {
    setText(startQ); run(startQ);
  } else if (!document.body.classList.contains('results') && window.parent === window && window.matchMedia('(min-width: 641px)').matches && boxes[1]) {
    boxes[1].input.focus();
  }
})();
