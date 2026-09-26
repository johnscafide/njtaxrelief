(function(){
'use strict';
if(document.body.dataset.sidebarPage!=='data-center')return;
var tries=0,timer=null;
function paint(){
  tries++;
  var bar=document.querySelector('.wdx-pagebar');
  if(bar){
    var kicker=bar.querySelector('.wdx-kicker'),title=bar.querySelector('h1'),desc=bar.querySelector('p'),actions=bar.querySelector('.wdx-page-actions');
    if(kicker)kicker.textContent='PRO+ · governed intelligence';
    if(title)title.textContent='Data Center';
    if(desc)desc.textContent='Build, save and export governed New Jersey property datasets from Watchdog’s source-backed marker catalog.';
    if(actions)actions.innerHTML='<a class="wdx-btn" href="/property/dashboard"><i class="fas fa-table-columns"></i> Dashboard</a><a class="wdx-btn primary" href="/property/data-workbench"><i class="fas fa-table-list"></i> Open Data Workbench</a>';
  }
  /* Active menu state comes from the shared universal drawer (data-sidebar-page). */
  if(bar){clearInterval(timer);timer=null;}
  else if(tries>50&&timer){clearInterval(timer);timer=null;}
}
function boot(){paint();if(!timer)timer=setInterval(paint,100);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
