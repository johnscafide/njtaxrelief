/* Property Home: use the exact Dashboard navigation destinations and gating. */
(function(){
  'use strict';
  if(window.__WATCHDOG_HOME_MENU_SYNC__) return;
  window.__WATCHDOG_HOME_MENU_SYNC__=true;

  var URL='https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  if(!window.supabase) return;
  var db=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}});
  var profile={},entitlement=null;

  function loadScript(src){
    if(document.querySelector('script[src="'+src+'"]')) return Promise.resolve();
    return new Promise(function(resolve,reject){
      var s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=function(){reject(new Error('Could not load '+src));};document.head.appendChild(s);
    });
  }
  function loadIntelligenceRuntime(){
    var assets=[
      '/property/js/watchdog-intelligence-context.js',
      '/property/js/watchdog-semantic-context.js',
      '/property/js/watchdog-page-context.js',
      '/property/js/watchdog-home-semantic-bridge.js',
      '/property/js/watchdog-context-feedback.js',
      '/property/js/dashboard/home/watchdog-analyst-intel-loader.js',
      '/property/js/watchdog-intelligence-density.js',
      '/property/js/dashboard/home/watchdog-data-graph.js',
      '/property/js/watchdog-today-nav.js'
    ];
    return assets.reduce(function(p,src){return p.then(function(){return loadScript(src);});},Promise.resolve()).catch(function(error){console.warn('Watchdog Home Intelligence runtime unavailable:',error&&error.message||error);});
  }

  function plan(v){
    v=String(v||'').toLowerCase().replace(/\+/g,'_plus').replace(/[^a-z_]/g,'');
    if(v==='free') v='standard';
    return ['standard','agent','pro','pro_plus','teams','developer'].indexOf(v)>=0?v:'standard';
  }
  function actualPlan(){
    if(plan(profile.account_role)==='developer'||plan(entitlement&&entitlement.account_role)==='developer') return 'developer';
    return plan((entitlement&&entitlement.plan_tier)||profile.plan_tier||profile.plan);
  }
  function can(required){
    var rank={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
    return rank[actualPlan()]>=rank[plan(required)];
  }
  function isAgent(){
    if(actualPlan()==='developer') return true;
    var roles=Array.isArray(profile.roles)?profile.roles.map(String):[];
    return roles.some(function(x){return /agent|realtor|real_estate/i.test(x);})||/agent|realtor|real_estate/i.test(profile.role||'')||!!profile.pro_agent;
  }
  function item(href,icon,label,active){
    return '<a'+(active?' class="active"':'')+' href="'+href+'"><i class="fas '+icon+'"></i><span>'+label+'</span></a>';
  }
  function render(){
    var nav=document.querySelector('.hm27-nav-links');
    if(!nav) return;
    var items=[
      item('/property/dashboard','fa-table-columns','Dashboard'),
      item('/property/home','fa-house','Property Home',true),
      item('/property/town-compare','fa-code-compare','Town Compare'),
      item('/property/fairness','fa-scale-balanced','Assessment Fairness'),
      item('/property/pulse','fa-wave-square','Change Intelligence')
    ];
    if(isAgent()) items.push(item('/property/agent-desk','fa-bullseye','Agent Control'));
    if(can('pro_plus')) items.push(item('/property/scan','fa-magnifying-glass-chart','Appeal Scanner'));
    if(can('agent')) items.push(item('/property/data-workbench','fa-table-list','Data Workbench'));
    if(can('pro_plus')) items.push(item('/property/data-center','fa-database','Data Center'));
    items.push(item('/property/pro','fa-briefcase','Professional Hub'));
    items.push(item('/property/account','fa-user-gear','Account'));
    nav.innerHTML=items.join('');
    if(window.WatchdogTodayNav&&window.WatchdogTodayNav.refresh)window.WatchdogTodayNav.refresh();
  }

  function boot(){
    loadIntelligenceRuntime();
    render();
    db.auth.getSession().then(function(res){
      var user=res&&res.data&&res.data.session&&res.data.session.user;
      if(!user) return null;
      return Promise.allSettled([
        db.from('profiles').select('id,role,roles,pro_agent,plan,plan_tier,account_role').eq('id',user.id).maybeSingle(),
        db.rpc('get_my_entitlement')
      ]);
    }).then(function(parts){
      if(!parts) return;
      profile=parts[0]&&parts[0].status==='fulfilled'&&parts[0].value&&parts[0].value.data?parts[0].value.data:{};
      var ent=parts[1]&&parts[1].status==='fulfilled'&&parts[1].value?parts[1].value.data:null;
      entitlement=Array.isArray(ent)?ent[0]:ent;
      render();
    }).catch(function(){ render(); });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
