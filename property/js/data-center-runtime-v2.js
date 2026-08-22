(function () {
  'use strict';

  var catalog = null;
  var selected = [];
  var views = [];
  var activeView = '';
  var resultRows = [];
  var sb = null;

  var SB_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var SB_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;'
      }[char];
    });
  }

  function label(value) {
    return String(value || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, function (char) { return char.toUpperCase(); });
  }

  function markerProfessions(marker) {
    return Array.isArray(marker && marker.professions) ? marker.professions : [];
  }

  function allowed(marker, tier, profession) {
    if (tier === 'standard') return marker.tier === 'standard';
    if (tier === 'pro') {
      return marker.tier === 'standard' ||
        (marker.tier === 'pro' && (!profession || markerProfessions(marker).indexOf(profession) >= 0));
    }
    return true;
  }

  function client() {
    if (sb) return sb;

    if (window.NJPTRAccess && typeof window.NJPTRAccess.client === 'function') {
      try {
        sb = window.NJPTRAccess.client();
        if (sb) return sb;
      } catch (_error) {}
    }

    if (window.NJPTRSupabaseRuntime && typeof window.NJPTRSupabaseRuntime.createClient === 'function') {
      try {
        sb = window.NJPTRSupabaseRuntime.createClient();
        if (sb) return sb;
      } catch (_error2) {}
    }

    if (window.supabase && typeof window.supabase.createClient === 'function') {
      sb = window.supabase.createClient(SB_URL, SB_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
          storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token'
        }
      });
    }

    return sb;
  }

  window.WatchdogDataCenterClient = client;

  function renderStats() {
    if (!catalog || !catalog.summary) return;
    var summary = catalog.summary;
    $('dc-total').textContent = summary.total;
    $('dc-percent').textContent = summary.percent_of_goal + '%';
    $('dc-progress-bar').style.width = Math.min(100, Number(summary.percent_of_goal) || 0) + '%';

    var stats = [
      ['Public source', summary.public_source],
      ['Watchdog derived', summary.proprietary_derived],
      ['Standard', summary.by_tier && summary.by_tier.standard],
      ['Pro', summary.by_tier && summary.by_tier.pro],
      ['Pro+', summary.by_tier && summary.by_tier.pro_plus]
    ];

    $('dc-stats').innerHTML = stats.map(function (item) {
      return '<div class="dc-stat"><b>' + esc(item[1]) + '</b><span>' + esc(item[0]) + '</span></div>';
    }).join('');
  }

  function saveLocal() {
    try {
      localStorage.setItem('watchdog:data-center:fields', JSON.stringify(selected));
    } catch (_error) {}
  }

  function renderSelected() {
    if (!catalog) return;
    var markerMap = {};
    catalog.markers.forEach(function (marker) {
      markerMap[marker.id] = marker;
    });

    selected = selected.filter(function (id) { return !!markerMap[id]; });
    $('dc-selected-count').textContent = selected.length + ' field' + (selected.length === 1 ? '' : 's') + ' selected';
    $('dc-chips').innerHTML = '<div class="dc-chips">' + selected.map(function (id) {
      return '<button data-remove="' + esc(id) + '" title="Remove">' + esc(markerMap[id].label) + ' ×</button>';
    }).join('') + '</div>';
  }

  function readFilters() {
    return {
      profession: $('dc-prof').value,
      tier: $('dc-tier').value,
      category: $('dc-category').value,
      origin: $('dc-origin').value,
      query: $('dc-search').value.trim()
    };
  }

  function render() {
    if (!catalog) return;
    var current = readFilters();
    var query = current.query.toLowerCase();

    var rows = catalog.markers.filter(function (marker) {
      var professions = markerProfessions(marker);
      var searchable = [
        marker.label,
        marker.description,
        marker.id,
        marker.category,
        professions.join(' '),
        marker.professional_reason
      ].join(' ').toLowerCase();

      return allowed(marker, current.tier, current.profession) &&
        (!current.category || marker.category === current.category) &&
        (!current.origin || marker.origin === current.origin) &&
        (!current.profession || professions.indexOf(current.profession) >= 0) &&
        (!query || searchable.indexOf(query) >= 0);
    });

    $('dc-rows').innerHTML = rows.length ? rows.map(function (marker) {
      var professions = markerProfessions(marker);
      var professionTags = professions.map(function (profession) {
        var match = catalog.professions.find(function (item) { return item.id === profession; });
        return '<span>' + esc(match ? match.label : profession) + '</span>';
      }).join('');

      return '<tr>' +
        '<td class="dc-check"><input type="checkbox" data-marker="' + esc(marker.id) + '" ' +
          (selected.indexOf(marker.id) >= 0 ? 'checked' : '') + '></td>' +
        '<td><a class="dm" title="' + esc(marker.professional_reason || marker.description || '') + '" ' +
          'data-marker-id="' + esc(marker.id) + '" href="/property/marker?id=' + encodeURIComponent(marker.id) + '">' +
          '<strong>' + esc(marker.label) + '</strong></a><small>' + esc(marker.id) + '</small></td>' +
        '<td>' + esc(label(marker.category)) + '</td>' +
        '<td>' + esc(label(marker.scope)) + '</td>' +
        '<td><span class="dc-pill ' + esc(marker.tier) + '">' +
          esc(marker.tier === 'pro_plus' ? 'PRO+' : String(marker.tier || '').toUpperCase()) + '</span></td>' +
        '<td><span class="dc-pill ' + esc(marker.origin) + '">' +
          esc(marker.origin === 'public' ? 'Public' : 'Watchdog derived') + '</span></td>' +
        '<td class="dc-prof-tags">' + professionTags + '</td>' +
      '</tr>';
    }).join('') : '<tr><td class="dc-empty" colspan="7">No live markers match these filters.</td></tr>';

    renderSelected();
  }

  function ensureViewControls() {
    if ($('dc-saved-views')) return;
    var selectedBox = document.querySelector('.dc-selected');
    if (!selectedBox) return;

    var bar = document.createElement('div');
    bar.className = 'dc-view-actions';
    bar.innerHTML =
      '<select id="dc-saved-views" aria-label="Saved Data Center views"><option value="">Saved views</option></select>' +
      '<button id="dc-save-view" type="button"><i class="fas fa-bookmark"></i> Save view</button>' +
      '<button id="dc-delete-view" type="button" title="Delete selected view" hidden><i class="fas fa-trash"></i></button>';

    selectedBox.insertBefore(bar, $('dc-chips'));
    $('dc-save-view').addEventListener('click', saveView);
    $('dc-saved-views').addEventListener('change', applyView);
    $('dc-delete-view').addEventListener('click', deleteView);
  }

  function ensureResultBuilder() {
    if ($('dc-build')) return;
    var host = document.querySelector('.dc-selected');
    if (!host) return;

    var box = document.createElement('section');
    box.className = 'dc-result-builder';
    box.innerHTML =
      '<div class="dc-result-controls">' +
        '<label>Scope<select id="dc-scope"><option value="property">Property rows</option><option value="town">Town summary</option><option value="county">County summary</option></select></label>' +
        '<button id="dc-build" type="button">Build sheet</button>' +
        '<button id="dc-export" type="button" disabled>Export CSV</button>' +
        '<button id="dc-schedule" type="button">Schedule</button>' +
      '</div>' +
      '<p id="dc-result-note">Select fields, then build a governed provider-backed result sheet. Unsupported fields are identified, never invented.</p>' +
      '<div id="dc-results" class="dc-results" hidden></div>';

    host.insertAdjacentElement('afterend', box);
    $('dc-build').addEventListener('click', buildSheet);
    $('dc-export').addEventListener('click', exportSheet);
    $('dc-schedule').addEventListener('click', scheduleDelivery);
  }

  var providers = {
    'property.address': 'address',
    'property.municipality': 'town',
    'property.county': 'county',
    'property.block': 'block',
    'property.lot': 'lot',
    'property.pams_pin': 'pams_pin',
    'property.assessed_value': 'assessed',
    'property.assessed': 'assessed',
    'property.annual_tax': 'last_year_tax',
    'property.market_value': 'watchdog_value',
    'watchdog.market_value_estimate': 'watchdog_value',
    'watchdog.effective_tax_rate': 'effective_rate',
    'tax.effective_rate': 'effective_rate'
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

  function markerById(id) {
    return catalog && Array.isArray(catalog.markers) ?
      catalog.markers.find(function (marker) { return marker.id === id; }) : null;
  }

  function aggregate(rows, scope) {
    var grouped = {};

    rows.forEach(function (row) {
      var key = scope === 'town' ? (row.town || 'Unknown town') : (row.county || 'Unknown county');
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    });

    return Object.keys(grouped).sort().map(function (key) {
      var groupRows = grouped[key];
      var output = {
        address: key,
        town: key,
        county: key,
        pams_pin: groupRows.length + ' account properties',
        __markers: {}
      };

      ['assessed', 'last_year_tax', 'watchdog_value'].forEach(function (field) {
        var numbers = groupRows.map(function (row) { return Number(row[field]); }).filter(Number.isFinite);
        output[field] = numbers.length ? numbers.reduce(function (sum, number) { return sum + number; }, 0) : null;
      });

      var rates = groupRows.map(function (row) { return Number(row.effective_rate); }).filter(Number.isFinite);
      output.effective_rate = rates.length ? rates.reduce(function (sum, number) { return sum + number; }, 0) / rates.length : null;

      selected.forEach(function (id) {
        var marker = markerById(id);
        var compatible =
          (scope === 'town' && marker && (marker.scope === 'municipality' || marker.scope === 'town')) ||
          (scope === 'county' && marker && marker.scope === 'county');

        if (!compatible) return;

        for (var i = 0; i < groupRows.length; i += 1) {
          var row = groupRows[i];
          if (row.__markers && Object.prototype.hasOwnProperty.call(row.__markers, id) && row.__markers[id] != null) {
            output.__markers[id] = row.__markers[id];
            break;
          }
        }
      });

      return output;
    });
  }

  function chunksOf(items, size) {
    var output = [];
    for (var i = 0; i < items.length; i += size) output.push(items.slice(i, i + size));
    return output;
  }

  function invokeWorkbench(name, batch, ids) {
    var c = client();
    if (!c) return Promise.reject(new Error('Data service unavailable'));
    return c.functions.invoke(name, {
      body: {
        pams_pins: batch,
        marker_ids: ids
      }
    }).then(function (response) {
      if (response.error) throw response.error;
      return response.data || {};
    });
  }

  function hydrateRows(rows) {
    var pins = rows.map(function (row) { return row.pams_pin; }).filter(Boolean);
    if (!pins.length) return Promise.resolve(rows);

    var pinChunks = chunksOf(pins, 500);
    var allFieldChunks = chunksOf(selected, 500);
    var derivedIds = selected.filter(function (id) {
      var marker = markerById(id);
      return marker && marker.origin === 'watchdog-derived';
    });
    var derivedFieldChunks = chunksOf(derivedIds, 250);
    var calls = [];

    pinChunks.forEach(function (batch) {
      allFieldChunks.forEach(function (ids) {
        calls.push(invokeWorkbench('workbench-hydrate', batch, ids).then(function (data) {
          return { kind: 'base', data: data };
        }));
      });

      derivedFieldChunks.forEach(function (ids) {
        calls.push(invokeWorkbench('workbench-derived', batch, ids).then(function (data) {
          return { kind: 'derived', data: data };
        }));
      });
    });

    return Promise.all(calls).then(function (parts) {
      var records = {};
      var markers = {};
      var meta = {};

      parts.sort(function (a, b) {
        if (a.kind === 'base' && b.kind === 'derived') return -1;
        if (a.kind === 'derived' && b.kind === 'base') return 1;
        return 0;
      });

      parts.forEach(function (part) {
        var data = part.data || {};

        (data.records || []).forEach(function (record) {
          var pin = String(record.pams_pin);
          records[pin] = Object.assign(records[pin] || {}, record);
        });

        Object.keys(data.markers || {}).forEach(function (pin) {
          markers[pin] = Object.assign(markers[pin] || {}, data.markers[pin]);
        });

        Object.keys(data.meta || {}).forEach(function (pin) {
          meta[pin] = Object.assign(meta[pin] || {}, data.meta[pin]);
        });
      });

      return rows.map(function (row) {
        var pin = String(row.pams_pin || '');
        return Object.assign({}, row, records[pin] || {}, {
          __markers: markers[pin] || {},
          __meta: meta[pin] || {}
        });
      });
    });
  }

  function session() {
    var c = client();
    if (!c) return Promise.resolve(null);
    return c.auth.getSession().then(function (response) {
      return response.data && response.data.session;
    });
  }

  function buildSheet() {
    if (!selected.length) {
      alert('Select at least one field first.');
      return;
    }

    $('dc-result-note').textContent = 'Resolving selected fields through live governed providers…';

    session().then(function (currentSession) {
      if (!currentSession) throw new Error('Sign in required');
      return client()
        .from('saved_properties')
        .select('pams_pin,address,town,county,block,lot,assessed,last_year_tax,effective_rate,watchdog_value')
        .order('address');
    }).then(function (response) {
      if (response.error) throw response.error;
      return hydrateRows(response.data || []);
    }).then(function (rows) {
      var scope = $('dc-scope').value;
      resultRows = scope === 'property' ? rows : aggregate(rows, scope);

      var labels = {};
      catalog.markers.forEach(function (marker) { labels[marker.id] = marker.label; });

      $('dc-results').hidden = false;
      $('dc-results').innerHTML =
        '<table><thead><tr>' + selected.map(function (id) {
          return '<th>' + esc(labels[id] || id) + '</th>';
        }).join('') + '</tr></thead><tbody>' + resultRows.map(function (row) {
          return '<tr>' + selected.map(function (id) {
            return '<td>' + esc(value(row, id)) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table>';

      $('dc-export').disabled = !resultRows.length;
      $('dc-result-note').textContent = resultRows.length + ' governed ' + scope + ' row' +
        (resultRows.length === 1 ? '' : 's') +
        '. Live fields are resolved by the production Workbench provider contract; missing source values remain explicitly blank.';
    }).catch(function (error) {
      $('dc-result-note').textContent = 'Sheet could not be built: ' + error.message;
    });
  }

  function csvCell(valueToEncode) {
    return '"' + String(valueToEncode == null ? '' : valueToEncode).replace(/"/g, '""') + '"';
  }

  function exportSheet() {
    if (!resultRows.length) return;

    var labels = {};
    catalog.markers.forEach(function (marker) { labels[marker.id] = marker.label; });

    var csv = [selected.map(function (id) {
      return csvCell(labels[id] || id);
    }).join(',')].concat(resultRows.map(function (row) {
      return selected.map(function (id) { return csvCell(value(row, id)); }).join(',');
    })).join('\r\n');

    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'watchdog-data-center-' + new Date().toISOString().slice(0, 10) + '.csv';
    anchor.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function scheduleDelivery() {
    if (!activeView) {
      alert('Save this column set before scheduling delivery.');
      return;
    }

    var cadence = window.prompt('Delivery cadence: weekly or monthly', 'weekly');
    cadence = String(cadence || '').toLowerCase();
    if (['weekly', 'monthly'].indexOf(cadence) < 0) return;

    var view = views.find(function (item) { return item.id === activeView; });
    client().from('data_center_delivery_jobs').insert({
      view_id: activeView,
      name: ((view && view.name) || 'Data Center') + ' delivery',
      scope: $('dc-scope').value,
      format: 'csv',
      cadence: cadence,
      status: 'scheduled',
      next_run_at: new Date().toISOString()
    }).then(function (response) {
      if (response.error) throw response.error;
      alert('Scheduled. Watchdog will prepare the next delivery automatically.');
    }).catch(function (error) {
      alert('Delivery could not be scheduled: ' + error.message);
    });
  }

  function paintViews() {
    var select = $('dc-saved-views');
    if (!select) return;

    select.innerHTML = '<option value="">Saved views</option>' + views.map(function (view) {
      return '<option value="' + esc(view.id) + '"' + (view.id === activeView ? ' selected' : '') + '>' +
        esc(view.name) + '</option>';
    }).join('');

    $('dc-delete-view').hidden = !activeView;
  }

  function loadViews() {
    ensureViewControls();
    return session().then(function (currentSession) {
      if (!currentSession) return [];

      return client()
        .from('saved_data_center_views')
        .select('id,name,scope,marker_ids,filters,sort_config,updated_at')
        .order('updated_at', { ascending: false })
        .then(function (response) {
          if (response.error) throw response.error;
          views = response.data || [];
          paintViews();
          return views;
        });
    }).catch(function () {
      return [];
    });
  }

  function saveView() {
    session().then(function (currentSession) {
      if (!currentSession) {
        alert('Sign in to save Data Center views across devices.');
        return null;
      }

      var name = window.prompt('Name this Data Center view:');
      if (!name || !name.trim()) return null;

      return client()
        .from('saved_data_center_views')
        .insert({
          name: name.trim().slice(0, 120),
          scope: 'property',
          marker_ids: selected,
          filters: readFilters()
        })
        .select('id,name,scope,marker_ids,filters,sort_config,updated_at')
        .single()
        .then(function (response) {
          if (response.error) throw response.error;
          views.unshift(response.data);
          activeView = response.data.id;
          paintViews();
          return response.data;
        });
    }).catch(function (error) {
      alert('View could not be saved: ' + error.message);
    });
  }

  function applyView(event) {
    activeView = event.target.value;
    $('dc-delete-view').hidden = !activeView;
    if (!activeView) return;

    var view = views.find(function (item) { return item.id === activeView; });
    if (!view) return;

    selected = Array.isArray(view.marker_ids) ? view.marker_ids : [];
    var storedFilters = view.filters || {};
    $('dc-prof').value = storedFilters.profession || '';
    $('dc-tier').value = storedFilters.tier || 'pro_plus';
    $('dc-category').value = storedFilters.category || '';
    $('dc-origin').value = storedFilters.origin || '';
    $('dc-search').value = storedFilters.query || '';
    saveLocal();
    render();
  }

  function deleteView() {
    if (!activeView || !window.confirm('Delete this saved Data Center view?')) return;

    client().from('saved_data_center_views').delete().eq('id', activeView).then(function (response) {
      if (response.error) throw response.error;
      views = views.filter(function (view) { return view.id !== activeView; });
      activeView = '';
      paintViews();
    }).catch(function (error) {
      alert('View could not be deleted: ' + error.message);
    });
  }

  function init(data) {
    if (!data || !Array.isArray(data.markers) || !Array.isArray(data.professions)) {
      throw new Error('Marker registry payload is invalid');
    }

    catalog = data;

    var viewPlan = document.documentElement.dataset.viewPlan;
    if (viewPlan) $('dc-tier').value = viewPlan === 'developer' ? 'pro_plus' : viewPlan;

    try {
      selected = JSON.parse(localStorage.getItem('watchdog:data-center:fields')) || [];
      if (!Array.isArray(selected)) selected = [];
    } catch (_error) {
      selected = [];
    }

    data.professions.forEach(function (profession) {
      $('dc-prof').insertAdjacentHTML(
        'beforeend',
        '<option value="' + esc(profession.id) + '">' + esc(profession.label) + '</option>'
      );
    });

    Array.from(new Set(data.markers.map(function (marker) { return marker.category; })))
      .sort()
      .forEach(function (category) {
        $('dc-category').insertAdjacentHTML(
          'beforeend',
          '<option value="' + esc(category) + '">' + esc(label(category)) + '</option>'
        );
      });

    renderStats();
    render();
    ensureResultBuilder();
    loadViews();

    document.documentElement.dataset.dataCenterReady = 'true';
    document.dispatchEvent(new CustomEvent('watchdog:data-center-ready', {
      detail: { total: data.markers.length }
    }));
  }

  function wireEvents() {
    ['dc-search', 'dc-prof', 'dc-tier', 'dc-category', 'dc-origin'].forEach(function (id) {
      var node = $(id);
      if (!node) return;
      node.addEventListener(id === 'dc-search' ? 'input' : 'change', render);
    });

    $('dc-rows').addEventListener('change', function (event) {
      var id = event.target && event.target.dataset ? event.target.dataset.marker : '';
      if (!id) return;

      if (event.target.checked && selected.indexOf(id) < 0) selected.push(id);
      if (!event.target.checked) selected = selected.filter(function (item) { return item !== id; });
      saveLocal();
      renderSelected();
    });

    $('dc-chips').addEventListener('click', function (event) {
      var button = event.target.closest('[data-remove]');
      if (!button) return;
      selected = selected.filter(function (item) { return item !== button.dataset.remove; });
      saveLocal();
      render();
    });

    $('dc-clear').addEventListener('click', function () {
      selected = [];
      saveLocal();
      render();
    });
  }

  function fail(error) {
    var rows = $('dc-rows');
    if (rows) rows.innerHTML = '<tr><td class="dc-empty" colspan="7">Marker registry could not load.</td></tr>';
    console.error('[Watchdog Data Center] startup failed', error);
  }

  function start() {
    try {
      wireEvents();
    } catch (error) {
      fail(error);
      return;
    }

    fetch('/property/data/marker-registry.json?v=20260822d', { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('Marker registry HTTP ' + response.status);
        return response.json();
      })
      .then(init)
      .catch(fail);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
