(function () {
  'use strict';

  var targetId = 'property-side-menu';
  var modernSecondaryPages = ['town-compare','fairness','pulse','scan','account','data-workbench','data-center'];

  function pageName() { return document.body.getAttribute('data-sidebar-page') || ''; }
  function isMobile() { return window.matchMedia && window.matchMedia('(max-width: 760px)').matches; }

  function loadModernSecondaryShell() {
    if (modernSecondaryPages.indexOf(pageName()) < 0) return false;
    ['/property/css/app-shell-2027.css','/property/css/secondary-pages-2027.css'].forEach(function (href) {
      if (document.querySelector('link[href="' + href + '"]')) return;
      var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.appendChild(link);
    });
    if (!document.querySelector('script[src="/property/js/app-shell-2027.js"]')) {
      var script = document.createElement('script'); script.src = '/property/js/app-shell-2027.js'; script.defer = true; document.body.appendChild(script);
    }
    var target = document.getElementById(targetId); if (target) { target.innerHTML = ''; target.hidden = true; }
    document.body.classList.remove('db-sidebar-expanded','wd-mobile-menu-open');
    return true;
  }

  function paintToggle() {
    var button = document.getElementById('db-sidebar-toggle'); if (!button) return;
    var expanded = document.body.classList.contains('db-sidebar-expanded');
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    button.setAttribute('aria-label', expanded ? 'Collapse navigation' : 'Expand navigation');
    var icon = button.querySelector('i'), label = button.querySelector('span');
    if (icon) icon.className = 'fas fa-angles-' + (expanded ? 'left' : 'right');
    if (label) label.textContent = expanded ? 'Collapse navigation' : 'Expand navigation';
  }

  function genericToggle() {
    if (isMobile()) return;
    document.body.classList.toggle('db-sidebar-expanded');
    var expanded = document.body.classList.contains('db-sidebar-expanded');
    try { localStorage.setItem('watchdogSidebarExpanded', expanded ? '1' : '0'); } catch (_) {}
    paintToggle();
  }

  function openingOverlay() {
    var old = document.getElementById('wd-agent-opening'); if (old) old.remove();
    var node = document.createElement('div'); node.id = 'wd-agent-opening';
    node.innerHTML = '<div><i class="fas fa-circle-notch fa-spin"></i><b>Opening Agent Control Center</b><span>Launching the standalone real estate workspace…</span></div>';
    node.style.cssText = 'position:fixed;inset:0;z-index:250000;background:rgba(238,243,246,.94);display:grid;place-items:center;font-family:"Source Sans 3",sans-serif;color:#102a4c;backdrop-filter:blur(8px)';
    var card=node.firstElementChild; card.style.cssText='display:grid;justify-items:center;gap:10px;background:#fff;border:1px solid #dce5ec;border-radius:20px;padding:34px 42px;box-shadow:0 24px 70px rgba(16,42,76,.18)';
    card.querySelector('i').style.cssText='font-size:24px;color:#088d8d'; card.querySelector('b').style.cssText='font:800 22px "Plus Jakarta Sans",sans-serif'; card.querySelector('span').style.cssText='color:#68788f';
    document.body.appendChild(node); return node;
  }

  function openAgentControl(event) {
    if (event) event.preventDefault();
    var url = '/property/agent-desk?standalone=1';
    var overlay = openingOverlay();
    var features = 'popup=yes,width=1600,height=980,resizable=yes,scrollbars=yes,toolbar=no,location=no,menubar=no,status=no';
    var win = window.open(url, 'watchdogAgentControl', features);
    window.setTimeout(function () {
      if (overlay && overlay.parentNode) overlay.remove();
      if (!win) window.location.href = url;
      else { try { win.focus(); } catch (_) {} }
    }, 700);
  }

  function runAction(action, event) {
    var page = pageName();
    if (action === 'mobile-menu') { toggleMobileMenu(true); return; }
    if (action === 'mobile-menu-close') { toggleMobileMenu(false); return; }
    if (action === 'nav-group') { var button = event.target.closest('.db-side-group-toggle'); if (button) setGroup(button, button.getAttribute('aria-expanded') !== 'true', true); return; }
    if (action === 'toggle') { if (page === 'home' && typeof window.hmToggleSidebar === 'function') window.hmToggleSidebar(); else if (typeof window.dbToggleSidebar === 'function') window.dbToggleSidebar(); else genericToggle(); return; }
    if (action === 'agent-intel') { if (page === 'home' && typeof window.hmAgentIntel === 'function') window.hmAgentIntel(); else if (typeof window.dbIntelOpen === 'function') window.dbIntelOpen(); return; }
    if (action === 'sign-out' && typeof window.plSignOut === 'function') { window.plSignOut(); return; }
    if (page !== 'dashboard') return;
    if (action === 'overview' && typeof window.dbPanel === 'function') { event.preventDefault(); window.dbPanel('main'); }
    if (action === 'profile' && typeof window.dbPanel === 'function') { event.preventDefault(); window.dbPanel('profile'); }
  }

  function toggleMobileMenu(open) {
    var menu = document.getElementById('wd-mobile-menu'); if (!menu) return;
    if (open) { menu.hidden = false; requestAnimationFrame(function () { menu.classList.add('open'); }); document.body.classList.add('wd-mobile-menu-open'); var close = menu.querySelector('[data-side-action="mobile-menu-close"]'); if (close) close.focus(); }
    else { menu.classList.remove('open'); document.body.classList.remove('wd-mobile-menu-open'); window.setTimeout(function () { if (!menu.classList.contains('open')) menu.hidden = true; }, 180); var trigger = document.querySelector('[data-side-action="mobile-menu"]'); if (trigger) trigger.focus(); }
  }

  function setGroup(button, expanded, remember) {
    var group = button && button.closest('.db-side-group'), submenu = group && group.querySelector('.db-side-submenu'); if (!group || !submenu) return;
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false'); group.classList.toggle('open', expanded);
    if (expanded) submenu.removeAttribute('hidden'); else window.setTimeout(function () { if (!group.classList.contains('open')) submenu.setAttribute('hidden', ''); }, 260);
    if (remember) { try { localStorage.setItem('watchdogNavGroup:' + group.getAttribute('data-side-group'), expanded ? '1' : '0'); } catch (_) {} }
  }

  function restoreGroups(container) {
    container.querySelectorAll('.db-side-group').forEach(function (group) { var button = group.querySelector('.db-side-group-toggle'); if (!button) return; var expanded = button.getAttribute('aria-expanded') === 'true'; if (group.querySelector('[aria-current="page"]')) expanded = true; setGroup(button, expanded, false); });
  }

  function activateSearch(container) {
    var input = container.querySelector('#db-nav-search'); if (!input) return;
    function filter() { var q = input.value.trim().toLowerCase(); container.querySelectorAll('.db-side-group').forEach(function (group) { var matches = 0; group.querySelectorAll('.db-side-link').forEach(function (link) { var show = !q || link.textContent.toLowerCase().indexOf(q) >= 0; link.classList.toggle('db-nav-search-hidden', !show); if (show) matches += 1; }); group.classList.toggle('db-nav-search-hidden', !!q && !matches); if (q && matches) setGroup(group.querySelector('.db-side-group-toggle'), true, false); }); container.querySelectorAll('.db-side-primary .db-side-link,.db-side-primary .pn').forEach(function (link) { link.classList.toggle('db-nav-search-hidden', !!q && link.textContent.toLowerCase().indexOf(q) < 0); }); container.classList.toggle('db-nav-searching', !!q); }
    input.addEventListener('input', filter); input.addEventListener('keydown', function (event) { if (event.key === 'Escape') { input.value = ''; filter(); input.blur(); } });
    document.addEventListener('keydown', function (event) { if (event.key === '/' && !/input|textarea|select/i.test(document.activeElement && document.activeElement.tagName)) { event.preventDefault(); if (!document.body.classList.contains('db-sidebar-expanded')) genericToggle(); window.setTimeout(function () { input.focus(); }, 120); } });
  }

  function activate(container) {
    var current = pageName();
    container.querySelectorAll('[data-nav-page]').forEach(function (item) { var active = item.getAttribute('data-nav-page') === current; item.classList.toggle('on', active); if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current'); });
    restoreGroups(container); activateSearch(container);
    container.addEventListener('click', function (event) {
      var agentLink = event.target.closest('a[data-nav-page="agent-desk"],a[href="/property/agent-desk"]');
      if (agentLink) { openAgentControl(event); toggleMobileMenu(false); return; }
      var control = event.target.closest('[data-side-action]'); if (control) runAction(control.getAttribute('data-side-action'), event);
    });
    try { if (localStorage.getItem('watchdogSidebarExpanded') === '1' && !isMobile()) document.body.classList.add('db-sidebar-expanded'); } catch (_) {}
    paintToggle(); paintDeveloperLinks(!!window.NJPTRDeveloperConfirmed || !!(window.NJPTRPlan && window.NJPTRPlan.state && window.NJPTRPlan.state().developer)); paintPlanNavigation();
  }

  function paintDeveloperLinks(show) { document.querySelectorAll('.developer-only').forEach(function (node) { node.hidden = !show; }); }
  function paintPlanNavigation() {
    var plan = window.NJPTRPlan && window.NJPTRPlan.state ? window.NJPTRPlan.state() : null, paid = !!(plan && (plan.effective === 'pro' || plan.effective === 'pro_plus' || plan.effective === 'developer')), planLabel = document.getElementById('db-side-plan');
    if (planLabel) { var effective = plan && plan.effective ? plan.effective : 'standard'; planLabel.textContent = effective === 'pro_plus' ? 'Pro+ plan' : effective === 'developer' ? 'Developer access' : effective === 'pro' ? 'Pro plan' : 'Standard plan'; }
    document.querySelectorAll('.db-side-mobile [data-nav-page="pro"]').forEach(function (node) { var label = node.querySelector('span'); if (label) label.textContent = paid ? 'Tools' : 'Pro'; node.setAttribute('aria-label', paid ? 'Professional tools' : 'Pro plans'); });
    document.querySelectorAll('.wd-mobile-pro-link').forEach(function (node) { var title = node.querySelector('b'), note = node.querySelector('small'); if (paid) { if (title) title.textContent = 'Professional tools'; if (note) note.textContent = 'Your plan workspace'; } else { if (title) title.textContent = 'Explore Pro'; if (note) note.textContent = 'Professional tools and workflows'; } });
    document.querySelectorAll('.paid-only').forEach(function (node) { node.hidden = !paid; });
  }

  function loadFlood() {
    if (window.WatchdogFlood || document.getElementById('wd-flood-script')) return;
    var s = document.createElement('script'); s.id = 'wd-flood-script'; s.src = '/property/js/flood-intelligence.js'; s.defer = true; document.head.appendChild(s);
  }

  function loadWhyWatchdog() {
    if (window.WatchdogWhy || document.getElementById('wd-why-script')) return;
    var s = document.createElement('script');
    s.id = 'wd-why-script';
    s.src = '/property/js/watchdog-why.js';
    s.defer = true;
    document.head.appendChild(s);
  }

  document.addEventListener('njptr:plan-change', function (event) { paintDeveloperLinks(!!(event.detail && event.detail.developer)); paintPlanNavigation(); });
  document.addEventListener('watchdog:developer-confirmed', function () { paintDeveloperLinks(true); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') toggleMobileMenu(false); });

  function load() {
    loadWhyWatchdog();
    if (loadModernSecondaryShell()) return Promise.resolve(true);
    loadFlood();
    var target = document.getElementById(targetId); if (!target) return Promise.resolve(false);
    return fetch('/property/partials/sidemenu.html', { credentials: 'same-origin' }).then(function (response) { if (!response.ok) throw new Error('Navigation request returned ' + response.status); return response.text(); }).then(function (markup) { target.innerHTML = markup; activate(target); document.dispatchEvent(new CustomEvent('njptr:sidemenu-ready')); return true; }).catch(function (error) { console.error('Shared navigation could not load:', error); target.innerHTML = '<aside class="db-sidebar db-sidebar-fallback"><a class="db-side-brand" href="/property/dashboard"><span><i class="fas fa-dog"></i></span><div><b>Watchdog</b><small>Open dashboard</small></div></a></aside>'; return false; });
  }

  window.njptrSideMenuReady = document.readyState === 'loading' ? new Promise(function (resolve) { document.addEventListener('DOMContentLoaded', function () { load().then(resolve); }, { once: true }); }) : load();
  window.njptrToggleSidebar = genericToggle;
  window.njptrOpenAgentControl = openAgentControl;
})();
