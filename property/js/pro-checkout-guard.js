(function(){
  'use strict';
  var path=(window.location.pathname||'').replace(/\/+$/,'');
  if(path!=='/property/pro')return;

  function cadence(){var b=document.querySelector('[data-cadence].active');return b&&b.dataset.cadence==='monthly'?'monthly':'yearly';}
  function prefill(plan){var p=document.getElementById('demo-plan'),c=document.getElementById('demo-cadence'),demo=document.getElementById('demo');if(p)p.value=plan;if(c)c.value=cadence();if(demo)demo.scrollIntoView({behavior:'smooth',block:'start'});}
  function gate(){
    ['agent','pro'].forEach(function(plan){
      var band=document.querySelector('[data-price-band="'+plan+'"]');
      var cta=band&&band.querySelector('.pro-price-cta');
      if(!cta)return;
      cta.removeAttribute('data-billing-plan');
      cta.removeAttribute('data-billing-cadence');
      cta.dataset.checkoutGuarded=plan;
      cta.dataset.demoPlan=plan;
      cta.dataset.demoCadence=cadence();
      cta.href='#demo';
    });
  }

  document.addEventListener('click',function(e){
    var c=e.target.closest('[data-checkout-guarded]');
    if(!c)return;
    e.preventDefault();
    prefill(c.dataset.checkoutGuarded);
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',gate,{once:true});else gate();
  document.addEventListener('click',function(e){if(e.target.closest('[data-cadence]'))setTimeout(gate,0);});
  var mo=new MutationObserver(function(){gate();});
  mo.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['data-billing-plan','data-billing-cadence']});
})();
