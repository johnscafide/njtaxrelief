(function () {
  'use strict';

  var targetId = 'property-side-menu';

  function pageName() {
    return document.body.getAttribute('data-sidebar-page') || '';
  }

  function isMobile() {
    return window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
  }

  function paintToggle() {
    var button = document.getElementById('db-sidebar-toggle');
    if (!button) return;
    var expanded = document.body.classList.contains('db-sidebar-expanded');
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    button.setAttribute('aria-label', expanded ? 'Collapse navigation' : 'Expand navigation');
    var icon = button.querySelector('i');
    var label = button.querySelector('span');
    if (icon) icon.className = 'fas fa-chevron-' + (expanded ? 'left' : 'right');
    if (label) label.textContent = expanded ? 'Collapse navigation' : 'Expand navigation';
  }

  function genericToggle() {
    if (isMobile()) return;
    document.body.classList.toggle('db-sidebar-expanded');
    var expanded = document.body.classList.contains('db-sidebar-expanded');
    try { localStorage.setItem('watchdogSidebarExpanded', expanded ? '1' : '0'); } catch (_storageError) {}
    paintToggle();
  }

  function runAction(action, event) {
    var page = pageName();
    if (action === 'nav-group') {
      var button = event.target.closest('.db-side-group-toggle');
      if (button) setGroup(button, button.getAttribute('aria-expanded') !== 'true', true);
      return;
    }
    if (action === 'toggle') {
      if (page === 'home' && typeof window.hmToggleSidebar === 'function') window.hmToggleSidebar();
      else if (typeof window.dbToggleSidebar === 'function') window.dbToggleSidebar();
      else genericToggle();
      return;
    }
    if (action === 'agent-intel') {
      if (page === 'home' && typeof window.hmAgentIntel === 'function') window.hmAgentIntel();
      else if (typeof window.dbIntelOpen === 'function') window.dbIntelOpen();
      return;
    }
    if (action === 'sign-out' && typeof window.plSignOut === 'function') {
      window.plSignOut();
      return;
    }
    if (page !== 'dashboard') return;
    if (action === 'overview' && typeof window.dbPanel === 'function') {
      event.preventDefault();
      window.dbPanel('main');
    }
    if (action === 'profile' && typeof window.dbPanel === 'function') {
      event.preventDefault();
      window.dbPanel('profile');
    }
  }

  function setGroup(button, expanded, remember) {
    var group = button && button.closest('.db-side-group');
    var submenu = group && group.querySelector('.db-side-submenu');
    if (!group || !submenu) return;
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    group.classList.toggle('open', expanded);
    if (expanded) submenu.removeAttribute('hidden');
    else window.setTimeout(function () {
      if (!group.classList.contains('open')) submenu.setAttribute('hidden', '');
    }, 260);
    if (remember) {
      try { localStorage.setItem('watchdogNavGroup:' + group.getAttribute('data-side-group'), expanded ? '1' : '0'); } catch (_storageError) {}
    }
  }

  function restoreGroups(container) {
    container.querySelectorAll('.db-side-group').forEach(function (group) {
      var button = group.querySelector('.db-side-group-toggle');
      if (!button) return;
      var expanded = button.getAttribute('aria-expanded') === 'true';
      try {
        var saved = localStorage.getItem('watchdogNavGroup:' + group.getAttribute('data-side-group'));
        if (saved !== null) expanded = saved === '1';
      } catch (_storageError) {}
      if (group.querySelector('[aria-current="page"]')) expanded = true;
      setGroup(button, expanded, false);
    });
  }

  function activate(container) {
    var current = pageName();
    container.querySelectorAll('[data-nav-page]').forEach(function (item) {
      var active = item.getAttribute('data-nav-page') === current;
      item.classList.toggle('on', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    restoreGroups(container);
    container.addEventListener('click', function (event) {
      var control = event.target.closest('[data-side-action]');
      if (control) runAction(control.getAttribute('data-side-action'), event);
    });
    try {
      if (localStorage.getItem('watchdogSidebarExpanded') === '1' && !isMobile()) {
        document.body.classList.add('db-sidebar-expanded');
      }
    } catch (_storageError) {}
    paintToggle();
    paintDeveloperLinks(!!(window.NJPTRPlan && window.NJPTRPlan.state && window.NJPTRPlan.state().developer));
  }

  function paintDeveloperLinks(show) {
    document.querySelectorAll('.developer-only').forEach(function (node) { node.hidden = !show; });
  }

  document.addEventListener('njptr:plan-change', function (event) {
    paintDeveloperLinks(!!(event.detail && event.detail.developer));
  });
  document.addEventListener('watchdog:developer-confirmed', function () { paintDeveloperLinks(true); });

  function load() {
    var target = document.getElementById(targetId);
    if (!target) return Promise.resolve(false);
    return fetch('/property/sidemenu.html?v=20260806a', { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('Navigation request returned ' + response.status);
        return response.text();
      })
      .then(function (markup) {
        target.innerHTML = markup;
        activate(target);
        document.dispatchEvent(new CustomEvent('njptr:sidemenu-ready'));
        return true;
      })
      .catch(function (error) {
        console.error('Shared navigation could not load:', error);
        target.innerHTML = '<aside class="db-sidebar db-sidebar-fallback"><a class="db-side-brand" href="/property/dashboard.html"><span><i class="fas fa-dog"></i></span><div><b>Watchdog</b><small>Open dashboard</small></div></a></aside>';
        return false;
      });
  }

  window.njptrSideMenuReady = document.readyState === 'loading'
    ? new Promise(function (resolve) { document.addEventListener('DOMContentLoaded', function () { load().then(resolve); }, { once: true }); })
    : load();
  window.njptrToggleSidebar = genericToggle;
})();
