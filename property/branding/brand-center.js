(function(){
  'use strict';

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
      if (updated && spec.metadata) updated.textContent = spec.metadata.updated || '2026-08-19';
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
