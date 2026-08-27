/* Watchdog Dashboard v2 loading skeleton */
(function(){
  'use strict';
  var root=document.getElementById('wd4-root');
  if(!root||root.children.length)return;
  root.hidden=false;
  root.innerHTML='<div class="wdv2-skeleton-app" aria-hidden="true">'+
    '<div class="wdv2-skel-top"><i></i><b></b><span></span><span></span></div>'+
    '<div class="wdv2-skel-welcome"><div><i></i><i></i></div><div><i></i><i></i><i></i></div></div>'+
    '<div class="wdv2-skel-rail"><i></i><i></i></div>'+
    '<div class="wdv2-skel-kpis">'+Array(6).fill('<article><i></i><b></b><span></span></article>').join('')+'</div>'+
    '<div class="wdv2-skel-primary"><article></article><aside><article></article><article></article></aside></div>'+
    '<div class="wdv2-skel-analysis">'+Array(3).fill('<article></article>').join('')+'</div>'+
    '<div class="wdv2-skel-table"></div>'+
  '</div>';
})();
