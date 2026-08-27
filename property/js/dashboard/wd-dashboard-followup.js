/* Dashboard follow-up: evidence routing, ROBUST methodology affordance, and actionable rail cues. */
(function (w, d) {
  'use strict';
  if (w.__WATCHDOG_DASHBOARD_FOLLOWUP__) return;
  w.__WATCHDOG_DASHBOARD_FOLLOWUP__ = true;

  var WD = w.WD;

  function route(path) {
    var prefix = w.NJPTRSupabaseRuntime && typeof w.NJPTRSupabaseRuntime.routePrefix === 'string'
      ? w.NJPTRSupabaseRuntime.routePrefix
      : ((location.hostname === 'watchdogindex.com' || location.hostname === 'www.watchdogindex.com') ? '' : '/property');
    path = String(path || '/');
    if (path.charAt(0) !== '/') path = '/' + path;
    return prefix + path;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char];
    });
  }

  function patchScoreMethodology() {
    var kicker = d.querySelector('.wdd-score .wdd-kicker');
    if (!kicker || kicker.getAttribute('data-methodology-linked') === '1') return;
    kicker.setAttribute('data-methodology-linked', '1');
    kicker.innerHTML = '<a class="wdd-score-methodology" href="' + route('/data-methodology') + '#robust" title="Watchdog Score and ROBUST methodology">Watchdog Score</a>';
  }

  function pinFromEvidenceLink(anchor) {
    if (!anchor) return '';
    var explicit = anchor.getAttribute('data-evidence-pin');
    if (explicit) return explicit;
    try {
      return new URL(anchor.getAttribute('href') || '', location.href).searchParams.get('pin') || '';
    } catch (_urlError) {
      return '';
    }
  }

  function patchEvidenceLinks() {
    d.querySelectorAll('.wdd-case-money a').forEach(function (anchor) {
      var pin = pinFromEvidenceLink(anchor);
      if (!pin) return;
      anchor.setAttribute('data-evidence-pin', pin);
      anchor.href = route('/home') + '?pin=' + encodeURIComponent(pin);
      anchor.setAttribute('aria-label', 'Open governed property evidence');
      anchor.title = 'Open governed property evidence';
    });
  }

  function propertyAddress(property) {
    return property && (property.address || property.pams_pin) ? String(property.address || property.pams_pin) : 'Saved property';
  }

  function dateLabel(timestamp, overdue) {
    var date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return '';
    if (overdue) {
      var days = Math.max(1, Math.floor((Date.now() - date.getTime()) / 86400000));
      return 'Overdue ' + days + 'd';
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function upcomingItems() {
    if (!WD || !WD.S || !Array.isArray(WD.S.properties)) return [];
    var now = Date.now();
    var items = [];

    WD.S.properties.forEach(function (property) {
      var pin = String(property.pams_pin || '');
      if (!pin) return;
      var nextAt = new Date(property.next_action_at || '').getTime();
      if (Number.isFinite(nextAt)) {
        var overdue = nextAt < now;
        items.push({
          pin: pin,
          rank: overdue ? 0 : 1,
          sortAt: nextAt,
          icon: overdue ? 'fa-clock-rotate-left' : 'fa-calendar-check',
          tone: overdue ? 'is-urgent' : '',
          title: property.follow_up_reason || (overdue ? 'Scheduled follow-up is overdue' : 'Scheduled follow-up'),
          meta: propertyAddress(property) + ' · ' + dateLabel(nextAt, overdue)
        });
        return;
      }

      if (property.has_appeal_case) {
        items.push({
          pin: pin,
          rank: 2,
          sortAt: Number.MAX_SAFE_INTEGER,
          icon: 'fa-gavel',
          tone: '',
          title: 'Appeal case needs a follow-up date',
          meta: propertyAddress(property)
        });
        return;
      }

      if (!WD.S.scores || !WD.S.scores[pin]) {
        items.push({
          pin: pin,
          rank: 3,
          sortAt: Number.MAX_SAFE_INTEGER,
          icon: 'fa-gauge-high',
          tone: '',
          title: 'Watchdog Score is not available yet',
          meta: propertyAddress(property) + ' · Open the evidence record'
        });
      }
    });

    items.sort(function (a, b) {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.sortAt !== b.sortAt) return a.sortAt - b.sortAt;
      return a.meta.localeCompare(b.meta);
    });
    return items;
  }

  function renderUpcoming() {
    var rail = d.getElementById('wdd-rail');
    if (!rail || !WD) return;
    var items = upcomingItems();
    var current = rail.querySelector('#wdd-upcoming');
    if (!current) {
      current = d.createElement('section');
      current.id = 'wdd-upcoming';
      current.className = 'wdd-panel wdd-upcoming';
      var snapshot = rail.querySelector('#wdd-snapshot');
      if (snapshot) snapshot.insertAdjacentElement('afterend', current);
      else rail.appendChild(current);
    }

    var body = items.length
      ? items.slice(0, 4).map(function (item) {
          return '<button type="button" class="wdd-upcoming-item ' + item.tone + '" data-upcoming-pin="' + esc(item.pin) + '">' +
            '<span class="wdd-upcoming-icon"><i class="fas ' + item.icon + '" aria-hidden="true"></i></span>' +
            '<span class="wdd-upcoming-copy"><b>' + esc(item.title) + '</b><small>' + esc(item.meta) + '</small></span>' +
            '<i class="fas fa-chevron-right wdd-upcoming-arrow" aria-hidden="true"></i>' +
          '</button>';
        }).join('')
      : '<div class="wdd-upcoming-empty"><i class="fas fa-circle-check" aria-hidden="true"></i><div><b>Nothing queued</b><small>No scheduled follow-up or missing-score task needs attention right now.</small></div></div>';

    current.innerHTML = '<div class="wdd-upcoming-head"><div><span>UPCOMING</span><h3>Needs action</h3></div><small>Follow-ups, appeal work and score coverage</small></div>' + body;
  }

  function openProperty(pin, event) {
    if (!pin) return;
    if (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    location.assign(route('/home') + '?pin=' + encodeURIComponent(pin));
  }

  function handleCaptureClick(event) {
    var target = event.target && event.target.closest ? event.target : null;
    if (!target) return;

    var evidence = target.closest('.wdd-case-money a');
    if (evidence) {
      var pin = pinFromEvidenceLink(evidence);
      if (pin) {
        openProperty(pin, event);
        return;
      }
    }

    var upcoming = target.closest('[data-upcoming-pin]');
    if (upcoming) openProperty(upcoming.getAttribute('data-upcoming-pin'), event);
  }

  function renderAll() {
    WD = w.WD || WD;
    if (!WD) return;
    patchScoreMethodology();
    patchEvidenceLinks();
    renderUpcoming();
  }

  function scheduleRender() {
    w.setTimeout(renderAll, 30);
  }

  d.addEventListener('click', handleCaptureClick, true);
  if (WD && WD.S && WD.S.user) {
    scheduleRender();
    if (typeof WD.onRepaint === 'function') WD.onRepaint(scheduleRender);
  } else {
    d.addEventListener('wd:ready', function () {
      WD = w.WD || WD;
      scheduleRender();
      if (WD && typeof WD.onRepaint === 'function') WD.onRepaint(scheduleRender);
    }, { once: true });
  }
})(window, document);
