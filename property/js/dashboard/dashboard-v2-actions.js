/* Watchdog dashboard v2 primary action stabilizer */
(function(){
  'use strict';
  if(window.__WD_DASH_V2_ACTIONS__)return;window.__WD_DASH_V2_ACTIONS__=true;
  var attempts=0,timer=null;
  function ensure(){
    var acts=document.querySelector('.wd4-page-actions');
    if(!acts)return false;
    if(!acts.querySelector('[data-wd7="add-property"]')){
      var b=document.createElement('button');
      b.type='button';b.className='wd7-add-property';b.dataset.wd7='add-property';
      b.innerHTML='<i class="fas fa-house-circle-plus"></i><span>Add Property</span>';
      acts.insertBefore(b,acts.firstChild);
    }
    var widgets=acts.querySelector('[data-action="widgets"]');
    if(widgets){widgets.setAttribute('aria-label','Dashboard widgets');widgets.setAttribute('title','Dashboard widgets');}
    var layout=acts.querySelector('[data-action="layout"]');
    if(layout){layout.setAttribute('aria-label','Arrange dashboard');layout.setAttribute('title','Arrange dashboard');}
    var exp=acts.querySelector('[data-action="export"]');if(exp)exp.setAttribute('title','Export portfolio');
    return true;
  }
  function burst(){clearInterval(timer);attempts=0;timer=setInterval(function(){attempts++;ensure();if(attempts>=20){clearInterval(timer);timer=null;}},150);}
  document.addEventListener('change',function(e){if(e.target&&e.target.id==='wd4-county')setTimeout(burst,40);},true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',burst,{once:true});else burst();
})();
