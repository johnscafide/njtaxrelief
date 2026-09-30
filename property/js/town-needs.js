/* Town Needs (/town-needs): lists the red-flag towns from town-needs.json and takes submissions
   through /api/watchdog-town-needs. Page copy lives in property/town-needs/index.html; this file
   only fills in town data and form state. A file goes straight to private storage through the
   one-time upload URL the API returns, then the API checks it. */
(function () {
  'use strict';
  var DATA_URL = '/property/data/municipal-requirements/town-needs.json?v=20260930a';
  var API = '/api/watchdog-town-needs';
  var MAX_BYTES = 10 * 1024 * 1024;
  var EXT_TYPES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
  var data = null, openedAt = {};
  var $ = function (id) { return document.getElementById(id); };

  function fileType(file) {
    var t = String(file.type || '').toLowerCase();
    if (t && Object.keys(EXT_TYPES).some(function (k) { return EXT_TYPES[k] === t; })) return t;
    var ext = String(file.name || '').split('.').pop().toLowerCase();
    return EXT_TYPES[ext] || '';
  }
  function status(form, message, kind) {
    var el = form.querySelector('.tn-form-status');
    el.textContent = message;
    el.className = 'tn-form-status' + (kind ? ' ' + kind : '');
  }
  function post(body) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.'); return j; }); });
  }
  function upload(url, file, type) {
    var form = new FormData();
    form.append('cacheControl', '3600');
    form.append('', new Blob([file], { type: type }), file.name || 'document');
    return fetch(url, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: form }).then(function (r) { if (!r.ok) throw new Error('The upload didn’t finish. Please try again.'); });
  }

  function townCard(t) {
    var node = $('tn-town-template').content.firstElementChild.cloneNode(true);
    node.id = 'town-' + t.code;
    node.dataset.code = t.code;
    node.querySelector('.tn-town-name').textContent = t.town;
    node.querySelector('.tn-town-meta').textContent = t.county + ' County';
    var list = node.querySelector('.tn-missing');
    t.needs.forEach(function (k) {
      var li = document.createElement('li');
      li.textContent = (data.needs[k] || {}).label || k;
      list.appendChild(li);
    });
    var button = node.querySelector('.tn-help');
    button.setAttribute('aria-controls', 'form-' + t.code);
    button.addEventListener('click', function () { toggleForm(node, t); });
    return node;
  }

  function toggleForm(card, t) {
    var host = card.querySelector('.tn-form-host'), button = card.querySelector('.tn-help');
    if (host.firstElementChild) {
      host.replaceChildren();
      button.setAttribute('aria-expanded', 'false');
      return;
    }
    var form = $('tn-form-template').content.firstElementChild.cloneNode(true);
    form.id = 'form-' + t.code;
    var set = form.querySelector('.tn-needs');
    t.needs.forEach(function (k, i) {
      var need = data.needs[k] || { label: k, hint: '' };
      var label = document.createElement('label');
      label.className = 'tn-check';
      var box = document.createElement('input');
      box.type = 'checkbox'; box.name = 'needs'; box.value = k; box.checked = t.needs.length === 1 || i === 0;
      var text = document.createElement('span');
      var b = document.createElement('b'); b.textContent = need.label;
      var small = document.createElement('small'); small.textContent = need.hint;
      text.appendChild(b); text.appendChild(small);
      label.appendChild(box); label.appendChild(text);
      set.appendChild(label);
    });
    form.querySelector('.tn-cancel').addEventListener('click', function () { toggleForm(card, t); button.focus(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); send(form, card, t); });
    host.appendChild(form);
    button.setAttribute('aria-expanded', 'true');
    openedAt[t.code] = Date.now();
    var first = form.querySelector('input[name="needs"]');
    if (first) first.focus();
  }

  function send(form, card, t) {
    var needs = Array.prototype.slice.call(form.querySelectorAll('input[name="needs"]:checked')).map(function (x) { return x.value; });
    var file = form.elements.file.files && form.elements.file.files[0] || null;
    var link = String(form.elements.source_url.value || '').trim();
    if (!needs.length) return status(form, 'Pick at least one item you can help with.', 'error');
    if (!file && !link) return status(form, 'Add the town’s document or a link to the town’s page.', 'error');
    if (link && !/^https:\/\/[^\s]+\.[^\s]+/i.test(link)) return status(form, 'The link must start with https://.', 'error');
    var type = file ? fileType(file) : '';
    if (file && !type) return status(form, 'Upload a PDF or a photo (JPG, PNG, WebP or HEIC).', 'error');
    if (file && file.size > MAX_BYTES) return status(form, 'The file must be 10 MB or smaller.', 'error');
    var submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    status(form, file ? 'Uploading…' : 'Sending…', '');
    post({
      action: 'start', code: t.code, needs: needs, answer: form.elements.answer.value, source_url: link,
      file: file ? { name: file.name, type: type, size: file.size } : null,
      name: form.elements.name.value, email: form.elements.email.value, role: form.elements.role.value,
      website: form.elements.website.value, elapsed_ms: Date.now() - (openedAt[t.code] || Date.now())
    }).then(function (res) {
      if (!file || !res.upload_url) return res;
      return upload(res.upload_url, file, type).then(function () { return post({ action: 'finish', id: res.id }); });
    }).then(function () {
      var host = card.querySelector('.tn-form-host');
      host.replaceChildren($('tn-done-template').content.firstElementChild.cloneNode(true));
      card.querySelector('.tn-help').setAttribute('aria-expanded', 'false');
      card.querySelector('.tn-help').focus();
    }).catch(function (err) {
      submit.disabled = false;
      status(form, err.message, 'error');
    });
  }

  function render() {
    var q = String($('tn-search').value || '').trim().toLowerCase(), county = $('tn-county').value;
    var towns = data.towns.filter(function (t) { return (!county || t.county === county) && (!q || t.town.toLowerCase().indexOf(q) >= 0); });
    var list = $('tn-list');
    list.replaceChildren.apply(list, towns.map(townCard));
    $('tn-empty').hidden = towns.length > 0;
    $('tn-count').textContent = towns.length === data.towns.length ? data.towns.length + ' towns' : towns.length + ' of ' + data.towns.length + ' towns';
  }

  function start() {
    fetch(DATA_URL, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); }).then(function (json) {
      data = json;
      var counties = Array.from(new Set(data.towns.map(function (t) { return t.county; }))).sort();
      var select = $('tn-county');
      counties.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; select.appendChild(o); });
      $('tn-search').addEventListener('input', render);
      select.addEventListener('change', render);
      render();
      // /town-needs?town=0406 opens that town's form (for links from the call sheet or a closing page).
      var code = new URLSearchParams(location.search).get('town');
      var card = code && document.getElementById('town-' + code.replace(/\D/g, '').slice(0, 4));
      if (card) { card.scrollIntoView({ block: 'start' }); card.querySelector('.tn-help').click(); }
    }).catch(function () {
      $('tn-count').textContent = '';
      $('tn-error').hidden = false;
    });
    fetch('/property/partials/footer.html').then(function (r) { return r.ok ? r.text() : ''; }).then(function (html) {
      var host = $('tn-footer');
      if (!host || !html) return;
      // content-architecture: dynamic — the shared site footer partial.
      host.innerHTML = html;
      host.querySelectorAll('script').forEach(function (old) {
        var s = document.createElement('script');
        Array.prototype.forEach.call(old.attributes, function (a) { s.setAttribute(a.name, a.value); });
        s.textContent = old.textContent;
        old.replaceWith(s);
      });
    }).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
