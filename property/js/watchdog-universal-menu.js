/* Watchdog universal navigation + profile menu.
   One canonical source for destinations, entitlement gating and account menu copy. */
(function(){
  'use strict';
  if(window.__WATCHDOG_UNIVERSAL_MENU__) return;
  window.__WATCHDOG_UNIVERSAL_MENU__ = true;

  var VERSION = '20260822a';
  var URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var db = null;
  var state = { user:null, profile:{}, entitlement:null, ready:false };
  var queued = false;
  var authAttempts = 0;

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function plan(v){
    v=String(v||'').toLowerCase().replace(/\+/g,'_plus').replace(/[^a-z_]/g,'');
    if(v==='free') v='standard';
    return ['standard','agent','pro','pro_plus','teams','developer'].indexOf(v)>=0?v:'standard';
  }
  function actualPlan(){
    if(plan(state.profile.account_role)==='developer'||plan(state.entitlement&&state.entitlement.account_role)==='developer') return 'developer';
    return plan((state.entitlement&&state.entitlement.plan_tier)||state.profile.plan_tier||state.profile.plan);
  }
  function can(required){
    var rank={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
    return rank[actualPlan()]>=rank[plan(required)];
  }
  function isAgent(){
    if(actualPlan()==='developer') return true;
    var roles=Array.isArray(state.profile.roles)?state.profile.roles.map(String):[];
    return roles.some(function(x){return /agent|realtor|real_estate/i.test(x);})||
      /agent|realtor|real_estate/i.test(state.profile.role||'')||!!state.profile.pro_agent;
  }
  function prettyPlan(){
    var p=actualPlan();
    if(!state.user) return 'Signed out';
    if(p==='developer') return 'Developer';
    if(p==='pro_plus') return 'Pro+';
    return p.replace(/\b\w/g,function(c){return c.toUpperCase();});
  }
  function displayName(){
    var meta=state.user&&state.user.user_metadata||{};
    return state.profile.display_name||state.profile.full_name||meta.full_name||meta.name||
      (state.user&&state.user.email?state.user.email.split('@')[0]:'Watchdog');
  }
  function avatar(){
    var meta=state.user&&state.user.user_metadata||{};
    return state.profile.avatar_url||meta.avatar_url||meta.picture||'';
  }
  function currentPage(){
    var explicit=document.body&&document.body.getAttribute('data-sidebar-page');
    if(explicit) return explicit;
    var p=(location.pathname||'').replace(/\/+$/,'');
    if(p==='/property'||p==='/property/index.html') return 'lookup';
    var m=p.match(/\/property\/([^/]+)/);
    return m?m[1]:'lookup';
  }

  function items(){
    var out=[
      {key:'dashboard',href:'/property/dashboard',icon:'fa-table-columns',label:'Dashboard'},
      {key:'home',href:'/property/home',icon:'fa-house',label:'Property Home'},
      {key:'town-compare',href:'/property/town-compare',icon:'fa-code-compare',label:'Town Compare'},
      {key:'robust',href:'/property/robust/',icon:'fa-gauge-high',label:'ROBUST Framework'},
      {key:'pulse',href:'/property/pulse',icon:'fa-wave-square',label:'Change Intelligence'}
    ];
    if(state.ready&&isAgent()) out.push({key:'agent-desk',href:'/property/agent-desk',icon:'fa-bullseye',label:'Agent Control'});
    if(state.ready&&can('pro_plus')) out.push({key:'scan',href:'/property/scan',icon:'fa-magnifying-glass-chart',label:'Appeal Scanner'});
    if(state.ready&&can('agent')) out.push({key:'data-workbench',href:'/property/data-workbench',icon:'fa-table-list',label:'Data Workbench'});
    if(state.ready&&can('pro_plus')) out.push({key:'data-center',href:'/property/data-center',icon:'fa-database',label:'Data Center'});
    out.push({key:'pro',href:'/property/pro',icon:'fa-briefcase',label:'Professional Hub'});
    out.push({key:'account',href:'/property/account',icon:'fa-user-gear',label:'Account'});
    return out;
  }
  function activeFor(item,page){
    if(item.key==='robust') return page==='robust'||/\/property\/robust(?:\/|$)/.test(location.pathname||'');
    return item.key===page;
  }
  function navLinksHtml(withSpan){
    var page=currentPage();
    return items().map(function(item){
      return '<a'+(activeFor(item,page)?' class="active" aria-current="page"':'')+' href="'+item.href+'"><i class="fas '+item.icon+'"></i>'+(withSpan?'<span>'+item.label+'</span>':item.label)+'</a>';
    }).join('');
  }
  function brandHtml(){
    return '<a class="wd-universal-brand" href="/property/dashboard"><span class="wd-universal-brand-mark"><i class="fas fa-dog"></i></span><span class="wd-universal-brand-copy"><strong>Watchdog</strong><small>PROPERTY INTELLIGENCE</small></span></a>';
  }

  function patchAppNav(){
    document.querySelectorAll('.wd4-nav-links,.hm27-nav-links').forEach(function(nav){
      var html=navLinksHtml(nav.classList.contains('hm27-nav-links'));
      if(nav.innerHTML!==html){nav.innerHTML=html;nav.dataset.wdUniversal=VERSION;}
    });
  }

  function publicDrawerHtml(){
    return '<div class="wd-universal-nav-head">'+brandHtml()+'<button class="wd-public-close wd-universal-close" type="button" data-wd-universal="close" aria-label="Close navigation"><i class="fas fa-xmark"></i></button></div>'+
      '<nav class="wd-universal-nav-links" aria-label="Watchdog navigation">'+navLinksHtml(true)+'</nav>'+
      '<div class="wd-universal-nav-foot">'+(state.user?
        '<button type="button" data-wd-universal="signout"><i class="fas fa-arrow-right-from-bracket"></i><span>Sign out</span></button>':
        '<button type="button" data-wd-universal="signin"><i class="fas fa-right-to-bracket"></i><span>Sign in</span></button>')+'</div>';
  }
  function patchPublicDrawer(){
    var sheet=document.getElementById('wd-main-sheet');
    if(!sheet) return;
    sheet.classList.add('wd-universal-public-nav');
    var html=publicDrawerHtml();
    if(sheet.innerHTML!==html){sheet.innerHTML=html;sheet.dataset.wdUniversal=VERSION;}
  }

  function profileMarkup(publicMode){
    if(!state.user){
      return (publicMode?'<button class="wd-universal-profile-close wd-public-close" type="button" data-wd-universal="close" aria-label="Close account menu"><i class="fas fa-xmark"></i></button>':'')+
        '<header><span><b>Watchdog</b><small>Sign in to your account</small></span><i>Signed out</i></header>'+
        '<nav><button type="button" data-wd-universal="signin"><i class="fas fa-right-to-bracket"></i><span><b>Sign in to Watchdog</b><small>Open your saved properties and account</small></span></button>'+
        '<a href="/property/pro"><i class="fas fa-briefcase"></i><span><b>Plans &amp; professional tools</b><small>Explore Watchdog access levels</small></span></a>'+
        '<a href="/property/"><i class="fas fa-magnifying-glass"></i><span><b>Property lookup</b><small>Search any New Jersey property</small></span></a></nav>';
    }
    var a=avatar();
    var identity=(a?'<img class="wd-universal-profile-avatar" src="'+esc(a)+'" alt="">':'<span class="wd-universal-profile-avatar fallback">'+esc(displayName().charAt(0).toUpperCase())+'</span>');
    return (publicMode?'<button class="wd-universal-profile-close wd-public-close" type="button" data-wd-universal="close" aria-label="Close account menu"><i class="fas fa-xmark"></i></button>':'')+
      '<header><div class="wd-universal-profile-id">'+identity+'<span><b>'+esc(displayName())+'</b><small>'+esc(state.user.email||'')+'</small></span></div><i>'+esc(prettyPlan())+'</i></header>'+
      '<nav>'+
      '<a href="/property/account"><i class="fas fa-user-pen"></i><span><b>Edit profile &amp; role</b><small>Profile, profession and preferences</small></span></a>'+
      '<button type="button" data-wd-universal="invite"><i class="fas fa-user-plus"></i><span><b>Invite others</b><small>Share your Watchdog referral link</small></span></button>'+
      '<a href="/property/account"><i class="fas fa-credit-card"></i><span><b>Account &amp; billing</b><small>Plan, subscription and billing</small></span></a>'+
      '<a href="/property/home"><i class="fas fa-house"></i><span><b>Property Home</b><small>Your saved-home workspace</small></span></a>'+
      '</nav><button class="wd-universal-signout" type="button" data-wd-universal="signout"><i class="fas fa-arrow-right-from-bracket"></i> Sign out</button>';
  }
  function patchProfiles(){
    var publicSheet=document.getElementById('wd-profile-sheet');
    var publicHost=document.getElementById('wd-profile-content');
    if(publicSheet&&publicHost){
      publicSheet.classList.add('wd-universal-public-profile');
      var oldHead=publicSheet.querySelector(':scope > .wd-public-sheet-head');
      if(oldHead) oldHead.setAttribute('aria-hidden','true');
      publicHost.classList.add('wd-universal-profile');
      var publicHtml=profileMarkup(true);
      if(publicHost.innerHTML!==publicHtml){publicHost.innerHTML=publicHtml;publicHost.dataset.wdUniversal=VERSION;}
    }
    ['wd6-profile','hm27-profile-pop'].forEach(function(id){
      var host=document.getElementById(id);
      if(!host) return;
      host.classList.add('wd-universal-profile');
      var html=profileMarkup(false);
      if(host.innerHTML!==html){host.innerHTML=html;host.dataset.wdUniversal=VERSION;}
    });
  }
  function patchProfileTriggers(){
    var publicTrigger=document.getElementById('wd-profile-trigger');
    if(publicTrigger){
      var a=avatar();
      if(a) publicTrigger.innerHTML='<img src="'+esc(a)+'" alt=""><span>'+esc(state.user?'Account':'Sign in')+'</span>';
      else publicTrigger.innerHTML='<i class="fas fa-user"></i><span>'+(state.user?'Account':'Sign in')+'</span>';
      publicTrigger.setAttribute('aria-label',state.user?'Open account menu':'Sign in or open account menu');
    }
  }

  function ensureInvite(){
    var shade=document.getElementById('wd-universal-invite-shade');
    if(!shade){shade=document.createElement('button');shade.id='wd-universal-invite-shade';shade.className='wd-universal-invite-shade';shade.type='button';shade.setAttribute('aria-label','Close invite');document.body.appendChild(shade);}
    var modal=document.getElementById('wd-universal-invite');
    if(!modal){modal=document.createElement('section');modal.id='wd-universal-invite';modal.className='wd-universal-invite';document.body.appendChild(modal);}
    return {shade:shade,modal:modal};
  }
  function inviteLink(){
    var code=state.user?'WD-'+String(state.user.id).replace(/-/g,'').slice(0,10).toUpperCase():'WATCHDOG';
    return {code:code,link:location.origin+'/property/?ref='+encodeURIComponent(code)};
  }
  function showInvite(){
    if(!state.user){signIn();return;}
    var nodes=ensureInvite(),d=inviteLink();
    nodes.modal.innerHTML='<button class="wd-universal-invite-x" type="button" data-wd-universal="invite-close" aria-label="Close invite"><i class="fas fa-xmark"></i></button><small>INVITE TO WATCHDOG</small><h2>Share better property intelligence.</h2><p>Send your personal Watchdog invite link to a friend, client or colleague.</p><label>Your invite link</label><div><input id="wd-universal-ref" readonly value="'+esc(d.link)+'"><button type="button" data-wd-universal="copy"><i class="far fa-copy"></i> Copy</button></div><footer><a href="mailto:?subject='+encodeURIComponent('Try Watchdog Property Intelligence')+'&body='+encodeURIComponent('I thought you might find Watchdog useful: '+d.link)+'"><i class="fas fa-envelope"></i>Email invite</a><button type="button" data-wd-universal="share"><i class="fas fa-share-nodes"></i> Share</button></footer><em>Invite code: '+esc(d.code)+'</em>';
    nodes.shade.classList.add('open');nodes.modal.classList.add('open');
  }
  function closeInvite(){
    var s=document.getElementById('wd-universal-invite-shade'),m=document.getElementById('wd-universal-invite');
    if(s)s.classList.remove('open');if(m)m.classList.remove('open');
  }
  function closePublic(){
    if(window.WatchdogPublicNav&&typeof window.WatchdogPublicNav.close==='function'){window.WatchdogPublicNav.close();return;}
    ['wd-main-sheet','wd-profile-sheet'].forEach(function(id){var x=document.getElementById(id);if(x)x.classList.remove('open');});
    var b=document.getElementById('wd-public-backdrop');if(b)b.classList.remove('open');
    document.body.classList.remove('wd-public-menu-open');
  }
  function signIn(){
    closePublic();
    if(typeof window.plSignInPrompt==='function'){window.plSignInPrompt();return;}
    location.href='/property/dashboard';
  }
  function signOut(){
    closePublic();closeInvite();
    if(db&&db.auth&&typeof db.auth.signOut==='function') db.auth.signOut().finally(function(){location.href='/property/';});
    else if(typeof window.plSignOut==='function') window.plSignOut();
    else location.href='/property/';
  }
  function copyInvite(){
    var d=inviteLink(),input=document.getElementById('wd-universal-ref');
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(d.link).then(function(){if(input){input.select();}}).catch(function(){});
    else if(input){input.focus();input.select();try{document.execCommand('copy');}catch(_) {}}
  }
  function shareInvite(){
    var d=inviteLink();
    if(navigator.share) navigator.share({title:'Watchdog Property Intelligence',text:'Take a look at Watchdog Property Intelligence.',url:d.link}).catch(function(){});
    else copyInvite();
  }

  function ensureCss(){
    if(document.querySelector('link[href^="/property/css/watchdog-universal-menu.css"]')) return;
    var link=document.createElement('link');link.rel='stylesheet';link.href='/property/css/watchdog-universal-menu.css?v='+VERSION;document.head.appendChild(link);
  }
  function refresh(){
    patchAppNav();patchPublicDrawer();patchProfiles();patchProfileTriggers();
    document.dispatchEvent(new CustomEvent('watchdog:universal-menu-ready',{detail:{version:VERSION,user:!!state.user,plan:actualPlan()}}));
  }
  function queue(){
    if(queued) return;queued=true;
    requestAnimationFrame(function(){queued=false;refresh();});
  }
  function setUser(u){state.user=u||null;queue();}
  function loadAuth(){
    if(!window.supabase){
      if(authAttempts++<30) setTimeout(loadAuth,120);
      else {state.ready=true;queue();}
      return;
    }
    if(!db) db=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}});
    db.auth.getSession().then(function(r){
      var session=r&&r.data&&r.data.session;
      state.user=session&&session.user||state.user||null;
      if(!state.user){state.ready=true;queue();return null;}
      return Promise.allSettled([
        db.from('profiles').select('display_name,full_name,avatar_url,role,roles,pro_agent,plan,plan_tier,account_role').eq('id',state.user.id).maybeSingle(),
        db.rpc('get_my_entitlement')
      ]).then(function(parts){
        state.profile=parts[0]&&parts[0].status==='fulfilled'&&parts[0].value&&parts[0].value.data||{};
        var ent=parts[1]&&parts[1].status==='fulfilled'&&parts[1].value?parts[1].value.data:null;
        state.entitlement=Array.isArray(ent)?ent[0]:ent;
        state.ready=true;queue();
      });
    }).catch(function(){state.ready=true;queue();});
  }

  document.addEventListener('click',function(ev){
    var control=ev.target&&ev.target.closest&&ev.target.closest('[data-wd-universal]');
    if(!control) return;
    var action=control.getAttribute('data-wd-universal');
    if(action==='close'){ev.preventDefault();closePublic();}
    else if(action==='signin'){ev.preventDefault();signIn();}
    else if(action==='signout'){ev.preventDefault();signOut();}
    else if(action==='invite'){ev.preventDefault();showInvite();}
    else if(action==='invite-close'){ev.preventDefault();closeInvite();}
    else if(action==='copy'){ev.preventDefault();copyInvite();}
    else if(action==='share'){ev.preventDefault();shareInvite();}
  },true);
  document.addEventListener('click',function(ev){if(ev.target&&ev.target.id==='wd-universal-invite-shade')closeInvite();});
  document.addEventListener('keydown',function(ev){if(ev.key==='Escape')closeInvite();});
  document.addEventListener('njptr:plan-change',loadAuth);
  document.addEventListener('watchdog:developer-confirmed',loadAuth);

  function boot(){
    ensureCss();queue();loadAuth();
    if(document.body) new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});
  }

  window.WatchdogUniversalMenu={version:VERSION,items:items,refresh:queue,setUser:setUser,state:function(){return state;},profileMarkup:profileMarkup};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
