/* Watchdog Agent Control workspace bar.
   One definition of the Agent Control tabs (Opportunity Desk, Farm Map, Growth,
   Advanced Farm) shared by every agent workspace page. A page declares:

     <nav class="aw27-bar" id="agent-workspace-nav" data-active="desk">
       <div class="aw27-actions">…page-specific buttons…</div>
     </nav>

   and this runtime adds the tabs (with the active one marked) plus the shared
   fullscreen / close window controls. Change TABS here and every page follows. */
(function(){
  'use strict';
  if(window.WatchdogAgentWorkspace)return;

  var host=String(location.hostname||'').toLowerCase();
  var clean=host==='watchdogindex.com'||host==='www.watchdogindex.com';
  function route(path){return clean?path:'/property'+path;}

  var TABS=[
    {key:'desk',href:'/agent-desk',icon:'fa-bullseye',label:'Opportunity Desk'},
    {key:'farm-map',href:'/farm-map',icon:'fa-map',label:'Farm Map'},
    {key:'growth',href:'/growth/',icon:'fa-arrow-trend-up',label:'Growth'},
    {key:'farm-builder',href:'/farm-builder',icon:'fa-sliders',label:'Advanced Farm'}
  ];

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

  function tabsHtml(active){
    return '<div class="aw27-tabs" role="list">'+TABS.map(function(t){
      var on=t.key===active;
      return '<a role="listitem" class="aw27-tab'+(on?' on':'')+'"'+(on?' aria-current="page"':'')+' href="'+esc(route(t.href))+'" data-aw27-tab="'+t.key+'" title="'+esc(t.label)+'"><i class="fas '+t.icon+'" aria-hidden="true"></i><span>'+esc(t.label)+'</span></a>';
    }).join('')+'</div>';
  }

  function windowControls(){
    return '<button class="aw27-icon" type="button" data-aw27="fullscreen" title="Fullscreen" aria-label="Toggle fullscreen"><i class="fas fa-expand" aria-hidden="true"></i></button>'+
      '<button class="aw27-icon" type="button" data-aw27="close" title="Close Agent Control" aria-label="Close Agent Control"><i class="fas fa-xmark" aria-hidden="true"></i></button>';
  }

  function render(){
    var bar=document.getElementById('agent-workspace-nav');
    if(!bar||bar.dataset.aw27Ready==='1')return;
    bar.dataset.aw27Ready='1';
    var actions=bar.querySelector('.aw27-actions');
    if(!actions){actions=document.createElement('div');actions.className='aw27-actions';bar.appendChild(actions);}
    bar.insertAdjacentHTML('afterbegin',tabsHtml(bar.dataset.active||''));
    actions.insertAdjacentHTML('beforeend',windowControls());
    /* In-page links into other Agent Control workspaces follow the same host-aware routing. */
    document.querySelectorAll('a[data-aw27-route]').forEach(function(a){a.setAttribute('href',route(a.dataset.aw27Route));});
    var current=bar.querySelector('.aw27-tab.on');
    if(current&&current.scrollIntoView&&bar.scrollWidth>bar.clientWidth){try{current.scrollIntoView({block:'nearest',inline:'center'});}catch(_){}}
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

  window.WatchdogAgentWorkspace={tabs:TABS,route:route,render:render};
  render();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});
})();
