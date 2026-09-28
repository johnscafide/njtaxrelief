(function () {
  'use strict';

  // Integration Center: CRM <-> property connection.
  // Reads get_my_crm_property_overview() and shows, side by side:
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
    var message = String(error && error.message || '');
    return code === 'PGRST202' || code === '42883' || /could not find the function/i.test(message);
  }

  // ---------- layout ----------
  function header(sub) {
    return '<header class="igx-head"><div><span class="igx-kicker">YOUR CRM + YOUR PROPERTIES</span>' +
      '<h2 id="igx-title">Every CRM contact, tied to a real property.</h2>' +
      '<p id="igx-sub">' + sub + '</p></div>' +
      '<button type="button" class="igx-btn is-ghost" data-igx-action="refresh"><i class="fas fa-rotate" aria-hidden="true"></i>Refresh</button></header>';
  }
  function stateCard(icon, title, copy, action) {
    return '<div class="igx-state"><i class="fas ' + icon + '" aria-hidden="true"></i><div><b>' + title + '</b><p>' + copy + '</p></div>' + (action || '') + '</div>';
  }
  function renderLoading() {
    root.hidden = false;
    root.innerHTML = header('Checking your CRM connection…') + '<div class="igx-panel" aria-busy="true"><div class="igx-list"><div class="igx-skeleton"></div><div class="igx-skeleton"></div><div class="igx-skeleton"></div></div></div>';
  }
  function renderState(icon, title, copy, action) {
    root.hidden = false;
    root.innerHTML = header('Connect your CRM once and Watchdog keeps your contacts and your properties in step.') + stateCard(icon, title, copy, action);
  }

  function subtitle() {
    var c = data.counts || {};
    var conn = data.connection || {};
    var provider = conn.provider === 'boldtrail' ? 'BoldTrail' : (conn.provider || 'Your CRM');
    var bits = [provider + ' connected'];
    if (conn.last_success_at) bits.push('last sync ' + ago(conn.last_success_at));
    bits.push(fmt(c.contacts) + ' ' + plural(c.contacts, 'contact', 'contacts'));
    return esc(bits.join(' · ')) + '. See which CRM properties to add to your dashboard, and who in your CRM is connected to the properties you already watch.';
  }

  function cards() {
    var c = data.counts || {};
    function card(kind, target, label, value, copy) {
      return '<button type="button" class="igx-card igx-card--' + kind + '" data-igx-tab="' + target + '" aria-pressed="' + String(tab === target) + '">' +
        '<small>' + label + '</small><b>' + fmt(value) + '</b><span>' + copy + '</span></button>';
    }
    return '<div class="igx-cards">' +
      '<div class="igx-card igx-card--navy"><small>CRM contacts</small><b>' + fmt(c.contacts) + '</b><span>' + fmt(c.matched_contacts) + ' linked to ' + fmt(c.matched_properties) + ' ' + plural(c.matched_properties, 'property', 'properties') + '</span></div>' +
      card('sky', 'ready', 'Ready to add', c.ready_to_add, 'In your CRM, not on your dashboard') +
      card('teal', 'dashboard', 'On your dashboard', c.on_dashboard, 'Dashboard properties with CRM details') +
      card('sand', 'missing', 'Not in your CRM', c.dashboard_not_in_crm, 'Dashboard properties no CRM contact is linked to') +
      '</div>';
  }

  function tabs() {
    var c = data.counts || {};
    var labels = { ready: ['Ready to add', c.ready_to_add], dashboard: ['On your dashboard', c.on_dashboard], missing: ['Not in your CRM', c.dashboard_not_in_crm], review: ['Needs your review', c.needs_review] };
    return '<div class="igx-tabs" role="tablist" aria-label="CRM and property views">' + TABS.map(function (id) {
      return '<button type="button" role="tab" class="igx-tab" id="igx-tab-' + id + '" aria-controls="igx-panel" aria-selected="' + String(tab === id) + '" data-igx-tab="' + id + '">' + labels[id][0] + '<em>' + fmt(labels[id][1]) + '</em></button>';
    }).join('') + '</div>';
  }

  function matches(text) { return !query || String(text || '').toLowerCase().indexOf(query) >= 0; }
  function contactText(contacts) {
    return (contacts || []).map(function (p) { return [p.name, p.email, p.stage, p.relationship].join(' '); }).join(' ');
  }
  function filtered(list, textFor) {
    return (list || []).filter(function (item) { return matches(textFor(item)); });
  }
  function toolbarSearch(placeholder) {
    return '<label class="igx-search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><span class="sr-only">Search</span>' +
      '<input type="search" id="igx-search" autocomplete="off" placeholder="' + esc(placeholder) + '" value="' + esc(query) + '"></label>';
  }
  function moreButton(total) {
    var limit = shown[tab] || PAGE;
    if (total <= limit) return '';
    var left = total - limit;
    var label = left <= PAGE ? 'Show ' + fmt(left) + ' more' : 'Show ' + PAGE + ' more (' + fmt(left) + ' left)';
    return '<div class="igx-more"><button type="button" class="igx-btn is-ghost" data-igx-action="more">' + label + '</button></div>';
  }
  function empty(icon, title, copy) {
    return '<div class="igx-empty"><i class="fas ' + icon + '" aria-hidden="true"></i><b>' + title + '</b><p>' + copy + '</p></div>';
  }
  function peopleChips(contacts, total) {
    var list = (contacts || []).slice(0, 3);
    var html = list.map(function (p) {
      return '<span class="igx-person"><b>' + esc(p.name || 'Unnamed contact') + '</b>' + (p.stage ? '<span class="igx-tag ' + stageClass(p.stage) + '">' + esc(p.stage) + '</span>' : '') + '</span>';
    }).join('');
    var extra = num(total) - list.length;
    if (extra > 0) html += '<span class="igx-person">+' + extra + ' more</span>';
    return html ? '<div class="igx-people">' + html + '</div>' : '';
  }

  function readyPanel() {
    var list = filtered(data.ready_to_add, function (p) { return [p.address, p.town, p.county, contactText(p.contacts)].join(' '); });
    var cap = data.capacity || {};
    var remaining = num(cap.remaining);
    var limit = shown.ready || PAGE;
    var visible = list.slice(0, limit);
    var selectedCount = Object.keys(selected).filter(function (pin) { return selected[pin]; }).length;
    var allShownSelected = visible.length > 0 && visible.every(function (p) { return selected[p.pams_pin]; });
    var capNote = remaining > 0
      ? 'You can add ' + fmt(remaining) + ' more ' + plural(remaining, 'property', 'properties') + ' on your plan.'
      : 'Your plan’s property limit is reached. Remove a property from your dashboard or upgrade to add more.';
    var html = '<p class="igx-panel-intro">These properties belong to contacts in your CRM but aren’t on your Watchdog dashboard yet. Add them to track taxes, assessments and changes. <span class="igx-note">' + esc(capNote) + '</span></p>';
    if (!(data.ready_to_add || []).length) {
      return html + empty('fa-circle-check', 'Nothing waiting to be added', 'Every property linked to your CRM is already on your dashboard. New matches show up here after each sync.');
    }
    html += '<div class="igx-toolbar"><div class="igx-toolbar-left">' + toolbarSearch('Search address, town or contact') +
      '<label class="igx-check"><input type="checkbox" id="igx-select-all"' + (allShownSelected ? ' checked' : '') + (visible.length ? '' : ' disabled') + '> Select all shown</label></div>' +
      '<div class="igx-toolbar-right"><button type="button" class="igx-btn" data-igx-action="add-selected"' + (selectedCount && remaining > 0 && !busy ? '' : ' disabled') + '><i class="fas fa-plus" aria-hidden="true"></i>Add selected (' + selectedCount + ')</button></div></div>';
    if (!list.length) return html + empty('fa-magnifying-glass', 'No matches for that search', 'Try a street, town or contact name.');
    html += '<ul class="igx-list">' + visible.map(function (p) {
      var sub = [p.town, p.county].filter(Boolean).join(', ');
      var people = num(p.contact_count);
      return '<li class="igx-row"><label class="igx-check"><input type="checkbox" data-igx-select="' + esc(p.pams_pin) + '"' + (selected[p.pams_pin] ? ' checked' : '') + '><span class="sr-only">Select ' + esc(p.address) + '</span></label>' +
        '<div class="igx-row-main"><span class="igx-row-title">' + esc(p.address || p.pams_pin) + '</span>' +
        '<span class="igx-row-sub">' + esc(sub) + (sub ? ' · ' : '') + fmt(people) + ' CRM ' + plural(people, 'contact', 'contacts') + '</span>' + peopleChips(p.contacts, people) + '</div>' +
        '<div class="igx-row-actions"><button type="button" class="igx-btn is-small" data-igx-add="' + esc(p.pams_pin) + '"' + (remaining > 0 && !busy ? '' : ' disabled') + '><i class="fas fa-plus" aria-hidden="true"></i>Add to dashboard</button></div></li>';
    }).join('') + '</ul>' + moreButton(list.length);
    return html;
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
    return '<div class="igx-contact"><div class="igx-contact-top"><span class="igx-contact-name">' + esc(p.name || 'Unnamed contact') + '</span>' +
      (p.stage ? '<span class="igx-tag ' + stageClass(p.stage) + '">' + esc(p.stage) + '</span>' : '') + '</div>' +
      (rows.length ? '<dl>' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>' : '') + '</div>';
  }

  function dashboardPanel() {
    var list = filtered(data.on_dashboard, function (p) { return [p.address, p.town, p.nickname, contactText(p.contacts)].join(' '); });
    var html = '<p class="igx-panel-intro">Properties on your dashboard that are linked to people in your CRM. Use this before you call, email or send a mailer.</p>';
    if (!(data.on_dashboard || []).length) {
      return html + empty('fa-house-user', 'No dashboard property is linked to your CRM yet', 'Add properties from “Ready to add”, or confirm matches under “Needs your review”.');
    }
    html += '<div class="igx-toolbar"><div class="igx-toolbar-left">' + toolbarSearch('Search address or contact') + '</div></div>';
    if (!list.length) return html + empty('fa-magnifying-glass', 'No matches for that search', 'Try a street, town or contact name.');
    var limit = shown.dashboard || PAGE;
    html += '<ul class="igx-list">' + list.slice(0, limit).map(function (p) {
      var title = p.nickname ? p.nickname + ' · ' + (p.address || '') : (p.address || p.pams_pin);
      var more = num(p.contact_count) - (p.contacts || []).length;
      return '<li class="igx-row no-check"><div class="igx-row-main"><span class="igx-row-title">' + esc(title) + '</span>' +
        '<span class="igx-row-sub">' + esc([p.town, p.kind === 'home' ? 'Your home' : 'On your dashboard'].filter(Boolean).join(' · ')) + '</span>' +
        '<div class="igx-contacts">' + (p.contacts || []).map(contactCard).join('') + '</div>' +
        (more > 0 ? '<span class="igx-row-sub">+' + more + ' more ' + plural(more, 'contact', 'contacts') + ' in your CRM</span>' : '') + '</div>' +
        '<div class="igx-row-actions"><a class="igx-btn is-ghost is-small" href="' + esc(route('/home?pin=' + encodeURIComponent(p.pams_pin))) + '"><i class="fas fa-house" aria-hidden="true"></i>Open property</a></div></li>';
    }).join('') + '</ul>' + moreButton(list.length);
    return html;
  }

  function missingPanel() {
    var list = filtered(data.dashboard_not_in_crm, function (p) { return [p.address, p.town, p.county, p.nickname].join(' '); });
    var html = '<p class="igx-panel-intro">These dashboard properties aren’t linked to anyone in your CRM. Download them to import into BoldTrail or share with your team. Watchdog never writes to your CRM on its own.</p>';
    if (!(data.dashboard_not_in_crm || []).length) {
      return html + empty('fa-circle-check', 'Every dashboard property is in your CRM', 'Nice. New dashboard properties that aren’t linked to a contact will show up here.');
    }
    html += '<div class="igx-toolbar"><div class="igx-toolbar-left">' + toolbarSearch('Search address or town') + '</div>' +
      '<div class="igx-toolbar-right"><button type="button" class="igx-btn" data-igx-action="download"><i class="fas fa-file-arrow-down" aria-hidden="true"></i>Download CSV</button>' +
      '<button type="button" class="igx-btn is-ghost" data-igx-action="copy"><i class="fas fa-copy" aria-hidden="true"></i>Copy addresses</button></div></div>';
    if (!list.length) return html + empty('fa-magnifying-glass', 'No matches for that search', 'Try a street or town.');
    var limit = shown.missing || PAGE;
    html += '<ul class="igx-list">' + list.slice(0, limit).map(function (p) {
      var title = p.nickname ? p.nickname + ' · ' + (p.address || '') : (p.address || p.pams_pin);
      return '<li class="igx-row no-check"><div class="igx-row-main"><span class="igx-row-title">' + esc(title) + '</span>' +
        '<span class="igx-row-sub">' + esc([p.town, p.county, p.kind === 'home' ? 'Your home' : ''].filter(Boolean).join(' · ')) + '</span></div>' +
        '<div class="igx-row-actions"><a class="igx-btn is-ghost is-small" href="' + esc(route('/home?pin=' + encodeURIComponent(p.pams_pin))) + '"><i class="fas fa-house" aria-hidden="true"></i>Open property</a></div></li>';
    }).join('') + '</ul>' + moreButton(list.length);
    return html;
  }

  function reviewPanel() {
    var list = filtered(data.needs_review, function (r) { return [r.crm_address, r.candidate_address, r.candidate_town, contactText([r.contact || {}])].join(' '); });
    var html = '<p class="igx-panel-intro">Watchdog found a New Jersey parcel at the address saved in your CRM. Confirm it’s the same property to link them. Nothing is linked until you say so.</p>';
    if (!(data.needs_review || []).length) {
      return html + empty('fa-circle-check', 'Nothing to review', 'When Watchdog finds a possible match for a CRM address, it waits here for you.');
    }
    if ((data.needs_review || []).length > 5) html += '<div class="igx-toolbar"><div class="igx-toolbar-left">' + toolbarSearch('Search address or contact') + '</div></div>';
    if (!list.length) return html + empty('fa-magnifying-glass', 'No matches for that search', 'Try a street, town or contact name.');
    var limit = shown.review || PAGE;
    html += '<ul class="igx-list">' + list.slice(0, limit).map(function (r) {
      var p = r.contact || {};
      var several = num(r.candidate_count) > 1;
      return '<li class="igx-row no-check"><div class="igx-row-main"><span class="igx-row-title">' + esc(p.name || 'Unnamed contact') +
        (p.stage ? ' <span class="igx-tag ' + stageClass(p.stage) + '">' + esc(p.stage) + '</span>' : '') + '</span>' +
        '<div class="igx-compare"><div><small>Address in your CRM</small><b>' + esc(r.crm_address || 'Not provided') + '</b></div>' +
        '<div><small>Watchdog parcel</small><b>' + esc([r.candidate_address, r.candidate_town].filter(Boolean).join(', ') || r.pams_pin) + '</b></div></div>' +
        (several ? '<span class="igx-row-sub">More than one parcel matched this address. Pick the right one under Advanced → CRM resolution, or mark this one as not a match.</span>' : '') + '</div>' +
        '<div class="igx-row-actions">' +
        '<button type="button" class="igx-btn is-small" data-igx-review="verify" data-igx-link="' + esc(r.link_id) + '"' + (several || busy ? ' disabled' : '') + '><i class="fas fa-check" aria-hidden="true"></i>Yes, same property</button>' +
        '<button type="button" class="igx-btn is-quiet is-small" data-igx-review="reject" data-igx-link="' + esc(r.link_id) + '"' + (busy ? ' disabled' : '') + '>Not a match</button></div></li>';
    }).join('') + '</ul>' + moreButton(list.length);
    return html;
  }

  function howItWorks() {
    var r = data.resolution || {};
    var c = data.counts || {};
    // A "candidate" resolution state can be stale once its link was reviewed, so only the
    // queue itself counts as being checked.
    var checking = num(r.pending) + num(r.error);
    var tiles = [
      [c.matched_contacts, 'Linked to a property'],
      [c.needs_review, 'Waiting for your review'],
      [checking, 'Being checked now'],
      [r.no_address, 'No property address in your CRM'],
      [r.no_match, 'No exact New Jersey parcel match'],
      [r.ambiguous, 'More than one possible parcel'],
      [r.non_nj, 'Outside New Jersey']
    ].filter(function (t) { return num(t[0]) > 0; });
    return '<details class="igx-how"><summary><i class="fas fa-circle-info" aria-hidden="true"></i>How Watchdog matches your CRM to properties<i class="fas fa-chevron-down igx-chevron" aria-hidden="true"></i></summary>' +
      '<div class="igx-how-body"><p>Watchdog links a CRM contact to a property only when the address in your CRM matches exactly one New Jersey parcel. It never guesses from names or partial addresses, and a possible match waits for your OK.</p>' +
      (tiles.length ? '<div class="igx-breakdown">' + tiles.map(function (t) { return '<div><b>' + fmt(t[0]) + '</b><span>' + t[1] + '</span></div>'; }).join('') + '</div>' : '') +
      '<p>To link more contacts, add a full street address with ZIP code to the contact in BoldTrail. Watchdog re-checks updated contacts after each sync, every 15 minutes.</p></div></details>';
  }

  function panel() {
    if (tab === 'dashboard') return dashboardPanel();
    if (tab === 'missing') return missingPanel();
    if (tab === 'review') return reviewPanel();
    return readyPanel();
  }

  // Re-rendering replaces the markup, so remember which control had focus and put it back.
  function focusKey(el) {
    if (!el || !root.contains(el)) return '';
    if (el.id) return '#' + el.id;
    if (el.dataset && el.dataset.igxSelect) return '[data-igx-select="' + el.dataset.igxSelect + '"]';
    return '';
  }
  function render() {
    var active = document.activeElement;
    var key = focusKey(active);
    var caret = active && active.id === 'igx-search' ? active.selectionStart : null;
    root.hidden = false;
    root.innerHTML = header(subtitle()) + cards() + tabs() +
      '<div class="igx-panel" id="igx-panel" role="tabpanel" aria-labelledby="igx-tab-' + tab + '">' + panel() + '</div>' + howItWorks();
    if (!key) return;
    var next = null;
    try { next = root.querySelector(key); } catch (_) {}
    if (!next) return;
    next.focus();
    if (caret != null) { try { next.setSelectionRange(caret, caret); } catch (_) {} }
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
      renderState('fa-triangle-exclamation', 'Your CRM overview could not load', esc(errorText(result.error, 'Please try again.')),
        '<button type="button" class="igx-btn" data-igx-action="refresh">Try again</button>');
      return;
    }
    data = result.data || {};
    if (data.allowed === false) {
      renderState('fa-address-book', 'Connect your CRM to your properties',
        'Match BoldTrail / kvCORE contacts to New Jersey properties, add them to your dashboard and see who’s connected to each property. Available on Agent, Pro, Pro+ and Teams.',
        '<a class="igx-btn" href="' + esc(route('/pro#pricing')) + '">Compare plans</a>');
      return;
    }
    var counts = data.counts || {};
    if (!data.connection && !num(counts.contacts)) {
      renderState('fa-plug', 'Connect your CRM',
        'Connect BoldTrail / kvCORE from Sync Accounts on your Account page. Watchdog then matches your contacts to New Jersey properties automatically.',
        '<a class="igx-btn" href="' + esc(route('/account#ac-connections')) + '">Open Sync Accounts</a>');
      return;
    }
    if (!tab) tab = num(counts.ready_to_add) ? 'ready' : num(counts.needs_review) ? 'review' : num(counts.on_dashboard) ? 'dashboard' : 'ready';
    var readyPins = {};
    (data.ready_to_add || []).forEach(function (p) { readyPins[p.pams_pin] = true; });
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
          assessed: Number.isFinite(Number(a.NET_VALUE)) && Number(a.NET_VALUE) > 0 ? Math.round(Number(a.NET_VALUE)) : null,
          last_year_tax: Number.isFinite(Number(a.LAST_YR_TX)) && Number(a.LAST_YR_TX) > 0 ? Math.round(Number(a.LAST_YR_TX) * 100) / 100 : null,
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
    (data.ready_to_add || []).forEach(function (p) { byPin[p.pams_pin] = p; });
    busy = true;
    render();
    toast('Adding ' + pins.length + ' ' + plural(pins.length, 'property', 'properties') + ' to your dashboard…');
    var totals = { added: 0, already: 0, over: 0, failed: 0, notLinked: 0 };
    try {
      for (var i = 0; i < pins.length; i += ADD_BATCH) {
        var chunk = pins.slice(i, i + ADD_BATCH);
        var parcels = await fetchParcels(chunk);
        var items = chunk.map(function (pin) {
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
        var result = await client.rpc('add_my_crm_properties_to_dashboard', { p_items: items });
        if (result.error) throw result.error;
        var r = result.data || {};
        totals.added += num(r.added_count);
        totals.already += num(r.already_on_dashboard);
        totals.over += num(r.over_limit);
        totals.failed += num(r.failed);
        totals.notLinked += num(r.not_linked);
        chunk.forEach(function (pin) { delete selected[pin]; });
      }
      var parts = [];
      parts.push(totals.added ? 'Added ' + totals.added + ' ' + plural(totals.added, 'property', 'properties') + ' to your dashboard.' : 'No properties were added.');
      if (totals.already) parts.push(totals.already + ' ' + plural(totals.already, 'was', 'were') + ' already there.');
      if (totals.over || trimmed) parts.push('Your plan’s property limit stopped the rest.');
      if (totals.failed || totals.notLinked) parts.push((totals.failed + totals.notLinked) + ' could not be added.');
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
    render();
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
  function missingRows() {
    return filtered(data.dashboard_not_in_crm, function (p) { return [p.address, p.town, p.county, p.nickname].join(' '); });
  }
  function downloadCsv() {
    var rows = missingRows();
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
    var text = missingRows().map(function (p) { return [p.address, p.town, 'NJ'].filter(Boolean).join(', '); }).join('\n');
    if (!text) return;
    var done = function () { toast('Addresses copied.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { toast('Copy was blocked by the browser. Use Download CSV instead.', true); });
    } else {
      toast('Copy isn’t available in this browser. Use Download CSV instead.', true);
    }
  }

  // ---------- events ----------
  root.addEventListener('click', function (event) {
    var target = event.target.closest('button,a');
    if (!target || !root.contains(target)) return;
    if (target.dataset.igxTab) {
      if (TABS.indexOf(target.dataset.igxTab) < 0) return;
      tab = target.dataset.igxTab;
      query = '';
      render();
      var focusTab = document.getElementById('igx-tab-' + tab);
      if (focusTab && target.classList.contains('igx-tab')) focusTab.focus();
      return;
    }
    if (target.dataset.igxAdd) { addPins([target.dataset.igxAdd]); return; }
    if (target.dataset.igxReview) { reviewMatch(target.dataset.igxLink, target.dataset.igxReview === 'verify' ? 'verify' : 'reject'); return; }
    var action = target.dataset.igxAction;
    if (action === 'refresh') { renderLoading(); load(); }
    else if (action === 'more') { shown[tab] = (shown[tab] || PAGE) + PAGE; render(); }
    else if (action === 'add-selected') { addPins(Object.keys(selected).filter(function (pin) { return selected[pin]; })); }
    else if (action === 'download') downloadCsv();
    else if (action === 'copy') copyAddresses();
  });
  root.addEventListener('change', function (event) {
    var input = event.target;
    if (input.dataset && input.dataset.igxSelect) {
      selected[input.dataset.igxSelect] = input.checked;
      render();
    } else if (input.id === 'igx-select-all') {
      var list = filtered(data.ready_to_add, function (p) { return [p.address, p.town, p.county, contactText(p.contacts)].join(' '); }).slice(0, shown.ready || PAGE);
      list.forEach(function (p) { selected[p.pams_pin] = input.checked; });
      render();
    }
  });
  root.addEventListener('input', function (event) {
    if (event.target.id !== 'igx-search') return;
    query = String(event.target.value || '').trim().toLowerCase();
    shown[tab] = PAGE;
    render();
  });
  root.addEventListener('keydown', function (event) {
    var current = event.target.closest('.igx-tab');
    if (!current || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return;
    var index = TABS.indexOf(current.dataset.igxTab);
    var next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    event.preventDefault();
    tab = next;
    query = '';
    render();
    var el = document.getElementById('igx-tab-' + next);
    if (el) el.focus();
  });

  async function boot() {
    try {
      client = window.NJPTRSupabaseRuntime.createClient();
      var auth = await client.auth.getUser();
      if (!auth || !auth.data || !auth.data.user) return;
      renderLoading();
      await load();
    } catch (error) {
      console.error('[Integrations] CRM property overview failed', error);
      renderState('fa-triangle-exclamation', 'Your CRM overview could not load', 'Please refresh the page and try again.',
        '<button type="button" class="igx-btn" data-igx-action="refresh">Try again</button>');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
