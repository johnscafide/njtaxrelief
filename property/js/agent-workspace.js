/* Watchdog agent workspace bar.
   Agent tool pages that keep a sticky workspace bar (Farm Map, Farm Builder,
   Farm Lists, Playbooks) show where they live in the information architecture
   instead of a second set of tabs:

     <- Agent Desk  /  Farm  /  Farm Map          [page actions] [fullscreen] [close]

   The first crumb is the way back to the Agent Desk and the second opens the
   tool's area on the desk. Area labels are the five Agent Desk areas the
   Watchdog menu uses (AGENT_AREAS in watchdog-universal-menu.js); tool names are
   the canonical names on the desk cards. A page declares:

     <nav class="aw27-bar" id="agent-workspace-nav" data-active="farm-map">
       <div class="aw27-actions">…page-specific buttons…</div>
     </nav>

   and this runtime adds the breadcrumb plus the shared fullscreen / close
   window controls. Styles: /property/css/watchdog-page-head.css. */
(function(){
  'use strict';
  if(window.WatchdogAgentWorkspace)return;

  var host=String(location.hostname||'').toLowerCase();
  var clean=host==='watchdogindex.com'||host==='www.watchdogindex.com';
  function route(path){return clean?path:'/property'+path;}

  /* The five Agent Desk areas (desk section key -> menu label). */
  var AREAS={home:'Agent Desk',clients:'Clients',farm:'Farm',marketing:'Marketing',research:'Research'};
  /* Workspace-bar pages: data-active key -> area and canonical tool name. */
  var PAGES={
    'desk':{area:'home',label:''},
    'farm-map':{area:'farm',label:'Farm Map'},
    'farm-builder':{area:'farm',label:'Farm Builder'},
    'market-list':{area:'farm',label:'Farm Lists'},
    'growth':{area:'marketing',label:'Playbooks'}
  };

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

  // content-architecture: dynamic — navigation chrome bound from the page's data-active key to its IA area and canonical tool name; no page copy lives here.
  function crumbsHtml(active){
    var page=PAGES[active]||{area:'home',label:''};
    var sep='<span class="wd-crumbs-sep" aria-hidden="true">/</span>';
    var html='<a class="wd-crumbs-desk" href="'+esc(route('/agent-desk'))+'"><i class="fas fa-arrow-left" aria-hidden="true"></i><span>Agent Desk</span></a>';
    if(page.area!=='home')html+=sep+'<a href="'+esc(route('/agent-desk')+'#'+page.area)+'">'+esc(AREAS[page.area])+'</a>';
    if(page.label)html+=sep+'<span class="wd-crumbs-here" aria-current="page">'+esc(page.label)+'</span>';
    return '<nav class="wd-crumbs" aria-label="Breadcrumb">'+html+'</nav>';
  }
  function ensureCss(){
    var href='/property/css/watchdog-page-head.css';
    if(document.querySelector('link[href^="'+href+'"]'))return;
    var l=document.createElement('link');l.rel='stylesheet';l.href=href;(document.head||document.documentElement).appendChild(l);
  }

  function windowControls(){
    return '<button class="aw27-icon" type="button" data-aw27="fullscreen" title="Fullscreen" aria-label="Toggle fullscreen"><i class="fas fa-expand" aria-hidden="true"></i></button>'+
      '<button class="aw27-icon" type="button" data-aw27="close" title="Close Agent Control" aria-label="Close Agent Control"><i class="fas fa-xmark" aria-hidden="true"></i></button>';
  }

  function render(){
    var bar=document.getElementById('agent-workspace-nav');
    if(!bar||bar.dataset.aw27Ready==='1')return;
    bar.dataset.aw27Ready='1';
    ensureCss();
    var actions=bar.querySelector('.aw27-actions');
    if(!actions){actions=document.createElement('div');actions.className='aw27-actions';bar.appendChild(actions);}
    /* The breadcrumb inside is the landmark; the bar itself is just a toolbar row. */
    bar.setAttribute('role','none');bar.removeAttribute('aria-label');
    bar.insertAdjacentHTML('afterbegin',crumbsHtml(bar.dataset.active||''));
    actions.insertAdjacentHTML('beforeend',windowControls());
    /* In-page links into other Agent Control workspaces follow the same host-aware routing. */
    document.querySelectorAll('a[data-aw27-route]').forEach(function(a){a.setAttribute('href',route(a.dataset.aw27Route));});
  }

  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-aw27]');
    if(!b)return;
    var action=b.dataset.aw27;
    if(action==='fullscreen'){
      e.preventDefault();
      try{if(!document.fullscreenElement)document.documentElement.requestFullscreen();else document.exitFullscreen();}catch(_){}
    }else if(action==='close'){
      e.preventDefault();
      var bar=document.getElementById('agent-workspace-nav');
      var onDesk=bar&&bar.dataset.active==='desk';
      if(window.opener&&!window.opener.closed){window.close();return;}
      location.href=route(onDesk?'/dashboard':'/agent-desk');
    }
  });
  document.addEventListener('fullscreenchange',function(){
    document.querySelectorAll('[data-aw27="fullscreen"] i').forEach(function(i){i.className='fas '+(document.fullscreenElement?'fa-compress':'fa-expand');});
  });

  window.WatchdogAgentWorkspace={areas:AREAS,pages:PAGES,route:route,render:render};
  render();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});
})();
