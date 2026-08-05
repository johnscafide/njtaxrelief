(function () {
  'use strict';

  var targetId = 'property-side-menu';

  function pageName() {
    return document.body.getAttribute('data-sidebar-page') || '';
  }

  function runAction(action, event) {
    var page = pageName();
    if (action === 'toggle') {
      if (page === 'home' && typeof window.hmToggleSidebar === 'function') window.hmToggleSidebar();
      else if (typeof window.dbToggleSidebar === 'function') window.dbToggleSidebar();
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

  function activate(container) {
    var current = pageName();
    container.querySelectorAll('[data-nav-page]').forEach(function (item) {
      var active = item.getAttribute('data-nav-page') === current;
      item.classList.toggle('on', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    container.addEventListener('click', function (event) {
      var control = event.target.closest('[data-side-action]');
      if (control) runAction(control.getAttribute('data-side-action'), event);
    });
  }

  function load() {
    var target = document.getElementById(targetId);
    if (!target) return Promise.resolve(false);
    return fetch('/property/sidemenu.html?v=20260805c', { credentials: 'same-origin' })
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
})();
