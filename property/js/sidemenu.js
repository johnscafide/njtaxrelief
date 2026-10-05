/* 
     
     Hi There. I see you are checking the code. I'm sure you have reasons for such. Curiosity would be my guess. 

     My name is John. I've been building sites since I was 10. I was gifted ecommerce website software on floppy disks
     and fell in love with web developement ever since. I learned to code HTML using just notepad. I took computer science
     classes (BASIC and Visual Basic in high school). Took a few college classes learning C++, Python, Ruby and Javascript.
     My very first websites was with Angelfire and Geocities. In college I dabbed in game development, small tools, and
     graphic design. Database management with SQL by my sophmore year. Joomla and other CMS tools learned by the age of 20. 
     I have an understanding and experience writing code by hand, studing and analyzing bugs, issues, and corrections. 
     The introduction of AI is interesting. I can understand the worry and fear. I also see the memes of "Hey I can make 
     your job obsolete" then show a localhost:3000. haha. But I do believe, if you understand how to use the tools, it's
     no different than templates, hiring a local kid, outsourcing your work to fivrr or an agency. I code, I understand the
     backend and frontend. I'm not an expert by all means. But I do have insights. Watchdog was built on real research.
     Watchdog & it's companion, NJPropertyTaxRelief.com, is from years of listening to real people with real needs in NJ.
     I hope these sites and tools have benefit to you and/or your business. If you found them useful, the least I ask of
     you is to share. Sure, I have paid plan options for members, but majority of the site is free to use. I'm a real estate
     agent, licensed tax professional, and a big fan of the state of New Jersey. It's a great state, but not without its
     flaws. The idea is to educate more New Jerseyians about their benefits and property taxes in the state. It's possible
     one day this site will exceed some of the bigger natonal sites. Who knows. But for now, I present to you, Watchdog
     Property Intelligence.

     */
