(function () {
  'use strict';

  var mobile = window.matchMedia('(max-width: 720px)');
  if (!mobile.matches || !document.body || document.body.dataset.sidebarPage !== 'data-center') return;

  var observer = null;
  var bound = false;
  var originalBuildText = '';
  var originalExportText = '';
  var status = null;

  function ensureStatus() {
    if (status) return status;
    status = document.createElement('div');
    status.className = 'dc-mobile-result-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;
    document.body.appendChild(status);
    return status;
  }

  function announce(message, tone) {
    var node = ensureStatus();
    node.textContent = message;
    node.dataset.tone = tone || 'info';
    node.hidden = false;
    clearTimeout(node._timer);
    node._timer = setTimeout(function () { node.hidden = true; }, 4200);
  }

  function setButtonBusy(button, busy, busyText, originalText) {
    if (!button) return;
    if (busy) {
      button.setAttribute('aria-busy', 'true');
      button.disabled = true;
      button.textContent = busyText;
      return;
    }
    button.removeAttribute('aria-busy');
    button.disabled = false;
    button.textContent = originalText;
  }

  function enhanceResults() {
    var results = document.getElementById('dc-results');
    if (!results) return;
    results.setAttribute('role', 'region');
    results.setAttribute('aria-label', 'Data Center result sheet');
    results.setAttribute('tabindex', '0');
    var table = results.querySelector('table');
    if (table) table.setAttribute('aria-label', 'Generated governed Data Center sheet');
  }

  function handleNote() {
    var note = document.getElementById('dc-result-note');
    var build = document.getElementById('dc-build');
    var exportButton = document.getElementById('dc-export');
    var results = document.getElementById('dc-results');
    if (!note || !build) return;

    var text = String(note.textContent || '').trim();
    if (text.indexOf('Resolving selected fields') === 0) {
      if (!originalBuildText) originalBuildText = build.textContent || 'Build sheet';
      build.setAttribute('aria-busy', 'true');
      build.disabled = true;
      build.textContent = 'Building…';
      if (results) results.setAttribute('aria-busy', 'true');
      return;
    }

    if (text.indexOf('Sheet could not be built:') === 0) {
      if (!originalBuildText) originalBuildText = 'Build sheet';
      setButtonBusy(build, false, '', originalBuildText);
      if (results) {
        results.removeAttribute('aria-busy');
        results.hidden = true;
      }
      if (exportButton) exportButton.disabled = true;
      announce('The result sheet could not be built. Your previous sheet has been hidden so stale results are not mistaken for current data.', 'error');
      return;
    }

    if (/^\d+ governed /.test(text)) {
      if (!originalBuildText) originalBuildText = 'Build sheet';
      setButtonBusy(build, false, '', originalBuildText);
      if (results) results.removeAttribute('aria-busy');
      enhanceResults();
      announce('Data Center sheet is ready.', 'success');
    }
  }

  function bind() {
    if (bound) return true;
    var note = document.getElementById('dc-result-note');
    var build = document.getElementById('dc-build');
    var exportButton = document.getElementById('dc-export');
    var results = document.getElementById('dc-results');
    if (!note || !build || !exportButton || !results) return false;

    bound = true;
    originalBuildText = build.textContent || 'Build sheet';
    originalExportText = exportButton.textContent || 'Export CSV';

    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    note.setAttribute('aria-atomic', 'true');
    enhanceResults();

    observer = new MutationObserver(handleNote);
    observer.observe(note, { childList: true, characterData: true, subtree: true });

    exportButton.addEventListener('click', function () {
      if (exportButton.disabled) return;
      exportButton.setAttribute('aria-busy', 'true');
      exportButton.textContent = 'Exporting…';
      setTimeout(function () {
        exportButton.removeAttribute('aria-busy');
        exportButton.textContent = originalExportText;
        announce('CSV export prepared.', 'success');
      }, 450);
    });

    return true;
  }

  if (!bind()) {
    var rootObserver = new MutationObserver(function () {
      if (bind()) rootObserver.disconnect();
    });
    rootObserver.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { rootObserver.disconnect(); }, 15000);
  }
})();