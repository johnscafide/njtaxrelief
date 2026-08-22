(function () {
  'use strict';

  if (!window.matchMedia || !window.matchMedia('(max-width: 720px)').matches) return;
  if (!document.body || document.body.dataset.sidebarPage !== 'data-center') return;

  var recoveryTimer = null;
  var recoveryShown = false;

  function ready() {
    return document.documentElement.dataset.dataCenterReady === 'true';
  }

  function recoveryHost() {
    var existing = document.getElementById('dc-mobile-recovery');
    if (existing) return existing;

    var main = document.querySelector('.dc-main');
    if (!main) return null;

    var host = document.createElement('section');
    host.id = 'dc-mobile-recovery';
    host.className = 'dc-mobile-recovery';
    host.hidden = true;
    host.setAttribute('role', 'alert');
    host.setAttribute('aria-live', 'assertive');
    host.innerHTML =
      '<span class="dc-mobile-recovery-kicker">DATA CENTER</span>' +
      '<h2>Data could not finish loading</h2>' +
      '<p>The governed marker catalog did not become ready. This may be a temporary connection issue.</p>' +
      '<button type="button" id="dc-mobile-retry">Retry Data Center</button>';

    var hero = main.querySelector('.dc-hero');
    if (hero && hero.nextSibling) main.insertBefore(host, hero.nextSibling);
    else main.insertBefore(host, main.firstChild);

    host.querySelector('#dc-mobile-retry').addEventListener('click', function () {
      this.disabled = true;
      this.setAttribute('aria-busy', 'true');
      this.textContent = 'Retrying…';
      window.location.reload();
    });

    return host;
  }

  function showRecovery(reason) {
    if (ready() || recoveryShown) return;
    var host = recoveryHost();
    if (!host) return;

    recoveryShown = true;
    host.hidden = false;
    host.dataset.reason = reason || 'startup';

    var rows = document.getElementById('dc-rows');
    if (rows) rows.setAttribute('aria-hidden', 'true');

    var retry = host.querySelector('#dc-mobile-retry');
    if (retry) retry.focus({ preventScroll: true });
    host.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function inspectRows() {
    if (ready()) return;
    var rows = document.getElementById('dc-rows');
    if (!rows) return;
    var text = (rows.textContent || '').toLowerCase();
    if (text.indexOf('marker registry could not load') >= 0) {
      showRecovery('registry-error');
    }
  }

  document.addEventListener('watchdog:data-center-ready', function () {
    if (recoveryTimer) window.clearTimeout(recoveryTimer);
    var host = document.getElementById('dc-mobile-recovery');
    if (host) host.hidden = true;
    var rows = document.getElementById('dc-rows');
    if (rows) rows.removeAttribute('aria-hidden');
  }, { once: true });

  function start() {
    var rows = document.getElementById('dc-rows');
    if (rows && window.MutationObserver) {
      new MutationObserver(inspectRows).observe(rows, { childList: true, subtree: true, characterData: true });
    }

    inspectRows();
    recoveryTimer = window.setTimeout(function () {
      if (!ready()) showRecovery('startup-timeout');
    }, 10000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
