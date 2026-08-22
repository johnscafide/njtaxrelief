(function(){
  'use strict';

  var path=(window.location.pathname||'').replace(/\/+$/,'');
  if(path!=='/property/pro'&&path!=='/pro')return;

  function qs(sel,root){return (root||document).querySelector(sel);}

  window.WatchdogProCadence=window.WatchdogProCadence||function(){
    var active=qs('[data-cadence].active');
    return active&&active.dataset.cadence==='monthly'?'monthly':'yearly';
  };

  function stickyPriceShortcut(){
    if(qs('#pro-price-float'))return;
    var link=document.createElement('a');
    link.className='pro-price-float';
    link.id='pro-price-float';
    link.href='#pricing';
    link.innerHTML='Plans from <b>$59/mo</b> <span>View pricing</span> <i class="fas fa-arrow-down"></i>';
    document.body.appendChild(link);

    var hero=qs('.pro-hero');
    var pricing=qs('#pricing');
    var ticking=false;
    function update(){
      ticking=false;
      if(!hero||!pricing)return;
      var heroBottom=hero.getBoundingClientRect().bottom;
      var priceTop=pricing.getBoundingClientRect().top;
      link.classList.toggle('show',heroBottom<80&&priceTop>window.innerHeight*.55);
    }
    function onScroll(){
      if(ticking)return;
      ticking=true;
      requestAnimationFrame(update);
    }
    window.addEventListener('scroll',onScroll,{passive:true});
    window.addEventListener('resize',onScroll);
    update();
  }

  function trackFastPath(){
    document.addEventListener('click',function(e){
      var jump=e.target.closest('[data-price-jump],[data-fast-plan]');
      if(!jump)return;
      if(typeof window.gtag==='function')window.gtag('event','pro_price_fast_path',{
        location:jump.dataset.priceJump||'hero_strip',
        plan:jump.dataset.fastPlan||''
      });
    });
  }

  function init(){
    stickyPriceShortcut();
    trackFastPath();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
