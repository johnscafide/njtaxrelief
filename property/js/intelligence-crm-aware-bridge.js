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

  function routeFunctions(functionsClient) {
    if (!functionsClient || typeof functionsClient.invoke !== 'function') return functionsClient;
    if (functionsClient.__watchdogCrmAware) return functionsClient;

    var original = functionsClient.invoke.bind(functionsClient);
    functionsClient.invoke = function (name, options) {
      if (name === 'intelligence-analyst') {
        var prompt = options && options.body && options.body.prompt;
        if (isCrmPrompt(prompt)) return original('intelligence-crm-analyst', options);
      }
      return original(name, options);
    };

    try { Object.defineProperty(functionsClient, '__watchdogCrmAware', { value: true }); }
    catch (_error) { functionsClient.__watchdogCrmAware = true; }
    return functionsClient;
  }

  function findFunctionsDescriptor(client) {
    var proto = client;
    while (proto) {
      var descriptor = Object.getOwnPropertyDescriptor(proto, 'functions');
      if (descriptor && typeof descriptor.get === 'function') return descriptor;
      proto = Object.getPrototypeOf(proto);
    }
    return null;
  }

  function patchClient(client) {
    if (!client || client.__watchdogCrmFunctionsGetter) return;

    var descriptor = findFunctionsDescriptor(client);
    if (!descriptor || typeof descriptor.get !== 'function') {
      try { routeFunctions(client.functions); } catch (_error) {}
      return;
    }

    try {
      Object.defineProperty(client, 'functions', {
        configurable: true,
        enumerable: descriptor.enumerable !== false,
        get: function () {
          return routeFunctions(descriptor.get.call(client));
        }
      });
      Object.defineProperty(client, '__watchdogCrmFunctionsGetter', { value: true });
    } catch (_error) {
      try { routeFunctions(client.functions); } catch (_ignored) {}
    }
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
      var observer = new MutationObserver(function () {
        enhanceAnalyst();
        try {
          var liveClient = window.NJPTRAccess && window.NJPTRAccess.client ? window.NJPTRAccess.client() : null;
          patchClient(liveClient);
        } catch (_error) {}
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
