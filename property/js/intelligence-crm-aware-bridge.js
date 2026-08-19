(function () {
  'use strict';
  if (window.__WATCHDOG_CRM_INTELLIGENCE_BRIDGE__) return;
  window.__WATCHDOG_CRM_INTELLIGENCE_BRIDGE__ = true;

  function isCrmPrompt(prompt) {
    var p = String(prompt || '').toLowerCase();
    if (/\b(crm|boldtrail|kvcore)\b/.test(p)) return true;
    if (/\b(my|our)\s+(leads?|clients?|contacts?|database)\b/.test(p)) return true;
    if (/\b(leads?|clients?|contacts?)\b/.test(p) && /\b(stage|source|assigned|relationship|database|pipeline)\b/.test(p)) return true;
    return false;
  }

  function patchClient(client) {
    if (!client || !client.functions || typeof client.functions.invoke !== 'function' || client.functions.__watchdogCrmAware) return;
    var original = client.functions.invoke.bind(client.functions);
    client.functions.invoke = function (name, options) {
      if (name === 'intelligence-analyst') {
        var prompt = options && options.body && options.body.prompt;
        if (isCrmPrompt(prompt)) return original('intelligence-crm-analyst', options);
      }
      return original(name, options);
    };
    try { Object.defineProperty(client.functions, '__watchdogCrmAware', { value: true }); }
    catch (_error) { client.functions.__watchdogCrmAware = true; }
  }

  function sendPrompt(text) {
    var input = document.getElementById('dwa-input');
    var send = document.getElementById('dwa-send');
    if (!input || !send) return;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    send.click();
  }

  function enhanceAnalyst() {
    var panel = document.getElementById('dwa-panel');
    if (!panel || panel.dataset.crmAware === 'true') return;
    panel.dataset.crmAware = 'true';
    var chips = panel.querySelector('.dwa-chips');
    if (!chips) return;

    var first = document.createElement('button');
    first.type = 'button';
    first.className = 'dwa-chip dwa-chip-crm';
    first.innerHTML = '<i class="fas fa-address-book"></i> What does my CRM know about these properties?';
    first.addEventListener('click', function () { sendPrompt('What does my CRM know about these properties?'); });

    var second = document.createElement('button');
    second.type = 'button';
    second.className = 'dwa-chip dwa-chip-crm';
    second.innerHTML = '<i class="fas fa-link"></i> Do I have a verified CRM relationship for these properties?';
    second.addEventListener('click', function () { sendPrompt('Do I have a verified CRM relationship for these properties?'); });

    chips.append(first, second);

    var note = panel.querySelector('.dwa-note');
    if (note && !note.querySelector('[data-crm-aware-note]')) {
      var span = document.createElement('span');
      span.setAttribute('data-crm-aware-note', 'true');
      span.innerHTML = ' <b>CRM-aware:</b> authorized CRM context is treated as relationship/workflow context only and never replaces governed property facts.';
      note.appendChild(span);
    }
  }

  async function install() {
    try {
      await Promise.resolve(window.njptrAccessReady);
      var client = window.NJPTRAccess && window.NJPTRAccess.client ? window.NJPTRAccess.client() : null;
      patchClient(client);
    } catch (_error) {}

    enhanceAnalyst();
    if (typeof MutationObserver !== 'undefined' && document.documentElement) {
      var observer = new MutationObserver(function () { enhanceAnalyst(); });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
