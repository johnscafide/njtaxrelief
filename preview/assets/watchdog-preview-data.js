/*
 * Watchdog preview data authority.
 * All user data reads for the isolated dashboard/home preview live here.
 * Property facts come from the governed semantic snapshot contract; this file
 * does not recreate provider selection, source precedence, or marker math.
 */
(function (window) {
  'use strict';

  var CONTRACT = 'watchdog-semantic-snapshot-v5';
  var PAGE_PACKS = {
    dashboard: ['identity', 'assessment_tax', 'sale_market'],
    home: ['identity', 'assessment_tax', 'sale_market', 'appeal_uniformity', 'municipal_pressure']
  };
  var PORTFOLIO_METRICS = [
    { id: 'property.assessed_value', label: 'Portfolio assessment', format: 'currency', method: 'Sum of available governed property assessments.' },
    { id: 'property.annual_tax', label: 'Annual property tax', format: 'currency', method: 'Sum of available reported annual tax values.' }
  ];

  function fail(code, message) {
    var error = new Error(message);
    error.code = code;
    throw error;
  }

  function getClient() {
    var runtime = window.NJPTRSupabaseRuntime;
    if (!runtime || typeof runtime.createClient !== 'function') {
      fail('runtime_unavailable', 'The shared Watchdog data runtime is unavailable.');
    }
    return runtime.createClient();
  }

  function uniqueProperties(rows) {
    var found = new Set();
    return (Array.isArray(rows) ? rows : []).filter(function (row) {
      var pin = String(row && row.pams_pin || '').trim();
      if (!pin || found.has(pin)) return false;
      found.add(pin);
      row.pams_pin = pin;
      return true;
    });
  }

  async function getSession(client) {
    var result = await client.auth.getSession();
    if (result && result.error) throw result.error;
    return result && result.data && result.data.session || null;
  }

  async function getSavedProperties(client, userId) {
    var rows = [];
    var pageSize = 500;
    for (var offset = 0; ; offset += pageSize) {
      var result = await client
        .from('saved_properties')
        .select('id,user_id,pams_pin,address,town,county,zip,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (result && result.error) throw result.error;
      var page = result && Array.isArray(result.data) ? result.data : [];
      rows = rows.concat(page);
      if (page.length < pageSize) break;
    }
    return uniqueProperties(rows);
  }

  async function getSemanticSnapshots(client, pins, packs) {
    var snapshots = new Map();
    var manifests = [];
    var registryVersion = null;
    var checkedAt = null;
    for (var offset = 0; offset < pins.length; offset += 25) {
      var batch = pins.slice(offset, offset + 25);
      var result = await client.functions.invoke('intelligence-semantic-context', {
        body: { pams_pins: batch, packs: packs }
      });
      if (result && result.error) throw result.error;
      var payload = result && result.data;
      if (!payload || payload.contract_version !== CONTRACT || !Array.isArray(payload.snapshots)) {
        fail('semantic_contract_mismatch', 'Watchdog returned an unsupported or incomplete data contract.');
      }
      payload.snapshots.forEach(function (snapshot) {
        if (snapshot && snapshot.pams_pin) snapshots.set(String(snapshot.pams_pin), snapshot);
      });
      if (Array.isArray(payload.packs)) manifests = manifests.concat(payload.packs);
      registryVersion = payload.registry_version || registryVersion;
      checkedAt = payload.checked_at || checkedAt;
    }
    return { snapshots: snapshots, packs: manifests, registryVersion: registryVersion, checkedAt: checkedAt };
  }

  function getMarker(snapshot, markerId) {
    if (!snapshot || !Array.isArray(snapshot.markers)) return null;
    return snapshot.markers.find(function (item) { return item && item.id === markerId; }) || null;
  }

  function summarizeMetric(entries, spec) {
    var sum = 0;
    var count = 0;
    entries.forEach(function (entry) {
      var marker = getMarker(entry.snapshot, spec.id);
      if (!marker || marker.state !== 'available' || typeof marker.value !== 'number' || !Number.isFinite(marker.value)) return;
      sum += marker.value;
      count += 1;
    });
    return {
      id: spec.id,
      label: spec.label,
      format: spec.format,
      value: count ? sum : null,
      available_count: count,
      property_count: entries.length,
      complete: entries.length > 0 && count === entries.length
    };
  }

  async function load(page, requestedPin) {
    var client = getClient();
    var session = await getSession(client);
    if (!session || !session.user) return { signed_in: false, properties: [] };

    var properties = await getSavedProperties(client, session.user.id);
    var allProperties = properties.slice();
    if (!properties.length) {
      return { signed_in: true, user: session.user, properties: [], entries: [], summaries: [], contract: CONTRACT };
    }

    var selected = null;
    if (page === 'home') {
      selected = properties.find(function (row) { return row.pams_pin === String(requestedPin || ''); }) || properties[0];
      properties = [selected];
    }

    var governed = await getSemanticSnapshots(client, properties.map(function (row) { return row.pams_pin; }), PAGE_PACKS[page] || PAGE_PACKS.dashboard);
    var entries = properties.map(function (property) {
      return { property: property, snapshot: governed.snapshots.get(property.pams_pin) || null };
    });

    return {
      signed_in: true,
      user: session.user,
      properties: allProperties,
      selected_pin: selected && selected.pams_pin || null,
      entries: entries,
      summaries: page === 'dashboard' ? PORTFOLIO_METRICS.map(function (metric) { return summarizeMetric(entries, metric); }) : [],
      packs: governed.packs,
      registry_version: governed.registryVersion,
      checked_at: governed.checkedAt,
      contract: CONTRACT
    };
  }

  window.WatchdogPreviewData = Object.freeze({
    load: load,
    getMarker: getMarker,
    pagePacks: PAGE_PACKS,
    contract: CONTRACT
  });
})(window);
