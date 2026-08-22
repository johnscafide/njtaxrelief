(function () {
  'use strict';

  var mobile = window.matchMedia('(max-width: 720px)');
  if (!mobile.matches || !document.body || document.body.dataset.sidebarPage !== 'data-center') return;

  var lastTrigger = null;
  var overlay = null;
  var status = null;

  function client() {
    return typeof window.WatchdogDataCenterClient === 'function' ? window.WatchdogDataCenterClient() : null;
  }

  function ensureStatus() {
    if (status) return status;
    status = document.createElement('div');
    status.className = 'dc-mobile-status';
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
    clearTimeout(node._hideTimer);
    node._hideTimer = setTimeout(function () { node.hidden = true; }, 4200);
  }

  function closeDialog(value) {
    if (!overlay) return;
    var resolver = overlay._resolver;
    overlay.remove();
    overlay = null;
    document.body.classList.remove('dc-mobile-dialog-open');
    if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus();
    if (resolver) resolver(value);
  }

  function openDialog(options) {
    return new Promise(function (resolve) {
      if (overlay) closeDialog(null);
      lastTrigger = options.trigger || document.activeElement;
      overlay = document.createElement('div');
      overlay.className = 'dc-mobile-dialog-layer';
      overlay._resolver = resolve;
      overlay.innerHTML =
        '<div class="dc-mobile-dialog" role="dialog" aria-modal="true" aria-labelledby="dc-mobile-dialog-title">' +
          '<div class="dc-mobile-dialog-head">' +
            '<div><span class="dc-mobile-dialog-kicker">DATA CENTER</span><h2 id="dc-mobile-dialog-title"></h2></div>' +
            '<button class="dc-mobile-dialog-close" type="button" aria-label="Close dialog"><i class="fas fa-xmark" aria-hidden="true"></i></button>' +
          '</div>' +
          '<p class="dc-mobile-dialog-copy"></p>' +
          '<form class="dc-mobile-dialog-form">' +
            (options.kind === 'name' ? '<label>View name<input id="dc-mobile-dialog-input" type="text" maxlength="120" autocomplete="off" enterkeyhint="done"></label>' : '') +
            (options.kind === 'cadence' ? '<label>Delivery cadence<select id="dc-mobile-dialog-input"><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>' : '') +
            '<div class="dc-mobile-dialog-actions">' +
              '<button class="dc-mobile-dialog-cancel" type="button">Cancel</button>' +
              '<button class="dc-mobile-dialog-primary" type="submit"></button>' +
            '</div>' +
          '</form>' +
        '</div>';

      document.body.appendChild(overlay);
      document.body.classList.add('dc-mobile-dialog-open');
      overlay.querySelector('#dc-mobile-dialog-title').textContent = options.title;
      overlay.querySelector('.dc-mobile-dialog-copy').textContent = options.copy || '';
      overlay.querySelector('.dc-mobile-dialog-primary').textContent = options.action || 'Continue';

      var input = overlay.querySelector('#dc-mobile-dialog-input');
      if (input && options.value) input.value = options.value;

      function cancel() { closeDialog(null); }
      overlay.querySelector('.dc-mobile-dialog-close').addEventListener('click', cancel);
      overlay.querySelector('.dc-mobile-dialog-cancel').addEventListener('click', cancel);
      overlay.addEventListener('click', function (event) { if (event.target === overlay) cancel(); });
      overlay.querySelector('form').addEventListener('submit', function (event) {
        event.preventDefault();
        var value = input ? String(input.value || '').trim() : 'confirmed';
        if (options.kind === 'name' && !value) {
          input.setAttribute('aria-invalid', 'true');
          input.focus();
          return;
        }
        closeDialog(value);
      });

      overlay.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
          return;
        }
        if (event.key !== 'Tab') return;
        var focusables = Array.from(overlay.querySelectorAll('button,input,select,[href],[tabindex]:not([tabindex="-1"])')).filter(function (node) { return !node.disabled; });
        if (!focusables.length) return;
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });

      requestAnimationFrame(function () {
        (input || overlay.querySelector('.dc-mobile-dialog-close')).focus();
      });
    });
  }

  function setBusy(button, busy, text) {
    if (!button) return;
    if (busy) {
      button.dataset.mobileOriginalText = button.textContent;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = text;
    } else {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      if (button.dataset.mobileOriginalText) button.textContent = button.dataset.mobileOriginalText;
      delete button.dataset.mobileOriginalText;
    }
  }

  function selectedIds() {
    return Array.from(document.querySelectorAll('#dc-rows input[data-marker]:checked')).map(function (node) { return node.dataset.marker; });
  }

  function filters() {
    return {
      profession: document.getElementById('dc-prof').value,
      tier: document.getElementById('dc-tier').value,
      category: document.getElementById('dc-category').value,
      origin: document.getElementById('dc-origin').value,
      query: document.getElementById('dc-search').value.trim()
    };
  }

  async function saveView(button) {
    var c = client();
    if (!c) {
      announce('Data service is unavailable right now.', 'error');
      return;
    }
    var sessionResponse = await c.auth.getSession();
    if (!(sessionResponse.data && sessionResponse.data.session)) {
      await openDialog({ trigger: button, title: 'Sign in required', copy: 'Sign in to save Data Center views across devices.', action: 'Got it' });
      return;
    }

    var name = await openDialog({ trigger: button, kind: 'name', title: 'Save this view', copy: 'Give this field and filter combination a name you will recognize later.', action: 'Save view' });
    if (!name) return;

    setBusy(button, true, 'Saving…');
    try {
      var response = await c.from('saved_data_center_views').insert({
        name: name.slice(0, 120),
        scope: 'property',
        marker_ids: selectedIds(),
        filters: filters()
      }).select('id,name,scope,marker_ids,filters,sort_config,updated_at').single();
      if (response.error) throw response.error;
      var select = document.getElementById('dc-saved-views');
      if (select && response.data) {
        var option = document.createElement('option');
        option.value = response.data.id;
        option.textContent = response.data.name;
        option.selected = true;
        select.insertBefore(option, select.options[1] || null);
        var deleteButton = document.getElementById('dc-delete-view');
        if (deleteButton) deleteButton.hidden = false;
      }
      announce('View saved.', 'success');
    } catch (error) {
      announce('View could not be saved: ' + error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  }

  async function schedule(button) {
    var select = document.getElementById('dc-saved-views');
    var activeView = select ? select.value : '';
    if (!activeView) {
      await openDialog({ trigger: button, title: 'Save this view first', copy: 'Scheduling uses a saved Data Center view so Watchdog can reproduce the same fields later.', action: 'Got it' });
      return;
    }

    var cadence = await openDialog({ trigger: button, kind: 'cadence', title: 'Schedule delivery', copy: 'Choose how often Watchdog should prepare this governed CSV delivery.', action: 'Schedule' });
    if (!cadence) return;

    var c = client();
    if (!c) {
      announce('Data service is unavailable right now.', 'error');
      return;
    }

    setBusy(button, true, 'Scheduling…');
    try {
      var name = select.options[select.selectedIndex] ? select.options[select.selectedIndex].textContent : 'Data Center';
      var response = await c.from('data_center_delivery_jobs').insert({
        view_id: activeView,
        name: name + ' delivery',
        scope: document.getElementById('dc-scope').value,
        format: 'csv',
        cadence: cadence,
        status: 'scheduled',
        next_run_at: new Date().toISOString()
      });
      if (response.error) throw response.error;
      announce('Delivery scheduled ' + cadence + '.', 'success');
    } catch (error) {
      announce('Delivery could not be scheduled: ' + error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  }

  async function deleteView(button) {
    var select = document.getElementById('dc-saved-views');
    var activeView = select ? select.value : '';
    if (!activeView) return;
    var confirmed = await openDialog({ trigger: button, title: 'Delete saved view?', copy: 'This removes the saved Data Center view from your account. It does not change property data.', action: 'Delete view' });
    if (!confirmed) return;

    var c = client();
    if (!c) return announce('Data service is unavailable right now.', 'error');
    setBusy(button, true, 'Deleting…');
    try {
      var response = await c.from('saved_data_center_views').delete().eq('id', activeView);
      if (response.error) throw response.error;
      var option = select.querySelector('option[value="' + CSS.escape(activeView) + '"]');
      if (option) option.remove();
      select.value = '';
      button.hidden = true;
      announce('Saved view deleted.', 'success');
    } catch (error) {
      announce('View could not be deleted: ' + error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  }

  document.addEventListener('click', function (event) {
    if (!mobile.matches) return;
    var button = event.target.closest('button');
    if (!button) return;

    if (button.id === 'dc-save-view') {
      event.preventDefault();
      event.stopImmediatePropagation();
      saveView(button);
      return;
    }
    if (button.id === 'dc-schedule') {
      event.preventDefault();
      event.stopImmediatePropagation();
      schedule(button);
      return;
    }
    if (button.id === 'dc-delete-view') {
      event.preventDefault();
      event.stopImmediatePropagation();
      deleteView(button);
      return;
    }
    if (button.id === 'dc-build' && !selectedIds().length) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openDialog({ trigger: button, title: 'Select fields first', copy: 'Choose at least one governed marker before building a result sheet.', action: 'Got it' });
    }
  }, true);
})();