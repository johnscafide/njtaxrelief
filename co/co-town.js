// Town pages for the /co lookup (/co/<county>/<town>, the client checklist and the embedded
// lookup): share buttons, "Was this helpful?" votes, Add CO Requirements / Report a correction,
// and measurement. The page's <main data-co-town> carries the town (see api/_co-pages.js).
(function () {
  'use strict';

  var root = document.querySelector('[data-co-town]');
  if (!root) return;
  var town = {
    code: root.getAttribute('data-code'),
    name: root.getAttribute('data-name'),
    county: root.getAttribute('data-county'),
    status: root.getAttribute('data-status'),
    url: root.getAttribute('data-url'),
    surface: root.getAttribute('data-surface') || 'page'
  };

  // ---------- measurement ----------
  // Google Analytics (after cookie consent) and Clarity get named events; Watchdog's first-party
  // analytics gets tool_open with an action. Shared links carry utm_source=share and
  // utm_medium=<how> (copy, text, facebook, linkedin, native), so visits from shares show up
  // as their own source.
  function measure(name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params); } catch (_) {}
    try {
      if (typeof window.clarity === 'function') {
        window.clarity('event', name);
        Object.keys(params).forEach(function (k) { if (params[k] !== '' && params[k] != null) window.clarity('set', 'co_' + k, String(params[k])); });
      }
    } catch (_) {}
  }
  function firstParty(action, source, status) {
    try { if (window.WatchdogAnalytics) window.WatchdogAnalytics.track('tool_open', { tool: 'co_lookup', action: action, scope: town.code, source: source || town.surface, status: status || '' }); } catch (_) {}
  }
  function base() { return { town: town.name, county: town.county, town_code: town.code, surface: town.surface }; }
  function withBase(extra) { var o = base(); Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }

  if (town.surface === 'checklist') {
    measure('co_checklist_view', base());
    window.addEventListener('load', function () { firstParty('checklist_view'); });
  } else {
    measure('co_town_result', withBase({ result: town.status }));
    // product-analytics.js loads deferred too; wait for it.
    window.addEventListener('load', function () { firstParty('town_result', town.surface, town.status); });
  }

  // ---------- toast ----------
  var toastEl = document.querySelector('[data-toast]'), toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2200);
  }

  // ---------- share ----------
  function shareLink(medium) {
    var u = new URL(town.url);
    u.searchParams.set('utm_source', 'share');
    u.searchParams.set('utm_medium', medium);
    u.searchParams.set('utm_campaign', 'co_town');
    if (town.surface !== 'page') u.searchParams.set('utm_content', town.surface);
    return u.toString();
  }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); } finally { ta.remove(); }
    });
  }
  function trackShare(method) {
    measure('share', withBase({ method: method, content_type: 'co_town', item_id: town.code }));
    measure('co_share', withBase({ method: method }));
    firstParty('share', method);
  }
  var nativeBtn = document.querySelector('[data-share-native]');
  if (nativeBtn && navigator.share) {
    nativeBtn.hidden = false;
    nativeBtn.addEventListener('click', function () {
      navigator.share({ title: town.name + ' resale CO requirements', text: town.name + ' resale CO and smoke/CO certificate requirements', url: shareLink('native') })
        .then(function () { trackShare('native'); })
        .catch(function () {});
    });
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-share]');
    if (el && el.hasAttribute('data-share')) {
      var method = el.getAttribute('data-share');
      if (method === 'copy') {
        e.preventDefault();
        copy(el.getAttribute('data-url') || shareLink('copy')).then(function () { toast('Link copied'); }, function () { toast('Couldn’t copy. Copy the address bar instead.'); });
      }
      trackShare(method);
      return;
    }
    if (e.target.closest('[data-print]')) {
      measure('co_checklist_open', base());
      firstParty('checklist_open');
      return;
    }
    if (e.target.closest('[data-print-now]')) {
      measure('co_checklist_print', base());
      firstParty('checklist_print', 'checklist');
      window.print();
    }
  });

  // ---------- Was this helpful? ----------
  var votesEl = document.querySelector('[data-votes]');
  var summaryEl = document.querySelector('[data-helpful-summary]');
  var VOTE_KEY = 'wd_co_votes', CLIENT_KEY = 'wd_co_voter';
  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (_) { return null; }
    return val;
  }
  function myVotes() { try { return JSON.parse(store(VOTE_KEY) || '{}') || {}; } catch (_) { return {}; } }
  function clientId() {
    var id = store(CLIENT_KEY);
    if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2, 14);
      store(CLIENT_KEY, id);
    }
    return id;
  }
  function paint(counts, mine) {
    if (!votesEl) return;
    Array.prototype.forEach.call(votesEl.querySelectorAll('[data-vote]'), function (b) {
      var v = +b.getAttribute('data-vote');
      var on = mine === v;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (counts) {
      votesEl.querySelector('[data-score]').textContent = counts.up - counts.down;
      if (summaryEl) summaryEl.textContent = counts.up > 0 ? ' · ' + counts.up + (counts.up === 1 ? ' person' : ' people') + ' found this helpful' : '';
    }
  }
  if (votesEl) {
    var counts = null, mine = myVotes()[town.code] || 0;
    paint(null, mine);
    fetch('/api/co-feedback?code=' + encodeURIComponent(town.code))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) { counts = d; paint(counts, mine); } })
      .catch(function () {});
    votesEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-vote]');
      if (!b) return;
      var v = +b.getAttribute('data-vote');
      var next = mine === v ? 0 : v;
      var prev = mine;
      // Show the change right away; the server's count replaces it.
      if (counts) {
        if (prev === 1) counts.up--; if (prev === -1) counts.down--;
        if (next === 1) counts.up++; if (next === -1) counts.down++;
      }
      mine = next;
      paint(counts, mine);
      if (next === 1) toast('Thanks! Glad it helped.');
      else if (next === -1) toast('Thanks. Tell us what’s off with Report a correction.');
      fetch('/api/co-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: town.code, vote: next, client: clientId() }) })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d) return;
          counts = { up: d.up, down: d.down };
          paint(counts, mine);
          var all = myVotes();
          if (mine) all[town.code] = mine; else delete all[town.code];
          store(VOTE_KEY, JSON.stringify(all));
        })
        .catch(function () {});
      var label = next === 1 ? 'helpful' : next === -1 ? 'not_helpful' : 'cleared';
      measure('co_vote', withBase({ vote: label }));
      firstParty('vote', label);
    });
  }

  // ---------- Add CO Requirements / Report a correction (both go to the Back Office town-info queue) ----------
  var NEED_KEYS = ['co_required', 'co_fee', 'co_contact', 'fire_fee', 'fire_contact'];
  var EXT_TYPES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
  var MAX_BYTES = 10 * 1024 * 1024;
  var dlg = document.getElementById('add-dlg'), addForm = document.getElementById('add-form');
  var openedAt = 0, fixing = false;
  function fileType(file) {
    var t = String(file.type || '').toLowerCase();
    if (t && Object.keys(EXT_TYPES).some(function (k) { return EXT_TYPES[k] === t; })) return t;
    return EXT_TYPES[String(file.name || '').split('.').pop().toLowerCase()] || '';
  }
  function formStatus(msg, kind) { var el = addForm.querySelector('.formstatus'); el.textContent = msg; el.className = 'formstatus' + (kind ? ' ' + kind : ''); }
  function postNeeds(body) {
    return fetch('/api/watchdog-town-needs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.'); return j; }); });
  }
  function uploadFile(url, file, type) {
    var fd = new FormData();
    fd.append('cacheControl', '3600');
    fd.append('', new Blob([file], { type: type }), file.name || 'document');
    return fetch(url, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: fd }).then(function (r) { if (!r.ok) throw new Error('The upload didn’t finish. Please try again.'); });
  }
  function openAdd(t, fix) {
    openedAt = Date.now(); fixing = !!fix;
    measure(fixing ? 'co_correction_open' : 'co_add_requirements_open', { town: t.name, town_code: t.code });
    addForm.reset(); formStatus('', '');
    document.getElementById('add-title').textContent = fixing ? 'Report a correction' : 'Add CO Requirements';
    addForm.querySelector('[data-doc-label]').textContent = fixing ? 'Town document that shows the right info' : 'Town document';
    Array.prototype.forEach.call(addForm.querySelectorAll('[data-fix-only]'), function (el) { el.hidden = !fixing; });
    Array.prototype.forEach.call(addForm.querySelectorAll('[data-add-only]'), function (el) { el.hidden = fixing; });
    addForm.querySelector('.send').disabled = false;
    document.getElementById('add-town').textContent = t.name + ', ' + t.county;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function closeAdd() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
  document.addEventListener('click', function (e) {
    if (!dlg) return;
    if (e.target.closest('[data-add]')) openAdd(town, false);
    else if (e.target.closest('[data-fix]')) openAdd(town, true);
  });
  if (addForm) addForm.querySelector('.cancel').addEventListener('click', closeAdd);
  if (addForm) addForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = addForm.elements, t = town;
    var file = f.file.files && f.file.files[0] || null;
    var link = String(f.source_url.value || '').trim();
    var problem = String(f.problem.value || '').trim();
    if (fixing && !problem) return formStatus('Tell us what’s wrong.', 'error');
    if (!file && !link) return formStatus('Add the town’s document or a link to the town’s page.', 'error');
    if (link && !/^https:\/\/[^\s]+\.[^\s]+/i.test(link)) return formStatus('The link must start with https://.', 'error');
    var type = file ? fileType(file) : '';
    if (file && !type) return formStatus('Upload a PDF or a photo (JPG, PNG, WebP or HEIC).', 'error');
    if (file && file.size > MAX_BYTES) return formStatus('The file must be 10 MB or smaller.', 'error');
    var send = addForm.querySelector('.send');
    send.disabled = true;
    formStatus(file ? 'Uploading…' : 'Sending…', '');
    postNeeds({
      action: 'start', code: t.code, needs: fixing ? ['correction'] : NEED_KEYS, answer: fixing ? problem : f.answer.value, source_url: link,
      file: file ? { name: file.name, type: type, size: file.size } : null,
      name: f.name.value, email: f.email.value, role: f.role.value,
      website: f.website.value, elapsed_ms: Date.now() - openedAt
    }).then(function (res) {
      if (!file || !res.upload_url) return res;
      return uploadFile(res.upload_url, file, type).then(function () { return postNeeds({ action: 'finish', id: res.id }); });
    }).then(function () {
      formStatus('Thanks, it’s in. We’ll check it before it goes live.', '');
      measure(fixing ? 'co_correction_submitted' : 'co_requirements_submitted', { town: t.name, town_code: t.code });
      setTimeout(closeAdd, 1800);
    }).catch(function (err) {
      send.disabled = false;
      formStatus(err.message || 'Something went wrong. Please try again.', 'error');
    });
  });

})();
