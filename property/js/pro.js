(function(){
  'use strict';

  var path=(window.location.pathname||'').replace(/\/+$/,'');
  if(path!=='/property/pro')return;

  function loadFragment(id,url){
    return fetch(url).then(function(r){if(!r.ok)throw new Error(url+' '+r.status);return r.text();}).then(function(html){
      var host=document.getElementById(id);if(!host)return;host.innerHTML=html;
      host.querySelectorAll('script').forEach(function(old){var s=document.createElement('script');Array.from(old.attributes).forEach(function(a){s.setAttribute(a.name,a.value);});s.textContent=old.textContent;old.replaceWith(s);});
    }).catch(function(e){console.error('Fragment load failed',e);});
  }

  function reveal(){
    var nodes=Array.prototype.slice.call(document.querySelectorAll('.pro-reveal'));
    if(!nodes.length)return;
    if(!('IntersectionObserver' in window)||(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)){
      nodes.forEach(function(n){n.classList.add('is-visible');});return;
    }
    var io=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(!entry.isIntersecting)return;entry.target.classList.add('is-visible');io.unobserve(entry.target);});},{threshold:.12,rootMargin:'0px 0px -7% 0px'});
    nodes.forEach(function(n){io.observe(n);});
  }

  function story(){
    var section=document.querySelector('.pro-story');
    var steps=Array.prototype.slice.call(document.querySelectorAll('[data-pro-screen]'));
    var panels=Array.prototype.slice.call(document.querySelectorAll('[data-pro-panel]'));
    var tabs=Array.prototype.slice.call(document.querySelectorAll('.pro-app-tabs span'));
    var pathLabel=document.getElementById('pro-app-path');
    if(!section||!steps.length||!panels.length)return;
    var labels=['watchdog / property intelligence','watchdog / score + evidence','watchdog / watchlist','watchdog / professional research','watchdog / action'];
    var active=-1,ticking=false;
    function set(index){index=Math.max(0,Math.min(panels.length-1,index));if(index===active)return;active=index;steps.forEach(function(n,i){n.classList.toggle('active',i===index);});panels.forEach(function(n,i){n.classList.toggle('active',i===index);});tabs.forEach(function(n,i){n.classList.toggle('active',i===index);});if(pathLabel)pathLabel.textContent=labels[index]||labels[0];}
    function nearest(){if(window.innerWidth<=1100)return active<0?0:active;var r=section.getBoundingClientRect();if(r.bottom<0||r.top>window.innerHeight)return -1;var target=Math.min(window.innerHeight-130,Math.max(150,window.innerHeight*.47));var best=0,dist=Infinity;steps.forEach(function(step,i){var x=step.getBoundingClientRect(),c=x.top+x.height/2,d=Math.abs(c-target);if(d<dist){dist=d;best=i;}});return best;}
    function onScroll(){if(ticking)return;ticking=true;requestAnimationFrame(function(){ticking=false;var i=nearest();if(i>=0)set(i);});}
    window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',onScroll);set(0);onScroll();
  }

  function roleTabs(){
    var tabs=Array.prototype.slice.call(document.querySelectorAll('[data-role-tab]'));
    var panels=Array.prototype.slice.call(document.querySelectorAll('[data-role-panel]'));
    if(!tabs.length)return;
    function set(key){tabs.forEach(function(t){var on=t.dataset.roleTab===key;t.classList.toggle('active',on);t.setAttribute('aria-selected',on?'true':'false');});panels.forEach(function(p){p.classList.toggle('active',p.dataset.rolePanel===key);});}
    tabs.forEach(function(t){t.addEventListener('click',function(){set(t.dataset.roleTab);});});set('agent');
  }

  var priceData={
    yearly:{
      agent:{value:'290',unit:'/ year',eyebrow:'Annual',note:'Two months included. Save $58 vs 12 monthly payments.'},
      pro:{value:'490',unit:'/ year',eyebrow:'Annual',note:'Two months included. Save $98 vs 12 monthly payments.'},
      pro_plus:{value:'3,490',unit:'/ year',eyebrow:'Annual',note:'Two months included. Save $698 vs 12 monthly payments.'}
    },
    monthly:{
      agent:{value:'29',unit:'/ month',eyebrow:'Monthly',note:'Pay month to month.'},
      pro:{value:'49',unit:'/ month',eyebrow:'Monthly',note:'Pay month to month.'},
      pro_plus:{value:'349',unit:'/ month',eyebrow:'Monthly',note:'Pay month to month.'}
    }
  };

  function pricing(){
    var buttons=Array.prototype.slice.call(document.querySelectorAll('[data-cadence]'));
    if(!buttons.length)return;
    function set(cad){
      if(!priceData[cad])cad='yearly';
      buttons.forEach(function(b){b.classList.toggle('active',b.dataset.cadence===cad);});
      ['agent','pro','pro_plus'].forEach(function(plan){var d=priceData[cad][plan];var v=document.querySelector('[data-price-value="'+plan+'"]'),u=document.querySelector('[data-price-unit="'+plan+'"]'),e=document.querySelector('[data-price-eyebrow="'+plan+'"]'),n=document.querySelector('[data-price-note="'+plan+'"]'),cta=document.querySelector('[data-billing-plan="'+plan+'"]');if(v)v.textContent=d.value;if(u)u.textContent=d.unit;if(e)e.textContent=d.eyebrow;if(n)n.textContent=d.note;if(cta)cta.dataset.billingCadence=cad;});
    }
    buttons.forEach(function(b){b.addEventListener('click',function(){set(b.dataset.cadence);});});set('yearly');
  }

  function heroMotion(){
    var orbit=document.querySelector('.pro-orbit');
    if(!orbit||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    orbit.addEventListener('pointermove',function(e){var r=orbit.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;orbit.style.transform='perspective(1000px) rotateY('+(x*2.2)+'deg) rotateX('+(-y*2)+'deg)';});
    orbit.addEventListener('pointerleave',function(){orbit.style.transform='';});
  }

  function init(){loadFragment('main-nav','/property/partials/nav.html');loadFragment('main-footer','/property/partials/footer.html');reveal();story();roleTabs();pricing();heroMotion();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
