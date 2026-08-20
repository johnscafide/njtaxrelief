(function(){
  'use strict';
  if(window.__WATCHDOG_BRAND_CONSISTENCY__)return;
  window.__WATCHDOG_BRAND_CONSISTENCY__=true;

  var STYLE='/property/css/brand-consistency.css';
  var items=[
    {page:'dashboard',href:'/property/dashboard',icon:'fa-table-columns',label:'Dashboard'},
    {page:'home',href:'/property/home',icon:'fa-house',label:'Property Home'},
    {page:'town-compare',href:'/property/town-compare',icon:'fa-code-compare',label:'Town Compare'},
    {page:'fairness',href:'/property/fairness',icon:'fa-scale-balanced',label:'Assessment Fairness'},
    {page:'pulse',href:'/property/pulse',icon:'fa-wave-square',label:'Change Intelligence'},
    {page:'agent-desk',href:'/property/agent-desk',icon:'fa-bullseye',label:'Agent Control'},
    {page:'scan',href:'/property/scan',icon:'fa-magnifying-glass-chart',label:'Appeal Scanner'},
    {page:'data-workbench',href:'/property/data-workbench',icon:'fa-table-list',label:'Data Workbench'},
    {page:'data-center',href:'/property/data-center',icon:'fa-database',label:'Data Center'},
    {page:'pro',href:'/property/pro',icon:'fa-briefcase',label:'Professional Hub'},
    {page:'account',href:'/property/account',icon:'fa-user-gear',label:'Account'}
  ];

  function ensureStyle(){
    if(document.querySelector('link[href="'+STYLE+'"]'))return;
    var l=document.createElement('link');
    l.rel='stylesheet';l.href=STYLE;document.head.appendChild(l);
  }

  function currentPage(){
    var p=(document.body&&document.body.getAttribute('data-sidebar-page'))||'';
    if(p)return p;
    var path=location.pathname.replace(/\/+$/,'').split('/').pop();
    return path||'dashboard';
  }

  function markup(page){
    return items.map(function(item){
      var active=page===item.page?' class="active" aria-current="page"':'';
      return '<a'+active+' href="'+item.href+'"><i class="fas '+item.icon+'" aria-hidden="true"></i><span>'+item.label+'</span></a>';
    }).join('');
  }

  function syncNavigation(){
    var page=currentPage();
    var signature='v1:'+page;
    var html=markup(page);
    document.querySelectorAll('.wd4-nav-links,.hm27-nav-links').forEach(function(nav){
      if(nav.getAttribute('data-wd-brand-nav')===signature)return;
      nav.innerHTML=html;
      nav.setAttribute('data-wd-brand-nav',signature);
    });
  }

  function setText(selector,value){
    document.querySelectorAll(selector).forEach(function(n){
      if(n.textContent!==value)n.textContent=value;
    });
  }

  function syncBrand(){
    setText('.wd4-brand-copy strong','Watchdog');
    setText('.wd4-brand-copy small,.hm27-brand-copy small,.wdx-brand-copy small','PROPERTY INTELLIGENCE');
  }

  function run(){ensureStyle();syncNavigation();syncBrand();}

  var scheduled=false;
  function schedule(){
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(function(){scheduled=false;run();});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});
  else run();

  var observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.WatchdogBrandConsistency={sync:run,items:items.slice()};
})();
