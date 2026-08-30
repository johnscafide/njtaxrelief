/* Watchdog universal navigation + profile menu.
   One canonical source for destinations, entitlement gating and account menu copy. */
(function(){
  'use strict';
  if(window.__WATCHDOG_UNIVERSAL_MENU__) return;
  window.__WATCHDOG_UNIVERSAL_MENU__ = true;

  var VERSION = '20260824b';
  /* CSS has a longer browser/CDN cache lifetime than this runtime. Keep a
     separate asset revision so interaction fixes can invalidate cached chrome
     immediately without coupling that cache key to the menu data contract. */
  var CSS_VERSION = '20260825a';
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

  function items(){
    var out = [
      {key:'dashboard',href:route('/dashboard'),icon:'fa-table-columns',label:'Dashboard'},
      {key:'home',href:route('/home'),icon:'fa-house',label:'Property Home'},
      {key:'town-compare',href:route('/town-compare'),icon:'fa-code-compare',label:'Town Compare'},
      {key:'robust',href:route('/robust/'),icon:'fa-gauge-high',label:'ROBUST Framework'},
      {key:'pulse',href:route('/pulse'),icon:'fa-wave-square',label:'Property Pulse'}
    ];
    if(state.ready && isAgent()) out.push({key:'agent-desk',href:route('/agent-desk'),icon:'fa-bullseye',label:'Agent Control'});
    if(state.ready && can('pro_plus')) out.push({key:'scan',href:route('/scan'),icon:'fa-magnifying-glass-chart',label:'Appeal Scanner'});
    if(state.ready && can('agent')) out.push({key:'data-workbench',href:route('/data-workbench'),icon:'fa-table-list',label:'Data Workbench'});
    if(state.ready && can('pro_plus')) out.push({key:'data-center',href:route('/data-center'),icon:'fa-database',label:'Data Center'});
    out.push({key:'pro',href:route('/pro'),icon:'fa-briefcase',label:'Professional Hub'});
    out.push({key:'account',href:route('/account'),icon:'fa-user-gear',label:'Account'});
    return out;
  }
  function developerItems(){
    return [
      {key:'developer',href:route('/developer'),icon:'fa-code',label:'Developer Command Center',detail:'Platform map and developer shortcuts'},
      {key:'developer-recaps',href:route('/logs/recap'),icon:'fa-calendar-check',label:'Daily Recaps',detail:'Daily operating memory and handoffs'},
      {key:'developer-marketing',href:'/property/developer-marketing-plan.html',icon:'fa-bullhorn',label:'Marketing Campaign',detail:'Organic-first Watchdog launch plan under $100'},
      {key:'developer-analytics',href:route('/analytics'),icon:'fa-chart-line',label:'Analytics',detail:'External product and account KPIs'},
      {key:'developer-logs',href:route('/logs'),icon:'fa-clock-rotate-left',label:'Build Logs',detail:'Build, verification and audit history'},
      {key:'developer-data',href:route('/developer-data'),icon:'fa-database',label:'Data Operations',detail:'Marker freshness and release controls'}
    ];
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
  function activeFor(item,page){
    if(item.key === 'robust') return page === 'robust';
    return item.key === page;
  }
  function navLinksHtml(){
    var page = currentPage();
    return items().map(function(item){
      return '<a' + (activeFor(item,page) ? ' class="active" aria-current="page"' : '') + ' href="' + item.href + '"><i class="fas ' + item.icon + '"></i><span>' + item.label + '</span></a>';
    }).join('');
  }
  function brandHtml(){
    return '<a class="wd-universal-brand" href="' + route('/dashboard') + '"><span class="wd-universal-brand-mark"><i class="fas fa-dog"></i></span><span class="wd-universal-brand-copy"><strong>Watchdog</strong><small>PROPERTY INTELLIGENCE</small></span></a>';
  }

  function patchAppNav(){
    document.querySelectorAll('.wd4-nav-links,.hm27-nav-links').forEach(function(nav){
      var html = navLinksHtml();
      if(nav.innerHTML !== html){ nav.innerHTML = html; nav.dataset.wdUniversal = VERSION; }
    });
  }
  function publicDrawerHtml(){
    var footer = state.user ? '' : '<div class="wd-universal-nav-foot"><button type="button" data-wd-universal="signin"><i class="fas fa-right-to-bracket"></i><span>Sign in</span></button></div>';
    return '<div class="wd-universal-nav-head">' + brandHtml() + '<button class="wd-public-close wd-universal-close" type="button" data-wd-universal="close" aria-label="Close navigation"><i class="fas fa-xmark"></i></button></div>' +
      '<nav class="wd-universal-nav-links" aria-label="Watchdog navigation">' + navLinksHtml() + '</nav>' + footer;
  }
    function patchPublicDrawer(){
    var sheet = document.getElementById('wd-main-sheet');
    if(!sheet) return;
    sheet.classList.add('wd-universal-public-nav');
    /* Never rewrite the drawer while it is open. Replacing innerHTML mid-tap
       destroys the anchor before the browser finishes the activation event,
       which silently swallows the navigation (always on WebKit/iOS,
       intermittently on Chromium). public-nav.js re-runs refresh() on close. */
    if(sheet.classList.contains('open')) return;
    var html = publicDrawerHtml();
    if(sheet.innerHTML !== html){ sheet.innerHTML = html; sheet.dataset.wdUniversal = VERSION; }
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
    return close +
      '<header><span><b>' + esc(displayName()) + '</b><small>' + esc(state.user.email || '') + '</small></span><i>' + esc(prettyPlan()) + '</i></header>' +
      '<nav>' +
        planPromoHtml() +
        '<a href="' + route('/account') + '"><i class="fas fa-user-pen"></i><span><b>Edit profile &amp; role</b><small>Profile, profession and preferences</small></span></a>' +
        '<button type="button" data-wd-universal="invite"><i class="fas fa-user-plus"></i><span><b>Invite others</b><small>Share your Watchdog referral link</small></span></button>' +
        '<a href="' + route('/account') + '"><i class="fas fa-credit-card"></i><span><b>Account &amp; billing</b><small>Plan, subscription and billing</small></span></a>' +
        '<a href="' + route('/home') + '"><i class="fas fa-house"></i><span><b>Property Home</b><small>Your saved-home workspace</small></span></a>' +
        developerToolsHtml() +
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
      if(publicHost.innerHTML !== publicHtml){ publicHost.innerHTML = publicHtml; publicHost.dataset.wdUniversal = VERSION; }
    }
    ['wd6-profile','hm27-profile-pop'].forEach(function(id){
      var host = document.getElementById(id);
      if(!host) return;
      host.classList.add('wd-universal-profile');
      var html = profileMarkup(false);
      if(host.innerHTML !== html){ host.innerHTML = html; host.dataset.wdUniversal = VERSION; }
    });
  }
  function patchProfileTriggers(){
    var publicTrigger = document.getElementById('wd-profile-trigger');
    if(!publicTrigger) return;
    var a = avatar();
    publicTrigger.innerHTML = a ? '<img src="' + esc(a) + '" alt=""><span>' + (state.user ? 'Account' : 'Sign in') + '</span>' : '<i class="fas fa-user"></i><span>' + (state.user ? 'Account' : 'Sign in') + '</span>';
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
  function inviteLink(){
    var code = state.user ? 'WD-' + String(state.user.id).replace(/-/g,'').slice(0,10).toUpperCase() : 'WATCHDOG';
    return {code:code,link:location.origin + route('/') + '?ref=' + encodeURIComponent(code)};
  }
  function showInvite(){
    if(!state.user){ signIn(); return; }
    var nodes = ensureInvite(), d = inviteLink();
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
    ['wd-main-sheet','wd-profile-sheet'].forEach(function(id){ var x = document.getElementById(id); if(x) x.classList.remove('open'); });
    var b = document.getElementById('wd-public-backdrop');
    if(b) b.classList.remove('open');
    document.body.classList.remove('wd-public-menu-open');
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
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(d.link).then(function(){ if(input) input.select(); }).catch(function(){});
    else if(input){ input.focus(); input.select(); try{ document.execCommand('copy'); }catch(_){} }
  }
  function shareInvite(){
    var d = inviteLink();
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
    new MutationObserver(queue).observe(node,{childList:true,subtree:true});
  }
    function attachTargetObservers(){
    ['wd6-profile','hm27-profile-pop'].forEach(function(id){ watchTarget(document.getElementById(id)); });
    document.querySelectorAll('.wd4-nav-links,.hm27-nav-links').forEach(watchTarget);
  }
  function refresh(){
    patchAppNav();
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
    var selector = '#wd-main-sheet,#wd-profile-content,#wd6-profile,#hm27-profile-pop,.wd4-nav-links,.hm27-nav-links';
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
    if(action === 'close'){ ev.preventDefault(); closePublic(); }
    else if(action === 'signin'){ ev.preventDefault(); signIn(); }
    else if(action === 'signout'){ ev.preventDefault(); signOut(); }
    else if(action === 'invite'){ ev.preventDefault(); showInvite(); }
    else if(action === 'invite-close'){ ev.preventDefault(); closeInvite(); }
    else if(action === 'copy'){ ev.preventDefault(); copyInvite(); }
    else if(action === 'share'){ ev.preventDefault(); shareInvite(); }
  },true);
  document.addEventListener('click',function(ev){ if(ev.target && ev.target.id === 'wd-universal-invite-shade') closeInvite(); });
  document.addEventListener('keydown',function(ev){ if(ev.key === 'Escape') closeInvite(); });
  document.addEventListener('njptr:plan-change',loadAuth);
  document.addEventListener('watchdog:developer-confirmed',loadAuth);

  function boot(){
    ensureCss();
    queue();
    loadAuth();
    if(typeof MutationObserver !== 'undefined' && document.body){
      new MutationObserver(function(records){ if(mutationMayContainChrome(records)) queue(); }).observe(document.body,{childList:true,subtree:true});
    }
  }

  window.WatchdogUniversalMenu = {
    version:VERSION,
    items:items,
    developerItems:developerItems,
    planPromo:planPromo,
    refresh:queue,
    setUser:setUser,
    route:route,
    state:function(){ return state; },
    profileMarkup:profileMarkup
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
