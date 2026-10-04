/* Watchdog universal navigation + profile menu.
   One canonical source for destinations, entitlement gating, account menu copy
   AND the main navigation drawer itself. Every Watchdog page that shows a menu
   uses the drawer rendered here (the same one the property index uses), so a
   change to items() or publicDrawerHtml() updates the menu on every page.
   Pages open it with WatchdogUniversalMenu.open() or any element carrying
   data-wd-universal="open-menu". */
(function(){
  'use strict';
  if(window.__WATCHDOG_UNIVERSAL_MENU__) return;
  window.__WATCHDOG_UNIVERSAL_MENU__ = true;

  var VERSION = '20261001a';
  /* CSS has a longer browser/CDN cache lifetime than this runtime. Keep a
     separate asset revision so interaction fixes can invalidate cached chrome
     immediately without coupling that cache key to the menu data contract. */
  var CSS_VERSION = '20261001a';
  var URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var hostname = String(location.hostname || '').toLowerCase();
  var cleanHost = hostname === 'watchdogindex.com' || hostname === 'www.watchdogindex.com';
  var prefix = cleanHost ? '' : '/property';
  var db = null;
  var state = { user:null, profile:{}, entitlement:null, ready:false };
  var queued = false;
  var authAttempts = 0;
  var observed = typeof WeakSet === 'function' ? new WeakSet() : null;
  var chromeObservers = [];
  var lastFocus = null;

  function route(path){
    path = String(path || '/');
    if(path.indexOf('/property/') === 0) path = path.slice('/property'.length);
    else if(path === '/property') path = '/';
    if(path.charAt(0) !== '/') path = '/' + path;
    if(prefix && path === '/') return prefix + '/';
    return prefix + path;
  }
  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function plan(v){
    v = String(v || '').toLowerCase().replace(/\+/g,'_plus').replace(/[^a-z_]/g,'');
    if(v === 'free') v = 'standard';
    return ['standard','agent','pro','pro_plus','teams','developer'].indexOf(v) >= 0 ? v : 'standard';
  }
  function hasDeveloperRole(){
    return plan(state.profile.account_role) === 'developer' ||
      plan(state.entitlement && state.entitlement.account_role) === 'developer';
  }
  function isDeveloper(){
    return !!state.user && state.ready && hasDeveloperRole();
  }
  function actualPlan(){
    if(hasDeveloperRole()) return 'developer';
    return plan((state.entitlement && state.entitlement.plan_tier) || state.profile.plan_tier || state.profile.plan);
  }
  function can(required){
    var rank = {standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
    return rank[actualPlan()] >= rank[plan(required)];
  }
  /* "My work" holds the professional tools (Agent Desk, clients, farm,
     marketing, research). Only paying members open it: Agent, Pro, Pro+,
     Teams and developers. Everyone else (signed out, a free account, or an
     agent profile without a paid plan) sees the tab locked, with a short note
     on how to unlock it, and none of the professional destinations. */
  function workUnlocked(){
    return !!state.user && state.ready && can('agent');
  }
  function isAgent(){
    if(actualPlan() === 'developer') return true;
    var roles = Array.isArray(state.profile.roles) ? state.profile.roles.map(String) : [];
    return roles.some(function(x){ return /agent|realtor|real_estate/i.test(x); }) ||
      /agent|realtor|real_estate/i.test(state.profile.role || '') || !!state.profile.pro_agent;
  }
  function prettyPlan(){
    var p = actualPlan();
    if(!state.user) return 'Signed out';
    if(p === 'developer') return 'Developer';
    if(p === 'pro_plus') return 'Pro+';
    return p.replace(/\b\w/g,function(c){ return c.toUpperCase(); });
  }
  function displayName(){
    var meta = state.user && state.user.user_metadata || {};
    return state.profile.display_name || state.profile.full_name || meta.full_name || meta.name ||
      (state.user && state.user.email ? state.user.email.split('@')[0] : 'Watchdog');
  }
  function avatar(){
    var meta = state.user && state.user.user_metadata || {};
    return state.profile.avatar_url || meta.avatar_url || meta.picture || '';
  }
  function currentPage(){
    var explicit = document.body && document.body.getAttribute('data-sidebar-page');
    if(explicit) return explicit;
    var p = (location.pathname || '/').replace(/\/+$/,'') || '/';
    if(p === '/property' || p === '/property/index.html' || p === '/' || p === '/index.html') return 'lookup';
    if(p.indexOf('/property/') === 0) p = p.slice('/property'.length);
    var m = p.match(/^\/([^/]+)/);
    return m ? m[1] : 'lookup';
  }

  /* Normalizes a clean, /property/ or .html path to its public clean path. */
  function publicPath(p){
    p = String(p || '/').split('#')[0].split('?')[0];
    if(p === '/property' || p.indexOf('/property/') === 0) p = p.slice('/property'.length) || '/';
    p = p.replace(/\/index\.html$/i,'').replace(/\.html$/i,'');
    if(p.length > 1) p = p.replace(/\/+$/,'');
    return p || '/';
  }
  /* Watchdog information architecture, agent side (see
     property/docs/watchdog-information-architecture.md). The five areas are the
     Agent Desk sections and the future agent app tab bar. Each area owns the
     tool pages in `paths`, so a tool page lights up its area in the menu. These
     labels are the canonical nav labels: the Agent Desk rail, the app-shell
     page header and the agent workspace breadcrumb use the same words. */
  var AGENT_AREAS = [
    {key:'agent-desk',section:'home',label:'Agent Desk',icon:'fa-briefcase',hint:'Who to call today and what is due',paths:['/agent-desk','/agent/training']},
    {key:'clients',section:'clients',label:'Clients',icon:'fa-user-group',hint:'Contacts, sphere and deals',paths:['/agent/contacts','/agent/listing-prep','/agent/buyers','/agent/open-house','/transaction','/client-room','/true-cost']},
    {key:'farm',section:'farm',label:'Farm',icon:'fa-map-location-dot',hint:'Neighborhoods you want to own',paths:['/farm-map','/farm-builder','/market-list']},
    {key:'marketing',section:'marketing',label:'Marketing',icon:'fa-bullhorn',hint:'Mailers, email updates and reports',paths:['/marketing-studio','/newsletter-studio','/report-builder','/report-studio','/marketing-plan','/growth']},
    {key:'research',section:'research',label:'Research',icon:'fa-magnifying-glass',hint:'Homes, towns and public data',paths:['/scan','/data-workbench','/data-center','/workbench']}
  ];
  /* Which agent area a page belongs to. On the desk itself the hash names the
     section; #deals is the retired sixth section, now part of Clients. */
  function agentAreaFor(path,hash){
    path = publicPath(path);
    var i, j;
    if(path === '/agent-desk'){
      var section = String(hash || '').replace(/^#/,'').split('/')[0];
      if(section === 'deals') section = 'clients';
      for(i = 0; i < AGENT_AREAS.length; i++) if(AGENT_AREAS[i].section === section) return AGENT_AREAS[i].key;
      return 'agent-desk';
    }
    for(i = 0; i < AGENT_AREAS.length; i++){
      for(j = 0; j < AGENT_AREAS[i].paths.length; j++){
        var p = AGENT_AREAS[i].paths[j];
        if(path === p || path.indexOf(p + '/') === 0) return AGENT_AREAS[i].key;
      }
    }
    return '';
  }
  function onDesk(){ return publicPath(location.pathname) === '/agent-desk'; }
  /* Areas open their Agent Desk section. On the desk a hash link switches the
     section in place; elsewhere it opens the desk on that section. */
  function areaHref(area){
    var hash = area.section === 'home' ? (onDesk() ? '#home' : '') : '#' + area.section;
    return route('/agent-desk') + hash;
  }

  function items(){
    var out = [
      {key:'dashboard',href:route('/dashboard'),icon:'fa-table-columns',label:'Dashboard'},
      {key:'lookup',href:route('/'),icon:'fa-magnifying-glass-location',label:'Property Lookup'},
      {key:'home',href:route('/home'),icon:'fa-house',label:'Property Home'},
      {key:'pulse',href:route('/pulse'),icon:'fa-wave-square',label:'Property Pulse'},
      {key:'anchor',href:route('/anchor/applications/'),icon:'fa-file-circle-check',label:'ANCHOR Applications'},
      {key:'town-compare',href:route('/town-compare'),icon:'fa-code-compare',label:'Town Compare'},
      {key:'co',href:'/co',icon:'fa-house-circle-check',label:'CO Requirements'},
      {key:'robust',href:route('/robust/'),icon:'fa-gauge-high',label:'ROBUST Framework'},
      {key:'games',href:route('/games'),icon:'fa-puzzle-piece',label:'Games'}
    ];
    if(state.ready && isAgent() && workUnlocked()){
      /* Paying agents get their five Agent Desk areas. Transactions, Data Workbench,
         Data Center and the Appeal Scanner live inside Clients and Research. */
      AGENT_AREAS.forEach(function(area){ out.push({key:area.key,href:areaHref(area),icon:area.icon,label:area.label}); });
    } else {
      if(state.ready && can('pro_plus')) out.push({key:'scan',href:route('/scan'),icon:'fa-magnifying-glass-chart',label:'Appeal Scanner'});
      if(state.ready && can('agent')) out.push({key:'transaction',href:'/transaction/',icon:'fa-file-signature',label:'Transactions'});
      if(state.ready && can('agent')) out.push({key:'data-workbench',href:route('/data-workbench'),icon:'fa-table-list',label:'Data Workbench'});
      /* NJW-98: the public Data Center transparency surface is discoverable for
         every visitor. Private execution stays enforced inside Data Center. */
      out.push({key:'data-center',href:route('/data-center'),icon:'fa-database',label:'Data Center'});
      out.push({key:'pro',href:route('/pro'),icon:'fa-tags',label:'Plans & Pricing'});
    }
    out.push({key:'account',href:route('/account'),icon:'fa-user-gear',label:'Account'});
    return out;
  }
  /* Two "lenses" keep homeowners from wading through professional tools they
     cannot use. items() stays the single entitlement-filtered source of
     destinations; META only says which lens (and group) a destination belongs
     to and adds a one-line plain-English hint under the label. The first five
     home destinations are the homeowner app tab bar; "learn" rows sit below. */
  var META = {
    'dashboard':{lens:'home',hint:'Your daily overview'},
    'lookup':{lens:'home',hint:'Search any New Jersey address'},
    'home':{lens:'home',hint:'Your saved homes and their scores'},
    'pulse':{lens:'home',hint:'What is changing near your home'},
    'anchor':{lens:'home',hint:'NJ property tax relief applications'},
    'town-compare':{lens:'home',group:'learn',hint:'Compare taxes between towns'},
    'co':{lens:'home',group:'learn',hint:'Free resale CO rules for NJ towns'},
    'robust':{lens:'home',group:'learn',hint:'How the Watchdog Score works'},
    'games':{lens:'home',group:'learn',hint:'Daily home and town puzzles'},
    'scan':{lens:'work',hint:'Find homes that look over-assessed'},
    'transaction':{lens:'work',hint:'Closing checklist and documents'},
    'data-workbench':{lens:'work',hint:'Build and export property lists'},
    'data-center':{lens:'work',hint:'Every public data source we use'},
    'pro':{lens:'work',hint:'Compare plans for professionals'},
    'account':{lens:'both',hint:'Profile, plan and billing'}
  };
  AGENT_AREAS.forEach(function(area){ META[area.key] = {lens:'work',hint:area.hint}; });
  /* The public Data Center (NJW-98) stays discoverable for every visitor, so
     while My work is locked it sits under Learn and compare instead. */
  function metaFor(key){
    if(key === 'data-center' && !workUnlocked()) return {lens:'home',group:'learn',hint:META[key].hint};
    return META[key] || {lens:'home',hint:''};
  }
  /* Professional tools the viewer cannot open yet. They appear only in the
     "My work" lens with the plan they need, so pros can discover them and
     homeowners never see them in their own lens. Agents find these tools
     inside their Agent Desk areas instead. */
  function lockedItems(){
    if(!workUnlocked() || isAgent()) return [];
    var have = {};
    items().forEach(function(item){ have[item.key] = true; });
    var out = [];
    if(!have['agent-desk']) out.push({key:'agent-desk',icon:'fa-briefcase',label:'Agent Desk',need:'Agent'});
    if(!have.scan) out.push({key:'scan',icon:'fa-magnifying-glass-chart',label:'Appeal Scanner',need:'Pro+'});
    if(!have.transaction) out.push({key:'transaction',icon:'fa-file-signature',label:'Transactions',need:'Agent'});
    if(!have['data-workbench']) out.push({key:'data-workbench',icon:'fa-table-list',label:'Data Workbench',need:'Agent'});
    return out;
  }
  var LENS_KEY = 'wd_menu_lens_v1';
  function storedLens(){ try{ var v = localStorage.getItem(LENS_KEY); return v === 'home' || v === 'work' ? v : ''; }catch(_){ return ''; } }
  function defaultLens(){
    if(!workUnlocked()) return 'home';
    if(agentAreaFor(location.pathname,location.hash)) return 'work';
    var page = currentPage();
    if(page === 'fairness') page = 'robust';
    var meta = META[page];
    if(meta && meta.lens !== 'both') return meta.lens;
    var saved = storedLens();
    if(saved) return saved;
    return state.user && state.ready && (isAgent() || can('agent')) ? 'work' : 'home';
  }
  function setLens(lens){
    lens = lens === 'work' ? 'work' : 'home';
    /* A locked My work tab only shows how to unlock it; never remember it. */
    if(workUnlocked() || lens === 'home'){ try{ localStorage.setItem(LENS_KEY,lens); }catch(_){} }
    var sheet = document.getElementById('wd-main-sheet');
    if(!sheet) return;
    var nav = sheet.querySelector('.wd-universal-nav-links');
    if(nav) nav.setAttribute('data-lens',lens);
    var tabs = sheet.querySelector('.wd-universal-lens');
    if(tabs) tabs.setAttribute('data-lens',lens);
    sheet.querySelectorAll('[data-wd-lens]').forEach(function(tab){
      var on = tab.getAttribute('data-wd-lens') === lens;
      tab.setAttribute('aria-selected',on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    });
  }

  function developerItems(){
    return [
      {key:'developer',href:route('/developer'),icon:'fa-code',label:'Developer Command Center',detail:'Platform map and developer shortcuts'},
      {key:'developer-recaps',href:route('/logs/recap'),icon:'fa-calendar-check',label:'Daily Recaps',detail:'Daily operating memory and handoffs'},
      {key:'developer-marketing',href:route('/developer-marketing-plan'),icon:'fa-bullhorn',label:'Marketing Campaign',detail:'Organic-first Watchdog launch plan under $100'},
      {key:'developer-analytics',href:route('/analytics'),icon:'fa-chart-line',label:'Analytics',detail:'External product and account KPIs'},
      {key:'developer-logs',href:route('/logs'),icon:'fa-clock-rotate-left',label:'Build Logs',detail:'Build, verification and audit history'},
      {key:'developer-data',href:route('/developer-data'),icon:'fa-database',label:'Data Operations',detail:'Marker freshness and release controls'}
    ];
  }
  function isSalesConsultant(){
    var a = state.profile && state.profile.account_role, b = state.entitlement && state.entitlement.account_role;
    return String(a || '') === 'sales_consultant' || String(b || '') === 'sales_consultant';
  }
  function salesDeskHtml(){
    if(!isSalesConsultant() && !isDeveloper()) return '';
    return '<a class="wd-universal-developer-tool" data-wd-developer-tool="sales-desk" href="' + route('/sales-desk') + '"><i class="fas fa-handshake"></i><span><b>Sales Desk</b><small>' + (isDeveloper() ? 'Consultants, attributions and payouts' : 'Your share links, accounts and commissions') + '</small></span></a>';
  }
  function developerToolsHtml(){
    if(!isDeveloper()) return '';
    return '<div class="wd-universal-developer-label"><i class="fas fa-code"></i><span>Developer tools</span></div>' +
      developerItems().map(function(item){
        return '<a class="wd-universal-developer-tool" data-wd-developer-tool="' + item.key + '" href="' + item.href + '"><i class="fas ' + item.icon + '"></i><span><b>' + item.label + '</b><small>' + item.detail + '</small></span></a>';
      }).join('');
  }
  function planPromo(){
    if(!state.user || !state.ready || isDeveloper()) return null;
    var p = actualPlan();
    if(p === 'standard' || p === 'agent'){
      return {key:'pro',tone:'pro',href:route('/pro#pricing'),eyebrow:p === 'agent' ? 'READY FOR MORE?' : 'UPGRADE WATCHDOG',title:'Move up to Pro',detail:'Deeper professional research and intelligence.',icon:'fa-arrow-trend-up',cta:'Explore Pro'};
    }
    if(p === 'pro'){
      return {key:'pro_plus',tone:'plus',href:route('/pro#pricing'),eyebrow:'GO FURTHER',title:'Unlock Pro+',detail:'Higher-scale data, Scanner and advanced workflows.',icon:'fa-bolt',cta:'Explore Pro+'};
    }
    if(p === 'pro_plus'){
      return {key:'teams',tone:'teams',href:route('/teams'),eyebrow:'WORK WITH OTHERS?',title:'Part of a team?',detail:'Preview shared intelligence, seats and team controls.',icon:'fa-users',cta:'Preview Teams'};
    }
    return null;
  }
  function planPromoHtml(){
    var promo = planPromo();
    if(!promo) return '';
    return '<a class="wd-universal-plan-promo wd-universal-plan-promo-' + promo.tone + '" data-wd-plan-promo="' + promo.key + '" href="' + promo.href + '">' +
      '<span class="wd-universal-plan-promo-icon"><i class="fas ' + promo.icon + '"></i></span>' +
      '<span class="wd-universal-plan-promo-copy"><small>' + promo.eyebrow + '</small><b>' + promo.title + '</b><em>' + promo.detail + '</em></span>' +
      '<span class="wd-universal-plan-promo-cta">' + promo.cta + ' <i class="fas fa-arrow-right"></i></span>' +
    '</a>';
  }
  /* The one destination that shows as current. Agent tool pages light up their
     Agent Desk area (Farm Map -> Farm); everything else matches its page key. */
  function activeKey(){
    var area = agentAreaFor(location.pathname,location.hash);
    if(area && isAgent() && workUnlocked()) return area;
    return currentPage();
  }
  function activeFor(item,page){
    if(item.key === 'robust') return page === 'robust' || page === 'fairness';
    return item.key === page;
  }
  function navLinkHtml(item,page){
    var meta = metaFor(item.key);
    var on = activeFor(item,page);
    var cls = 'wd-universal-link wd-universal-lens-' + meta.lens + (on ? ' active' : '');
    return '<a class="' + cls + '"' + (on ? ' aria-current="page"' : '') + ' data-wd-nav="' + item.key + '" href="' + item.href + '"><i class="fas ' + item.icon + '" aria-hidden="true"></i><span>' + item.label + (meta.hint ? '<small>' + meta.hint + '</small>' : '') + '</span></a>';
  }
  function navLinksHtml(){
    var page = activeKey();
    var all = items();
    var account = all.filter(function(item){ return item.key === 'account'; });
    var main = all.filter(function(item){ return item.key !== 'account'; });
    var unlocked = workUnlocked();
    var home = main.filter(function(item){ var m = metaFor(item.key); return m.lens !== 'work' && m.group !== 'learn'; });
    var learn = main.filter(function(item){ return metaFor(item.key).group === 'learn'; });
    var work = unlocked ? main.filter(function(item){ return metaFor(item.key).lens === 'work'; }) : [];
    var locked = lockedItems().map(function(item){
      return '<a class="wd-universal-link wd-universal-lens-work wd-universal-locked" href="' + route('/pro#pricing') + '"><i class="fas ' + item.icon + '" aria-hidden="true"></i><span>' + item.label + '<small>Included with ' + item.need + '</small></span><em>' + item.need + '</em></a>';
    }).join('');
    var list = function(rows){ return rows.map(function(item){ return navLinkHtml(item,page); }).join(''); };
    return '<p class="wd-universal-lens-eyebrow wd-universal-lens-home">For your home</p>' + list(home) +
      (learn.length ? '<p class="wd-universal-lens-eyebrow wd-universal-lens-home wd-universal-group-learn">Learn and compare</p>' + list(learn) : '') +
      '<button type="button" class="wd-universal-lens-hint wd-universal-lens-home" data-wd-universal="lens" data-wd-lens-to="work"><i class="fas ' + (unlocked ? 'fa-briefcase' : 'fa-lock') + '" aria-hidden="true"></i><span><b>Agent or pro?</b><small>' + (unlocked ? 'Your professional tools are under My work' : 'My work opens with an Agent or Pro membership') + '</small></span><i class="fas fa-arrow-right" aria-hidden="true"></i></button>' +
      (unlocked ?
        '<p class="wd-universal-lens-eyebrow wd-universal-lens-work">' + (isAgent() ? 'Your Agent Desk' : 'For your business') + '</p>' + list(work) + locked :
        workLockedHtml()) +
      '<div class="wd-universal-nav-rule"></div>' +
      account.map(function(item){ return navLinkHtml(item,page); }).join('');
  }
  /* What a locked My work tab shows: what it is and how to unlock it, with
     no professional destinations listed. */
  function workLockedHtml(){
    return '<div class="wd-universal-work-locked wd-universal-lens-work" data-wd-work-locked="true">' +
      '<span class="wd-universal-work-locked-icon"><i class="fas fa-lock" aria-hidden="true"></i></span>' +
      '<b>My work is for members</b>' +
      '<p>Tools for real estate agents and property pros. Unlock them with a Watchdog Agent or Pro membership.</p>' +
      '<a class="wd-universal-work-locked-cta" href="' + route('/pro#pricing') + '">See membership plans <i class="fas fa-arrow-right" aria-hidden="true"></i></a>' +
      (state.user ? '' : '<button type="button" class="wd-universal-work-locked-link" data-wd-universal="signin">Already a member? Sign in</button>') +
      '<button type="button" class="wd-universal-work-locked-link" data-wd-universal="lens" data-wd-lens-to="home">Back to My home</button>' +
    '</div>';
  }
  function lensTabsHtml(lens){
    var unlocked = workUnlocked();
    var tab = function(key,icon,label,locked){
      var on = key === lens;
      return '<button type="button" role="tab" data-wd-universal="lens" data-wd-lens="' + key + '"' + (locked ? ' data-wd-locked="true" aria-label="' + label + ', members only"' : '') + ' aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '"><i class="fas ' + icon + '"></i><span>' + label + '</span></button>';
    };
    return '<div class="wd-universal-lens" data-lens="' + lens + '" role="tablist" aria-label="Show tools for">' + tab('home','fa-house-chimney','My home',false) + tab('work',unlocked ? 'fa-briefcase' : 'fa-lock','My work',!unlocked) + '<span class="wd-universal-lens-thumb" aria-hidden="true"></span></div>';
  }
  function brandHtml(){
    return '<a class="wd-universal-brand" href="' + route('/dashboard') + '"><span class="wd-universal-brand-mark"><i class="fas fa-dog"></i></span><span class="wd-universal-brand-copy"><strong>Watchdog</strong><small>PROPERTY INTELLIGENCE</small></span></a>';
  }

  function publicDrawerHtml(){
    var footer = state.user ? '' : '<div class="wd-universal-nav-foot"><button type="button" data-wd-universal="signin"><i class="fas fa-right-to-bracket"></i><span>Sign in</span></button></div>';
    var lens = defaultLens();
    /* Site search (watchdog-site-search.js) opens from any [data-wd-search="open"]. */
    return '<div class="wd-universal-nav-head">' + brandHtml() + '<button class="wd-public-close wd-universal-close" type="button" data-wd-universal="close" aria-label="Close navigation"><i class="fas fa-xmark"></i></button></div>' +
      '<button type="button" class="wd-universal-search" data-wd-search="open"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><span>Search Watchdog</span><small>Pages, terms, addresses</small></button>' +
      lensTabsHtml(lens) +
      '<nav class="wd-universal-nav-links" data-lens="' + lens + '" aria-label="Watchdog navigation">' + navLinksHtml() + '</nav>' + footer;
  }
  /* Pages that do not ship the public header markup still get the exact same
     drawer: mount the backdrop + sheet once, at the end of <body>. */
  function ensureDrawer(){
    if(!document.body) return null;
    var back = document.getElementById('wd-public-backdrop');
    if(!back){
      back = document.createElement('div');
      back.id = 'wd-public-backdrop';
      back.className = 'wd-public-backdrop';
      document.body.appendChild(back);
    }
    var sheet = document.getElementById('wd-main-sheet');
    if(!sheet){
      sheet = document.createElement('aside');
      sheet.id = 'wd-main-sheet';
      sheet.className = 'wd-public-sheet';
      sheet.setAttribute('aria-hidden','true');
      sheet.setAttribute('aria-label','Watchdog navigation');
      document.body.appendChild(sheet);
    }
    return sheet;
  }
  /* Idempotent render for every piece of shared chrome. The old check, which
     compared innerHTML with the source string, was always true (browsers serialize markup
     differently from the source string, and other runtimes such as the ANCHOR
     profile row add to it), so each refresh rewrote the profile, the observer
     on that node queued another refresh, and the menu re-rendered about 60
     times a second. Now a node is rewritten only when the markup this runtime
     wants changed, or when another script replaced our content (our first
     child is gone). Rows other runtimes add inside are left alone, and the
     mutation records of our own write are dropped so the target observers
     cannot feed a loop. */
  function renderChrome(node,html){
    if(!node) return false;
    var mine = node.__wdUniversalFirst;
    if(node.__wdUniversalSource === html && mine && mine.parentNode === node) return false;
    node.innerHTML = html;
    node.__wdUniversalSource = html;
    node.__wdUniversalFirst = node.firstElementChild || node.firstChild;
    if(node.dataset) node.dataset.wdUniversal = VERSION;
    chromeObservers.forEach(function(observer){ observer.takeRecords(); });
    return true;
  }
  function patchPublicDrawer(){
    var sheet = ensureDrawer();
    if(!sheet) return;
    sheet.classList.add('wd-universal-public-nav');
    /* Never rewrite the drawer while it is open. Replacing innerHTML mid-tap
       destroys the anchor before the browser finishes the activation event,
       which silently swallows the navigation (always on WebKit/iOS,
       intermittently on Chromium). public-nav.js re-runs refresh() on close. */
    if(sheet.classList.contains('open')) return;
    var html = publicDrawerHtml();
    renderChrome(sheet,html);
  }

  function profileMarkup(publicMode){
    var close = publicMode ? '<button class="wd-universal-profile-close wd-public-close" type="button" data-wd-universal="close" aria-label="Close account menu"><i class="fas fa-xmark"></i></button>' : '';
    if(!state.user){
      return close +
        '<header><span><b>Watchdog</b><small>Sign in to your account</small></span><i>Signed out</i></header>' +
        '<nav>' +
          '<button type="button" data-wd-universal="signin"><i class="fas fa-right-to-bracket"></i><span><b>Sign in to Watchdog</b><small>Open your saved properties and account</small></span></button>' +
          '<a href="' + route('/pro') + '"><i class="fas fa-briefcase"></i><span><b>Plans &amp; professional tools</b><small>Explore Watchdog access levels</small></span></a>' +
          '<a href="' + route('/') + '"><i class="fas fa-magnifying-glass"></i><span><b>Property lookup</b><small>Search any New Jersey property</small></span></a>' +
        '</nav>';
    }
    var pic = avatar();
    var initial = esc(String(displayName()).trim().charAt(0).toUpperCase() || 'W');
    var face = pic ? '<img class="wd-universal-face" src="' + esc(pic) + '" alt="">' : '<em class="wd-universal-face" aria-hidden="true">' + initial + '</em>';
    return close +
      '<header>' + face + '<span><b>' + esc(displayName()) + '</b><small>' + esc(state.user.email || '') + '</small></span><i>' + esc(prettyPlan()) + '</i></header>' +
      '<nav>' +
        planPromoHtml() +
        '<a href="' + route('/account') + '"><i class="fas fa-user-pen"></i><span><b>Edit profile &amp; role</b><small>Profile, profession and preferences</small></span></a>' +
        '<button type="button" data-wd-universal="invite"><i class="fas fa-user-plus"></i><span><b>Invite others</b><small>Share your Watchdog referral link</small></span></button>' +
        '<a href="' + route('/account') + '"><i class="fas fa-credit-card"></i><span><b>Account &amp; billing</b><small>Plan, subscription and billing</small></span></a>' +
        ((isAgent() || can('agent')) ? '<a href="/agent/training"><i class="fas fa-graduation-cap"></i><span><b>Training Center</b><small>Review Agent and Pro+ workflows anytime</small></span></a>' : '') +
        '<a href="' + route('/home') + '"><i class="fas fa-house"></i><span><b>Property Home</b><small>Your saved-home workspace</small></span></a>' +
        developerToolsHtml() + salesDeskHtml() +
      '</nav><button class="wd-universal-signout" type="button" data-wd-universal="signout"><i class="fas fa-arrow-right-from-bracket"></i> Sign out</button>';
  }
  function patchProfiles(){
    var publicSheet = document.getElementById('wd-profile-sheet');
    var publicHost = document.getElementById('wd-profile-content');
      if(publicSheet && publicHost){
      publicSheet.classList.add('wd-universal-public-profile');
      if(publicSheet.classList.contains('open')) return;
      var oldHead = publicSheet.querySelector(':scope > .wd-public-sheet-head');
      if(oldHead) oldHead.setAttribute('aria-hidden','true');
      publicHost.classList.add('wd-universal-profile');
      var publicHtml = profileMarkup(true);
      renderChrome(publicHost,publicHtml);
    }
    ['wd6-profile','hm27-profile-pop'].forEach(function(id){
      var host = document.getElementById(id);
      if(!host) return;
      host.classList.add('wd-universal-profile');
      var html = profileMarkup(false);
      renderChrome(host,html);
    });
  }
  function patchProfileTriggers(){
    var publicTrigger = document.getElementById('wd-profile-trigger');
    if(!publicTrigger) return;
    var a = avatar();
    renderChrome(publicTrigger,a ? '<img src="' + esc(a) + '" alt=""><span>' + (state.user ? 'Account' : 'Sign in') + '</span>' : '<i class="fas fa-user"></i><span>' + (state.user ? 'Account' : 'Sign in') + '</span>');
    publicTrigger.setAttribute('aria-label',state.user ? 'Open account menu' : 'Sign in or open account menu');
  }

  function ensureInvite(){
    var shade = document.getElementById('wd-universal-invite-shade');
    if(!shade){
      shade = document.createElement('button');
      shade.id = 'wd-universal-invite-shade';
      shade.className = 'wd-universal-invite-shade';
      shade.type = 'button';
      shade.setAttribute('aria-label','Close invite');
      document.body.appendChild(shade);
    }
    var modal = document.getElementById('wd-universal-invite');
    if(!modal){ modal = document.createElement('section'); modal.id = 'wd-universal-invite'; modal.className = 'wd-universal-invite'; document.body.appendChild(modal); }
    return {shade:shade,modal:modal};
  }
  // Tracked member referral link: the signup attribution trigger credits the inviter
  // when a new account's first visit carries these tags. Same format everywhere.
  var REFERRAL_ROOT = 'https://www.watchdogindex.com/?utm_source=watchdog_referral&utm_medium=member&utm_campaign=';
  function inviteLink(){ return state.referral || null; }
  function loadReferral(){
    if(state.referral) return Promise.resolve(state.referral);
    if(!db || typeof db.rpc !== 'function') return Promise.resolve(null);
    return Promise.resolve(db.rpc('get_or_create_my_watchdog_referral_code')).then(function(r){
      if(!r || r.error || !r.data) return null;
      var code = String(r.data);
      state.referral = {code:code,link:REFERRAL_ROOT + encodeURIComponent(code)};
      return state.referral;
    }).catch(function(){ return null; });
  }
  /* Invite credit that does not depend on analytics cookies. When someone
     arrives through a member invite link we keep only the invite code (no
     visitor or session tracking), and once they sign in with a brand-new
     account the server credits the inviter. */
  var INVITE_KEY = 'wd_invite_code_v1';
  function captureInvite(){
    try{
      var q = new URLSearchParams(location.search || '');
      var code = q.get('invite') || '';
      if(!code && String(q.get('utm_source') || '').toLowerCase() === 'watchdog_referral' && String(q.get('utm_medium') || '').toLowerCase() === 'member') code = q.get('utm_campaign') || '';
      code = String(code).toUpperCase().replace(/[^A-Z0-9]/g,'');
      if(!/^[A-Z0-9]{10,16}$/.test(code)) return;
      if(localStorage.getItem(INVITE_KEY)) return; /* first invite wins */
      localStorage.setItem(INVITE_KEY,JSON.stringify({code:code,at:Date.now()}));
    }catch(_){}
  }
  function claimInvite(){
    if(!db || !state.user || typeof db.rpc !== 'function') return;
    var saved = null;
    try{ saved = JSON.parse(localStorage.getItem(INVITE_KEY) || 'null'); }catch(_){}
    if(!saved || !saved.code) return;
    var drop = function(){ try{ localStorage.removeItem(INVITE_KEY); }catch(_){} };
    if(Date.now() - Number(saved.at || 0) > 30 * 86400000){ drop(); return; }
    var created = Date.parse(state.user.created_at || '');
    /* Existing accounts cannot be credited; forget the code. */
    if(Number.isFinite(created) && Date.now() - created > 14 * 86400000){ drop(); return; }
    Promise.resolve(db.rpc('claim_my_watchdog_referral',{p_code:saved.code})).then(function(r){
      if(r && !r.error) drop();
    }).catch(function(){});
  }

  function showInvite(){
    if(!state.user){ signIn(); return; }
    loadReferral().then(function(d){ renderInvite(d); });
  }
  function renderInvite(d){
    var nodes = ensureInvite();
    if(!d){
      nodes.modal.innerHTML = '<button class="wd-universal-invite-x" type="button" data-wd-universal="invite-close" aria-label="Close invite"><i class="fas fa-xmark"></i></button><small>INVITE TO WATCHDOG</small><h2>Your invite link is not available right now.</h2><p>Please try again in a moment.</p>';
      nodes.shade.classList.add('open');
      nodes.modal.classList.add('open');
      return;
    }
    nodes.modal.innerHTML = '<button class="wd-universal-invite-x" type="button" data-wd-universal="invite-close" aria-label="Close invite"><i class="fas fa-xmark"></i></button><small>INVITE TO WATCHDOG</small><h2>Share better property intelligence.</h2><p>Send your personal Watchdog invite link to a friend, client or colleague.</p><label>Your invite link</label><div><input id="wd-universal-ref" readonly value="' + esc(d.link) + '"><button type="button" data-wd-universal="copy"><i class="far fa-copy"></i> Copy</button></div><footer><a href="mailto:?subject=' + encodeURIComponent('Try Watchdog Property Intelligence') + '&body=' + encodeURIComponent('I thought you might find Watchdog useful: ' + d.link) + '"><i class="fas fa-envelope"></i>Email invite</a><button type="button" data-wd-universal="share"><i class="fas fa-share-nodes"></i> Share</button></footer><em>Invite code: ' + esc(d.code) + '</em>';
    nodes.shade.classList.add('open');
    nodes.modal.classList.add('open');
  }
  function closeInvite(){
    var s = document.getElementById('wd-universal-invite-shade'), m = document.getElementById('wd-universal-invite');
    if(s) s.classList.remove('open');
    if(m) m.classList.remove('open');
  }
  function closePublic(){
    if(window.WatchdogPublicNav && typeof window.WatchdogPublicNav.close === 'function'){
      window.WatchdogPublicNav.close();
      return;
    }
    var wasOpen = false;
    ['wd-main-sheet','wd-profile-sheet'].forEach(function(id){
      var x = document.getElementById(id);
      if(!x) return;
      if(x.classList.contains('open')) wasOpen = true;
      x.classList.remove('open');
      x.setAttribute('aria-hidden','true');
    });
    var b = document.getElementById('wd-public-backdrop');
    if(b) b.classList.remove('open');
    if(document.body) document.body.classList.remove('wd-public-menu-open','wd-profile-menu-open');
    if(wasOpen && lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
    /* Rendering is skipped while the drawer is open; catch up now. */
    queue();
  }
  /* Open the one shared Watchdog drawer. Public pages delegate to
     WatchdogPublicNav (it also owns the public profile sheet); every other page
     uses this built-in controller so no page needs its own drawer. */
  function openMenu(){
    var sheet = ensureDrawer();
    if(!sheet) return;
    if(window.WatchdogPublicNav && typeof window.WatchdogPublicNav.open === 'function'){
      window.WatchdogPublicNav.open('main');
      return;
    }
    if(!sheet.classList.contains('open')) patchPublicDrawer();
    document.dispatchEvent(new CustomEvent('watchdog:menu-before-open'));
    lastFocus = document.activeElement;
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden','false');
    var back = document.getElementById('wd-public-backdrop');
    if(back) back.classList.add('open');
    document.body.classList.add('wd-public-menu-open');
    var c = sheet.querySelector('[data-wd-universal="close"]');
    if(c && c.focus) requestAnimationFrame(function(){ c.focus(); });
    document.dispatchEvent(new CustomEvent('watchdog:public-menu-open',{detail:{menu:'main'}}));
  }
  function signIn(){
    closePublic();
    if(window.WatchdogAuth && typeof window.WatchdogAuth.openSignIn === 'function'){ window.WatchdogAuth.openSignIn(location.pathname + location.search + location.hash); return; }
    if(window.NJPTRSupabaseRuntime && typeof window.NJPTRSupabaseRuntime.openOnboarding === 'function'){ window.NJPTRSupabaseRuntime.openOnboarding(location.pathname + location.search + location.hash); return; }
    if(typeof window.plSignInPrompt === 'function'){ window.plSignInPrompt(); return; }
    location.href = route('/dashboard');
  }
  function signOut(){
    closePublic();
    closeInvite();
    if(db && db.auth && typeof db.auth.signOut === 'function') db.auth.signOut().finally(function(){ location.href = route('/'); });
    else if(typeof window.plSignOut === 'function') window.plSignOut();
    else location.href = route('/');
  }
  function copyInvite(){
    var d = inviteLink(), input = document.getElementById('wd-universal-ref');
    if(!d) return;
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(d.link).then(function(){ if(input) input.select(); }).catch(function(){});
    else if(input){ input.focus(); input.select(); try{ document.execCommand('copy'); }catch(_){} }
  }
  function shareInvite(){
    var d = inviteLink();
    if(!d) return;
    if(navigator.share) navigator.share({title:'Watchdog Property Intelligence',text:'Take a look at Watchdog Property Intelligence.',url:d.link}).catch(function(){});
    else copyInvite();
  }

  function ensureCss(){
    var href = '/property/css/watchdog-universal-menu.css?v=' + CSS_VERSION;
    var existing = document.querySelector('link[href^="/property/css/watchdog-universal-menu.css"]');
    if(existing){
      if(existing.getAttribute('href') !== href) existing.setAttribute('href',href);
      return;
    }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
  function watchTarget(node){
    if(!node || typeof MutationObserver === 'undefined') return;
    if(observed && observed.has(node)) return;
    if(observed) observed.add(node);
    var observer = new MutationObserver(queue);
    observer.observe(node,{childList:true,subtree:true});
    chromeObservers.push(observer);
  }
    function attachTargetObservers(){
    ['wd6-profile','hm27-profile-pop'].forEach(function(id){ watchTarget(document.getElementById(id)); });
  }
  /* Static navigation links (breadcrumbs, back links) carry clean public
     paths. Preview and local hosts serve pages under /property, so rewrite them
     there once; on WatchdogIndex the clean path already works. */
  function localizeRouteLinks(){
    if(cleanHost) return;
    document.querySelectorAll('a[data-wd-route]').forEach(function(a){
      if(a.dataset.wdRouted === '1') return;
      var raw = a.getAttribute('href') || '/';
      var hash = raw.indexOf('#') >= 0 ? raw.slice(raw.indexOf('#')) : '';
      var path = raw.split('#')[0];
      /* Root-level static pages (/agent/*, /transaction) are served as-is. */
      if(!/^\/(agent|transaction|client-room)(\/|$)/.test(path)) a.setAttribute('href',route(path) + hash);
      a.dataset.wdRouted = '1';
    });
  }
  function refresh(){
    localizeRouteLinks();
    patchPublicDrawer();
    patchProfiles();
    patchProfileTriggers();
    attachTargetObservers();
    document.dispatchEvent(new CustomEvent('watchdog:universal-menu-ready',{detail:{version:VERSION,user:!!state.user,plan:actualPlan(),cleanRoutes:cleanHost}}));
  }
  function queue(){
    if(queued) return;
    queued = true;
    requestAnimationFrame(function(){ queued = false; refresh(); });
  }
  function setUser(u){ state.user = u || null; queue(); }
  function loadAuth(){
    if(!window.supabase){
      if(authAttempts++ < 30) setTimeout(loadAuth,120);
      else { state.ready = true; queue(); }
      return;
    }
    if(!db) db = window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}});
    db.auth.getSession().then(function(r){
      var session = r && r.data && r.data.session;
      state.user = session && session.user || state.user || null;
      if(!state.user){ state.ready = true; queue(); return null; }
      claimInvite();
      return Promise.allSettled([
        db.from('profiles').select('display_name,full_name,avatar_url,role,roles,pro_agent,plan,plan_tier,account_role').eq('id',state.user.id).maybeSingle(),
        db.rpc('get_my_entitlement')
      ]).then(function(parts){
        state.profile = parts[0] && parts[0].status === 'fulfilled' && parts[0].value && parts[0].value.data || {};
        var ent = parts[1] && parts[1].status === 'fulfilled' && parts[1].value ? parts[1].value.data : null;
        state.entitlement = Array.isArray(ent) ? ent[0] : ent;
        state.ready = true;
        queue();
      });
    }).catch(function(){ state.ready = true; queue(); });
  }
  function mutationMayContainChrome(records){
    var selector = '#wd-main-sheet,#wd-profile-content,#wd6-profile,#hm27-profile-pop';
    for(var i=0;i<records.length;i++){
      var added = records[i].addedNodes || [];
      for(var j=0;j<added.length;j++){
        var n = added[j];
        if(!n || n.nodeType !== 1) continue;
        if((n.matches && n.matches(selector)) || (n.querySelector && n.querySelector(selector))) return true;
      }
    }
    return false;
  }

  document.addEventListener('click',function(ev){
    var control = ev.target && ev.target.closest && ev.target.closest('[data-wd-universal]');
    if(!control) return;
    var action = control.getAttribute('data-wd-universal');
    if(action === 'open-menu'){ ev.preventDefault(); ev.stopPropagation(); openMenu(); }
    else if(action === 'close'){ ev.preventDefault(); closePublic(); }
    else if(action === 'lens'){ ev.preventDefault(); setLens(control.getAttribute('data-wd-lens') || control.getAttribute('data-wd-lens-to')); }
    else if(action === 'signin'){ ev.preventDefault(); signIn(); }
    else if(action === 'signout'){ ev.preventDefault(); signOut(); }
    else if(action === 'invite'){ ev.preventDefault(); showInvite(); }
    else if(action === 'invite-close'){ ev.preventDefault(); closeInvite(); }
    else if(action === 'copy'){ ev.preventDefault(); copyInvite(); }
    else if(action === 'share'){ ev.preventDefault(); shareInvite(); }
  },true);
  document.addEventListener('click',function(ev){
    if(!ev.target) return;
    if(ev.target.id === 'wd-universal-invite-shade') closeInvite();
    else if(ev.target.id === 'wd-public-backdrop' && !window.WatchdogPublicNav) closePublic();
  });
  document.addEventListener('keydown',function(ev){
    var tab = ev.target && ev.target.closest && ev.target.closest('.wd-universal-lens [data-wd-lens]');
    if(tab && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')){
      ev.preventDefault();
      var next = tab.getAttribute('data-wd-lens') === 'home' ? 'work' : 'home';
      setLens(next);
      var target = tab.parentNode.querySelector('[data-wd-lens="' + next + '"]');
      if(target) target.focus();
      return;
    }
    if(ev.key !== 'Escape') return;
    closeInvite();
    var sheet = document.getElementById('wd-main-sheet');
    if(sheet && sheet.classList.contains('open') && !window.WatchdogPublicNav) closePublic();
  });
  document.addEventListener('njptr:plan-change',loadAuth);
  /* Area links on the Agent Desk only change the hash: close the drawer and
     move the current-area highlight with it. */
  window.addEventListener('hashchange',function(){
    var sheet = document.getElementById('wd-main-sheet');
    if(sheet && sheet.classList.contains('open')) closePublic();
    else queue();
  });
  document.addEventListener('watchdog:developer-confirmed',loadAuth);

  /* Pages the clean-route adapter does not serve (direct /property/ URLs and
     root static pages) still get the developer-only site editor loader. */
  function ensureSiteEditorLoader(){
    if(window.__WD_SITE_EDITOR_LOADER__ || document.querySelector('script[src*="site-editor-loader.js"]')) return;
    var script = document.createElement('script');
    script.src = '/property/js/site-editor-loader.js';
    script.defer = true;
    (document.head || document.documentElement).appendChild(script);
  }

  function boot(){
    captureInvite();
    ensureCss();
    ensureSiteEditorLoader();
    queue();
    loadAuth();
    if(typeof MutationObserver !== 'undefined' && document.body){
      new MutationObserver(function(records){ if(mutationMayContainChrome(records)) queue(); }).observe(document.body,{childList:true,subtree:true});
    }
  }

  window.WatchdogUniversalMenu = {
    version:VERSION,
    items:items,
    areas:AGENT_AREAS,
    areaFor:agentAreaFor,
    developerItems:developerItems,
    planPromo:planPromo,
    refresh:queue,
    open:openMenu,
    close:closePublic,
    setUser:setUser,
    route:route,
    state:function(){ return state; },
    profileMarkup:profileMarkup
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();

/* Universal glass top bar (idempotent; the page server may already load it). */
(function(){try{if(window.__wdGlassHeader||document.querySelector('script[src^="/property/js/watchdog-glass-header.js"]'))return;var s=document.createElement('script');s.src='/property/js/watchdog-glass-header.js';s.defer=true;(document.head||document.documentElement).appendChild(s);}catch(_){}})();
/* Site search, Ctrl/Cmd+K (idempotent; the page server may already load it). */
(function(){try{if(window.__wdSiteSearch||document.querySelector('script[src^="/property/js/watchdog-site-search.js"]'))return;var s=document.createElement('script');s.src='/property/js/watchdog-site-search.js';s.defer=true;(document.head||document.documentElement).appendChild(s);}catch(_){}})();
