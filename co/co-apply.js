// /co/<county>/<town>/apply: fills in the town's own CO application PDF in the browser.
// The field map comes from property/data/co-application-forms.json (inlined as #co-form by
// api/_co-pages.js); the blank PDF comes from /api/co-form-template, checked against its pinned hash.
// Nothing typed here is sent to Watchdog or saved.
(function (root) {
  'use strict';

  var ROLE_LABEL = { seller: 'Seller', agent: 'Seller\'s agent', buyer: 'Buyer', buyer_agent: 'Buyer\'s agent', other: '' };
  var ROLE_FROM = { seller: 'owner', agent: 'agent', buyer: 'buyer', buyer_agent: 'buyer_agent' };
  var DERIVED = {
    today: [],
    address_full: ['address', 'unit'],
    city_zip: ['city', 'zip'],
    owner_street: ['owner_address', 'address', 'unit'],
    owner_city_zip_full: ['owner_city_zip', 'city', 'zip'],
    owner_address_full: ['owner_address', 'owner_city_zip', 'address', 'unit', 'city', 'zip'],
    owner_mailing: ['owner_address', 'owner_city_zip'],
    buyer_address_full: ['buyer_address', 'buyer_city_zip'],
    vacant_yn: ['occupancy'],
    lockbox_yn: ['lockbox'],
    access_name: ['access_name'],
    access_phone: ['access_phone'],
    applicant_name: ['applicant_role', 'applicant_name'],
    applicant_phone: ['applicant_role', 'applicant_phone'],
    applicant_email: ['applicant_role', 'applicant_email'],
    applicant_name_title: ['applicant_role', 'applicant_name']
  };

  function clean(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function join(parts, sep) { return parts.map(clean).filter(Boolean).join(sep == null ? ', ' : sep); }
  function usDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(v));
    return m ? m[2] + '/' + m[3] + '/' + m[1] : clean(v);
  }
  function todayUs(now) {
    var d = now || new Date();
    return ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + d.getDate()).slice(-2) + '/' + d.getFullYear();
  }

  // Every answer the PDF can use, including the combined ones (full address, "you", and so on).
  function values(a, now) {
    a = a || {};
    var v = {};
    Object.keys(a).forEach(function (k) { v[k] = clean(a[k]); });
    v.settlement_date = usDate(a.settlement_date);
    v.today = todayUs(now);
    v.address_full = join([v.address, v.unit ? 'Unit ' + v.unit : '']);
    v.city_zip = join([v.city, join(['NJ', v.zip], ' ')]);
    if (!v.city && !v.zip) v.city_zip = '';
    var mailing = !!(v.owner_address || v.owner_city_zip);
    v.owner_street = mailing ? v.owner_address : v.address_full;
    v.owner_city_zip_full = mailing ? v.owner_city_zip : v.city_zip;
    v.owner_address_full = mailing ? join([v.owner_address, v.owner_city_zip]) : join([v.address_full, v.city_zip]);
    v.owner_mailing = mailing ? join([v.owner_address, v.owner_city_zip]) : '';
    v.buyer_address_full = join([v.buyer_address, v.buyer_city_zip]);
    v.vacant_yn = v.occupancy ? (v.occupancy === 'vacant' ? 'Yes' : 'No') : '';
    v.lockbox_yn = v.lockbox ? 'Yes' : '';
    var from = ROLE_FROM[v.applicant_role];
    if (from) {
      v.applicant_name = v[from + '_name'] || v.applicant_name || '';
      v.applicant_phone = v[from + '_phone'] || v.applicant_phone || '';
      v.applicant_email = v[from + '_email'] || v.applicant_email || '';
    }
    v.applicant_name_title = join([v.applicant_name, v.applicant_name ? ROLE_LABEL[v.applicant_role] : '']);
    if (!v.access_name && !v.access_phone) {
      var who = v.agent_name || v.agent_phone ? 'agent' : 'owner';
      v.access_name = v[who + '_name'] || '';
      v.access_phone = v[who + '_phone'] || '';
    }
    return v;
  }

  // One PDF field's text from its spec: a key, {join: [keys], sep}, {mark: key, is: value} or {text}.
  function fieldText(spec, v) {
    if (typeof spec === 'string') return v[spec] || '';
    if (!spec || typeof spec !== 'object') return '';
    if (spec.text != null) return String(spec.text);
    if (spec.join) return join(spec.join.map(function (k) { return v[k]; }), spec.sep);
    if (spec.mark) return (spec.is === '*' ? !!v[spec.mark] : v[spec.mark] === spec.is) ? 'X' : '';
    return '';
  }
  function specKeys(spec) {
    if (typeof spec === 'string') return [spec];
    if (!spec || typeof spec !== 'object') return [];
    if (spec.join) return spec.join.slice();
    if (spec.mark) return [spec.mark];
    return [];
  }
  // The questions this town's form asks, so the page only shows those.
  function askedKeys(fields, overlay) {
    var out = {};
    var specs = Object.keys(fields || {}).map(function (name) { return fields[name]; }).concat((overlay || []).map(function (o) { return o.value; }));
    specs.forEach(function (spec) {
      specKeys(spec).forEach(function (k) {
        (DERIVED[k] || [k]).forEach(function (x) { out[x] = true; });
      });
    });
    return Object.keys(out);
  }
  function fillMap(fields, v) {
    var out = {};
    Object.keys(fields || {}).forEach(function (name) {
      var text = fieldText(fields[name], v);
      if (text) out[name] = text;
    });
    return out;
  }

  function fit(field, text, font) {
    var widgets = field.acroField.getWidgets();
    var width = widgets.length ? widgets[0].getRectangle().width - 4 : 0;
    var size = 10;
    if (width > 0) while (size > 6 && font.widthOfTextAtSize(text, size) > width) size -= 0.5;
    try { field.setFontSize(size); } catch (_) {}
    var max = field.getMaxLength();
    field.setText(max ? text.slice(0, max) : text);
  }

  // Flattening can leave page links to form widgets that no longer exist, which some PDF readers flag as damaged.
  function dropDanglingAnnots(P, doc) {
    var key = P.PDFName.of('Annots');
    doc.getPages().forEach(function (page) {
      var annots = page.node.lookup(key);
      if (!(annots instanceof P.PDFArray)) return;
      var keep = annots.asArray().filter(function (ref) { return !(ref instanceof P.PDFRef) || doc.context.lookup(ref); });
      if (keep.length !== annots.size()) page.node.set(key, doc.context.obj(keep));
    });
  }

  // Fills the town's PDF in place: its own form fields (entry.fields, by field name) and text placed
  // on the page for forms without fields (entry.overlay: page index, x, y baseline and width in PDF points).
  async function fillDoc(P, doc, entry, v) {
    var form = doc.getForm();
    if (form.getFields().length !== (entry.field_count || 0) || doc.getPageCount() !== (entry.pages || doc.getPageCount())) throw new Error('changed');
    var font = await doc.embedFont(P.StandardFonts.Helvetica);
    var map = fillMap(entry.fields, v);
    Object.keys(map).forEach(function (name) {
      var field;
      try { field = form.getTextField(name); } catch (_) { throw new Error('changed'); }
      fit(field, pdfSafe(map[name]), font);
    });
    if (form.getFields().length) {
      form.updateFieldAppearances(font);
      form.flatten();
      dropDanglingAnnots(P, doc);
    }
    var pages = doc.getPages();
    (entry.overlay || []).forEach(function (o) {
      var text = pdfSafe(fieldText(o.value, v));
      var page = pages[o.page || 0];
      if (!text || !page) return;
      var size = o.size || 10;
      while (o.w && size > 6 && font.widthOfTextAtSize(text, size) > o.w) size -= 0.5;
      while (o.w && text.length > 1 && font.widthOfTextAtSize(text, size) > o.w) text = text.slice(0, -1);
      page.drawText(text, { x: o.x, y: o.y, size: size, font: font, color: P.rgb(0.05, 0.1, 0.35) });
    });
  }

  // Standard PDF fonts only cover Latin-1; swap the usual curly quotes and dashes and drop the rest.
  function pdfSafe(s) {
    return String(s).replace(/[\u2018\u2019\u201a\u2032]/g, '\'').replace(/[\u201c\u201d\u201e\u2033]/g, '"')
      .replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\u2026/g, '...').replace(/[\u00a0\u2007\u202f]/g, ' ')
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e\xa0-\xff]/g, '');
  }

  var api = { fillDoc: fillDoc, values: values, fieldText: fieldText, askedKeys: askedKeys, fillMap: fillMap, pdfSafe: pdfSafe };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WatchdogCoApply = api;
  if (typeof document === 'undefined') return;

  var main = document.querySelector('[data-co-town]');
  var dataEl = document.getElementById('co-form');
  var formEl = document.querySelector('[data-apply-form]');
  if (!main || !dataEl || !formEl) return;
  var cfg = JSON.parse(dataEl.textContent);
  var statusEl = formEl.querySelector('[data-apply-status]');
  var makeBtn = formEl.querySelector('[data-make]');
  var done = document.querySelector('[data-done]');
  var objectUrl = '';

  function track(action, status) {
    try { if (window.WatchdogAnalytics) window.WatchdogAnalytics.track('tool_open', { tool: 'co_lookup', action: action, scope: cfg.code, source: 'apply', status: status || '' }); } catch (_) {}
    try { if (typeof window.gtag === 'function') window.gtag('event', 'co_' + action, { town: cfg.town, town_code: cfg.code, status: status || '' }); } catch (_) {}
  }
  window.addEventListener('load', function () { track('apply_view'); });

  // Show only what this town's form asks for.
  var asked = {};
  askedKeys(cfg.fields, cfg.overlay).forEach(function (k) { asked[k] = true; });
  function syncQuestions() {
    var role = (formEl.elements.applicant_role || {}).value || '';
    Array.prototype.forEach.call(formEl.querySelectorAll('[data-q]'), function (q) {
      var k = q.getAttribute('data-q');
      var show = !!asked[k];
      if (/^applicant_(name|phone|email)$/.test(k)) show = show && role === 'other';
      q.hidden = !show;
    });
    Array.prototype.forEach.call(formEl.querySelectorAll('[data-group]'), function (g) {
      g.hidden = !g.querySelector('[data-q]:not([hidden])');
    });
  }
  syncQuestions();
  if (formEl.elements.applicant_role) formEl.elements.applicant_role.addEventListener('change', syncQuestions);
  var city = formEl.elements.city;
  if (city && !city.value) city.value = cfg.town.replace(/ (Township|Borough|City|Town|Village)$/, '').replace(/^City of /, '');

  function say(msg, error) { statusEl.textContent = msg || ''; statusEl.classList.toggle('error', !!error); }
  function answers() {
    var a = {};
    Array.prototype.forEach.call(formEl.querySelectorAll('[data-key]'), function (el) {
      if (!el.closest('[hidden]')) a[el.getAttribute('data-key')] = el.value;
    });
    return a;
  }

  async function template() {
    var res = await fetch('/api/co-form-template?code=' + encodeURIComponent(cfg.code), { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache' });
    if (res.status === 409) throw new Error('changed');
    if (!res.ok) throw new Error('unavailable');
    var sha = String(res.headers.get('X-Watchdog-Template-SHA256') || '').toLowerCase();
    if (sha !== cfg.sha256) throw new Error('changed');
    return new Uint8Array(await res.arrayBuffer());
  }

  function wrap(text, font, size, width) {
    var lines = [], line = '';
    pdfSafe(text).split(' ').forEach(function (word) {
      var next = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = word; } else line = next;
    });
    if (line) lines.push(line);
    return lines;
  }

  async function nextStepsPage(doc) {
    var P = window.PDFLib;
    var page = doc.addPage([612, 792]);
    var regular = await doc.embedFont(P.StandardFonts.Helvetica), bold = await doc.embedFont(P.StandardFonts.HelveticaBold);
    var navy = P.rgb(0.106, 0.141, 0.188), gray = P.rgb(0.37, 0.42, 0.48), blue = P.rgb(0.051, 0.239, 0.745);
    var y = 730;
    function text(s, o) { page.drawText(pdfSafe(s), { x: o.x || 54, y: y, size: o.size, font: o.font || regular, color: o.color || navy }); }
    function para(s, size, color) { wrap(s, regular, size, 504).forEach(function (l) { text(l, { size: size, color: color }); y -= size + 5; }); }
    text(cfg.town + ': what to do next', { size: 22, font: bold }); y -= 34;
    para('This page was added by Watchdog. It is not part of the town\'s application.', 10, gray); y -= 14;
    ['1. Check every page and fill in anything left blank.', '2. Sign and date the application.', '3. Send it to the town with the fee.'].forEach(function (l) { text(l, { size: 13 }); y -= 22; });
    y -= 6;
    if (cfg.how_to_apply) { text('How to send it', { size: 14, font: bold, color: blue }); y -= 20; para(cfg.how_to_apply, 11.5); y -= 12; }
    if (cfg.fees && cfg.fees.length) {
      text('Fees', { size: 14, font: bold, color: blue }); y -= 20;
      cfg.fees.forEach(function (f) {
        var lines = wrap(f.label, regular, 11, 400);
        lines.forEach(function (l, i) { text(l, { size: 11 }); if (i === 0) page.drawText(pdfSafe(f.amount), { x: 558 - bold.widthOfTextAtSize(pdfSafe(f.amount), 11), y: y, size: 11, font: bold, color: navy }); y -= 16; });
        y -= 2;
      });
    }
    y = 60;
    para('Filled in with Watchdog at watchdogindex.com/co. Watchdog is not ' + cfg.town + ' and does not send or keep applications. Rules and fees can change, so confirm with the town.', 9.5, gray);
  }

  async function build(a) {
    var P = window.PDFLib;
    if (!P || !P.PDFDocument) throw new Error('engine');
    var doc = await P.PDFDocument.load(await template(), { updateMetadata: false });
    await fillDoc(P, doc, cfg, values(a));
    await nextStepsPage(doc);
    return doc.save({ useObjectStreams: false });
  }

  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

  formEl.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!formEl.elements.ack.checked) { say('Check the box first.', true); return; }
    if (!clean(formEl.elements.address.value)) { say('Add the home\'s street address.', true); formEl.elements.address.focus(); return; }
    makeBtn.disabled = true;
    say('Making your PDF...');
    try {
      var bytes = await build(answers());
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      var name = slug(cfg.town) + '-co-application' + (clean(formEl.elements.address.value) ? '-' + slug(formEl.elements.address.value) : '') + '.pdf';
      var dl = done.querySelector('[data-download]'), open = done.querySelector('[data-open]');
      dl.href = objectUrl; dl.setAttribute('download', name); open.href = objectUrl;
      say('');
      formEl.hidden = true;
      done.hidden = false;
      done.scrollIntoView({ behavior: 'smooth', block: 'start' });
      track('apply_pdf', 'ok');
    } catch (err) {
      var why = err && err.message;
      say(why === 'changed'
        ? cfg.town + ' changed its form, so we paused filling it in. Use the town\'s blank form for now.'
        : 'We couldn\'t get the town\'s form right now. Try again in a minute.', true);
      track('apply_pdf', why === 'changed' ? 'changed' : 'error');
    } finally {
      makeBtn.disabled = false;
    }
  });
  done.querySelector('[data-download]').addEventListener('click', function () { track('apply_download'); });
  done.querySelector('[data-open]').addEventListener('click', function () { track('apply_open'); });
  done.querySelector('[data-again]').addEventListener('click', function () { done.hidden = true; formEl.hidden = false; formEl.scrollIntoView({ block: 'start' }); });
})(typeof window !== 'undefined' ? window : globalThis);
