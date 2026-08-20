(function(){
  'use strict';

  function ensureLayoutCss(){
    var href='/property/branding/brand-center-layout-fix.css';
    if(document.querySelector('link[href="'+href+'"]')) return;
    var link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href;
    document.head.appendChild(link);
  }
  ensureLayoutCss();

  function $(selector, root){ return (root || document).querySelector(selector); }
  function $$(selector, root){ return Array.from((root || document).querySelectorAll(selector)); }

  function copyText(text, button){
    if (!text) return;
    var done = function(){
      if (!button) return;
      var original = button.innerHTML;
      button.innerHTML = '<i class="fas fa-check"></i> Copied';
      setTimeout(function(){ button.innerHTML = original; }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function(){ fallbackCopy(text, done); });
    } else fallbackCopy(text, done);
  }

  function fallbackCopy(text, done){
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly','');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); done(); } catch (_error) {}
    area.remove();
  }

  function wireCopyButtons(){
    $$('[data-copy-target]').forEach(function(button){
      button.addEventListener('click', function(){
        var target = document.getElementById(button.getAttribute('data-copy-target'));
        copyText(target ? target.innerText : '', button);
      });
    });
  }

  function wireLocalNav(){
    var links = $$('.bc-localnav a[href^="#"]');
    var sections = links.map(function(link){ return document.querySelector(link.getAttribute('href')); }).filter(Boolean);
    if (!('IntersectionObserver' in window) || !sections.length) return;
    var observer = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (!entry.isIntersecting) return;
        links.forEach(function(link){ link.classList.toggle('active', link.getAttribute('href') === '#' + entry.target.id); });
      });
    }, {rootMargin:'-18% 0px -72% 0px', threshold:0});
    sections.forEach(function(section){ observer.observe(section); });
  }

  function wireSearch(){
    var input = $('#bc-search');
    if (!input) return;
    input.addEventListener('input', function(){
      var term = input.value.trim().toLowerCase();
      $$('.bc-panel[data-search]').forEach(function(panel){
        var haystack = ((panel.getAttribute('data-search') || '') + ' ' + panel.textContent).toLowerCase();
        panel.hidden = !!term && haystack.indexOf(term) === -1;
      });
    });
  }

  function syncCurrentReferences(spec){
    var implementation = spec && spec.implementation ? spec.implementation : {};
    var retiredNav = '/property/partials/sidemenu.html';
    var currentNav = implementation.sidebar || '/property/js/sidemenu.js';
    var consistencyCss = implementation.canonical_shared_reference || '/property/css/brand-consistency.css';
    var brandRuntime = implementation.brand_runtime || '/property/js/brand-consistency-runtime.js';

    $$('code,.bc-asset span,.bc-asset a').forEach(function(node){
      if (node.textContent && node.textContent.trim() === retiredNav) node.textContent = currentNav;
    });
    $$('a[href="'+retiredNav+'"]').forEach(function(link){ link.setAttribute('href', currentNav); });
    $$('.bc-rule-list li span').forEach(function(node){
      if (!node.textContent || node.textContent.indexOf(retiredNav) < 0) return;
      node.textContent = node.textContent.replace(retiredNav, currentNav).replace('owns shared signed-in navigation', 'routes shared signed-in navigation into the current app shell');
    });

    var sharedRef = $('.bc-asset b');
    if (sharedRef && !document.querySelector('[data-bc-current-layer]')) {
      var list = $('.bc-asset-list');
      if (list) {
        var row = document.createElement('div');
        row.className = 'bc-asset';
        row.setAttribute('data-bc-current-layer','');
        row.innerHTML = '<span class="bc-asset-icon"><i class="fas fa-palette"></i></span><div><b>Canonical app consistency layer</b><span></span></div><a>Open</a>';
        row.querySelector('span span, div span');
        var pathNode = row.querySelector('div span');
        var link = row.querySelector('a');
        if (pathNode) pathNode.textContent = consistencyCss;
        if (link) link.setAttribute('href', consistencyCss);
        list.insertBefore(row, list.firstChild);

        var runtimeRow = document.createElement('div');
        runtimeRow.className = 'bc-asset';
        runtimeRow.setAttribute('data-bc-current-layer','runtime');
        runtimeRow.innerHTML = '<span class="bc-asset-icon"><i class="fas fa-arrows-rotate"></i></span><div><b>Canonical brand/navigation runtime</b><span></span></div><a>Open</a>';
        var runtimePath = runtimeRow.querySelector('div span');
        var runtimeLink = runtimeRow.querySelector('a');
        if (runtimePath) runtimePath.textContent = brandRuntime;
        if (runtimeLink) runtimeLink.setAttribute('href', brandRuntime);
        list.insertBefore(runtimeRow, row.nextSibling);
      }
    }
  }

  function loadMachineSpec(){
    var state = $('#bc-machine-state');
    return fetch('/property/branding/brand-system.json', {cache:'no-store'}).then(function(response){
      if (!response.ok) throw new Error('Brand system unavailable');
      return response.json();
    }).then(function(spec){
      if (state) {
        state.className = 'bc-machine-state good';
        state.innerHTML = '<i class="fas fa-circle-check"></i> Machine spec loaded';
      }
      var version = $('#bc-version');
      var updated = $('#bc-updated');
      if (version && spec.metadata) version.textContent = 'v' + (spec.metadata.version || '1.0.0');
      if (updated && spec.metadata) updated.textContent = spec.metadata.updated || '2026-08-20';
      syncCurrentReferences(spec);
      window.WatchdogBrandSystem = spec;
      return spec;
    }).catch(function(error){
      if (state) {
        state.className = 'bc-machine-state bad';
        state.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Machine spec could not load';
      }
      console.error('[Watchdog Brand Center]', error);
    });
  }

  function reveal(){
    var app = $('#bc-app');
    if (app) app.hidden = false;
    wireCopyButtons();
    wireLocalNav();
    wireSearch();
    loadMachineSpec();
  }

  var ready = window.njptrAccessReady || Promise.resolve({developer:false});
  Promise.resolve(ready).then(reveal).catch(function(error){
    console.error('[Watchdog Brand Center] Access denied', error);
  });
})();
