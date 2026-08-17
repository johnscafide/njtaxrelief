/* TEMPORARY CHECKOUT GUARD.
   Remove this file and its billing-client loader only after NJW-200 verifies the new
   Paddle Agent/Pro price objects, checkout mappings and webhook mappings in production. */
(function(){
  'use strict';
  var path=(window.location.pathname||'').replace(/\/+$/,'');
  if(path!=='/property/pro')return;

  function cadence(){
    if(typeof window.WatchdogProCadence==='function')return window.WatchdogProCadence();
    var b=document.querySelector('[data-cadence].active');
    return b&&b.dataset.cadence==='monthly'?'monthly':'yearly';
  }

  function prefill(plan){
    var p=document.getElementById('demo-plan');
    var c=document.getElementById('demo-cadence');
    var demo=document.getElementById('demo');
    if(p)p.value=plan;
    if(c)c.value=cadence();
    if(demo)demo.scrollIntoView({behavior:'smooth',block:'start'});
  }

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
      cta.innerHTML=(plan==='agent'?'Get started with Agent':'Get started with Pro')+' <i class="fas fa-arrow-right"></i>';

      var secondary=band.querySelector('.pro-price-secondary');
      if(secondary)secondary.hidden=true;
    });
  }

  document.addEventListener('click',function(e){
    var c=e.target.closest('[data-checkout-guarded]');
    if(!c)return;
    e.preventDefault();
    prefill(c.dataset.checkoutGuarded);
  });

  function init(){
    gate();
    var pricing=document.getElementById('pricing');
    if(!pricing)return;
    var mo=new MutationObserver(function(){gate();});
    mo.observe(pricing,{subtree:true,attributes:true,attributeFilter:['data-billing-plan','data-billing-cadence']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  document.addEventListener('click',function(e){if(e.target.closest('[data-cadence]'))setTimeout(gate,0);});
})();