(function () {
  'use strict';

  var targetId = 'property-side-menu';
  var modernSecondaryPages = ['town-compare','fairness','pulse','scan','account','data-workbench','data-center'];

  function pageName() { return document.body.getAttribute('data-sidebar-page') || ''; }
  function isMobile() { return window.matchMedia && window.matchMedia('(max-width: 760px)').matches; }

  function loadModernSecondaryShell() {
    if (modernSecondaryPages.indexOf(pageName()) < 0) return false;
    ['/property/css/app-shell-2027.css','/property/css/secondary-pages-2027.css'].forEach(function (href) {
      if (document.querySelector('link[href="' + href + '"]')) return;
      var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.appendChild(link);
    });
    if (!document.querySelector('script[src="/property/js/app-shell-2027.js"]')) {
      var script = document.createElement('script'); script.src = '/property/js/app-shell-2027.js'; script.defer = true; document.body.appendChild(script);
    }
    var target = document.getElementById(targetId); if (target) { target.innerHTML = ''; target.hidden = true; }
    document.body.classList.remove('db-sidebar-expanded','wd-mobile-menu-open');
    return true;
  }

  function suppressLegacySidebar() {
    var target = document.getElementById(targetId);
    if (target) {
      target.innerHTML = '';
      target.hidden = true;
      target.style.display = 'none';
      var shell = target.parentElement;
      if (shell && shell.classList.contains('db-shell')) shell.style.gridTemplateColumns = 'minmax(0,1fr)';
    }
    document.body.classList.remove('db-sidebar-expanded','wd-mobile-menu-open');
    document.documentElement.classList.add('wd-no-legacy-sidebar');
    document.dispatchEvent(new CustomEvent('njptr:sidemenu-ready', { detail: { legacySidebar: false } }));
    return true;
  }

  function paintToggle() {
    var button = document.getElementById('db-sidebar-toggle'); if (!button) return;
    var expanded = document.body.classList.contains('db-sidebar-expanded');
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    button.setAttribute('aria-label', expanded ? 'Collapse navigation' : 'Expand navigation');
    var icon = button.querySelector('i'), label = button.querySelector('span');
    if (icon) icon.className = 'fas fa-angles-' + (expanded ? 'left' : 'right');
    if (label) label.textContent = expanded ? 'Collapse navigation' : 'Expand navigation';
  }

  function genericToggle() {
    if (isMobile()) return;
    document.body.classList.toggle('db-sidebar-expanded');
    var expanded = document.body.classList.contains('db-sidebar-expanded');
    try { localStorage.setItem('watchdogSidebarExpanded', expanded ? '1' : '0'); } catch (_) {}
    paintToggle();
  }

  function openAgentControl(event) {
    if (event) event.preventDefault();
    var host = String(location.hostname || '').toLowerCase();
    location.href = (host === 'watchdogindex.com' || host === 'www.watchdogindex.com') ? '/agent-desk' : '/property/agent-desk';
  }

  function runAction(action, event) {
    var page = pageName();
    if (action === 'mobile-menu') { toggleMobileMenu(true); return; }
    if (action === 'mobile-menu-close') { toggleMobileMenu(false); return; }
    if (action === 'nav-group') { var button = event.target.closest('.db-side-group-toggle'); if (button) setGroup(button, button.getAttribute('aria-expanded') !== 'true', true); return; }
    if (action === 'toggle') { if (page === 'home' && typeof window.hmToggleSidebar === 'function') window.hmToggleSidebar(); else if (typeof window.dbToggleSidebar === 'function') window.dbToggleSidebar(); else genericToggle(); return; }
    if (action === 'agent-intel') { if (page === 'home' && typeof window.hmAgentIntel === 'function') window.hmAgentIntel(); else if (typeof window.dbIntelOpen === 'function') window.dbIntelOpen(); return; }
    if (action === 'sign-out' && typeof window.plSignOut === 'function') { window.plSignOut(); return; }
    if (page !== 'dashboard') return;
    if (action === 'overview' && typeof window.dbPanel === 'function') { event.preventDefault(); window.dbPanel('main'); }
    if (action === 'profile' && typeof window.dbPanel === 'function') { event.preventDefault(); window.dbPanel('profile'); }
  }

  function toggleMobileMenu(open) {
    var menu = document.getElementById('wd-mobile-menu'); if (!menu) return;
    if (open) { menu.hidden = false; requestAnimationFrame(function () { menu.classList.add('open'); }); document.body.classList.add('wd-mobile-menu-open'); var close = menu.querySelector('[data-side-action="mobile-menu-close"]'); if (close) close.focus(); }
    else { menu.classList.remove('open'); document.body.classList.remove('wd-mobile-menu-open'); window.setTimeout(function () { if (!menu.classList.contains('open')) menu.hidden = true; }, 180); var trigger = document.querySelector('[data-side-action="mobile-menu"]'); if (trigger) trigger.focus(); }
  }

  function setGroup(button, expanded, remember) {
    var group = button && button.closest('.db-side-group'), submenu = group && group.querySelector('.db-side-submenu'); if (!group || !submenu) return;
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false'); group.classList.toggle('open', expanded);
    if (expanded) submenu.removeAttribute('hidden'); else window.setTimeout(function () { if (!group.classList.contains('open')) submenu.setAttribute('hidden', ''); }, 260);
    if (remember) { try { localStorage.setItem('watchdogNavGroup:' + group.getAttribute('data-side-group'), expanded ? '1' : '0'); } catch (_) {} }
  }

  function restoreGroups(container) {
    container.querySelectorAll('.db-side-group').forEach(function (group) { var button = group.querySelector('.db-side-group-toggle'); if (!button) return; var expanded = button.getAttribute('aria-expanded') === 'true'; if (group.querySelector('[aria-current="page"]')) expanded = true; setGroup(button, expanded, false); });
  }

  function activateSearch(container) {
    var input = container.querySelector('#db-nav-search'); if (!input) return;
    function filter() { var q = input.value.trim().toLowerCase(); container.querySelectorAll('.db-side-group').forEach(function (group) { var matches = 0; group.querySelectorAll('.db-side-link').forEach(function (link) { var show = !q || link.textContent.toLowerCase().indexOf(q) >= 0; link.classList.toggle('db-nav-search-hidden', !show); if (show) matches += 1; }); group.classList.toggle('db-nav-search-hidden', !!q && !matches); if (q && matches) setGroup(group.querySelector('.db-side-group-toggle'), true, false); }); container.querySelectorAll('.db-side-primary .db-side-link,.db-side-primary .pn').forEach(function (link) { link.classList.toggle('db-nav-search-hidden', !!q && link.textContent.toLowerCase().indexOf(q) < 0); }); container.classList.toggle('db-nav-searching', !!q); }
    input.addEventListener('input', filter); input.addEventListener('keydown', function (event) { if (event.key === 'Escape') { input.value = ''; filter(); input.blur(); } });
    document.addEventListener('keydown', function (event) { if (event.key === '/' && !/input|textarea|select/i.test(document.activeElement && document.activeElement.tagName)) { event.preventDefault(); if (!document.body.classList.contains('db-sidebar-expanded')) genericToggle(); window.setTimeout(function () { input.focus(); }, 120); } });
  }

  function activate(container) {
    var current = pageName();
    container.querySelectorAll('[data-nav-page]').forEach(function (item) { var active = item.getAttribute('data-nav-page') === current; item.classList.toggle('on', active); if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current'); });
    restoreGroups(container); activateSearch(container);
    container.addEventListener('click', function (event) {
      var agentLink = event.target.closest('a[data-nav-page="agent-desk"],a[href="/property/agent-desk"]');
      if (agentLink) { openAgentControl(event); toggleMobileMenu(false); return; }
      var control = event.target.closest('[data-side-action]'); if (control) runAction(control.getAttribute('data-side-action'), event);
    });
    try { if (localStorage.getItem('watchdogSidebarExpanded') === '1' && !isMobile()) document.body.classList.add('db-sidebar-expanded'); } catch (_) {}
    paintToggle(); paintDeveloperLinks(!!window.NJPTRDeveloperConfirmed || !!(window.NJPTRPlan && window.NJPTRPlan.state && window.NJPTRPlan.state().developer)); paintPlanNavigation();
  }

  function paintDeveloperLinks(show) { document.querySelectorAll('.developer-only').forEach(function (node) { node.hidden = !show; }); }
  function paintPlanNavigation() {
    var plan = window.NJPTRPlan && window.NJPTRPlan.state ? window.NJPTRPlan.state() : null, paid = !!(plan && ['agent','pro','pro_plus','teams','developer'].indexOf(plan.effective) >= 0), planLabel = document.getElementById('db-side-plan');
    if (planLabel) { var effective = plan && plan.effective ? plan.effective : 'standard'; planLabel.textContent = effective === 'agent' ? 'Agent plan' : effective === 'pro_plus' ? 'Pro+ plan' : effective === 'teams' ? 'Teams plan' : effective === 'developer' ? 'Developer access' : effective === 'pro' ? 'Pro plan' : 'Standard plan'; }
    document.querySelectorAll('.db-side-mobile [data-nav-page="pro"]').forEach(function (node) { var label = node.querySelector('span'); if (label) label.textContent = paid ? 'Tools' : 'Pro'; node.setAttribute('aria-label', paid ? 'Professional tools' : 'Pro plans'); });
    document.querySelectorAll('.wd-mobile-pro-link').forEach(function (node) { var title = node.querySelector('b'), note = node.querySelector('small'); if (paid) { if (title) title.textContent = 'Professional tools'; if (note) note.textContent = 'Your plan dashboard'; } else { if (title) title.textContent = 'See Pro'; if (note) note.textContent = 'Professional tools and tasks'; } });
    document.querySelectorAll('.paid-only').forEach(function (node) { node.hidden = !paid; });
  }

  function loadFlood() {
    if (window.WatchdogFlood || document.getElementById('wd-flood-script')) return;
    var s = document.createElement('script'); s.id = 'wd-flood-script'; s.src = '/property/js/flood-intelligence.js'; s.defer = true; document.head.appendChild(s);
  }

  function loadWhyWatchdog() {
    if (window.WatchdogWhy || document.getElementById('wd-why-script')) return;
    var s = document.createElement('script');
    s.id = 'wd-why-script';
    s.src = '/property/js/watchdog-why.js';
    s.defer = true;
    document.head.appendChild(s);
  }

  function loadBrandConsistency() {
    if (window.WatchdogBrandConsistency || document.querySelector('script[src="/property/js/brand-consistency-runtime.js"]')) return;
    var s = document.createElement('script');
    s.src = '/property/js/brand-consistency-runtime.js';
    s.defer = true;
    document.head.appendChild(s);
  }

  document.addEventListener('njptr:plan-change', function (event) { paintDeveloperLinks(!!(event.detail && event.detail.developer)); paintPlanNavigation(); });
  document.addEventListener('watchdog:developer-confirmed', function () { paintDeveloperLinks(true); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') toggleMobileMenu(false); });

  function load() {
    loadBrandConsistency();
    loadWhyWatchdog();
    if (loadModernSecondaryShell()) return Promise.resolve(true);
    loadFlood();
    return Promise.resolve(suppressLegacySidebar());
  }

  window.njptrSideMenuReady = document.readyState === 'loading' ? new Promise(function (resolve) { document.addEventListener('DOMContentLoaded', function () { load().then(resolve); }, { once: true }); }) : load();
  window.njptrToggleSidebar = genericToggle;
  window.njptrOpenAgentControl = openAgentControl;
})();