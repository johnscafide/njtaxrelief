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

  function ensureIntelligenceCss(){
    var href='/property/css/watchdog-intelligence-brand.css';
    if(document.querySelector('link[href="'+href+'"]')) return;
    var link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href;
    document.head.appendChild(link);
  }

  ensureLayoutCss();
  ensureIntelligenceCss();

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

  function injectIntelligenceBrandSection(){
    if ($('#intelligence-brand')) return;
    var color = $('#color');
    if (!color || !color.parentNode) return;

    var nav = $('.bc-localnav');
    if (nav && !nav.querySelector('a[href="#intelligence-brand"]')) {
      var typeLink = nav.querySelector('a[href="#type"]');
      var link = document.createElement('a');
      link.href = '#intelligence-brand';
      link.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Watchdog Intelligence';
      if (typeLink) nav.insertBefore(link, typeLink); else nav.appendChild(link);
    }

    var section = document.createElement('section');
    section.className = 'bc-panel';
    section.id = 'intelligence-brand';
    section.setAttribute('data-search','watchdog intelligence gradient colorful border sub-brand voice robust score analyst ai branding');
    section.innerHTML = ''+
      '<div class="bc-panel-head"><div><span class="bc-eyebrow">04 · INTELLIGENCE SUB-BRAND</span><h2>Watchdog <span class="wd-intelligence-word">Intelligence</span></h2><p>Watchdog Intelligence has one restrained visual signature across pricing, product education and future collateral. It sits inside the Watchdog master brand rather than replacing it.</p></div><span class="bc-panel-tag">Required</span></div>'+
      '<div class="bc-intelligence-demo"><div>'+
        '<span class="bc-eyebrow">CANONICAL SIGNATURE</span><h3>Color identifies the Intelligence layer.</h3><p>Whenever a surface explicitly names Watchdog Intelligence, render <b class="wd-intelligence-word">Intelligence</b> in the four-stop gradient and/or use a restrained 1px Intelligence gradient border around the meaningful Intelligence section or card. Major standalone callouts should normally use both.</p>'+
        '<div class="bc-intelligence-samples">'+
          '<div class="bc-intelligence-sample"><small>Word treatment</small><b>Watchdog <span class="wd-intelligence-word">Intelligence</span></b></div>'+
          '<div class="bc-intelligence-sample wd-intelligence-surface"><small>Surface treatment</small><b>1px colorful border, white interior</b></div>'+
          '<div class="bc-intelligence-sample"><small>Gradient</small><b>#2f6df6 → #6c5ce7 → #d760b5 → #08a6a7</b></div>'+
        '</div>'+
        '<p class="bc-intelligence-do"><b>Keep it restrained.</b> This gradient is not a generic dashboard accent and does not replace semantic status colors. Generic Watchdog UI remains blue, navy and neutral. If gradient text is not legible or supported, use Watchdog ink and preserve the colorful border.</p>'+
      '</div></div>'+
      '<div class="bc-grid two" style="margin-top:14px">'+
        '<article class="bc-card"><span class="bc-eyebrow">VOICE</span><h3>Voice belongs to Watchdog Intelligence</h3><p>Use <b>Watchdog Intelligence Voice</b> when the full name is needed. Inside an established Intelligence context, <b>Voice</b> is enough. Do not sell or brand Voice as a separate audio product.</p><p>Agent and Pro unlock Voice through Watchdog Intelligence entitlement. Pro+ includes it. Written evidence remains authoritative.</p></article>'+
        '<article class="bc-card"><span class="bc-eyebrow">ROBUST</span><h3>Watchdog Score, powered by ROBUST</h3><p><b>The Watchdog Score is powered by the ROBUST Framework.</b> One score. Six dimensions. ROBUST.</p><p>R Recourse · O Overassessment Position · B Burden · U Uniformity · S Stability · T Trajectory. Never rename the product “ROBUST Score.”</p></article>'+
      '</div>'+
      '<div class="bc-grid two" style="margin-top:14px">'+
        '<article class="bc-card"><h3>Human guide</h3><p>The canonical sub-brand rules, usage examples, accessibility fallback, Voice relationship and ROBUST naming are maintained here.</p><a class="bc-btn" href="/property/branding/WATCHDOG-INTELLIGENCE-BRAND.md"><i class="fas fa-book-open"></i> Open Intelligence standard</a></article>'+
        '<article class="bc-card"><h3>Machine spec</h3><p>Agents and future tooling should use the machine-readable spec rather than guessing at gradient stops, plan naming or ROBUST dimensions.</p><a class="bc-btn" href="/property/branding/intelligence-brand.json"><i class="fas fa-brackets-curly"></i> Open machine spec</a></article>'+
      '</div>';
    color.insertAdjacentElement('afterend', section);
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

        var intelligenceRow = document.createElement('div');
        intelligenceRow.className = 'bc-asset';
        intelligenceRow.setAttribute('data-bc-current-layer','intelligence');
        intelligenceRow.innerHTML = '<span class="bc-asset-icon"><i class="fas fa-wand-magic-sparkles"></i></span><div><b>Watchdog Intelligence sub-brand</b><span>/property/branding/WATCHDOG-INTELLIGENCE-BRAND.md</span></div><a href="/property/branding/WATCHDOG-INTELLIGENCE-BRAND.md">Open</a>';
        list.insertBefore(intelligenceRow, runtimeRow.nextSibling);
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
    injectIntelligenceBrandSection();
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
