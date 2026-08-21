(function(){
  'use strict';

  const mobileQuery = window.matchMedia('(max-width: 720px)');
  if (!mobileQuery.matches) return;

  const enhanced = new WeakSet();

  function optionButtons(host, selector) {
    return Array.from(host.querySelectorAll(selector)).filter((el) => !el.disabled && !el.hidden);
  }

  function announce(status, message) {
    status.textContent = message || '';
  }

  function enhanceAutocomplete(input, host, selector, label) {
    if (!input || !host || enhanced.has(input)) return;
    enhanced.add(input);

    if (!host.id) host.id = input.id + '-options';
    const status = document.createElement('span');
    status.className = 'msa-mobile-autocomplete-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    host.insertAdjacentElement('afterend', status);

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', host.id);
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-haspopup', 'listbox');
    host.setAttribute('role', 'listbox');
    host.setAttribute('aria-label', label + ' suggestions');

    let activeIndex = -1;

    function syncOptions(announceCount) {
      const options = optionButtons(host, selector);
      options.forEach((option, index) => {
        option.setAttribute('role', 'option');
        option.setAttribute('tabindex', '-1');
        if (!option.id) option.id = input.id + '-option-' + index;
        option.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
      });
      input.setAttribute('aria-expanded', options.length ? 'true' : 'false');
      host.setAttribute('aria-busy', 'false');
      if (activeIndex >= options.length) activeIndex = options.length ? 0 : -1;
      if (announceCount && input.value.trim().length >= 2) {
        const emptyState = host.querySelector('small');
        announce(status, options.length ? options.length + ' ' + label + ' suggestions available.' : (emptyState?.textContent?.trim() || 'No matching ' + label + ' suggestions.'));
      }
      return options;
    }

    function setActive(nextIndex) {
      const options = syncOptions(false);
      if (!options.length) return;
      activeIndex = (nextIndex + options.length) % options.length;
      options.forEach((option, index) => option.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false'));
      const active = options[activeIndex];
      input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('input', () => {
      activeIndex = -1;
      input.removeAttribute('aria-activedescendant');
      if (input.value.trim().length >= 2) {
        host.setAttribute('aria-busy', 'true');
        announce(status, 'Searching ' + label + ' suggestions…');
      } else {
        input.setAttribute('aria-expanded', 'false');
        announce(status, '');
      }
    }, true);

    input.addEventListener('keydown', (event) => {
      const options = optionButtons(host, selector);
      if (event.key === 'ArrowDown') {
        if (!options.length) return;
        event.preventDefault();
        setActive(activeIndex < 0 ? 0 : activeIndex + 1);
      } else if (event.key === 'ArrowUp') {
        if (!options.length) return;
        event.preventDefault();
        setActive(activeIndex < 0 ? options.length - 1 : activeIndex - 1);
      } else if (event.key === 'Enter' && activeIndex >= 0 && options[activeIndex]) {
        event.preventDefault();
        options[activeIndex].click();
        activeIndex = -1;
        input.removeAttribute('aria-activedescendant');
        input.setAttribute('aria-expanded', 'false');
        announce(status, input.value + ' selected.');
      } else if (event.key === 'Escape' && (options.length || input.getAttribute('aria-expanded') === 'true')) {
        event.preventDefault();
        host.innerHTML = '';
        activeIndex = -1;
        input.removeAttribute('aria-activedescendant');
        input.setAttribute('aria-expanded', 'false');
        host.setAttribute('aria-busy', 'false');
        announce(status, 'Suggestions closed.');
      }
    });

    host.addEventListener('click', (event) => {
      const option = event.target.closest(selector);
      if (!option) return;
      activeIndex = -1;
      input.removeAttribute('aria-activedescendant');
      input.setAttribute('aria-expanded', 'false');
      requestAnimationFrame(() => announce(status, input.value + ' selected.'));
    });

    const observer = new MutationObserver(() => {
      activeIndex = -1;
      input.removeAttribute('aria-activedescendant');
      syncOptions(true);
    });
    observer.observe(host, { childList: true, subtree: true });
    syncOptions(false);
  }

  function scan() {
    enhanceAutocomplete(
      document.getElementById('msa-town'),
      document.getElementById('msa-town-options'),
      '[data-msa-town]',
      'municipality'
    );
    enhanceAutocomplete(
      document.getElementById('msa-smart-town'),
      document.getElementById('msa-smart-options'),
      '[data-smart-town]',
      'municipality'
    );
  }

  function installBootstrapRecovery() {
    const app = document.getElementById('ms-app');
    if (!app) return;

    let recoveryTimer = window.setTimeout(() => {
      const loading = app.querySelector('.ms-loading');
      const readySurface = app.querySelector('#ms-discovery, .msa-shell');
      if (!loading || readySurface || app.querySelector('.msa-mobile-recovery')) return;

      app.innerHTML = '<section class="msa-mobile-recovery" role="alert" aria-labelledby="msa-mobile-recovery-title">' +
        '<i class="fas fa-triangle-exclamation" aria-hidden="true"></i>' +
        '<h2 id="msa-mobile-recovery-title">Audience did not finish opening.</h2>' +
        '<p>Your campaign may still be loading, or the current campaign context could not be restored. Retry the Audience step to reconnect it safely.</p>' +
        '<button type="button" class="ms-primary" id="msa-mobile-retry">Retry Audience</button>' +
        '<small>Your saved campaign data is not changed by retrying.</small>' +
        '</section>';

      const retry = document.getElementById('msa-mobile-retry');
      if (retry) retry.addEventListener('click', () => window.location.reload());
    }, 9000);

    const observer = new MutationObserver(() => {
      if (app.querySelector('#ms-discovery, .msa-shell')) {
        window.clearTimeout(recoveryTimer);
        recoveryTimer = 0;
        observer.disconnect();
      }
    });
    observer.observe(app, { childList: true, subtree: true });
  }

  const app = document.getElementById('ms-app') || document.body;
  const pageObserver = new MutationObserver(scan);
  pageObserver.observe(app, { childList: true, subtree: true });
  scan();
  installBootstrapRecovery();
})();
