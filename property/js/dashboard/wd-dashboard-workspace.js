/* Dashboard-only composition and real-data card visuals. This file decorates
   the existing renderer output and does not fetch or mutate property data. */
(function (w, d) {
  'use strict';
  var WD = w.WD;
  if (!WD || w.__WDD_WORKSPACE_EXTENSION__) return;
  var signals = d.getElementById('wdd-signals');
  var rail = d.getElementById('wdd-rail');
  if (!signals || !rail) return;
  w.__WDD_WORKSPACE_EXTENSION__ = true;

  var colorClasses = ['is-blue', 'is-green', 'is-yellow', 'is-coral'];

  function element(tag, className, text) {
    var node = d.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function chart(label, className) {
    var node = element('div', 'wdd-mini-chart ' + className);
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', label);
    return node;
  }

  function titleKey(card) {
    var title = card.querySelector('.wdd-signal-k');
    return title ? title.textContent.trim().toLowerCase() : '';
  }

  function removeCharts(card) {
    Array.prototype.forEach.call(card.querySelectorAll('.wdd-mini-chart'), function (node) {
      node.remove();
    });
  }

  function countyChart(props) {
    var counts = {};
    props.forEach(function (property) {
      var key = String(property.county || '').trim().toUpperCase() || 'NOT SET';
      counts[key] = (counts[key] || 0) + 1;
    });
    var rows = Object.keys(counts).map(function (key) {
      return { label: key === 'NOT SET' ? 'Not set' : WD.H.titleCase(key), count: counts[key] };
    }).sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label); });
    var visible = rows.slice(0, 3);
    var otherCount = rows.slice(3).reduce(function (sum, row) { return sum + row.count; }, 0);
    if (otherCount) visible.push({ label: 'Other', count: otherCount });
    var description = visible.length
      ? visible.map(function (row) { return row.label + ' ' + row.count; }).join(', ')
      : 'no properties in this selection';
    var result = chart('Properties by county: ' + description, 'wdd-county-chart');
    var list = element('div', 'wdd-county-rows');
    list.setAttribute('aria-hidden', 'true');
    var max = Math.max.apply(null, visible.map(function (row) { return row.count; }).concat([1]));
    if (!visible.length) {
      list.appendChild(element('small', '', 'No county data'));
    } else {
      visible.forEach(function (row) {
        var line = element('span');
        line.appendChild(element('small', '', row.label));
        var track = element('i');
        var fill = element('b');
        fill.style.width = ((row.count / max) * 100).toFixed(1) + '%';
        track.appendChild(fill);
        line.appendChild(track);
        line.appendChild(element('strong', '', row.count));
        list.appendChild(line);
      });
    }
    result.appendChild(list);
    return result;
  }

  function marketChart(stats) {
    var assessed = WD.H.num(stats.assessed);
    var market = WD.H.num(stats.value);
    var max = Math.max(assessed, market, 1);
    var label = 'Portfolio assessed total ' + (assessed ? WD.H.money(assessed) : 'unavailable') +
      ' compared with governed market estimate ' + (market ? WD.H.money(market) : 'unavailable');
    var result = chart(label, 'wdd-compare-chart');
    result.setAttribute('aria-hidden', 'false');
    result.setAttribute('role', 'img');
    result.appendChild(compareRow('Assessed', assessed, max));
    result.appendChild(compareRow('Market', market, max));
    return result;
  }

  function compareRow(label, value, max) {
    var row = element('div', 'wdd-compare-row');
    row.setAttribute('aria-hidden', 'true');
    row.appendChild(element('span', '', label));
    var track = element('i');
    var fill = element('b');
    fill.style.width = Math.max(0, Math.min(100, (value / max) * 100)).toFixed(1) + '%';
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(element('strong', '', value > 0 ? WD.H.money(value) : '—'));
    return row;
  }

  function taxChart(props) {
    var bands = [
      { label: '0–5k', min: 0, max: 5000, count: 0 },
      { label: '5–10k', min: 5000, max: 10000, count: 0 },
      { label: '10–20k', min: 10000, max: 20000, count: 0 },
      { label: '20k+', min: 20000, max: Infinity, count: 0 }
    ];
    var validTaxes = props.map(function (property) { return WD.H.valid(property.last_year_tax); })
      .filter(function (value) { return value != null && value > 0; });
    validTaxes.forEach(function (value) {
      for (var i = 0; i < bands.length; i += 1) {
        if (value >= bands[i].min && value < bands[i].max) { bands[i].count += 1; break; }
      }
    });
    var max = Math.max.apply(null, bands.map(function (band) { return band.count; }).concat([1]));
    var label = 'Annual tax bands for ' + validTaxes.length + ' properties with recorded tax: ' +
      bands.map(function (band) { return band.label + ' ' + band.count; }).join(', ');
    var result = chart(label, 'wdd-tax-chart');
    var bars = element('div', 'wdd-tax-bars');
    bars.setAttribute('aria-hidden', 'true');
    bands.forEach(function (band) {
      var item = element('span');
      var bar = element('i');
      bar.style.setProperty('--bar', ((band.count / max) * 100).toFixed(1) + '%');
      item.appendChild(bar);
      item.appendChild(element('b', '', band.count));
      item.appendChild(element('small', '', band.label));
      bars.appendChild(item);
    });
    result.appendChild(bars);
    return result;
  }

  function reviewChart(props) {
    var mix = { bad: 0, warn: 0, ok: 0 };
    props.forEach(function (property) {
      var category = WD.categoryFor(property);
      if (Object.prototype.hasOwnProperty.call(mix, category)) mix[category] += 1;
    });
    var total = props.length;
    var label = 'Review status breakdown: ' + mix.bad + ' review, ' + mix.warn + ' watch, ' + mix.ok + ' good';
    var result = chart(label, 'wdd-status-chart');
    var stacked = element('div', 'wdd-mini-stacked');
    stacked.setAttribute('aria-hidden', 'true');
    [
      { key: 'bad', color: 'is-coral' },
      { key: 'warn', color: 'is-yellow' },
      { key: 'ok', color: 'is-green' }
    ].forEach(function (item) {
      var segment = element('i', 'wdd-mini-segment ' + item.color);
      segment.style.setProperty('--segment', (total ? mix[item.key] / total * 100 : 0).toFixed(1) + '%');
      stacked.appendChild(segment);
    });
    result.appendChild(stacked);
    var legend = element('div', 'wdd-mini-legend');
    legend.setAttribute('aria-hidden', 'true');
    [
      { key: 'bad', label: 'Review', color: 'is-coral' },
      { key: 'warn', label: 'Watch', color: 'is-yellow' },
      { key: 'ok', label: 'Good', color: 'is-green' }
    ].forEach(function (item) {
      var entry = element('span');
      entry.appendChild(element('i', item.color));
      entry.appendChild(d.createTextNode(item.label + ' '));
      entry.appendChild(element('b', '', mix[item.key]));
      legend.appendChild(entry);
    });
    result.appendChild(legend);
    return result;
  }

  function decorateCards() {
    var stats = WD.stats();
    var props = WD.filtered();
    var colorFor = {
      'properties': 'is-blue',
      'market estimate': 'is-green',
      'annual tax': 'is-yellow',
      'worth reviewing': 'is-coral'
    };
    var chartFor = {
      'properties': countyChart(props),
      'market estimate': marketChart(stats),
      'annual tax': taxChart(props),
      'worth reviewing': reviewChart(props)
    };
    Array.prototype.forEach.call(signals.querySelectorAll('.wdd-signal'), function (card) {
      if (card.classList.contains('wdd-sponsor-signal')) return;
      var key = titleKey(card);
      if (!Object.prototype.hasOwnProperty.call(colorFor, key)) return;
      colorClasses.forEach(function (className) { card.classList.remove(className); });
      card.classList.add(colorFor[key]);
      removeCharts(card);
      card.appendChild(chartFor[key]);
    });
  }

  function moveExistingPanels() {
    var sponsorSlot = d.getElementById('wdd-sponsor');
    var sponsor = signals.querySelector('.wdd-sponsor-signal');
    if (sponsorSlot && sponsor) {
      while (sponsorSlot.firstChild) sponsorSlot.removeChild(sponsorSlot.firstChild);
      sponsorSlot.appendChild(sponsor);
    }

    var calendarSlot = d.getElementById('wdd-calendar');
    var appealCalendar = rail.querySelector('.wdd-appeal-calendar');
    if (calendarSlot && appealCalendar) {
      while (calendarSlot.firstChild) calendarSlot.removeChild(calendarSlot.firstChild);
      calendarSlot.appendChild(appealCalendar);
    }
  }

  function decorate() {
    try {
      decorateCards();
      moveExistingPanels();
    } catch (error) {
      console.warn('[watchdog] dashboard workspace decoration', error);
    }
  }

  var repaint = WD.repaint;
  if (typeof repaint === 'function') {
    WD.repaint = function () {
      var result = repaint.apply(this, arguments);
      decorate();
      return result;
    };
  }

  /* The first renderer pass is direct; later data refreshes use WD.repaint. */
  d.addEventListener('wd:ready', function () { w.setTimeout(decorate, 0); }, { once: true });
  if (w.requestAnimationFrame) w.requestAnimationFrame(decorate);
  else w.setTimeout(decorate, 0);
})(window, document);

