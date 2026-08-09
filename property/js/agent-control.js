(function () {
  'use strict';
  var client = null;
  var user = null;
  var territories = [];
  var farm = [];
  var sent = {};
  var $ = function (id) { return document.getElementById(id); };
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(message) { var node = $('pl-toast'); if (!node) return; node.textContent = message; node.style.display = 'block'; clearTimeout(window._act); window._act = setTimeout(function () { node.style.display = 'none'; }, 2400); }
  function pinFromLink(link) { try { return new URL(link.href).searchParams.get('pin') || ''; } catch (_) { return ''; } }
  function eventKey(target) {
    var card = target.closest && target.closest('[data-key]');
    if (card && card.dataset.key) return card.dataset.key;
    var link = target.closest && target.closest('a[href*="pin="]');
    return link ? pinFromLink(link) : '';
  }

  function logEvent(name, target, metadata) {
    if (!client || !user) return;
    var key = eventKey(target) || 'agent-desk:' + name;
    var dedupe = name + ':' + key;
    if (sent[dedupe] && Date.now() - sent[dedupe] < 15000) return;
    sent[dedupe] = Date.now();
    var link = target.closest && target.closest('a[href*="pin="]');
    client.from('agent_funnel_events').insert({
      user_id: user.id,
      opportunity_key: key,
      pams_pin: link ? pinFromLink(link) || null : null,
      event_name: name,
      metadata: metadata || {}
    }).then(function (result) { if (result.error) console.warn('Agent funnel event was not recorded:', result.error.message); });
  }

  function bindTelemetry() {
    document.addEventListener('click', function (event) {
      var evidence = event.target.closest('[data-action="evidence"],[data-focus="evidence"]');
      if (evidence) logEvent('evidence_opened', evidence, { surface: evidence.dataset.focus ? 'focus' : 'queue' });
      var property = event.target.closest('.ad-address-link,.ad-focus-main a,.ad-focus-actions a');
      if (property && property.matches('a')) logEvent('property_opened', property, { surface: property.closest('.ad-focus') ? 'focus' : 'queue' });
      var watch = event.target.closest('[data-action="watch"]');
      if (watch) logEvent('watched', watch);
      var dismiss = event.target.closest('[data-action="dismiss"]');
      if (dismiss) logEvent('dismissed', dismiss);
    });
    document.addEventListener('change', function (event) {
      if (!event.target.matches('[data-action="outcome"]') || !event.target.value) return;
      var map = { touch: 'conversation_started', reply: 'reply', valuation_request: 'valuation_request', appointment: 'appointment', listing: 'listing', not_relevant: 'dismissed' };
      logEvent(map[event.target.value] || 'conversation_started', event.target, { recorded_outcome: event.target.value });
    });
  }

  function coverage(territory) {
    var value = territory.scope_value.toLowerCase();
    return farm.filter(function (row) {
      if (territory.scope_type === 'municipality') return String(row.municipality || '').toLowerCase() === value;
      if (territory.scope_type === 'county') return String(row.county || '').toLowerCase() === value;
      return String(row.zip || '').replace(/\D/g, '').slice(0, 5) === value.replace(/\D/g, '').slice(0, 5);
    }).length;
  }

  function drawTerritories() {
    var host = $('ad-territory-list');
    if (!host) return;
    if (!territories.length) {
      host.innerHTML = '<div class="ad-territory-empty"><i class="fas fa-map-location-dot"></i><div><b>Create your first territory</b><p>Group your lawful sphere by town, county or ZIP and see where new property evidence is concentrated.</p></div></div>';
      return;
    }
    host.innerHTML = territories.map(function (row) {
      var count = coverage(row);
      return '<div class="ad-territory" data-id="' + esc(row.id) + '"><i class="fas fa-map-pin"></i><div><b>' + esc(row.label) + '</b><span>' + esc(row.scope_value) + ' · ' + count + ' sphere propert' + (count === 1 ? 'y' : 'ies') + '</span><small data-territory-status>Protected records available on demand</small></div><button type="button" data-territory-preview title="Check current protected municipal inventory"><i class="fas fa-database"></i> Check data</button><button type="button" data-territory-remove aria-label="Remove territory"><i class="fas fa-xmark"></i></button></div>';
    }).join('');
  }

  function loadTerritories() {
    return Promise.all([
      client.from('agent_territories').select('*').order('updated_at', { ascending: false }),
      client.from('agent_farm_properties').select('pams_pin,address,municipality,county,zip')
    ]).then(function (results) {
      if (results[0].error) throw results[0].error;
      territories = results[0].data || [];
      farm = results[1].data || [];
      drawTerritories();
    }).catch(function (error) {
      $('ad-territory-list').innerHTML = '<div class="ad-control-error"><b>Territories need the v0.45 database migration.</b><span>' + esc(error.message || 'Unavailable') + '</span></div>';
    });
  }

  function bindTerritories() {
    var form = $('ad-territory-form');
    $('ad-territory-new').onclick = function () { form.hidden = false; $('ad-territory-label').focus(); };
    $('ad-territory-cancel').onclick = function () { form.hidden = true; form.reset(); };
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      client.from('agent_territories').upsert({
        user_id: user.id,
        label: $('ad-territory-label').value.trim(),
        scope_type: $('ad-territory-type').value,
        scope_value: $('ad-territory-value').value.trim(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,scope_type,scope_value' }).then(function (result) {
        if (result.error) throw result.error;
        form.hidden = true; form.reset(); toast('Territory saved'); return loadTerritories();
      }).catch(function (error) { toast(error.message || 'Territory could not be saved'); });
    });
    $('ad-territory-list').addEventListener('click', function (event) {
      var row = event.target.closest('.ad-territory'); if (!row) return;
      var territory = territories.find(function (item) { return item.id === row.dataset.id; }); if (!territory) return;
      if (event.target.closest('[data-territory-remove]')) {
        client.from('agent_territories').delete().eq('id', territory.id).then(function (result) { if (result.error) throw result.error; return loadTerritories(); }).catch(function (error) { toast(error.message); });
      }
      if (event.target.closest('[data-territory-preview]')) {
        var status = row.querySelector('[data-territory-status]'); status.textContent = 'Checking protected inventory…';
        client.functions.invoke('municipal-data', { body: { scope_type: territory.scope_type, scope_value: territory.scope_value, property_classes: territory.property_classes, limit: 25 } }).then(function (result) {
          if (result.error) throw result.error;
          status.textContent = result.data.count + ' current records sampled · delivery ' + String(result.data.delivery_id).slice(0, 8);
        }).catch(function (error) { status.textContent = error.message || 'Inventory is temporarily unavailable'; });
      }
    });
  }

  var STAGES = [
    ['Evidence reviewed', ['evidence_opened']],
    ['Conversation started', ['conversation_started']],
    ['Response or valuation', ['reply', 'valuation_request']],
    ['Appointment or listing', ['appointment', 'listing']]
  ];
  function drawFunnel(events) {
    var counts = STAGES.map(function (stage) { return stage[1].reduce(function (total, name) { return total + events.filter(function (row) { return row.event_name === name; }).length; }, 0); });
    var base = Math.max(counts[0], 1);
    $('ad-funnel').innerHTML = STAGES.map(function (stage, index) {
      var percent = index === 0 ? 100 : Math.min(100, Math.round((counts[index] / base) * 100));
      return '<div class="ad-funnel-stage"><div><span>' + esc(stage[0]) + '</span><b>' + counts[index] + '</b></div><i><em style="width:' + percent + '%"></em></i><small>' + (index ? percent + '% of evidence reviews' : 'workflow starting point') + '</small></div>';
    }).join('');
  }
  function loadFunnel() {
    var since = new Date(Date.now() - Number($('ad-funnel-window').value || 30) * 86400000).toISOString();
    client.from('agent_funnel_events').select('event_name,occurred_at').gte('occurred_at', since).order('occurred_at', { ascending: false }).then(function (result) {
      if (result.error) throw result.error; drawFunnel(result.data || []);
    }).catch(function (error) { $('ad-funnel').innerHTML = '<div class="ad-control-error"><b>Conversion analytics need the v0.45 migration.</b><span>' + esc(error.message || 'Unavailable') + '</span></div>'; });
  }

  function start(context) {
    if (!context || !context.user) return;
    user = context.user;
    client = window.NJPTRAccess && typeof window.NJPTRAccess.client === 'function' ? window.NJPTRAccess.client() : null;
    if (!client) return;
    bindTelemetry(); bindTerritories();
    $('ad-funnel-window').onchange = loadFunnel;
    loadTerritories(); loadFunnel();
  }
  Promise.resolve(window.njptrAccessReady).then(start).catch(function () {});
})();
