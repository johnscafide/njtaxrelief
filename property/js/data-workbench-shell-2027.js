(function(){
  'use strict';
  function apply(){
    var bar=document.querySelector('.wdx-pagebar');
    if(!bar)return false;
    var kicker=bar.querySelector('.wdx-kicker');
    var title=bar.querySelector('h1');
    var desc=bar.querySelector('p');
    var primary=bar.querySelector('.wdx-btn.primary');
    if(kicker)kicker.textContent='Professional data';
    if(title)title.textContent='Data Workbench';
    if(desc)desc.textContent='Build governed property datasets, choose fields, filter records and prepare exports from one professional workspace.';
    if(primary){primary.href='/data-center';primary.innerHTML='<i class="fas fa-database"></i> Field Catalog';}
    // Page-bar links from the shared shell point at /property/ pages; public page URLs are root-level.
    bar.querySelectorAll('a[href^="/property/"]').forEach(function(a){
      var href=a.getAttribute('href');
      if(!/^\/property\/(?:js|css|data|assets)\//.test(href))a.setAttribute('href',href.slice(9)||'/');
    });
    return true;
  }
  if(apply())return;
  var observer=new MutationObserver(function(){if(apply())observer.disconnect();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(function(){observer.disconnect();apply();},3000);
})();
