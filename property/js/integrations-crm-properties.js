(function () {
  'use strict';

  // Integration Center: CRM <-> property connection.
  // Static structure and copy live in property/integrations/index.html (#igx-crm).
  // This script reads get_my_crm_property_overview() and fills in the data:
  //   * properties linked to CRM contacts that are not on the dashboard yet (add them),
  //   * dashboard properties with their CRM contact details,
  //   * dashboard properties that no CRM contact is linked to (export for the CRM),
  //   * candidate matches waiting for the user's confirmation.
  // Only verified PAMS PIN links count as "in your CRM". Nothing here writes to the CRM.
  if (window.__WATCHDOG_INTEGRATIONS_CRM_PROPERTIES__) return;
  window.__WATCHDOG_INTEGRATIONS_CRM_PROPERTIES__ = true;

  var root = document.getElementById('igx-crm');
  if (!root || !window.NJPTRSupabaseRuntime) return;

  // Statewide NJOGIS parcels. ZIP5 on this layer is the owner's mailing ZIP, not the
  // property's, so it is deliberately not requested.
  var NJOGIS = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
  var PARCEL_FIELDS = 'PAMS_PIN,PROP_LOC,MUN_NAME,COUNTY,PCLBLOCK,PCLLOT,NET_VALUE,LAST_YR_TX';
  var PAGE = 25;
  var ADD_BATCH = 50;
  var TABS = ['ready', 'dashboard', 'missing', 'review'];
  var BREAKDOWN = [
    ['matched_contacts', 'Linked to a property'],
    ['needs_review', 'Waiting for your review'],
    ['checking', 'Being checked now'],
    ['no_address', 'No property address in your CRM'],
    ['no_match', 'No exact New Jersey parcel match'],
    ['ambiguous', 'More than one possible parcel'],
    ['non_nj', 'Outside New Jersey']
  ];

  var $ = function (sel) { return root.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };
  var list = $('#igx-list');
  var search = $('#igx-search');
  var selectAll = $('#igx-select-all');
  var moreButton = $('#igx-more');

  var client = null;
  var data = null;
  var tab = '';
  var query = '';
  var shown = {};
  var selected = {};
  var busy = false;
  var toastTimer = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function route(path) {
    var rt = window.NJPTRSupabaseRuntime;
    var prefix = rt && typeof rt.routePrefix === 'string' ? rt.routePrefix : ((location.hostname === 'watchdogindex.com' || location.hostname === 'www.watchdogindex.com') ? '' : '/property');
    path = String(path || '/');
    if (path.charAt(0) !== '/') path = '/' + path;
    return prefix + path;
  }
  function num(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
  function fmt(value) { return num(value).toLocaleString(); }
  function plural(n, one, many) { return num(n) === 1 ? one : many; }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  }
  function ago(iso) {
    var t = new Date(iso || '').getTime();
    if (!Number.isFinite(t)) return '';
    var mins = Math.round((Date.now() - t) / 60000);
    if (mins < 2) return 'just now';
    if (mins < 60) return mins + ' min ago';
    var hours = Math.round(mins / 60);
    if (hours < 36) return hours + ' ' + plural(hours, 'hour', 'hours') + ' ago';
    return fmtDate(iso);
  }
  function stageClass(stage) { return 'stage-' + String(stage || '').toLowerCase().replace(/[^a-z]+/g, '-'); }
  function relationshipLabel(value) {
    return String(value || '').split(',').map(function (part) {
      part = part.trim();
      return part ? part.charAt(0).toUpperCase() + part.slice(1) : '';
    }).filter(Boolean).join(' and ');
  }
  function toast(text, isError) {
    var el = document.getElementById('igx-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'igx-toast';
      el.className = 'igx-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.className = 'igx-toast' + (isError ? ' is-error' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 6000);
  }
  function errorText(error, fallback) {
    var message = error && (error.message || error.error_description || error.details) || '';
    return message ? String(message) : fallback;
  }
  function missingRpc(error) {
    var code = error && error.code || '';
    return code === 'PGRST202' || code === '42883' || /could not find the function/i.test(String(error && error.message || ''));
  }

  // ---------- state switching ----------
  function showState(name, message) {
    root.hidden = false;
    $$('[data-igx-state]').forEach(function (el) { el.hidden = el.dataset.igxState !== name; });
    $('#igx-board').hidden = name !== 'board';
    if (name === 'error' && message) $('#igx-error-text').textContent = message;
  }

  // ---------- rows (data-driven) ----------
  function contactText(contacts) {
    return (contacts || []).map(function (p) { return [p.name, p.email, p.stage, p.relationship].join(' '); }).join(' ');
  }
  var SEARCH_TEXT = {
    ready: function (p) { return [p.address, p.town, p.county, contactText(p.contacts)].join(' '); },
    dashboard: function (p) { return [p.address, p.town, p.nickname, contactText(p.contacts)].join(' '); },
    missing: function (p) { return [p.address, p.town, p.county, p.nickname].join(' '); },
    review: function (r) { return [r.crm_address, r.candidate_address, r.candidate_town, contactText([r.contact || {}])].join(' '); }
  };
  var SOURCE = { ready: 'ready_to_add', dashboard: 'on_dashboard', missing: 'dashboard_not_in_crm', review: 'needs_review' };

  function items(name) { return (data && data[SOURCE[name]]) || []; }
  function filtered(name) {
    return items(name).filter(function (item) { return !query || SEARCH_TEXT[name](item).toLowerCase().indexOf(query) >= 0; });
  }

  function stageTag(stage) {
    return stage ? '<span class="igx-tag ' + stageClass(stage) + '">' + esc(stage) + '</span>' : '';
  }
  function peopleChips(contacts, total) {
    var few = (contacts || []).slice(0, 3);
    var chips = few.map(function (p) {
      return '<span class="igx-person"><b>' + esc(p.name || 'Unnamed contact') + '</b>' + stageTag(p.stage) + '</span>';
    });
    var extra = num(total) - few.length;
    if (extra > 0) chips.push('<span class="igx-person">+' + extra + ' more</span>');
    return chips.length ? '<div class="igx-people">' + chips.join('') + '</div>' : '';
  }
  function openLink(pin) {
    return '<a class="igx-btn is-ghost is-small" href="' + esc(route('/home?pin=' + encodeURIComponent(pin))) + '"><i class="fas fa-house" aria-hidden="true"></i>Open property</a>';
  }
  function titleFor(p) { return p.nickname ? p.nickname + ' · ' + (p.address || '') : (p.address || p.pams_pin); }

  function readyRow(p, canAdd) {
    var sub = [p.town, p.county].filter(Boolean).join(', ');
    var people = num(p.contact_count);
    return '<li class="igx-row"><label class="igx-check"><input type="checkbox" data-igx-select="' + esc(p.pams_pin) + '"' + (selected[p.pams_pin] ? ' checked' : '') + '><span class="sr-only">Select ' + esc(p.address) + '</span></label>' +
      '<div class="igx-row-main"><span class="igx-row-title">' + esc(p.address || p.pams_pin) + '</span>' +
      '<span class="igx-row-sub">' + esc(sub) + (sub ? ' · ' : '') + fmt(people) + ' CRM ' + plural(people, 'contact', 'contacts') + '</span>' + peopleChips(p.contacts, people) + '</div>' +
      '<div class="igx-row-actions"><button type="button" class="igx-btn is-small" data-igx-add="' + esc(p.pams_pin) + '"' + (canAdd ? '' : ' disabled') + '><i class="fas fa-plus" aria-hidden="true"></i>Add to dashboard</button></div></li>';
  }
  function contactCard(p) {
    var rows = [];
    if (p.relationship) rows.push(['Looking to', esc(relationshipLabel(p.relationship))]);
    if (p.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) rows.push(['Email', '<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>']);
    if (p.phone) {
      var digits = String(p.phone).replace(/[^0-9+]/g, '');
      rows.push(['Phone', digits ? '<a href="tel:' + esc(digits) + '">' + esc(p.phone) + '</a>' : esc(p.phone)]);
    }
    if (p.source) rows.push(['Source', esc(p.source)]);
    if (p.tags && p.tags.length) rows.push(['Tags', esc(p.tags.slice(0, 6).join(', '))]);
    if (p.last_activity_at) rows.push(['Last activity', esc(fmtDate(p.last_activity_at))]);
    else if (p.updated_at) rows.push(['CRM updated', esc(fmtDate(p.updated_at))]);
    return '<div class="igx-contact"><div class="igx-contact-top"><span class="igx-contact-name">' + esc(p.name || 'Unnamed contact') + '</span>' + stageTag(p.stage) + '</div>' +
      (rows.length ? '<dl>' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>' : '') + '</div>';
  }
  function dashboardRow(p) {
    var more = num(p.contact_count) - (p.contacts || []).length;
    return '<li class="igx-row no-check"><div class="igx-row-main"><span class="igx-row-title">' + esc(titleFor(p)) + '</span>' +
      '<span class="igx-row-sub">' + esc([p.town, p.kind === 'home' ? 'Your home' : 'On your dashboard'].filter(Boolean).join(' · ')) + '</span>' +
      '<div class="igx-contacts">' + (p.contacts || []).map(contactCard).join('') + '</div>' +
      (more > 0 ? '<span class="igx-row-sub">+' + more + ' more ' + plural(more, 'contact', 'contacts') + ' in your CRM</span>' : '') + '</div>' +
      '<div class="igx-row-actions">' + openLink(p.pams_pin) + '</div></li>';
  }
  function missingRow(p) {
    return '<li class="igx-row no-check"><div class="igx-row-main"><span class="igx-row-title">' + esc(titleFor(p)) + '</span>' +
      '<span class="igx-row-sub">' + esc([p.town, p.county, p.kind === 'home' ? 'Your home' : ''].filter(Boolean).join(' · ')) + '</span></div>' +
      '<div class="igx-row-actions">' + openLink(p.pams_pin) + '</div></li>';
  }
  function reviewRow(r) {
    var p = r.contact || {};
    var several = num(r.candidate_count) > 1;
    return '<li class="igx-row no-check"><div class="igx-row-main"><span class="igx-row-title">' + esc(p.name || 'Unnamed contact') + ' ' + stageTag(p.stage) +
      (several ? ' <span class="igx-tag">More than one parcel</span>' : '') + '</span>' +
      '<div class="igx-compare"><div><small>Address in your CRM</small><b>' + esc(r.crm_address || 'Not provided') + '</b></div>' +
      '<div><small>Watchdog parcel</small><b>' + esc([r.candidate_address, r.candidate_town].filter(Boolean).join(', ') || r.pams_pin) + '</b></div></div></div>' +
      '<div class="igx-row-actions">' +
      '<button type="button" class="igx-btn is-small" data-igx-review="verify" data-igx-link="' + esc(r.link_id) + '"' + (several || busy ? ' disabled' : '') + '><i class="fas fa-check" aria-hidden="true"></i>Yes, same property</button>' +
      '<button type="button" class="igx-btn is-quiet is-small" data-igx-review="reject" data-igx-link="' + esc(r.link_id) + '"' + (busy ? ' disabled' : '') + '>Not a match</button></div></li>';
  }

  // ---------- render ----------
  function setCount(key, value) {
    $$('[data-igx-count="' + key + '"]').forEach(function (el) { el.textContent = fmt(value); });
  }
  function renderSummary() {
    var c = data.counts || {};
    var conn = data.connection || {};
    Object.keys(c).forEach(function (key) { setCount(key, c[key]); });
    setCount('remaining', data.capacity && data.capacity.remaining);
    var provider = conn.provider === 'boldtrail' ? 'BoldTrail' : (conn.provider || 'Your CRM');
    var bits = [provider + ' connected'];
    if (conn.last_success_at) bits.push('last sync ' + ago(conn.last_success_at));
    bits.push(fmt(c.contacts) + ' ' + plural(c.contacts, 'contact', 'contacts'));
    $('#igx-status').textContent = bits.join(' · ') + '.';

    var r = data.resolution || {};
    // A "candidate" resolution state can be stale once its link was reviewed, so only the
    // queue itself counts as being checked.
    var values = { matched_contacts: c.matched_contacts, needs_review: c.needs_review, checking: num(r.pending) + num(r.error), no_address: r.no_address, no_match: r.no_match, ambiguous: r.ambiguous, non_nj: r.non_nj };
    $('#igx-breakdown').innerHTML = BREAKDOWN.filter(function (b) { return num(values[b[0]]) > 0; }).map(function (b) {
      return '<div><b>' + fmt(values[b[0]]) + '</b><span>' + b[1] + '</span></div>';
    }).join('');
  }

  function renderPanel() {
    var remaining = num(data.capacity && data.capacity.remaining);
    $$('[data-igx-tab]').forEach(function (el) {
      var on = el.dataset.igxTab === tab;
      if (el.classList.contains('igx-tab')) el.setAttribute('aria-selected', String(on));
      else el.setAttribute('aria-pressed', String(on));
    });
    $('#igx-panel').setAttribute('aria-labelledby', 'igx-tab-' + tab);
    $$('#igx-panel [data-igx-for]').forEach(function (el) { el.hidden = el.dataset.igxFor !== tab; });
    $('[data-igx-cap="some"]').hidden = remaining <= 0;
    $('[data-igx-cap="none"]').hidden = remaining > 0;

    var all = items(tab);
    var rows = filtered(tab);
    var limit = shown[tab] || PAGE;
    var visible = rows.slice(0, limit);
    $('#igx-toolbar').hidden = !all.length;
    $$('[data-igx-empty]').forEach(function (el) {
      var which = !all.length ? tab : (!rows.length ? 'search' : '');
      el.hidden = el.dataset.igxEmpty !== which;
    });

    var canAdd = remaining > 0 && !busy;
    var render = { ready: function (p) { return readyRow(p, canAdd); }, dashboard: dashboardRow, missing: missingRow, review: reviewRow }[tab];
    list.innerHTML = visible.map(render).join('');

    var left = rows.length - visible.length;
    moreButton.hidden = left <= 0;
    moreButton.textContent = left <= PAGE ? 'Show ' + fmt(left) + ' more' : 'Show ' + PAGE + ' more (' + fmt(left) + ' left)';

    var selectedCount = Object.keys(selected).filter(function (pin) { return selected[pin]; }).length;
    $('#igx-selected-count').textContent = String(selectedCount);
    $('[data-igx-action="add-selected"]').disabled = !selectedCount || !canAdd;
    selectAll.disabled = !visible.length || tab !== 'ready';
    selectAll.checked = tab === 'ready' && visible.length > 0 && visible.every(function (p) { return selected[p.pams_pin]; });
    $$('[data-igx-action="download"],[data-igx-action="copy"]').forEach(function (b) { b.disabled = !rows.length; });
  }

  function render() {
    showState('board');
    renderSummary();
    renderPanel();
  }

  // ---------- data ----------
  async function load() {
    var result = await client.rpc('get_my_crm_property_overview');
    if (result.error) {
      if (missingRpc(result.error)) {
        // The overview RPC ships with a database migration; until it exists, keep the page as it was.
        root.hidden = true;
        console.info('[Integrations] CRM property overview is not available yet.');
        return;
      }
      showState('error', errorText(result.error, 'Please try again.'));
      return;
    }
    data = result.data || {};
    if (data.allowed === false) { showState('upsell'); return; }
    var counts = data.counts || {};
    if (!data.connection && !num(counts.contacts)) { showState('connect'); return; }
    if (!tab) tab = num(counts.ready_to_add) ? 'ready' : num(counts.needs_review) ? 'review' : num(counts.on_dashboard) ? 'dashboard' : 'ready';
    var readyPins = {};
    items('ready').forEach(function (p) { readyPins[p.pams_pin] = true; });
    Object.keys(selected).forEach(function (pin) { if (!readyPins[pin]) delete selected[pin]; });
    render();
  }

  function parcelPoint(feature) {
    var c = feature && feature.centroid;
    if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) return { lat: c.y, lon: c.x };
    var rings = feature && feature.geometry && feature.geometry.rings;
    if (!rings || !rings.length) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    rings.forEach(function (ring) {
      ring.forEach(function (pt) {
        minX = Math.min(minX, pt[0]); maxX = Math.max(maxX, pt[0]);
        minY = Math.min(minY, pt[1]); maxY = Math.max(maxY, pt[1]);
      });
    });
    return Number.isFinite(minX) ? { lat: (minY + maxY) / 2, lon: (minX + maxX) / 2 } : null;
  }

  // Parcel facts for the dashboard card. If NJOGIS is slow or down, the property is
  // still added with the address Watchdog already matched; the dashboard fills in later.
  async function fetchParcels(pins) {
    var safe = pins.filter(function (pin) { return /^[A-Za-z0-9._-]{5,40}$/.test(pin); });
    if (!safe.length) return {};
    var params = new URLSearchParams({
      where: "PAMS_PIN IN ('" + safe.join("','") + "')",
      outFields: PARCEL_FIELDS,
      returnGeometry: 'true',
      returnCentroid: 'true',
      outSR: '4326',
      f: 'json'
    });
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 12000);
    try {
      var res = await fetch(NJOGIS + '?' + params.toString(), { signal: ctrl ? ctrl.signal : undefined });
      if (!res.ok) return {};
      var json = await res.json();
      var out = {};
      (json.features || []).forEach(function (f) {
        var a = f.attributes || {};
        if (!a.PAMS_PIN) return;
        var point = parcelPoint(f);
        out[a.PAMS_PIN] = {
          address: a.PROP_LOC || '',
          town: a.MUN_NAME || '',
          county: a.COUNTY || '',
          block: a.PCLBLOCK != null ? String(a.PCLBLOCK) : '',
          lot: a.PCLLOT != null ? String(a.PCLLOT) : '',
          assessed: Number(a.NET_VALUE) > 0 ? Math.round(Number(a.NET_VALUE)) : null,
          last_year_tax: Number(a.LAST_YR_TX) > 0 ? Math.round(Number(a.LAST_YR_TX) * 100) / 100 : null,
          lat: point ? Math.round(point.lat * 1e6) / 1e6 : null,
          lon: point ? Math.round(point.lon * 1e6) / 1e6 : null
        };
      });
      return out;
    } catch (_) {
      return {};
    } finally {
      clearTimeout(timer);
    }
  }

  function compact(obj) {
    var out = {};
    Object.keys(obj).forEach(function (k) { if (obj[k] !== null && obj[k] !== undefined && obj[k] !== '') out[k] = obj[k]; });
    return out;
  }

  async function addPins(pins) {
    if (busy || !pins.length || !data) return;
    var remaining = num(data.capacity && data.capacity.remaining);
    if (remaining <= 0) { toast('Your plan’s property limit is reached.', true); return; }
    var trimmed = pins.length > remaining;
    pins = pins.slice(0, remaining);
    var byPin = {};
    items('ready').forEach(function (p) { byPin[p.pams_pin] = p; });
    busy = true;
    renderPanel();
    toast('Adding ' + pins.length + ' ' + plural(pins.length, 'property', 'properties') + ' to your dashboard…');
    var totals = { added: 0, already: 0, over: 0, failed: 0 };
    try {
      for (var i = 0; i < pins.length; i += ADD_BATCH) {
        var chunk = pins.slice(i, i + ADD_BATCH);
        var parcels = await fetchParcels(chunk);
        var payload = chunk.map(function (pin) {
          var base = byPin[pin] || {};
          var parcel = parcels[pin] || {};
          return compact({
            pams_pin: pin,
            address: parcel.address || base.address,
            town: parcel.town || base.town,
            county: parcel.county || base.county,
            block: parcel.block,
            lot: parcel.lot,
            assessed: parcel.assessed,
            last_year_tax: parcel.last_year_tax,
            lat: parcel.lat,
            lon: parcel.lon
          });
        });
        var result = await client.rpc('add_my_crm_properties_to_dashboard', { p_items: payload });
        if (result.error) throw result.error;
        var r = result.data || {};
        totals.added += num(r.added_count);
        totals.already += num(r.already_on_dashboard);
        totals.over += num(r.over_limit);
        totals.failed += num(r.failed) + num(r.not_linked);
        chunk.forEach(function (pin) { delete selected[pin]; });
      }
      var parts = [totals.added ? 'Added ' + totals.added + ' ' + plural(totals.added, 'property', 'properties') + ' to your dashboard.' : 'No properties were added.'];
      if (totals.already) parts.push(totals.already + ' ' + plural(totals.already, 'was', 'were') + ' already there.');
      if (totals.over || trimmed) parts.push('Your plan’s property limit stopped the rest.');
      if (totals.failed) parts.push(totals.failed + ' could not be added.');
      toast(parts.join(' '), !totals.added);
    } catch (error) {
      toast(errorText(error, 'Properties could not be added. Please try again.'), true);
    } finally {
      busy = false;
      await load();
    }
  }

  async function reviewMatch(linkId, decision) {
    if (busy || !linkId) return;
    busy = true;
    renderPanel();
    try {
      var result = await client.rpc('review_my_crm_property_matches', { p_link_ids: [linkId], p_decision: decision });
      if (result.error) throw result.error;
      var r = result.data || {};
      if (num(r.decided) > 0) {
        toast(decision === 'verify' ? 'Linked. The property now counts as in your CRM.' : 'Marked as not a match.');
        window.dispatchEvent(new CustomEvent('watchdog:relationship-reviewed', { detail: { decision: decision } }));
      } else if (num(r.ambiguous_skipped) > 0) {
        toast('More than one parcel matched, so this can’t be confirmed here. Use Advanced → CRM resolution.', true);
      } else {
        toast('This match was already reviewed.', true);
      }
    } catch (error) {
      toast(errorText(error, 'The match could not be updated.'), true);
    } finally {
      busy = false;
      await load();
    }
  }

  function csvCell(value) {
    var s = String(value == null ? '' : value);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function downloadCsv() {
    var rows = filtered('missing');
    if (!rows.length) return;
    var lines = [['Address', 'Town', 'County', 'State', 'ZIP', 'Watchdog label', 'Watchdog PIN'].join(',')];
    rows.forEach(function (p) {
      lines.push([p.address, p.town, p.county, 'NJ', p.zip, p.nickname || (p.kind === 'home' ? 'Home' : 'Watching'), p.pams_pin].map(csvCell).join(','));
    });
    var blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'watchdog-properties-not-in-crm-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Downloaded ' + rows.length + ' ' + plural(rows.length, 'property', 'properties') + '.');
  }
  function copyAddresses() {
    var text = filtered('missing').map(function (p) { return [p.address, p.town, 'NJ'].filter(Boolean).join(', '); }).join('\n');
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Addresses copied.'); }, function () { toast('Copy was blocked by the browser. Use Download CSV instead.', true); });
    } else {
      toast('Copy isn’t available in this browser. Use Download CSV instead.', true);
    }
  }

  function setTab(next, focusTab) {
    if (TABS.indexOf(next) < 0) return;
    tab = next;
    query = '';
    search.value = '';
    renderPanel();
    if (focusTab) { var el = $('#igx-tab-' + next); if (el) el.focus(); }
  }

  // ---------- events ----------
  $$('[data-igx-route]').forEach(function (a) { a.setAttribute('href', route(a.dataset.igxRoute)); });

  root.addEventListener('click', function (event) {
    var target = event.target.closest('button,a');
    if (!target || !root.contains(target)) return;
    if (target.dataset.igxTab) { setTab(target.dataset.igxTab, target.classList.contains('igx-tab')); return; }
    if (target.dataset.igxAdd) { addPins([target.dataset.igxAdd]); return; }
    if (target.dataset.igxReview) { reviewMatch(target.dataset.igxLink, target.dataset.igxReview === 'verify' ? 'verify' : 'reject'); return; }
    var action = target.dataset.igxAction;
    if (action === 'refresh') { showState('loading'); load(); }
    else if (action === 'more') { shown[tab] = (shown[tab] || PAGE) + PAGE; renderPanel(); }
    else if (action === 'add-selected') { addPins(Object.keys(selected).filter(function (pin) { return selected[pin]; })); }
    else if (action === 'download') downloadCsv();
    else if (action === 'copy') copyAddresses();
  });
  root.addEventListener('change', function (event) {
    var input = event.target;
    if (input.dataset && input.dataset.igxSelect) {
      selected[input.dataset.igxSelect] = input.checked;
      var count = Object.keys(selected).filter(function (pin) { return selected[pin]; }).length;
      $('#igx-selected-count').textContent = String(count);
      $('[data-igx-action="add-selected"]').disabled = !count || busy || num(data.capacity && data.capacity.remaining) <= 0;
      var boxes = $$('[data-igx-select]');
      selectAll.checked = boxes.length > 0 && boxes.every(function (b) { return b.checked; });
    } else if (input === selectAll) {
      filtered('ready').slice(0, shown.ready || PAGE).forEach(function (p) { selected[p.pams_pin] = input.checked; });
      renderPanel();
    }
  });
  search.addEventListener('input', function () {
    query = String(search.value || '').trim().toLowerCase();
    shown[tab] = PAGE;
    renderPanel();
  });
  root.addEventListener('keydown', function (event) {
    var current = event.target.closest('.igx-tab');
    if (!current || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return;
    var index = TABS.indexOf(current.dataset.igxTab);
    event.preventDefault();
    setTab(TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length], true);
  });

  async function boot() {
    try {
      client = window.NJPTRSupabaseRuntime.createClient();
      var auth = await client.auth.getUser();
      if (!auth || !auth.data || !auth.data.user) return;
      showState('loading');
      await load();
    } catch (error) {
      console.error('[Integrations] CRM property overview failed', error);
      showState('error');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
