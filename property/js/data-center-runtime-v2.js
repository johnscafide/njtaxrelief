(function () {
  'use strict';

  var catalog = null;
  var selected = [];
  var views = [];
  var activeView = '';
  var resultRows = [];
  var sb = null;
  var searchTimer = null;
  var modalResolver = null;

  var SB_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var SB_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';

  function $(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>\"]/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char];
    });
  }
  function label(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function markerProfessions(marker) { return Array.isArray(marker && marker.professions) ? marker.professions : []; }
  function countBucket(n) {
    n = Number(n) || 0;
    if (!n) return '0';
    if (n === 1) return '1';
    if (n <= 5) return '2-5';
    if (n <= 10) return '6-10';
    if (n <= 25) return '11-25';
    if (n <= 100) return '26-100';
    return '100+';
  }
  function analytics(name, properties) {
    try {
      if (window.WatchdogAnalytics && typeof window.WatchdogAnalytics.track === 'function') {
        window.WatchdogAnalytics.track(name, properties || {});
      }
    } catch (_error) {}
  }
  function client() {
    if (sb) return sb;
    if (window.NJPTRSupabaseRuntime && typeof window.NJPTRSupabaseRuntime.createClient === 'function') {
      try { sb = window.NJPTRSupabaseRuntime.createClient(); if (sb) return sb; } catch (_error) {}
    }
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      sb = window.supabase.createClient(SB_URL, SB_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token' }
      });
    }
    return sb;
  }
  window.WatchdogDataCenterClient = client;

  function coverageFor(id) {
    if (window.WatchdogDataCenterPublic && typeof window.WatchdogDataCenterPublic.coverageFor === 'function') {
      return window.WatchdogDataCenterPublic.coverageFor(id);
    }
    return null;
  }
  function formatDate(value) {
    if (!value) return 'Not verified';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Not verified';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function markerById(id) {
    return catalog && Array.isArray(catalog.markers) ? catalog.markers.find(function (m) { return String(m.id) === String(id); }) : null;
  }

  function saveLocal() {
    try { localStorage.setItem('watchdog:data-center:fields', JSON.stringify(selected)); } catch (_error) {}
  }
  function emitSelection() {
    document.dispatchEvent(new CustomEvent('watchdog:data-center-selection', { detail: { count: selected.length } }));
  }
  function renderSelected() {
    if (!catalog) return;
    var map = {};
    catalog.markers.forEach(function (m) { map[m.id] = m; });
    selected = selected.filter(function (id) { return !!map[id]; });
    var count = $('dc-selected-count');
    if (count) count.textContent = selected.length + ' field' + (selected.length === 1 ? '' : 's') + ' selected';
    var chips = $('dc-chips');
    if (chips) chips.innerHTML = '<div class="dc-chips">' + selected.map(function (id) {
      return '<button type="button" data-remove="' + esc(id) + '" title="Remove field">' + esc(map[id].label) + ' ×</button>';
    }).join('') + '</div>';
    saveLocal();
    emitSelection();
  }

  function readFilters() {
    return {
      profession: $('dc-prof') ? $('dc-prof').value : '',
      category: $('dc-category') ? $('dc-category').value : '',
      origin: $('dc-origin') ? $('dc-origin').value : '',
      availability: $('dc-provider-status') ? $('dc-provider-status').value : 'live',
      query: $('dc-search') ? $('dc-search').value.trim() : ''
    };
  }

  function render() {
    if (!catalog || !$('dc-rows')) return;
    var current = readFilters();
    var query = current.query.toLowerCase();
    var rows = catalog.markers.filter(function (marker) {
      var professions = markerProfessions(marker);
      var c = coverageFor(marker.id);
      var status = c ? String(c.value_status || 'planned') : String(marker.provider_status || 'planned');
      var searchable = [marker.label, marker.description, marker.id, marker.category, professions.join(' '), marker.professional_reason].join(' ').toLowerCase();
      return (!current.category || marker.category === current.category) &&
        (!current.origin || marker.origin === current.origin) &&
        (!current.profession || professions.indexOf(current.profession) >= 0) &&
        (!current.availability || status === current.availability) &&
        (!query || searchable.indexOf(query) >= 0);
    });

    $('dc-rows').innerHTML = rows.length ? rows.map(function (marker) {
      var c = coverageFor(marker.id) || {};
      var status = String(c.value_status || marker.provider_status || 'planned');
      var origin = marker.origin === 'watchdog-derived' ? 'Watchdog derived' : 'Public source';
      return '<tr>' +
        '<td class="dc-check"><input type="checkbox" aria-label="Add ' + esc(marker.label) + '" data-marker="' + esc(marker.id) + '" ' + (selected.indexOf(marker.id) >= 0 ? 'checked' : '') + '></td>' +
        '<td><div class="dc-marker-name"><button class="dc-marker-detail" type="button" data-marker-detail="' + esc(marker.id) + '" aria-label="Details for ' + esc(marker.label) + '"><i class="fas fa-circle-info"></i></button><div><strong>' + esc(marker.label) + '</strong><small>' + esc(marker.description || marker.id) + '</small></div></div></td>' +
        '<td><span class="dc-status-dot ' + esc(status) + '">' + esc(label(status)) + '</span></td>' +
        '<td>' + esc(formatDate(c.last_verified_at)) + '</td>' +
        '<td><span class="' + (c.bulk_capable ? 'dc-bulk-yes' : 'dc-bulk-no') + '">' + (c.bulk_capable ? 'Bulk ready' : 'Bounded') + '</span></td>' +
        '<td>' + esc(label(marker.category)) + '</td>' +
        '<td>' + esc(label(marker.scope)) + '</td>' +
        '<td><span class="dc-pill ' + esc(marker.origin) + '">' + esc(origin) + '</span></td>' +
      '</tr>';
    }).join('') : '<tr><td class="dc-empty" colspan="8">No governed fields match these filters.</td></tr>';
    renderSelected();
  }

  function populateFilters() {
    if (!catalog) return;
    var prof = $('dc-prof');
    if (prof && Array.isArray(catalog.professions)) {
      prof.innerHTML = '<option value="">All professions</option>' + catalog.professions.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.label) + '</option>'; }).join('');
    }
    var category = $('dc-category');
    if (category) {
      var categories = Array.from(new Set(catalog.markers.map(function (m) { return m.category; }).filter(Boolean))).sort();
      category.innerHTML = '<option value="">All categories</option>' + categories.map(function (item) { return '<option value="' + esc(item) + '">' + esc(label(item)) + '</option>'; }).join('');
    }
  }

  function toast(message, type) {
    var node = $('dc-toast');
    if (!node) return;
    node.textContent = message;
    node.className = 'dc-toast ' + (type || '') + ' show';
    clearTimeout(node._timer);
    node._timer = setTimeout(function () { node.className = 'dc-toast'; }, 3500);
  }

  function closeModal(value) {
    var backdrop = $('dc-modal-backdrop');
    if (backdrop) backdrop.hidden = true;
    if (modalResolver) { var resolver = modalResolver; modalResolver = null; resolver(value); }
  }
  function openModal(options) {
    options = options || {};
    var backdrop = $('dc-modal-backdrop');
    if (!backdrop) return Promise.resolve(null);
    $('dc-modal-title').textContent = options.title || 'Data Center';
    $('dc-modal-copy').textContent = options.copy || '';
    var field = $('dc-modal-field');
    field.innerHTML = '';
    if (options.type === 'text') {
      field.innerHTML = '<input id="dc-modal-input" type="text" maxlength="120" autocomplete="off">';
      field.querySelector('input').value = options.value || '';
    } else if (options.type === 'select') {
      field.innerHTML = '<select id="dc-modal-input">' + (options.options || []).map(function (item) { return '<option value="' + esc(item.value) + '">' + esc(item.label) + '</option>'; }).join('') + '</select>';
    }
    $('dc-modal-confirm').textContent = options.confirm || 'Continue';
    $('dc-modal-cancel').textContent = options.cancel || 'Cancel';
    $('dc-modal-cancel').hidden = options.cancel === false;
    backdrop.hidden = false;
    setTimeout(function () { var input = $('dc-modal-input'); if (input) input.focus(); else $('dc-modal-confirm').focus(); }, 0);
    return new Promise(function (resolve) { modalResolver = resolve; });
  }
  function modalValue() {
    var input = $('dc-modal-input');
    return input ? input.value : true;
  }
  function wireModal() {
    if ($('dc-modal-confirm')) $('dc-modal-confirm').addEventListener('click', function () { closeModal(modalValue()); });
    if ($('dc-modal-cancel')) $('dc-modal-cancel').addEventListener('click', function () { closeModal(null); });
    if ($('dc-modal-backdrop')) $('dc-modal-backdrop').addEventListener('click', function (event) { if (event.target === $('dc-modal-backdrop')) closeModal(null); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && $('dc-modal-backdrop') && !$('dc-modal-backdrop').hidden) closeModal(null); });
  }

  function checkProPlus(showGate) {
    var c = client();
    if (!c) return Promise.resolve({ ok: false, session: null });
    return c.auth.getSession().then(function (response) {
      var session = response.data && response.data.session;
      if (!session) {
        if (showGate) openModal({ title: 'Pro+ workspace', copy: 'The governed field catalog is public. Sign in with Pro+ to build against your private saved properties, export results, save views or schedule deliveries.', confirm: 'View Pro+', cancel: 'Not now' }).then(function (choice) { if (choice) location.href = '/property/pro'; });
        return { ok: false, session: null };
      }
      return c.rpc('has_watchdog_plan', { required_plan: 'pro_plus' }).then(function (plan) {
        var ok = !plan.error && plan.data === true;
        if (!ok && showGate) openModal({ title: 'Pro+ required', copy: 'Your account can browse and select fields here, but private Data Center execution is a Pro+ capability.', confirm: 'See Pro+', cancel: 'Keep browsing' }).then(function (choice) { if (choice) location.href = '/property/pro'; });
        return { ok: ok, session: session };
      });
    }).catch(function () { return { ok: false, session: null }; });
  }

  function ensureResultBuilder() {
    if ($('dc-build')) return;
    var host = document.querySelector('.dc-selected');
    if (!host) return;
    var box = document.createElement('section');
    box.className = 'dc-result-builder';
    box.innerHTML = '<div class="dc-result-controls">' +
      '<label>Scope<select id="dc-scope"><option value="property">Property rows</option><option value="town">Town rollup — my saved properties</option><option value="county">County rollup — my saved properties</option></select></label>' +
      '<button id="dc-build" type="button">Build private sheet</button><button id="dc-export" type="button" disabled>Export CSV</button><button id="dc-schedule" type="button">Schedule</button></div>' +
      '<p id="dc-result-note">Select fields, then build a governed result sheet from your own saved properties. Missing or unsupported values remain explicit.</p>' +
      '<div id="dc-result-analytics" class="dc-result-analytics" hidden></div><div id="dc-results" class="dc-results" hidden></div>';
    host.insertAdjacentElement('afterend', box);
    $('dc-build').addEventListener('click', buildSheet);
    $('dc-export').addEventListener('click', exportSheet);
    $('dc-schedule').addEventListener('click', scheduleDelivery);
  }

  var providers = {
    'property.address': 'address', 'property.municipality': 'town', 'property.county': 'county', 'property.block': 'block', 'property.lot': 'lot', 'property.pams_pin': 'pams_pin',
    'property.assessed_value': 'assessed', 'property.assessed': 'assessed', 'property.annual_tax': 'last_year_tax', 'property.market_value': 'watchdog_value',
    'watchdog.market_value_estimate': 'watchdog_value', 'watchdog.effective_tax_rate': 'effective_rate', 'tax.effective_rate': 'effective_rate'
  };
  function value(row, id) {
    if (row && row.__markers && Object.prototype.hasOwnProperty.call(row.__markers, id)) {
      var resolved = row.__markers[id];
      return resolved == null || resolved === '' ? 'Not available' : resolved;
    }
    var key = providers[id];
    if (!key) return 'Not connected';
    var raw = row ? row[key] : null;
    return raw == null || raw === '' ? 'Not available' : raw;
  }
  function aggregate(rows, scope) {
    var grouped = {};
    rows.forEach(function (row) {
      var key = scope === 'town' ? (row.town || 'Unknown town') : (row.county || 'Unknown county');
      (grouped[key] = grouped[key] || []).push(row);
    });
    return Object.keys(grouped).sort().map(function (key) {
      var group = grouped[key];
      var out = { address: key, town: scope === 'town' ? key : '', county: scope === 'county' ? key : (group[0] && group[0].county), pams_pin: group.length + ' saved properties', __markers: {} };
      ['assessed', 'last_year_tax', 'watchdog_value'].forEach(function (field) {
        var nums = group.map(function (r) { return Number(r[field]); }).filter(Number.isFinite);
        out[field] = nums.length ? nums.reduce(function (a, b) { return a + b; }, 0) : null;
      });
      var rates = group.map(function (r) { return Number(r.effective_rate); }).filter(Number.isFinite);
      out.effective_rate = rates.length ? rates.reduce(function (a, b) { return a + b; }, 0) / rates.length : null;
      selected.forEach(function (id) {
        var marker = markerById(id);
        var compatible = (scope === 'town' && marker && (marker.scope === 'municipality' || marker.scope === 'town')) || (scope === 'county' && marker && marker.scope === 'county');
        if (!compatible) return;
        for (var i = 0; i < group.length; i += 1) {
          if (group[i].__markers && group[i].__markers[id] != null) { out.__markers[id] = group[i].__markers[id]; break; }
        }
      });
      return out;
    });
  }
  function chunksOf(items, size) { var output = []; for (var i = 0; i < items.length; i += size) output.push(items.slice(i, i + size)); return output; }
  function invokeWorkbench(name, batch, ids) {
    return client().functions.invoke(name, { body: { pams_pins: batch, marker_ids: ids } }).then(function (response) { if (response.error) throw response.error; return response.data || {}; });
  }
  function hydrateRows(rows) {
    var pins = rows.map(function (r) { return r.pams_pin; }).filter(Boolean);
    if (!pins.length) return Promise.resolve(rows);
    var calls = [];
    chunksOf(pins, 500).forEach(function (batch) {
      chunksOf(selected, 500).forEach(function (ids) { calls.push(invokeWorkbench('workbench-hydrate', batch, ids).then(function (data) { return { kind: 'base', data: data }; })); });
      var derived = selected.filter(function (id) { var m = markerById(id); return m && m.origin === 'watchdog-derived'; });
      chunksOf(derived, 250).forEach(function (ids) { if (ids.length) calls.push(invokeWorkbench('workbench-derived', batch, ids).then(function (data) { return { kind: 'derived', data: data }; })); });
    });
    return Promise.all(calls).then(function (parts) {
      var records = {}, markers = {}, meta = {};
      parts.sort(function (a, b) { return a.kind === b.kind ? 0 : (a.kind === 'base' ? -1 : 1); });
      parts.forEach(function (part) {
        (part.data.records || []).forEach(function (record) { var pin = String(record.pams_pin); records[pin] = Object.assign(records[pin] || {}, record); });
        Object.keys(part.data.markers || {}).forEach(function (pin) { markers[pin] = Object.assign(markers[pin] || {}, part.data.markers[pin]); });
        Object.keys(part.data.meta || {}).forEach(function (pin) { meta[pin] = Object.assign(meta[pin] || {}, part.data.meta[pin]); });
      });
      return rows.map(function (row) { var pin = String(row.pams_pin || ''); return Object.assign({}, row, records[pin] || {}, { __markers: markers[pin] || {}, __meta: meta[pin] || {} }); });
    });
  }

  function parseNumber(valueToParse) {
    if (typeof valueToParse === 'number' && Number.isFinite(valueToParse)) return valueToParse;
    if (typeof valueToParse !== 'string') return null;
    if (!/[0-9]/.test(valueToParse)) return null;
    var cleaned = valueToParse.replace(/[$,%\s,]/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
    var n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  function median(numbers) {
    var sorted = numbers.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  function formatCompact(n) {
    if (!Number.isFinite(n)) return '—';
    return Intl.NumberFormat(undefined, { maximumFractionDigits: 2, notation: Math.abs(n) >= 1000000 ? 'compact' : 'standard' }).format(n);
  }
  function renderAnalysis(rows) {
    var host = $('dc-result-analytics');
    if (!host) return;
    var totalCells = rows.length * selected.length;
    var missing = 0;
    var cards = [];
    selected.forEach(function (id) {
      var m = markerById(id) || { label: id };
      var values = rows.map(function (row) { return value(row, id); }).filter(function (v) {
        var absent = v == null || v === '' || v === 'Not available' || v === 'Not connected';
        if (absent) missing += 1;
        return !absent;
      });
      if (!values.length) return;
      var numbers = values.map(parseNumber).filter(function (n) { return n != null; });
      if (numbers.length >= 2 && numbers.length >= values.length * .6) {
        cards.push('<div class="dc-analysis-card"><b>' + esc(formatCompact(median(numbers))) + '</b><strong>' + esc(m.label) + '</strong><p>Median · range ' + esc(formatCompact(Math.min.apply(null, numbers))) + '–' + esc(formatCompact(Math.max.apply(null, numbers))) + ' · ' + numbers.length + ' values</p></div>');
      } else {
        var counts = {};
        values.forEach(function (v) { var key = String(v); counts[key] = (counts[key] || 0) + 1; });
        var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
        cards.push('<div class="dc-analysis-card"><b>' + esc(counts[top]) + '</b><strong>' + esc(m.label) + '</strong><p>Most common: ' + esc(top) + ' · ' + values.length + ' populated values</p></div>');
      }
    });
    var coveragePct = totalCells ? Math.round(((totalCells - missing) / totalCells) * 100) : 0;
    cards.unshift('<div class="dc-analysis-card dc-analysis-wide"><b>' + coveragePct + '%</b><strong>Dataset value coverage</strong><p>' + (totalCells - missing) + ' of ' + totalCells + ' selected cells returned a value. Missing and unsupported values remain explicit.</p></div>');
    if ($('dc-scope') && $('dc-scope').value === 'property') {
      var towns = {};
      rows.forEach(function (r) { if (r.town) towns[r.town] = (towns[r.town] || 0) + 1; });
      var townList = Object.keys(towns).sort(function (a, b) { return towns[b] - towns[a]; }).slice(0, 3);
      if (townList.length) cards.unshift('<div class="dc-analysis-card dc-analysis-wide"><b>' + rows.length + '</b><strong>Saved properties analyzed</strong><p>Top locations in this private result: ' + townList.map(function (t) { return esc(t) + ' (' + towns[t] + ')'; }).join(', ') + '.</p></div>');
    }
    host.hidden = false;
    host.innerHTML = cards.slice(0, 10).join('');
  }

  function buildSheet() {
    if (!selected.length) { toast('Select at least one field first.', 'error'); return; }
    checkProPlus(true).then(function (accessState) {
      if (!accessState.ok) return;
      $('dc-result-note').textContent = 'Resolving selected fields through governed providers…';
      analytics('data_center_build_started', { scope: $('dc-scope').value, selected_count_bucket: countBucket(selected.length) });
      return client().from('saved_properties').select('pams_pin,address,town,county,block,lot,assessed,last_year_tax,effective_rate,watchdog_value').order('address')
        .then(function (response) { if (response.error) throw response.error; return hydrateRows(response.data || []); })
        .then(function (rows) {
          var scope = $('dc-scope').value;
          resultRows = scope === 'property' ? rows : aggregate(rows, scope);
          var labels = {}; catalog.markers.forEach(function (m) { labels[m.id] = m.label; });
          $('dc-results').hidden = false;
          $('dc-results').innerHTML = '<table><thead><tr>' + selected.map(function (id) { return '<th>' + esc(labels[id] || id) + '</th>'; }).join('') + '</tr></thead><tbody>' + resultRows.map(function (row) { return '<tr>' + selected.map(function (id) { return '<td>' + esc(value(row, id)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
          $('dc-export').disabled = !resultRows.length;
          $('dc-result-note').textContent = resultRows.length + ' governed ' + (scope === 'property' ? 'property row' : scope + ' rollup') + (resultRows.length === 1 ? '' : 's') + ' from your saved-property workspace. Missing source values remain explicit.';
          renderAnalysis(resultRows);
          analytics('data_center_dataset_built', { scope: scope, row_count_bucket: countBucket(resultRows.length), selected_count_bucket: countBucket(selected.length), status: 'success' });
          toast('Governed dataset built.', 'success');
        }).catch(function (error) {
          $('dc-result-note').textContent = 'Sheet could not be built: ' + error.message;
          analytics('data_center_dataset_built', { scope: $('dc-scope').value, status: 'error' });
          toast('Dataset build failed. ' + error.message, 'error');
        });
    });
  }

  function csvCell(v) { return '\"' + String(v == null ? '' : v).replace(/\"/g, '\"\"') + '\"'; }
  function exportSheet() {
    if (!resultRows.length) return;
    var labels = {}; catalog.markers.forEach(function (m) { labels[m.id] = m.label; });
    analytics('export_started', { tool: 'data_center', format: 'csv', result_count_bucket: countBucket(resultRows.length) });
    var csv = [selected.map(function (id) { return csvCell(labels[id] || id); }).join(',')].concat(resultRows.map(function (row) { return selected.map(function (id) { return csvCell(value(row, id)); }).join(','); })).join('\r\n');
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    var a = document.createElement('a'); a.href = url; a.download = 'watchdog-data-center-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    analytics('data_center_export_completed', { format: 'csv', row_count_bucket: countBucket(resultRows.length), selected_count_bucket: countBucket(selected.length), status: 'success' });
    analytics('export_completed', { tool: 'data_center', format: 'csv', result_count_bucket: countBucket(resultRows.length), status: 'success' });
    toast('CSV export prepared.', 'success');
  }

  function ensureViewControls() {
    if ($('dc-saved-views')) return;
    var host = $('dc-saved-controls');
    if (!host) return;
    host.innerHTML = '<div class="dc-view-actions"><select id="dc-saved-views" aria-label="Saved Data Center views"><option value="">Saved views</option></select><button id="dc-save-view" type="button"><i class="fas fa-bookmark"></i> Save current view</button><button id="dc-delete-view" type="button" hidden><i class="fas fa-trash"></i> Delete</button></div>';
    $('dc-save-view').addEventListener('click', saveView);
    $('dc-saved-views').addEventListener('change', applyView);
    $('dc-delete-view').addEventListener('click', deleteView);
  }
  function paintViews() {
    ensureViewControls();
    if (!$('dc-saved-views')) return;
    $('dc-saved-views').innerHTML = '<option value="">Saved views</option>' + views.map(function (view) { return '<option value="' + esc(view.id) + '"' + (view.id === activeView ? ' selected' : '') + '>' + esc(view.name) + '</option>'; }).join('');
    $('dc-delete-view').hidden = !activeView;
  }
  function loadViews() {
    ensureViewControls();
    return checkProPlus(false).then(function (state) {
      if (!state.ok) { if ($('dc-saved-controls')) $('dc-saved-controls').innerHTML = '<div class="dc-monitor-empty">Public browsing is active. Sign in with Pro+ to load private saved views.</div>'; return []; }
      return client().from('saved_data_center_views').select('id,name,scope,marker_ids,filters,sort_config,updated_at').order('updated_at', { ascending: false }).then(function (response) {
        if (response.error) throw response.error; views = response.data || []; paintViews(); return views;
      });
    }).catch(function () { return []; });
  }
  function saveView() {
    if (!selected.length) { toast('Select fields before saving a view.', 'error'); return; }
    checkProPlus(true).then(function (state) {
      if (!state.ok) return;
      return openModal({ title: 'Save Data Center view', copy: 'Give this governed field and filter set a reusable name.', type: 'text', confirm: 'Save view', cancel: 'Cancel' }).then(function (name) {
        name = String(name || '').trim(); if (!name) return;
        return client().from('saved_data_center_views').insert({ user_id: state.session.user.id, name: name.slice(0, 120), scope: $('dc-scope') ? $('dc-scope').value : 'property', marker_ids: selected, filters: readFilters() }).select('id,name,scope,marker_ids,filters,sort_config,updated_at').single().then(function (response) {
          if (response.error) throw response.error; views.unshift(response.data); activeView = response.data.id; paintViews(); analytics('data_center_view_saved', { selected_count_bucket: countBucket(selected.length), scope: $('dc-scope').value, status: 'success' }); toast('Saved view created.', 'success');
        });
      });
    }).catch(function (error) { toast('View could not be saved: ' + error.message, 'error'); });
  }
  function applyView(event) {
    activeView = event.target.value;
    $('dc-delete-view').hidden = !activeView;
    if (!activeView) return;
    var view = views.find(function (item) { return item.id === activeView; }); if (!view) return;
    selected = Array.isArray(view.marker_ids) ? view.marker_ids.slice() : [];
    var f = view.filters || {};
    if ($('dc-prof')) $('dc-prof').value = f.profession || '';
    if ($('dc-category')) $('dc-category').value = f.category || '';
    if ($('dc-origin')) $('dc-origin').value = f.origin || '';
    if ($('dc-provider-status')) $('dc-provider-status').value = f.availability || 'live';
    if ($('dc-search')) $('dc-search').value = f.query || '';
    if ($('dc-scope')) $('dc-scope').value = view.scope || 'property';
    render();
    if (window.WatchdogDataCenterPublic) window.WatchdogDataCenterPublic.activateTab('build', false);
  }
  function deleteView() {
    if (!activeView) return;
    checkProPlus(true).then(function (state) {
      if (!state.ok) return;
      return openModal({ title: 'Delete saved view?', copy: 'This removes the saved field/filter configuration. It does not delete any property records.', confirm: 'Delete view', cancel: 'Keep view' }).then(function (choice) {
        if (!choice) return;
        return client().from('saved_data_center_views').delete().eq('id', activeView).then(function (response) {
          if (response.error) throw response.error; views = views.filter(function (v) { return v.id !== activeView; }); activeView = ''; paintViews(); toast('Saved view deleted.', 'success');
        });
      });
    }).catch(function (error) { toast('View could not be deleted: ' + error.message, 'error'); });
  }

  function loadMonitoring() {
    var host = $('dc-monitor-list'); if (!host) return Promise.resolve();
    return checkProPlus(false).then(function (state) {
      if (!state.ok) { host.innerHTML = '<div class="dc-monitor-empty">Public browsing is active. Pro+ members can schedule private saved-view deliveries.</div>'; return; }
      return client().from('data_center_delivery_jobs').select('id,name,scope,format,cadence,next_run_at,last_run_at,status,updated_at').order('updated_at', { ascending: false }).limit(12).then(function (response) {
        if (response.error) throw response.error;
        var jobs = response.data || [];
        host.innerHTML = jobs.length ? jobs.map(function (job) { return '<div class="dcv2-fresh-row"><div class="dcv2-fresh-top"><b>' + esc(job.name || 'Data Center delivery') + '</b><span class="dcv2-fresh-badge">' + esc(label(job.status || 'scheduled')) + '</span></div><p>' + esc(label(job.cadence)) + ' · ' + esc(label(job.scope)) + ' · ' + esc(String(job.format || 'csv').toUpperCase()) + (job.next_run_at ? ' · next ' + esc(formatDate(job.next_run_at)) : '') + '</p></div>'; }).join('') : '<div class="dc-monitor-empty">No recurring Data Center deliveries yet.</div>';
      });
    }).catch(function () { host.innerHTML = '<div class="dc-monitor-empty">Monitoring status is unavailable right now.</div>'; });
  }
  function scheduleDelivery() {
    if (!activeView) { toast('Save the current field set before scheduling a delivery.', 'error'); if (window.WatchdogDataCenterPublic) window.WatchdogDataCenterPublic.activateTab('saved', false); return; }
    checkProPlus(true).then(function (state) {
      if (!state.ok) return;
      return openModal({ title: 'Schedule Data Center delivery', copy: 'Choose how often Watchdog should prepare this private saved view.', type: 'select', options: [{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }], confirm: 'Schedule', cancel: 'Cancel' }).then(function (cadence) {
        if (!cadence) return;
        var view = views.find(function (v) { return v.id === activeView; });
        return client().from('data_center_delivery_jobs').insert({ user_id: state.session.user.id, view_id: activeView, name: ((view && view.name) || 'Data Center') + ' delivery', scope: $('dc-scope').value, format: 'csv', cadence: cadence, status: 'scheduled', next_run_at: new Date().toISOString() }).then(function (response) {
          if (response.error) throw response.error; analytics('data_center_delivery_scheduled', { scope: $('dc-scope').value, format: 'csv', action: cadence, status: 'success' }); toast('Recurring delivery scheduled.', 'success'); loadMonitoring();
        });
      });
    }).catch(function (error) { toast('Delivery could not be scheduled: ' + error.message, 'error'); });
  }

  function wireEvents() {
    if ($('dc-rows')) $('dc-rows').addEventListener('change', function (event) {
      var checkbox = event.target.closest('[data-marker]'); if (!checkbox) return;
      var id = checkbox.dataset.marker;
      if (checkbox.checked && selected.indexOf(id) < 0) selected.push(id);
      if (!checkbox.checked) selected = selected.filter(function (item) { return item !== id; });
      renderSelected();
      analytics('data_center_field_selected', { marker_id: id, action: checkbox.checked ? 'add' : 'remove', selected_count_bucket: countBucket(selected.length) });
    });
    if ($('dc-chips')) $('dc-chips').addEventListener('click', function (event) {
      var button = event.target.closest('[data-remove]'); if (!button) return;
      selected = selected.filter(function (id) { return id !== button.dataset.remove; }); render();
    });
    if ($('dc-clear')) $('dc-clear').addEventListener('click', function () { selected = []; render(); });
    ['dc-prof', 'dc-category', 'dc-origin', 'dc-provider-status'].forEach(function (id) {
      var node = $(id); if (!node) return;
      node.addEventListener('change', function () { render(); analytics('data_center_filtered', { filter: id.replace('dc-', ''), interaction: node.value || 'all' }); });
    });
    if ($('dc-search')) $('dc-search').addEventListener('input', function () {
      render(); clearTimeout(searchTimer); searchTimer = setTimeout(function () { if ($('dc-search').value.trim()) analytics('data_center_searched', { interaction: 'query_present' }); }, 500);
    });
    document.addEventListener('watchdog:data-center-overview', render);
  }

  function loadCatalog() {
    return fetch('/property/data/marker-registry.json?v=20260829-dc-runtime', { cache: 'no-store' }).then(function (response) { if (!response.ok) throw new Error('Marker registry HTTP ' + response.status); return response.json(); }).then(function (data) {
      catalog = data;
      try { var stored = JSON.parse(localStorage.getItem('watchdog:data-center:fields') || '[]'); selected = Array.isArray(stored) ? stored : []; } catch (_error) { selected = []; }
      populateFilters(); ensureResultBuilder(); render();
      document.dispatchEvent(new CustomEvent('watchdog:data-center-ready', { detail: { total: catalog.markers.length } }));
      return data;
    }).catch(function (error) { if ($('dc-rows')) $('dc-rows').innerHTML = '<tr><td colspan="8" class="dc-empty">Data catalog could not be loaded.</td></tr>'; console.error('[Watchdog Data Center]', error); });
  }

  window.WatchdogDataCenterRuntime = { render: render, selected: function () { return selected.slice(); }, catalog: function () { return catalog; }, checkProPlus: checkProPlus };

  function start() {
    wireModal(); wireEvents(); ensureViewControls(); ensureResultBuilder(); loadCatalog(); loadViews(); loadMonitoring();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();