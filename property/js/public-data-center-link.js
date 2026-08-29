/* NJW-98 — keep the public Data Center discoverable even when the universal menu
   re-renders for signed-out or lower-tier visitors. Private execution remains
   enforced inside Data Center by session + Pro+ checks and RLS. */
(function(){
  'use strict';
  if(window.__WATCHDOG_PUBLIC_DATA_CENTER_LINK__) return;
  window.__WATCHDOG_PUBLIC_DATA_CENTER_LINK__=true;

  var HREF='/property/data-center';
  var scheduled=false;

  function makeLink(){
    var a=document.createElement('a');
    a.href=HREF;
    a.setAttribute('data-wd-public-data-center','1');
    a.innerHTML='<i class="fas fa-database"></i><span>Data Center</span>';
    return a;
  }

  function patchNav(nav){
    if(!nav) return;
    var existing=nav.querySelector('a[data-wd-public-data-center],a[href="/data-center"],a[href="/property/data-center"]');
    if(existing){
      if(existing.getAttribute('href')!==HREF) existing.setAttribute('href',HREF);
      existing.setAttribute('data-wd-public-data-center','1');
      return;
    }
    var link=makeLink();
    var before=Array.prototype.find.call(nav.querySelectorAll('a'),function(a){
      var href=String(a.getAttribute('href')||'');
      return /\/(?:property\/)?pro(?:$|[?#])/.test(href)||/\/(?:property\/)?account(?:$|[?#])/.test(href);
    });
    nav.insertBefore(link,before||null);
  }

  function patch(){
    scheduled=false;
    document.querySelectorAll('.wd-universal-nav-links,.wd4-nav-links,.hm27-nav-links').forEach(patchNav);
  }

  function schedule(){
    if(scheduled) return;
    scheduled=true;
    requestAnimationFrame(patch);
  }

  document.addEventListener('watchdog:universal-menu-ready',schedule);
  document.addEventListener('watchdog:public-menu-open',schedule);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();

  new MutationObserver(function(mutations){
    for(var i=0;i<mutations.length;i+=1){
      if(mutations[i].addedNodes&&mutations[i].addedNodes.length){schedule();break;}
    }
  }).observe(document.documentElement,{childList:true,subtree:true});
})();
